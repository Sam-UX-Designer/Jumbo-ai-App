import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode,
} from 'react'
import type {
  Baseline, DayRecord, GoalKey, InsightDecision, MealEntry, Measurement, Profile,
  Reminders, WorkoutEntry,
} from '../data/types'
import { generateHistory, generateMeasurements, TODAY } from '../data/generate'
import { computeBaseline } from '../lib/analytics'
import type { Levers } from '../lib/trajectory'
import { setHapticsEnabled, setSoundEnabled } from '../lib/feedback'
import { api, type ProviderInfo, type ServerConfig, type SyncedDay } from '../lib/api'
import { uid } from '../lib/util'

const STORAGE_KEY = 'jumbo.state.v2'

export interface Settings {
  haptics: boolean
  sound: boolean
  /** Whether Jumbo interprets patterns at all. Off leaves the data visible and uninterpreted. */
  aiPatterns: boolean
  creatorPersonalisation: boolean
}

/**
 * `dataMode` is the honesty switch that runs through the whole app.
 *  'demo' — a clearly labelled sample history so the product is explorable.
 *  'live' — records that actually came from a connected source.
 */
export type DataMode = 'demo' | 'live'

/** One turn of the conversation with Jumbo. */
export interface ChatMessage {
  id: string
  role: 'you' | 'jumbo'
  text: string
  /** Follow-ups Jumbo offered after this answer. */
  followUps?: string[]
  /** Set when this turn failed, so the UI can offer a retry. */
  error?: string
  pending?: boolean
}

export interface Persisted {
  onboarded: boolean
  /** True once the six-digit code was entered. The phone is the account key. */
  phoneVerified: boolean
  /** What the person allowed Jumbo to read, by metric. */
  permissions: Record<string, boolean>
  profile: Profile
  goals: GoalKey[]
  dataMode: DataMode
  decisions: Record<string, InsightDecision>
  dismissed: string[]
  followedChannels: string[]
  savedVideos: string[]
  theme: 'system' | 'light' | 'dark'
  settings: Settings
  reminders: Reminders
  levers: Levers | null
  milestones: string[]
  addedMeals: Record<string, MealEntry[]>
  addedWorkouts: Record<string, WorkoutEntry>
  addedNotes: Record<string, string>
  addedMeasurements: Measurement[]
}

export interface State extends Persisted {
  days: DayRecord[]
  measurements: Measurement[]
  baseline: Baseline
  today: string
  hydrated: boolean

  /** The day Home is showing. Always a real date, never ahead of today. */
  selectedDate: string
  /** The active conversation. Kept for the session, never written to disk. */
  chat: ChatMessage[]

  /** Server capability report. null until the first /api/config call returns. */
  server: ServerConfig | null
  serverReachable: boolean | null
  providers: ProviderInfo[]
  liveDays: SyncedDay[]
  syncErrors: Array<{ provider: string; message: string }>
  lastSyncAt: number | null
  syncing: boolean

  /** True once stored state has been read. Nothing is written before this. */
  bootstrapped: boolean
}

const defaultSettings: Settings = {
  haptics: true,
  sound: true,
  aiPatterns: true,
  creatorPersonalisation: true,
}

const defaultReminders: Reminders = {
  enabled: false,
  breakfast: '08:00',
  lunch: '13:00',
  dinner: '19:30',
  workout: '18:00',
}

export const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  sleep: true, steps: true, workouts: true, heart: true, body: true,
}

const defaultPersisted: Persisted = {
  onboarded: false,
  phoneVerified: false,
  permissions: { ...DEFAULT_PERMISSIONS },
  profile: { name: '', phone: '' },
  goals: [],
  dataMode: 'demo',
  decisions: {},
  dismissed: [],
  followedChannels: [],
  savedVideos: [],
  theme: 'dark',
  settings: defaultSettings,
  reminders: defaultReminders,
  levers: null,
  milestones: [],
  addedMeals: {},
  addedWorkouts: {},
  addedNotes: {},
  addedMeasurements: [],
}

export type Action =
  | { type: 'hydrate'; payload: Partial<Persisted> }
  | { type: 'setProfile'; profile: Partial<Profile> }
  | { type: 'toggleGoal'; goal: GoalKey }
  | { type: 'setGoals'; goals: GoalKey[] }
  | { type: 'setDataMode'; mode: DataMode }
  | { type: 'setPhoneVerified'; verified: boolean }
  | { type: 'setPermission'; key: string; value: boolean }
  | { type: 'selectDate'; date: string }
  | { type: 'chatSend'; id: string; text: string }
  | { type: 'chatReply'; id: string; text: string; followUps: string[] }
  | { type: 'chatFail'; id: string; message: string }
  | { type: 'chatClear' }
  | { type: 'finishOnboarding' }
  | { type: 'resetAll' }
  | { type: 'addMeal'; date: string; meal: MealEntry }
  | { type: 'removeMeal'; date: string; mealId: string }
  | { type: 'logWorkout'; date: string; workout: WorkoutEntry }
  | { type: 'removeWorkout'; date: string }
  | { type: 'setNote'; date: string; note: string }
  | { type: 'addMeasurement'; measurement: Measurement }
  | { type: 'toggleChannel'; channelId: string }
  | { type: 'toggleSavedVideo'; videoId: string }
  | { type: 'decide'; insightId: string; decision: InsightDecision }
  | { type: 'dismissInsight'; insightId: string }
  | { type: 'setTheme'; theme: Persisted['theme'] }
  | { type: 'setSetting'; key: keyof Settings; value: boolean }
  | { type: 'setReminders'; patch: Partial<Reminders> }
  | { type: 'setLevers'; levers: Levers }
  | { type: 'awardMilestone'; id: string }
  | { type: 'serverConfig'; config: ServerConfig | null; reachable: boolean }
  | { type: 'setProviders'; providers: ProviderInfo[] }
  | { type: 'syncStart' }
  | { type: 'syncDone'; days: SyncedDay[]; errors: State['syncErrors']; at: number }

/* ------------------------------------------------------- sample history */
const sampleHistory = generateHistory(TODAY)
const sampleMeasurements = generateMeasurements(TODAY)

/** Turns records that really came from a provider into Jumbo's day shape. */
function fromLive(rows: SyncedDay[]): DayRecord[] {
  return rows.map((r) => ({
    date: r.date,
    sleepHours: r.sleepHours ?? 0,
    sleepEfficiency: r.sleepEfficiency ?? 0,
    bedtimeHour: 23,
    steps: r.steps ?? 0,
    activeMinutes: r.activeMinutes ?? 0,
    restingHR: r.restingHR ?? 0,
    hrv: r.hrv ?? 0,
    weightKg: r.weightKg ?? 0,
    bodyFatPct: r.bodyFatPct ?? 0,
    workout: r.workout
      ? { id: `live-${r.date}`, type: r.workout.type as DayRecord['workout'] extends undefined ? never : never, minutes: r.workout.minutes, intensity: 2, source: 'imported' } as unknown as WorkoutEntry
      : undefined,
    meals: [],
    restDay: !r.workout,
  }))
}

function composeDays(p: Persisted, live: SyncedDay[]): DayRecord[] {
  const base = p.dataMode === 'live' && live.length ? fromLive(live) : sampleHistory
  return base.map((d) => {
    const extraMeals = p.addedMeals[d.date]
    const extraWorkout = p.addedWorkouts[d.date]
    const note = p.addedNotes[d.date]
    if (!extraMeals && !extraWorkout && !note) return d
    return {
      ...d,
      meals: extraMeals ? [...d.meals, ...extraMeals].sort((a, b) => a.time.localeCompare(b.time)) : d.meals,
      workout: extraWorkout ?? d.workout,
      restDay: extraWorkout ? false : d.restDay,
      notes: note ?? d.notes,
    }
  })
}

type Runtime = Pick<State,
  'server' | 'serverReachable' | 'providers' | 'liveDays' | 'syncErrors' | 'lastSyncAt'
  | 'syncing' | 'bootstrapped' | 'selectedDate' | 'chat'>

const emptyRuntime: Runtime = {
  server: null, serverReachable: null, providers: [],
  liveDays: [], syncErrors: [], lastSyncAt: null, syncing: false,
  bootstrapped: false,
  selectedDate: TODAY,
  chat: [],
}

function derive(p: Persisted, rt: Runtime): State {
  const days = composeDays(p, rt.liveDays)
  const measurements = p.dataMode === 'live'
    ? [...p.addedMeasurements].sort((a, b) => (a.date < b.date ? 1 : -1))
    : [...p.addedMeasurements, ...sampleMeasurements].sort((a, b) => (a.date < b.date ? 1 : -1))
  return {
    ...p,
    ...rt,
    days,
    measurements,
    baseline: computeBaseline(days, measurements),
    today: TODAY,
    hydrated: true,
    // A day that no longer exists (a shorter history after a sync) falls back
    // to today rather than leaving Home pointing at nothing.
    selectedDate: days.some((d) => d.date === rt.selectedDate) ? rt.selectedDate : TODAY,
  }
}

const persistedOf = (s: State): Persisted => {
  const {
    days: _d, measurements: _m, baseline: _b, today: _t, hydrated: _h,
    server: _s, serverReachable: _sr, providers: _p, liveDays: _l,
    syncErrors: _e, lastSyncAt: _ls, syncing: _sy, bootstrapped: _bs,
    selectedDate: _sd, chat: _c, ...rest
  } = s
  return rest
}

const runtimeOf = (s: State): Runtime => ({
  server: s.server, serverReachable: s.serverReachable, providers: s.providers,
  liveDays: s.liveDays, syncErrors: s.syncErrors, lastSyncAt: s.lastSyncAt,
  syncing: s.syncing, bootstrapped: s.bootstrapped,
  selectedDate: s.selectedDate, chat: s.chat,
})

function reducer(state: State, action: Action): State {
  const p = persistedOf(state)
  const rt = runtimeOf(state)
  const next = (patch: Partial<Persisted>, rtPatch: Partial<Runtime> = {}) =>
    derive({ ...p, ...patch }, { ...rt, ...rtPatch })

  switch (action.type) {
    case 'hydrate':
      return derive({
        ...p, ...action.payload,
        settings: { ...defaultSettings, ...(action.payload.settings ?? {}) },
        reminders: { ...defaultReminders, ...(action.payload.reminders ?? {}) },
        profile: { ...defaultPersisted.profile, ...(action.payload.profile ?? {}) },
        permissions: { ...DEFAULT_PERMISSIONS, ...(action.payload.permissions ?? {}) },
      }, { ...rt, bootstrapped: true })

    case 'setProfile': return next({ profile: { ...p.profile, ...action.profile } })
    case 'toggleGoal':
      return next({
        goals: p.goals.includes(action.goal)
          ? p.goals.filter((g) => g !== action.goal)
          : [...p.goals, action.goal],
      })
    case 'setGoals': return next({ goals: action.goals })
    case 'setDataMode': return next({ dataMode: action.mode })
    case 'setPhoneVerified': return next({ phoneVerified: action.verified })
    case 'setPermission': return next({ permissions: { ...p.permissions, [action.key]: action.value } })
    case 'finishOnboarding': return next({ onboarded: true })

    /* Day selection and the conversation live outside `Persisted`, so they are
       patched straight onto state rather than round-tripped through derive(). */
    case 'selectDate':
      return state.days.some((d) => d.date === action.date)
        ? { ...state, selectedDate: action.date }
        : state
    case 'chatSend':
      return {
        ...state,
        chat: [
          ...state.chat,
          { id: `${action.id}-you`, role: 'you', text: action.text },
          { id: action.id, role: 'jumbo', text: '', pending: true },
        ],
      }
    case 'chatReply':
      return {
        ...state,
        chat: state.chat.map((m) => (m.id === action.id
          ? { ...m, text: action.text, followUps: action.followUps, pending: false, error: undefined }
          : m)),
      }
    case 'chatFail':
      return {
        ...state,
        chat: state.chat.map((m) => (m.id === action.id
          ? { ...m, pending: false, error: action.message }
          : m)),
      }
    case 'chatClear': return { ...state, chat: [] }
    case 'resetAll':
      return derive({ ...defaultPersisted, theme: p.theme }, {
        ...emptyRuntime, bootstrapped: true,
        server: rt.server, serverReachable: rt.serverReachable, providers: rt.providers,
      })

    case 'addMeal':
      return next({ addedMeals: { ...p.addedMeals, [action.date]: [...(p.addedMeals[action.date] ?? []), action.meal] } })
    case 'removeMeal':
      return next({ addedMeals: { ...p.addedMeals, [action.date]: (p.addedMeals[action.date] ?? []).filter((m) => m.id !== action.mealId) } })
    case 'logWorkout':
      return next({ addedWorkouts: { ...p.addedWorkouts, [action.date]: action.workout } })
    case 'removeWorkout': {
      const w = { ...p.addedWorkouts }; delete w[action.date]
      return next({ addedWorkouts: w })
    }
    case 'setNote': return next({ addedNotes: { ...p.addedNotes, [action.date]: action.note } })
    case 'addMeasurement': return next({ addedMeasurements: [action.measurement, ...p.addedMeasurements] })

    case 'toggleChannel':
      return next({
        followedChannels: p.followedChannels.includes(action.channelId)
          ? p.followedChannels.filter((c) => c !== action.channelId)
          : [...p.followedChannels, action.channelId],
      })
    case 'toggleSavedVideo':
      return next({
        savedVideos: p.savedVideos.includes(action.videoId)
          ? p.savedVideos.filter((v) => v !== action.videoId)
          : [...p.savedVideos, action.videoId],
      })

    case 'decide': return next({ decisions: { ...p.decisions, [action.insightId]: action.decision } })
    case 'dismissInsight': return next({ dismissed: [...p.dismissed, action.insightId] })
    case 'setTheme': return next({ theme: action.theme })
    case 'setSetting': return next({ settings: { ...p.settings, [action.key]: action.value } })
    case 'setReminders': return next({ reminders: { ...p.reminders, ...action.patch } })
    case 'setLevers': return next({ levers: action.levers })
    case 'awardMilestone':
      return p.milestones.includes(action.id) ? state : next({ milestones: [...p.milestones, action.id] })

    case 'serverConfig': return next({}, { server: action.config, serverReachable: action.reachable })
    case 'setProviders': return next({}, { providers: action.providers })
    case 'syncStart': return next({}, { syncing: true })
    case 'syncDone': {
      const hasLive = action.days.length > 0
      return derive(
        { ...p, dataMode: hasLive ? 'live' : p.dataMode },
        { ...rt, liveDays: action.days, syncErrors: action.errors, lastSyncAt: action.at, syncing: false },
      )
    }
    default: return state
  }
}

interface Ctx {
  state: State
  dispatch: (a: Action) => void
  refreshProviders: () => Promise<void>
  sync: () => Promise<void>
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => derive(defaultPersisted, emptyRuntime))

  // Read once. `bootstrapped` gates the writer below, so a double-mount in
  // development can never overwrite stored state with defaults.
  useEffect(() => {
    let payload: Partial<Persisted> = {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) payload = JSON.parse(raw) as Partial<Persisted>
    } catch { /* corrupt storage must never block the app */ }
    dispatch({ type: 'hydrate', payload })
  }, [])

  useEffect(() => {
    if (!state.bootstrapped) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedOf(state))) } catch { /* private mode */ }
  }, [state])

  const refreshProviders = useCallback(async () => {
    const r = await api.providers()
    if (r.ok) dispatch({ type: 'setProviders', providers: r.data.providers })
  }, [])

  const sync = useCallback(async () => {
    dispatch({ type: 'syncStart' })
    const r = await api.sync(180)
    if (r.ok) {
      dispatch({ type: 'syncDone', days: r.data.days, errors: r.data.errors, at: r.data.syncedAt })
    } else {
      dispatch({ type: 'syncDone', days: [], errors: [{ provider: 'jumbo', message: r.message }], at: Date.now() })
    }
    await refreshProviders()
  }, [refreshProviders])

  // Capability probe, once. Determines what the app can honestly offer.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await api.config()
      if (cancelled) return
      if (r.ok) {
        dispatch({ type: 'serverConfig', config: r.data, reachable: true })
        await refreshProviders()
        await sync()
      } else {
        dispatch({ type: 'serverConfig', config: null, reachable: r.kind !== 'offline' })
      }
    })()
    return () => { cancelled = true }
  }, [refreshProviders, sync])

  // Theme
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
      const light = state.theme === 'light' || (state.theme === 'system' && prefersLight)
      root.setAttribute('data-theme', light ? 'light' : 'dark')
      document.querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', light ? '#FAFBF8' : '#08090A')
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [state.theme])

  useEffect(() => { setHapticsEnabled(state.settings.haptics) }, [state.settings.haptics])
  useEffect(() => { setSoundEnabled(state.settings.sound) }, [state.settings.sound])

  const value = useMemo(() => ({ state, dispatch, refreshProviders, sync }), [state, refreshProviders, sync])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export const useToday = () => {
  const { state } = useStore()
  return state.days[state.days.length - 1]
}

export const isDemo = (s: State) => s.dataMode === 'demo'
export const connectedProviders = (s: State) => s.providers.filter((p) => p.connection)
export const newMealId = () => `meal-${uid()}`
