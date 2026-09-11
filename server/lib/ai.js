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
 * The one preset Jumbo asks for. This is the only model identifier in the
 * application, and it does not name a model.
 *
 * Which models it resolves to, in what order, on which providers and with
 * what routing, is configured in the OpenRouter dashboard. That is the point:
 * a model being retired, or a better one arriving, is a change there and not
 * a deploy here. The application never learns what answered it.
 *
 * Every route uses it, meal photographs included. What differs between a
 * question and a photograph is the shape of the request — a photograph
 * carries an image part — not which models may answer it. That does mean
 * every model in the preset has to accept image input; /api/ai/selftest
 * probes exactly that and says so.
 */
export const PRESET = '@preset/jumbo-ai'

export const aiConfigured = () => has(env.openrouterKey)

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

async function attempt({ preset, messages, maxOutputTokens, temperature, signal }) {
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
      // A preset, never a model. OpenRouter resolves the rest.
      model: preset,
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
  // OpenRouter reports which model it actually routed to; useful in a log
  // and in the self-test, and never a configuration the app depends on.
  return { content: choice?.message?.content ?? '', model: body?.model ?? null }
}

/**
 * One structured generation, through a preset.
 *
 * The request names the preset, not a model, so OpenRouter resolves which
 * model runs and walks its own fallback chain. There is no model loop here: a
 * provider being down or a model being retired is handled upstream, where it
 * can be reconfigured without a deploy.
 *
 * The one retry that remains is for a reply that is not the JSON the route
 * needs. That is not a provider failure — the preset may route the second
 * attempt elsewhere — so it is worth asking once more before giving up.
 * Nothing is invented in place of an answer.
 *
 * Returns `{ data, model }`, where `model` is whatever OpenRouter reports it
 * actually used, for logging and the self-test.
 */
export async function generateJson({
  system,
  contents,
  schema,
  maxOutputTokens = 4096,
  temperature = 0.6,
  timeoutMs = 45_000,
}) {
  if (!aiConfigured()) {
    throw new AiError('Jumbo’s AI is not available.', { status: 501, code: 'setup_required' })
  }

  const preset = PRESET
  const messages = toMessages(`${system}\n\n${schemaInstruction(schema)}`, contents)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for (let tryNo = 1; tryNo <= 2; tryNo += 1) {
      let raw
      let model
      try {
        ;({ content: raw, model } = await attempt({
          preset, messages, maxOutputTokens, temperature, signal: controller.signal,
        }))
      } catch (err) {
        throw toAiError(err, preset)
      }

      const parsed = extractJson(raw)
      if (parsed && validate(parsed, schema)) {
        return { data: parsed, model: model || preset }
      }

      console.warn(
        `[ai] ${preset}${model ? ` (${model})` : ''}: reply was not the expected JSON`
        + (tryNo === 1 ? ', asking once more' : ''),
      )
    }
  } finally {
    clearTimeout(timer)
  }

  throw new AiError('Jumbo’s AI returned nothing usable.', { status: 502, code: 'unparsable' })
}

/** Turns a transport or provider failure into what the person is told. */
function toAiError(err, preset) {
  if (err instanceof AiError) return err
  if (err.name === 'AbortError') {
    console.warn(`[ai] ${preset}: timed out`)
    return new AiError('That took too long to come back.', { status: 504, code: 'timeout' })
  }
  if (err.declined) {
    console.warn(`[ai] ${preset}: declined by the provider`)
    return new AiError('Jumbo could not answer that one.', { status: 422, code: 'declined' })
  }

  const status = err.status ?? 0
  console.warn(`[ai] ${preset} failed (${status || 'network'}): ${err.message}`)

  if (status === 401 || status === 403) {
    return new AiError('Jumbo’s AI is not available.', { status: 502, code: 'bad_key' })
  }
  if (status === 402) {
    return new AiError('Jumbo’s AI is not available.', { status: 502, code: 'no_credit' })
  }
  if (status === 404) {
    // The preset name did not resolve. Worth saying plainly in the log,
    // because no amount of retrying fixes it.
    console.error(`[ai] ${preset} was not found on this OpenRouter account`)
    return new AiError('Jumbo’s AI is not available.', { status: 502, code: 'preset_missing' })
  }
  if (status === 429) {
    return new AiError('Too many requests at once. Try again shortly.', { status: 429, code: 'rate_limited' })
  }
  return new AiError('Jumbo’s AI could not answer.', { status: 502, code: 'upstream' })
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
