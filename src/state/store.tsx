import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type {
  Baseline, Connection, DayRecord, GoalKey, InsightDecision, MealEntry,
  Measurement, WorkoutEntry,
} from '../data/types'
import { generateHistory, generateMeasurements, TODAY } from '../data/generate'
import { computeBaseline } from '../lib/analytics'
import type { Levers } from '../lib/trajectory'

import { setHapticsEnabled } from '../lib/haptics'
import { uid } from '../lib/util'

const STORAGE_KEY = 'jumbo.state.v1'

export interface Settings {
  haptics: boolean
  /** Analysis of patterns across your data. Off by default is not the goal —
   *  but the switch must exist and must actually change what the app shows. */
  aiPatterns: boolean
  /** Whether anything leaves the device. Simulated, but honest about itself. */
  cloudProcessing: boolean
  creatorPersonalisation: boolean
  reduceMotionPreferred: boolean
}

export interface Persisted {
  onboarded: boolean
  sampleMode: boolean
  goal: GoalKey | null
  customGoal: string
  connections: Record<string, Connection>
  following: string[]
  decisions: Record<string, InsightDecision>
  dismissed: string[]
  theme: 'system' | 'light' | 'dark'
  settings: Settings
  levers: Levers | null
  milestones: string[]
  /** User-authored records layered on top of the imported history. */
  addedMeals: Record<string, MealEntry[]>
  addedWorkouts: Record<string, WorkoutEntry>
  addedNotes: Record<string, string>
  addedMeasurements: Measurement[]
  manualGapValues: Record<string, number>
}

export interface State extends Persisted {
  days: DayRecord[]
  measurements: Measurement[]
  baseline: Baseline
  today: string
  hydrated: boolean
}

const defaultSettings: Settings = {
  haptics: true,
  aiPatterns: true,
  cloudProcessing: false,
  creatorPersonalisation: true,
  reduceMotionPreferred: false,
}

const defaultPersisted: Persisted = {
  onboarded: false,
  sampleMode: false,
  goal: null,
  customGoal: '',
  connections: {},
  following: ['c1', 'c4'],
  decisions: {},
  dismissed: [],
  theme: 'system',
  settings: defaultSettings,
  levers: null,
  milestones: [],
  addedMeals: {},
  addedWorkouts: {},
  addedNotes: {},
  addedMeasurements: [],
  manualGapValues: {},
}

export type Action =
  | { type: 'hydrate'; payload: Partial<Persisted> }
  | { type: 'setGoal'; goal: GoalKey; custom?: string }
  | { type: 'connect'; sourceId: string }
  | { type: 'disconnect'; sourceId: string }
  | { type: 'sync'; sourceId: string }
  | { type: 'finishOnboarding'; sampleMode?: boolean }
  | { type: 'resetAll' }
  | { type: 'addMeal'; date: string; meal: MealEntry }
  | { type: 'updateMeal'; date: string; meal: MealEntry }
  | { type: 'removeMeal'; date: string; mealId: string }
  | { type: 'logWorkout'; date: string; workout: WorkoutEntry }
  | { type: 'removeWorkout'; date: string }
  | { type: 'setNote'; date: string; note: string }
  | { type: 'addMeasurement'; measurement: Measurement }
  | { type: 'setGapValue'; key: string; value: number }
  | { type: 'toggleFollow'; creatorId: string }
  | { type: 'decide'; insightId: string; decision: InsightDecision }
  | { type: 'dismissInsight'; insightId: string }
  | { type: 'setTheme'; theme: Persisted['theme'] }
  | { type: 'setSetting'; key: keyof Settings; value: boolean }
  | { type: 'setLevers'; levers: Levers }
  | { type: 'awardMilestone'; id: string }

/** The imported history, generated once and reused. */
const baseHistory = generateHistory(TODAY)
const baseMeasurements = generateMeasurements(TODAY)

function composeDays(p: Persisted): DayRecord[] {
  const connected = Object.keys(p.connections).length > 0
  if (!connected) {
    // Nothing connected: only what the person entered by hand exists.
    const dates = new Set([
      ...Object.keys(p.addedMeals), ...Object.keys(p.addedWorkouts), ...Object.keys(p.addedNotes), TODAY,
    ])
    return [...dates].sort().map((date) => ({
      date, sleepHours: 0, sleepEfficiency: 0, bedtimeHour: 23, steps: 0, activeMinutes: 0,
      restingHR: 0, hrv: 0, weightKg: 0, bodyFatPct: 0,
      workout: p.addedWorkouts[date], meals: p.addedMeals[date] ?? [],
      notes: p.addedNotes[date], restDay: !p.addedWorkouts[date],
    }))
  }
  return baseHistory.map((d) => {
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

function derive(p: Persisted): State {
  const connected = Object.keys(p.connections).length > 0
  const days = composeDays(p)
  const measurements = connected
    ? [...p.addedMeasurements, ...baseMeasurements].sort((a, b) => (a.date < b.date ? 1 : -1))
    : [...p.addedMeasurements].sort((a, b) => (a.date < b.date ? 1 : -1))
  return {
    ...p,
    days,
    measurements,
    baseline: computeBaseline(days, measurements),
    today: TODAY,
    hydrated: true,
  }
}

function persistedFrom(s: State): Persisted {
  const { days: _d, measurements: _m, baseline: _b, today: _t, hydrated: _h, ...rest } = s
  return rest
}

function reducer(state: State, action: Action): State {
  const p = persistedFrom(state)

  switch (action.type) {
    case 'hydrate':
      return derive({ ...p, ...action.payload, settings: { ...defaultSettings, ...(action.payload.settings ?? {}) } })

    case 'setGoal':
      return derive({ ...p, goal: action.goal, customGoal: action.custom ?? '' })

    case 'connect':
      return derive({
        ...p,
        connections: {
          ...p.connections,
          [action.sourceId]: { id: action.sourceId, connectedAt: Date.now(), lastSyncMinutesAgo: 2, status: 'connected' },
        },
      })

    case 'disconnect': {
      const next = { ...p.connections }
      delete next[action.sourceId]
      return derive({ ...p, connections: next })
    }

    case 'sync':
      return derive({
        ...p,
        connections: {
          ...p.connections,
          [action.sourceId]: { ...p.connections[action.sourceId], lastSyncMinutesAgo: 0, status: 'connected' },
        },
      })

    case 'finishOnboarding':
      return derive({ ...p, onboarded: true, sampleMode: action.sampleMode ?? p.sampleMode })

    case 'resetAll':
      return derive({ ...defaultPersisted, theme: p.theme })

    case 'addMeal':
      return derive({
        ...p,
        addedMeals: { ...p.addedMeals, [action.date]: [...(p.addedMeals[action.date] ?? []), action.meal] },
      })

    case 'updateMeal': {
      const list = p.addedMeals[action.date] ?? []
      const exists = list.some((m) => m.id === action.meal.id)
      return derive({
        ...p,
        addedMeals: {
          ...p.addedMeals,
          [action.date]: exists ? list.map((m) => (m.id === action.meal.id ? action.meal : m)) : [...list, action.meal],
        },
      })
    }

    case 'removeMeal':
      return derive({
        ...p,
        addedMeals: {
          ...p.addedMeals,
          [action.date]: (p.addedMeals[action.date] ?? []).filter((m) => m.id !== action.mealId),
        },
      })

    case 'logWorkout':
      return derive({ ...p, addedWorkouts: { ...p.addedWorkouts, [action.date]: action.workout } })

    case 'removeWorkout': {
      const next = { ...p.addedWorkouts }
      delete next[action.date]
      return derive({ ...p, addedWorkouts: next })
    }

    case 'setNote':
      return derive({ ...p, addedNotes: { ...p.addedNotes, [action.date]: action.note } })

    case 'addMeasurement':
      return derive({ ...p, addedMeasurements: [action.measurement, ...p.addedMeasurements] })

    case 'setGapValue':
      return derive({ ...p, manualGapValues: { ...p.manualGapValues, [action.key]: action.value } })

    case 'toggleFollow':
      return derive({
        ...p,
        following: p.following.includes(action.creatorId)
          ? p.following.filter((c) => c !== action.creatorId)
          : [...p.following, action.creatorId],
      })

    case 'decide':
      return derive({ ...p, decisions: { ...p.decisions, [action.insightId]: action.decision } })

    case 'dismissInsight':
      return derive({ ...p, dismissed: [...p.dismissed, action.insightId] })

    case 'setTheme':
      return derive({ ...p, theme: action.theme })

    case 'setSetting':
      return derive({ ...p, settings: { ...p.settings, [action.key]: action.value } })

    case 'setLevers':
      return derive({ ...p, levers: action.levers })

    case 'awardMilestone':
      return p.milestones.includes(action.id) ? state : derive({ ...p, milestones: [...p.milestones, action.id] })

    default:
      return state
  }
}

const StoreCtx = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, defaultPersisted, derive)
  const loaded = useRef(false)

  // Load once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) dispatch({ type: 'hydrate', payload: JSON.parse(raw) as Partial<Persisted> })
    } catch {
      /* Corrupt or unavailable storage should never block the app. */
    }
    loaded.current = true
  }, [])

  // Save on change.
  useEffect(() => {
    if (!loaded.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedFrom(state)))
    } catch {
      /* Private browsing — the session still works, it just will not persist. */
    }
  }, [state])

  // Theme + haptics side effects.
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const dark = state.theme === 'dark' || (state.theme === 'system' && prefersDark)
      root.setAttribute('data-theme', dark ? 'dark' : 'light')
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [state.theme])

  useEffect(() => { setHapticsEnabled(state.settings.haptics) }, [state.settings.haptics])

  const value = useMemo(() => ({ state, dispatch }), [state])
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

export const isConnected = (s: State) => Object.keys(s.connections).length > 0

export const newMealId = () => `meal-${uid()}`
