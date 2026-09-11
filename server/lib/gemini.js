import { env, has } from './env.js'

/**
 * Jumbo's one AI layer.
 *
 * Every AI feature in the product — Ask Jumbo, meal photographs, pattern
 * insights and the written Future scenario — goes through this file. There is
 * no second provider and no fallback model.
 *
 * The key is read from the environment on the server and never leaves it: it
 * is not returned by /api/config, not embedded in any client bundle, not put
 * in a URL, and not logged. The browser only ever talks to Jumbo's own API.
 *
 * Everything is asked for as JSON against a schema, so each caller gets a
 * predictable shape rather than prose it has to parse.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiConfigured = () => has(env.geminiKey)

/** The model in use, for the capability report. Never the key. */
export const geminiModel = () => env.geminiModel

export class GeminiError extends Error {
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

/**
 * One structured generation. `schema` is an OpenAPI-subset response schema;
 * the parsed object is returned.
 *
 * `contents` is Gemini's conversation array. Parts may mix text and images,
 * which is what the meal photograph route relies on.
 */
/**
 * The 2.5 models think before they answer, and those thinking tokens are
 * billed against maxOutputTokens. A schema-constrained call with a modest
 * budget can therefore spend the whole allowance thinking and come back with
 * finishReason MAX_TOKENS and no text at all.
 *
 * Jumbo's calls are grounded extraction against a fixed schema, so a long
 * private deliberation buys very little. The budget is kept small and the
 * output allowance generous, and `thinkingBudget` is only sent to models that
 * accept it — anything else rejects the field outright.
 */
const THINKS = /gemini-(2\.5|3|[3-9])/i.test.bind(/gemini-(2\.5|3|[3-9])/i)

function generationConfig({ schema, maxOutputTokens, temperature, think }) {
  const cfg = {
    responseMimeType: 'application/json',
    responseSchema: schema,
    maxOutputTokens,
    temperature,
  }
  if (think && THINKS(env.geminiModel)) cfg.thinkingConfig = { thinkingBudget: think }
  return cfg
}

async function callGemini({ system, contents, config, signal }) {
  const res = await fetch(`${BASE}/${env.geminiModel}:generateContent`, {
    method: 'POST',
    signal,
    headers: {
      // The key travels in a header, never in the URL, so it cannot end up
      // in an access log or a referrer.
      'x-goog-api-key': env.geminiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: config,
    }),
  })
  return { res, body: await res.json().catch(() => null) }
}

/** The text of a candidate, ignoring the model's private thought parts. */
const answerText = (candidate) => (candidate?.content?.parts ?? [])
  .filter((p) => !p.thought)
  .map((p) => p.text ?? '')
  .join('')
  .trim()

export async function generateJson({
  system,
  contents,
  schema,
  maxOutputTokens = 8192,
  temperature = 0.6,
  timeoutMs = 45_000,
}) {
  if (!geminiConfigured()) {
    throw new GeminiError('Jumbo’s AI is not available.', { status: 501, code: 'setup_required' })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res
  let body
  try {
    ;({ res, body } = await callGemini({
      system,
      contents,
      config: generationConfig({ schema, maxOutputTokens, temperature, think: 512 }),
      signal: controller.signal,
    }))

    // If the model still spent its allowance thinking, ask once more with
    // thinking off. This is a real second attempt, not a fallback answer.
    if (res.ok && isStarved(body)) {
      console.warn('[gemini] thinking exhausted the output budget; retrying without it')
      ;({ res, body } = await callGemini({
        system,
        contents,
        config: generationConfig({ schema, maxOutputTokens, temperature, think: 0 }),
        signal: controller.signal,
      }))
    }
  } catch (err) {
    throw new GeminiError(
      err.name === 'AbortError' ? 'That took too long to come back.' : 'Jumbo could not reach its AI.',
      { status: 504, code: 'timeout' },
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // The upstream message can name the key or the project. It is logged for
    // whoever runs the server and never forwarded to the browser.
    const detail = body?.error?.message ?? `status ${res.status}`
    console.error('[gemini] request rejected:', detail)
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /API key/i.test(detail))) {
      throw new GeminiError('Jumbo’s AI is not available.', { status: 502, code: 'bad_key' })
    }
    if (res.status === 429) {
      throw new GeminiError('Too many requests at once. Try again shortly.', { status: 429, code: 'rate_limited' })
    }
    throw new GeminiError('Jumbo’s AI could not answer.', { status: 502, code: 'upstream' })
  }

  if (body?.promptFeedback?.blockReason) {
    throw new GeminiError('Jumbo could not answer that one.', { status: 422, code: 'declined' })
  }

  const candidate = body?.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new GeminiError('Jumbo could not answer that one.', { status: 422, code: 'declined' })
  }

  const out = answerText(candidate)
  if (!out) {
    console.error('[gemini] no usable content. finishReason:', candidate?.finishReason,
      'usage:', JSON.stringify(body?.usageMetadata ?? {}))
    throw new GeminiError(
      candidate?.finishReason === 'MAX_TOKENS'
        ? 'That answer ran long. Try a narrower question.'
        : 'Jumbo’s AI had nothing to say just then. Please try again.',
      { status: 502, code: candidate?.finishReason === 'MAX_TOKENS' ? 'truncated' : 'empty' },
    )
  }

  try {
    return JSON.parse(out)
  } catch {
    // A response cut short mid-object is still worth salvaging: the schema
    // puts the answer first, so a repaired prefix keeps the useful part.
    const repaired = repairJson(out)
    if (repaired) {
      console.warn('[gemini] recovered a truncated response')
      return repaired
    }
    console.error('[gemini] unparsable response. finishReason:', candidate?.finishReason)
    throw new GeminiError('Jumbo’s AI returned nothing usable.', { status: 502, code: 'unparsable' })
  }
}

/** A candidate that finished by running out of room without producing text. */
const isStarved = (body) => {
  const c = body?.candidates?.[0]
  return c?.finishReason === 'MAX_TOKENS' && !answerText(c)
}

/**
 * Closes an object that was cut off mid-generation. Only ever used on a
 * response that failed to parse, and only returns something when the result
 * is valid JSON — otherwise the caller reports the failure.
 */
function repairJson(s) {
  let cut = s.lastIndexOf('"')
  while (cut > 0) {
    const head = s.slice(0, cut + 1)
    for (const tail of ['}', '"}', ']}', '"]}', '"}]}']) {
      try { return JSON.parse(head + tail) } catch { /* try the next shape */ }
    }
    cut = s.lastIndexOf('"', cut - 1)
    if (s.length - cut > 400) break
  }
  return null
}

/**
 * The one place an AI failure becomes an HTTP response. Product wording only:
 * no provider name, no model name, no credential, no stack.
 */
export function sendAiError(res, err, feature) {
  if (err instanceof GeminiError) {
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
