import type { Viz } from '../components/DataViz'
/**
 * The one place the client talks to the Jumbo API.
 *
 * Every call returns a discriminated result rather than throwing, because the
 * three failure modes matter differently in the UI:
 *   'setup'   - a credential is missing on the server. Show what to configure.
 *   'offline' - no API reachable at all. Fall back to demo mode, labelled.
 *   'error'   - the call reached the server and failed. Show the reason.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'setup'; missing: string[]; message: string; docs?: string; feature?: string }
  | { ok: false; kind: 'offline'; message: string }
  | { ok: false; kind: 'error'; status: number; message: string }

const BASE = '/api'

/**
 * How long a call is given before it is treated as lost.
 *
 * A request that never settles is worse than one that fails: the screen it
 * belongs to waits on it forever. Someone watched "Thinking" sit under four
 * questions in a row with no answer and no way to retry, because `fetch`
 * has no timeout of its own and a connection that is dropped in the middle
 * — a phone changing network, a cold serverless function killed mid-flight
 * — never rejects. Every call now ends, one way or the other.
 *
 * The AI is given far longer than the rest, because a real answer over a
 * slow model can legitimately take half a minute. It is still well inside
 * the point where a person has decided the app is broken.
 */
const TIMEOUT_MS = 20_000
const AI_TIMEOUT_MS = 45_000

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const budget = path.startsWith('/ai/') ? AI_TIMEOUT_MS : TIMEOUT_MS
  const abort = new AbortController()
  const bell = setTimeout(() => abort.abort(), budget)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
      signal: abort.signal,
    })
  } catch {
    clearTimeout(bell)
    // A timeout and an unreachable server look the same to the person, and
    // both are recoverable by trying again — so both say the same thing.
    // User-facing wording only: nothing here names a service, a port or a key.
    return { ok: false, kind: 'offline', message: 'Jumbo can’t reach its service right now. Please try again in a moment.' }
  }

  // The clock keeps running until the body is in hand. Headers can arrive
  // promptly and the body then stall forever, which waits just as long.
  let body: unknown = null
  try { body = await res.json() } catch { /* some errors have no body */ }
  clearTimeout(bell)

  // A body cut off part-way is not an answer. Without this an abort would
  // read as a successful reply with nothing in it, which is the same silent
  // wait in a different costume.
  if (abort.signal.aborted) {
    return { ok: false, kind: 'offline', message: 'Jumbo can’t reach its service right now. Please try again in a moment.' }
  }
  const b = (body ?? {}) as Record<string, unknown>

  if (res.ok) return { ok: true, data: body as T }

  if (res.status === 501 && (b.error === 'setup_required' || b.error === 'native_only')) {
    return {
      ok: false,
      kind: 'setup',
      missing: (b.missing as string[]) ?? [],
      // The server's own wording is deliberately not forwarded to the UI:
      // it names credentials. Screens supply their own product-level copy.
      message: 'This part of Jumbo isn’t available yet.',
      docs: b.docs as string | undefined,
      feature: b.feature as string | undefined,
    }
  }

  return {
    ok: false,
    kind: 'error',
    status: res.status,
    // The server's own wording is already product-level and is the only
    // thing that tells the person what actually happened. Use it whenever it
    // is there; the generic sentence is for responses that carry none —
    // a gateway error, a crash, an HTML error page.
    message: (b.message as string)
      ?? (res.status >= 500
        ? 'Something went wrong on Jumbo’s side. Please try again.'
        : 'That didn’t go through. Please try again.'),
  }
}

/* ------------------------------------------------------------------ types */

export interface ProviderInfo {
  id: string
  name: string
  vendor: string
  transport: 'oauth' | 'native'
  platform: 'ios' | 'android' | null
  provides: string[]
  blurb: string
  docs: string
  ready: boolean
  missing: string[]
  reason: string | null
  note: string | null
  connection: { status: 'connected'; connectedAt: number; lastSyncAt: number | null; scope: string | null } | null
}

export interface ServerConfig {
  ok: true
  /** Every AI feature: Ask Jumbo, meal photos, insights and Future. */
  ai: { configured: boolean; model: string | null }
  youtube: { configured: boolean; searchEnabled?: boolean }
  providers: Omit<ProviderInfo, 'connection'>[]
  publicUrl: string
}

export interface SyncedDay {
  date: string
  sources?: string[]
  sleepHours?: number
  sleepEfficiency?: number
  steps?: number
  activeMinutes?: number
  restingHR?: number
  hrv?: number
  weightKg?: number
  bodyFatPct?: number
  leanMassKg?: number
  workout?: { type: string; minutes: number; source: string }
}

export interface FoodAnalysis {
  source: 'openrouter'
  model: string
  dish: string
  /**
   * What the photograph turned out to be. 'not_food' and 'unclear' are
   * successful analyses with a normal outcome, not failures — the request
   * returns 200 and the screen offers a retake rather than an error.
   */
  verdict: 'food' | 'not_food' | 'unclear'
  /** One friendly sentence, set when the verdict is not 'food'. */
  message: string | null
  caveat: string | null
  alternatives: string[]
  confidence: number
  items: Array<{
    id: string; name: string; portion: string; grams: number
    kcal: number; protein: number; carbs: number; fat: number; confidence: number
  }>
}

export interface AiInsight {
  id: string
  domain: 'sleep' | 'movement' | 'nutrition' | 'recovery' | 'body'
  changed: string
  why: string
  evidence: string[]
  confidence: number
  limitation: string
  options: string[]
  window: string
  createdAt: number
}

export interface FutureNarrative {
  source: 'openrouter'
  model: string
  headline: string
  lifeStory: string[]
  whatDrivesIt: string[]
  honestly: string
  confidence: number
}

export interface ChatAnswer {
  source: 'openrouter'
  model: string
  answer: string
  followUps: string[]
  /**
   * Numbers and labels for a chart, table or metric row, when the question
   * warranted one. Validated server-side; null when it did not. Jumbo draws
   * it — the model never supplies markup.
   */
  visualization: Viz | null
  /** The figures Jumbo says it actually used. Shown, so a claim can be checked. */
  groundedIn: string[]
}

export interface YoutubeVideo {
  id: string
  title: string
  description: string
  channelId: string
  channelTitle: string
  publishedAt: string
  thumbnail: string | null
  durationIso: string | null
  viewCount: string | null
  url: string
  embedUrl: string
}

/* ------------------------------------------------------------------- api */

/** Fills in whatever an insight arrived without, so the screens can trust it. */
function soundInsight(i: Partial<AiInsight> | null | undefined): AiInsight {
  const o = i ?? {}
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    id: typeof o.id === 'string' ? o.id : `insight-${Math.random().toString(36).slice(2, 9)}`,
    domain: (['sleep', 'movement', 'nutrition', 'recovery', 'body'] as const)
      .includes(o.domain as never) ? (o.domain as AiInsight['domain']) : 'recovery',
    changed: typeof o.changed === 'string' ? o.changed : '',
    why: typeof o.why === 'string' ? o.why : '',
    evidence: strings(o.evidence),
    confidence: typeof o.confidence === 'number' && Number.isFinite(o.confidence)
      ? Math.max(0, Math.min(1, o.confidence)) : 0,
    limitation: typeof o.limitation === 'string' ? o.limitation : '',
    options: strings(o.options),
    window: typeof o.window === 'string' ? o.window : '',
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
  }
}

/** The same guard for the Future narrative: arrays the screen maps over. */
function soundNarrative(n: Partial<FutureNarrative> | null | undefined): FutureNarrative {
  const o = n ?? {}
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    source: 'openrouter',
    model: typeof o.model === 'string' ? o.model : '',
    headline: typeof o.headline === 'string' ? o.headline : '',
    lifeStory: strings(o.lifeStory),
    whatDrivesIt: strings(o.whatDrivesIt),
    honestly: typeof o.honestly === 'string' ? o.honestly : '',
    confidence: typeof o.confidence === 'number' && Number.isFinite(o.confidence)
      ? Math.max(0, Math.min(1, o.confidence)) : 0,
  }
}

export const api = {
  config: () => call<ServerConfig>('/config'),

  providers: () => call<{ providers: ProviderInfo[] }>('/oauth/providers'),

  connect: (id: string) =>
    call<{ authorizeUrl: string }>(`/oauth/connect/${id}`, { method: 'POST', body: '{}' }),

  disconnect: (id: string) =>
    call<{ ok: true }>(`/oauth/disconnect/${id}`, { method: 'POST', body: '{}' }),

  sync: (days = 180) =>
    call<{ connected: string[]; days: SyncedDay[]; errors: Array<{ provider: string; message: string }>; syncedAt: number }>(
      '/health/sync', { method: 'POST', body: JSON.stringify({ days }) },
    ),

  analyseFood: (imageBase64: string, mediaType: string, note?: string) =>
    call<FoodAnalysis>('/ai/food', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mediaType, note }),
    }),

  insights: async (summary: unknown) => {
    const r = await call<{ insights: AiInsight[]; model: string }>('/ai/insights', {
      method: 'POST', body: JSON.stringify({ summary }),
    })
    // The screens read these fields directly, so one insight missing an
    // array is a blank screen rather than a missing sentence. The server
    // normalises its own output, but a stale deployment, a proxy or a
    // half-written response is not the server — and none of them should be
    // able to take a screen down.
    if (r.ok) return { ...r, data: { ...r.data, insights: (r.data.insights ?? []).map(soundInsight) } }
    return r
  },

  future: async (payload: { baseline: unknown; levers: unknown; projection: unknown; horizonMonths: number }) => {
    const r = await call<FutureNarrative>('/ai/future', { method: 'POST', body: JSON.stringify(payload) })
    return r.ok ? { ...r, data: soundNarrative(r.data) } : r
  },

  chat: (payload: {
    question: string
    summary: unknown
    goals: string[]
    history: Array<{ role: 'you' | 'jumbo'; text: string }>
    /** The specific thing the question is about, when there is one. */
    focus?: { kind: string; subject: unknown }
  }) => call<ChatAnswer>('/ai/chat', { method: 'POST', body: JSON.stringify(payload) }),

  youtube: (params: { q?: string; topic?: string; goals?: string[]; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.topic) qs.set('topic', params.topic)
    if (params.goals?.length) qs.set('goals', params.goals.join(','))
    if (params.limit) qs.set('limit', String(params.limit))
    return call<{ source: 'youtube' | 'curated'; query: string; videos: YoutubeVideo[] }>(
      `/youtube/search?${qs}`,
    )
  },

  /** The latest from channels the person follows, read from their own feeds. */
  channels: (ids: string[], limit = 20) =>
    call<{ source: 'youtube' | 'curated'; query: string; videos: YoutubeVideo[] }>(
      `/youtube/channels?ids=${encodeURIComponent(ids.join(','))}&limit=${limit}`,
    ),

  channel: (id: string) =>
    call<{ id: string; title: string; description: string; thumbnail: string | null; subscriberCount: string | null; url: string }>(
      `/youtube/channel/${id}`,
    ),
}

/** Turns an ISO 8601 duration (PT12M34S) into minutes. */
export function isoDurationMinutes(iso: string | null): number | null {
  if (!iso) return null
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return null
  const [, h, min, s] = m
  return Math.round((Number(h ?? 0) * 60) + Number(min ?? 0) + Number(s ?? 0) / 60)
}

export function compactCount(n: string | null): string | null {
  if (!n) return null
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
}
