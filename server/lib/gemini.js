import { env, has } from './env.js'

/**
 * Gemini, for Ask Jumbo.
 *
 * The key is read from the environment on the server and never leaves it:
 * it is not returned by /api/config, not embedded in any client bundle, and
 * not logged. The browser only ever talks to Jumbo's own /api/ai/chat.
 *
 * Answers come back as JSON against a schema, so the conversation UI gets a
 * predictable shape rather than prose it has to parse.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiConfigured = () => has(env.geminiKey)

export class GeminiError extends Error {
  constructor(message, { status = 502, code = 'upstream' } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * One structured generation. `schema` is an OpenAPI-subset response schema;
 * the parsed object is returned.
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
    throw new GeminiError('Gemini is not configured on this server.', { status: 501, code: 'setup_required' })
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
      err.name === 'AbortError' ? 'The answer took too long to come back.' : 'Could not reach the model.',
      { status: 504, code: 'timeout' },
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // The upstream message can name the key or the project; it is logged for
    // the operator and never forwarded to the client.
    const detail = body?.error?.message ?? `status ${res.status}`
    console.error('[gemini] request rejected:', detail)
    if (res.status === 400 && /API key/i.test(detail)) {
      throw new GeminiError('The model rejected this request.', { status: 502, code: 'bad_key' })
    }
    if (res.status === 401 || res.status === 403) {
      throw new GeminiError('The model rejected this request.', { status: 502, code: 'bad_key' })
    }
    if (res.status === 429) {
      throw new GeminiError('Too many questions at once. Try again shortly.', { status: 429, code: 'rate_limited' })
    }
    throw new GeminiError('The model could not answer.', { status: 502, code: 'upstream' })
  }

  const blocked = body?.promptFeedback?.blockReason
  if (blocked) throw new GeminiError('Jumbo could not answer that one.', { status: 422, code: 'declined' })

  const candidate = body?.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new GeminiError('Jumbo could not answer that one.', { status: 422, code: 'declined' })
  }
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new GeminiError('That answer ran too long. Try a narrower question.', { status: 502, code: 'truncated' })
  }

  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (!text) throw new GeminiError('The model returned nothing to show.', { status: 502, code: 'empty' })

  try {
    return JSON.parse(text)
  } catch {
    throw new GeminiError('The model returned nothing usable.', { status: 502, code: 'unparsable' })
  }
}
