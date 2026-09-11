import { env, has } from './env.js'

/**
 * Jumbo's one AI service.
 *
 * Every AI feature in the product — Ask Jumbo, meal photographs, the Today
 * insight, pattern insights and the Future scenario — goes through this file.
 * It talks to OpenRouter, which fronts several providers, so a model going
 * away or a provider having a bad afternoon costs a retry rather than the
 * feature.
 *
 * The key is read from the environment on the server and never leaves it: it
 * is not returned by /api/config, not embedded in any client bundle, not put
 * in a URL, and not logged.
 */
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * The fallback chain, tried in order until one returns a valid answer.
 *
 * Chosen for structured JSON, quick turnaround and low cost, and deliberately
 * spread across provider families so the chain does not all fail together:
 * two Google generations, OpenAI, then Meta. Anthropic is not in the list.
 *
 * A model id that OpenRouter no longer serves simply fails its attempt and
 * the next one runs, which is the failure mode that took the app down when
 * one model was hard-wired. OPENROUTER_MODELS overrides the list without a
 * code change if one needs swapping in a hurry.
 */
const DEFAULT_TEXT_MODELS = [
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
]

/** The same idea for meal photographs, limited to models that read images. */
const DEFAULT_VISION_MODELS = [
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
]

const list = (raw, fallback) => {
  const parsed = String(raw || '').split(',').map((m) => m.trim()).filter(Boolean)
  return parsed.length ? parsed : fallback
}

/**
 * Model families known to accept image input. A meal photograph sent to a
 * text-only model does not fail loudly — the model simply describes nothing
 * and the analysis comes back empty — so the override is filtered rather
 * than trusted, and the vision defaults stand in if it leaves nothing.
 */
const VISION_CAPABLE = /(gemini|gpt-4o|gpt-4\.1|o4-|claude-3|pixtral|llama-3\.2-(11|90)b-vision|qwen.*-vl|internvl)/i

export const textModels = () => list(env.openrouterModels, DEFAULT_TEXT_MODELS)

export const visionModels = () => {
  const override = list(env.openrouterModels, null)
  if (!override) return DEFAULT_VISION_MODELS

  const usable = override.filter((m) => VISION_CAPABLE.test(m))
  const dropped = override.filter((m) => !VISION_CAPABLE.test(m))
  if (dropped.length) {
    console.warn(`[ai] ignoring text-only model(s) for image analysis: ${dropped.join(', ')}`)
  }
  // An override that names no image-capable model would leave meal
  // photographs with nothing to run on, so the defaults carry it.
  return usable.length ? usable : DEFAULT_VISION_MODELS
}

export const aiConfigured = () => has(env.openrouterKey)

/** The chain in use, for the capability report. Never the key. */
export const aiModels = () => textModels()

export class AiError extends Error {
  constructor(message, { status = 502, code = 'upstream' } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** A text part, for building `contents`. */
export const text = (t) => ({ text: String(t) })

/** An inline image part. `data` is base64 with no data: prefix. */
export const image = (data, mimeType = 'image/jpeg') => ({
  inlineData: { mimeType, data },
})

/** Jumbo's part shape translated to the OpenAI-compatible message shape. */
function toMessages(system, contents) {
  const messages = [{ role: 'system', content: system }]
  for (const turn of contents) {
    const parts = turn.parts ?? []
    const hasImage = parts.some((p) => p.inlineData)
    messages.push({
      role: turn.role === 'model' ? 'assistant' : 'user',
      content: hasImage
        ? parts.map((p) => (p.inlineData
          ? { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }
          : { type: 'text', text: p.text ?? '' }))
        : parts.map((p) => p.text ?? '').join('\n'),
    })
  }
  return messages
}

/**
 * Models differ in how well they honour a schema parameter, so the shape is
 * also stated in words. Between that, the JSON response format and the
 * validation below, a model that cannot comply fails its attempt rather than
 * returning something the product would have to guess at.
 */
function schemaInstruction(schema) {
  return [
    'Reply with a single JSON object and nothing else. No prose, no code fence.',
    'It must match this shape exactly:',
    JSON.stringify(schema, null, 2),
  ].join('\n')
}

/** Pulls the object out of a reply that may carry a fence or a stray line. */
function extractJson(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : s).trim()
  try { return JSON.parse(body) } catch { /* keep looking */ }
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(body.slice(start, end + 1)) } catch { /* not recoverable */ }
  }
  return null
}

/**
 * Checks the model returned the fields the route is about to read. Wrong
 * shape counts as a failed attempt, so the next model gets a turn rather
 * than the route handling a half-formed object.
 */
function validate(value, schema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const key of schema.required ?? []) {
    const spec = schema.properties?.[key]
    const got = value[key]
    if (got === undefined || got === null) return false
    if (spec?.type === 'array' && !Array.isArray(got)) return false
    if (spec?.type === 'string' && typeof got !== 'string') return false
    if (spec?.type === 'number' && typeof got !== 'number') return false
    if (spec?.type === 'boolean' && typeof got !== 'boolean') return false
  }
  return true
}

async function attempt({ model, messages, maxOutputTokens, temperature, signal }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      // Server-side only. The key never travels to the browser.
      Authorization: `Bearer ${env.openrouterKey}`,
      'Content-Type': 'application/json',
      // OpenRouter attributes traffic with these; neither is a secret.
      'HTTP-Referer': env.publicUrl,
      'X-Title': 'Jumbo',
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: maxOutputTokens,
      temperature,
    }),
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    // The upstream message can name the key or the account. It is logged for
    // whoever runs the server and never forwarded to the browser.
    const detail = body?.error?.message ?? `status ${res.status}`
    const err = new Error(detail)
    err.status = res.status
    throw err
  }

  const choice = body?.choices?.[0]
  if (choice?.finish_reason === 'content_filter') {
    const err = new Error('declined by the provider')
    err.declined = true
    throw err
  }
  return choice?.message?.content ?? ''
}

/**
 * One structured generation, with the fallback chain behind it.
 *
 * Returns `{ data, model }` — the object, and which model actually produced
 * it, so a response can name the model that answered rather than the one at
 * the head of the list. A model that
 * is gone, rate limited, slow, or simply cannot produce the shape costs one
 * attempt. When every model has failed, the reason from the last attempt
 * decides what the person is told — nothing is invented in place of an
 * answer.
 */
export async function generateJson({
  system,
  contents,
  schema,
  maxOutputTokens = 4096,
  temperature = 0.6,
  timeoutMs = 45_000,
  vision = false,
}) {
  if (!aiConfigured()) {
    throw new AiError('Jumbo’s AI is not available.', { status: 501, code: 'setup_required' })
  }

  const messages = toMessages(`${system}\n\n${schemaInstruction(schema)}`, contents)
  const models = vision ? visionModels() : textModels()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let last = { code: 'upstream', message: 'Jumbo’s AI could not answer.', status: 502 }

  try {
    for (const model of models) {
      try {
        const raw = await attempt({
          model, messages, maxOutputTokens, temperature, signal: controller.signal,
        })
        const parsed = extractJson(raw)
        if (!parsed) {
          console.warn(`[ai] ${model}: reply was not JSON, trying the next model`)
          last = { code: 'unparsable', message: 'Jumbo’s AI returned nothing usable.', status: 502 }
          continue
        }
        if (!validate(parsed, schema)) {
          console.warn(`[ai] ${model}: reply did not match the expected shape, trying the next model`)
          last = { code: 'unparsable', message: 'Jumbo’s AI returned nothing usable.', status: 502 }
          continue
        }
        if (model !== models[0]) console.warn(`[ai] answered by fallback model ${model}`)
        return { data: parsed, model }
      } catch (err) {
        if (err.name === 'AbortError') {
          // The whole budget is spent; further models cannot help.
          throw new AiError('That took too long to come back.', { status: 504, code: 'timeout' })
        }
        if (err.declined) {
          last = { code: 'declined', message: 'Jumbo could not answer that one.', status: 422 }
          console.warn(`[ai] ${model}: declined`)
          continue
        }
        const status = err.status ?? 0
        console.warn(`[ai] ${model} failed (${status || 'network'}): ${err.message}`)
        if (status === 401 || status === 403) {
          last = { code: 'bad_key', message: 'Jumbo’s AI is not available.', status: 502 }
          // A rejected key fails identically on every model; stop here.
          break
        }
        if (status === 429) {
          last = { code: 'rate_limited', message: 'Too many requests at once. Try again shortly.', status: 429 }
          continue
        }
        if (status === 402) {
          last = { code: 'no_credit', message: 'Jumbo’s AI is not available.', status: 502 }
          break
        }
        last = { code: 'upstream', message: 'Jumbo’s AI could not answer.', status: 502 }
      }
    }
  } finally {
    clearTimeout(timer)
  }

  console.error(`[ai] every model failed. last reason: ${last.code}`)
  throw new AiError(last.message, { status: last.status, code: last.code })
}

/**
 * The one place an AI failure becomes an HTTP response. Product wording only:
 * no provider name, no model name, no credential, no stack.
 */
export function sendAiError(res, err, feature) {
  if (err instanceof AiError) {
    console.error(`[ai:${feature}]`, err.code)
    return res.status(err.status).json({ error: err.code, message: err.message })
  }
  console.error(`[ai:${feature}]`, err)
  return res.status(500).json({ error: 'failed', message: 'Something went wrong on Jumbo’s side. Please try again.' })
}

/** Every AI route answers the same way when the server has no key. */
export const aiUnavailable = (res, feature) =>
  res.status(501).json({
    error: 'setup_required',
    feature,
    message: 'Jumbo’s AI is not available at the moment.',
  })
