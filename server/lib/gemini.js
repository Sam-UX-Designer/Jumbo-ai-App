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
export async function generateJson({
  system,
  contents,
  schema,
  maxOutputTokens = 2048,
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
    res = await fetch(`${BASE}/${env.geminiModel}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        // The key travels in a header, never in the URL, so it cannot end up
        // in an access log or a referrer.
        'x-goog-api-key': env.geminiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          maxOutputTokens,
          temperature,
        },
      }),
    })
    body = await res.json().catch(() => null)
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
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new GeminiError('That answer ran too long. Try a narrower question.', { status: 502, code: 'truncated' })
  }

  const out = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (!out) throw new GeminiError('Jumbo’s AI returned nothing to show.', { status: 502, code: 'empty' })

  try {
    return JSON.parse(out)
  } catch {
    throw new GeminiError('Jumbo’s AI returned nothing usable.', { status: 502, code: 'unparsable' })
  }
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
