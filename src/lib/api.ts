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

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    return { ok: false, kind: 'offline', message: 'Jumbo’s API is not reachable from this browser.' }
  }

  let body: unknown = null
  try { body = await res.json() } catch { /* some errors have no body */ }
  const b = (body ?? {}) as Record<string, unknown>

  if (res.ok) return { ok: true, data: body as T }

  if (res.status === 501 && (b.error === 'setup_required' || b.error === 'native_only')) {
    return {
      ok: false,
      kind: 'setup',
      missing: (b.missing as string[]) ?? [],
      message: (b.message as string) ?? 'This feature needs configuring on the server.',
      docs: b.docs as string | undefined,
      feature: b.feature as string | undefined,
    }
  }

  return {
    ok: false,
    kind: 'error',
    status: res.status,
    message: (b.message as string) ?? `Request failed with status ${res.status}.`,
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
  ai: { configured: boolean; model: string | null; missing: string[] }
  youtube: { configured: boolean; missing: string[] }
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
  source: 'claude'
  model: string
  dish: string
  readable: boolean
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
  source: 'claude'
  model: string
  headline: string
  lifeStory: string[]
  whatDrivesIt: string[]
  honestly: string
  confidence: number
}

export interface ChatAnswer {
  source: 'claude'
  model: string
  answer: string
  followUps: string[]
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

  insights: (summary: unknown) =>
    call<{ insights: AiInsight[]; model: string }>('/ai/insights', {
      method: 'POST', body: JSON.stringify({ summary }),
    }),

  future: (payload: { baseline: unknown; levers: unknown; projection: unknown; horizonMonths: number }) =>
    call<FutureNarrative>('/ai/future', { method: 'POST', body: JSON.stringify(payload) }),

  chat: (payload: {
    question: string
    summary: unknown
    goals: string[]
    history: Array<{ role: 'you' | 'jumbo'; text: string }>
  }) => call<ChatAnswer>('/ai/chat', { method: 'POST', body: JSON.stringify(payload) }),

  youtube: (params: { q?: string; goals?: string[]; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.goals?.length) qs.set('goals', params.goals.join(','))
    if (params.limit) qs.set('limit', String(params.limit))
    return call<{ query: string; videos: YoutubeVideo[] }>(`/youtube/search?${qs}`)
  },

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
