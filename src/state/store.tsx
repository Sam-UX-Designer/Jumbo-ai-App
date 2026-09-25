import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef,
  type ReactNode,
} from 'react'
import type { Viz } from '../components/DataViz'
import type {
  Baseline, DayRecord, GoalKey, InsightDecision, MealEntry, Measurement, Profile,
  Reminders, SleepEntry, WorkoutEntry, CustomFood,
} from '../data/types'
import { generateEmptyHistory, generateHistory, generateMeasurements, TODAY } from '../data/generate'
import type { AppNotification } from '../data/notifications'
import { computeBaseline } from '../lib/analytics'
import type { Levers } from '../lib/trajectory'
import { setHapticsEnabled, setSoundEnabled } from '../lib/feedback'
import { api, type ProviderInfo, type ServerConfig, type SyncedDay, type YoutubeVideo } from '../lib/api'
import type { PlanId } from '../data/plans'
import { planWorkoutType, type PlanSession, type TrainingPlan } from '../data/training'
import { hoursToHM, uid } from '../lib/util'
import {
  cloudConfigured, currentUser, onAuthChange, pullAndMerge, push, signOutCloud,
  type CloudUser,
} from '../lib/cloud'

const STORAGE_KEY = 'jumbo.state.v2'

/** A video kept in the person's own library, stored whole so it can be drawn. */
export type SavedVideo = YoutubeVideo

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
  /**
   * A chart, table or metric row Jumbo asked for alongside the words. The
   * model supplies the numbers; Jumbo draws it. See components/DataViz.
   */
  visualization?: Viz
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
  /**
   * The saved videos themselves, by id.
   *
   * `savedVideos` alone is only a list of ids, and an id cannot be drawn.
   * Keeping the video beside it is what lets Saved show what was saved after
   * the search that found it has been replaced.
   */
  savedVideoData: Record<string, SavedVideo>
  /**
   * The plan this person is actually on.
   *
   * There is no billing yet, so nothing in the app sets this to anything but
   * 'free'. It exists so the subscription card and Settings read the real
   * plan rather than a hard-coded one, and so the day checkout lands there is
   * one place to write to.
   */
  plan: PlanId
  theme: 'system' | 'light' | 'dark'
  settings: Settings
  reminders: Reminders
  levers: Levers | null
  milestones: string[]
  /**
   * Things that actually happened, written at the moment they happened.
   *
   * This is the notification feed's real source. The reducer appends to it
   * when a meal is saved, a workout is logged or a milestone is reached, so
   * every entry carries the instant of the event rather than a time chosen
   * later to look plausible. Nothing else writes to it, and the sample set
   * in data/notifications.ts is never mixed into it.
   */
  events: AppNotification[]
  /** Ids of notifications that have been read. Survives a reload. */
  readNotifications: string[]
  addedMeals: Record<string, MealEntry[]>
  /** Foods the person typed in themselves, kept so they need typing once. */
  customFoods: CustomFood[]
  addedWorkouts: Record<string, WorkoutEntry>
  /** Nights the person wrote down themselves, by date. */
  addedSleep: Record<string, SleepEntry>
  addedNotes: Record<string, string>
  addedMeasurements: Measurement[]
  /**
   * Training plans this person owns — written by them, or generated for
   * them and kept. Nothing ships in here: an account with no plans has no
   * plans, the same way an account with no meals has no meals.
   */
  plans: TrainingPlan[]
  /** Every session worked through, newest first. */
  sessions: PlanSession[]
}

export type CloudStatus = 'off' | 'signedOut' | 'syncing' | 'synced' | 'error'

export interface State extends Persisted {
  /**
   * The account this device is signed into, when accounts are configured at
   * all. Runtime only: the session itself belongs to Supabase, which keeps
   * it, so nothing here is written to local storage.
   */
  cloud: { status: CloudStatus; user: CloudUser | null; message: string | null }
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
  // Nobody is given sample data without asking for it. A new install starts
  // live and empty; 'demo' is reached only by choosing it on the connect
  // step, or from Settings later.
  dataMode: 'live',
  decisions: {},
  dismissed: [],
  followedChannels: [],
  savedVideos: [],
  savedVideoData: {},
  plan: 'free',
  theme: 'dark',
  settings: defaultSettings,
  reminders: defaultReminders,
  levers: null,
  milestones: [],
  events: [],
  readNotifications: [],
  addedMeals: {},
  customFoods: [],
  addedWorkouts: {},
  plans: [],
  sessions: [],
  addedSleep: {},
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
  | { type: 'chatReply'; id: string; text: string; followUps: string[]; visualization?: Viz | null }
  | { type: 'chatFail'; id: string; message: string }
  | { type: 'chatRetry'; id: string }
  | { type: 'chatClear' }
  | { type: 'finishOnboarding' }
  | { type: 'signOut' }
  | { type: 'addCustomFood'; food: CustomFood }
  | { type: 'cloudUser'; user: CloudUser | null }
  | { type: 'cloudStatus'; status: CloudStatus; message?: string | null }
  | { type: 'resetAll' }
  | { type: 'addMeal'; date: string; meal: MealEntry }
  | { type: 'removeMeal'; date: string; mealId: string }
  | { type: 'savePlan'; plan: TrainingPlan }
  | { type: 'removePlan'; planId: string }
  | { type: 'finishSession'; date: string; plan: TrainingPlan; minutes: number; intensity: 1 | 2 | 3; effort?: number; note?: string; workoutId: string; time: string; done: number }
  | { type: 'logWorkout'; date: string; workout: WorkoutEntry }
  | { type: 'removeWorkout'; date: string }
  | { type: 'logSleep'; date: string; sleep: SleepEntry }
  | { type: 'removeSleep'; date: string }
  | { type: 'setNote'; date: string; note: string }
  | { type: 'addMeasurement'; measurement: Measurement }
  | { type: 'toggleChannel'; channelId: string }
  | { type: 'toggleSavedVideo'; video: SavedVideo }
  | { type: 'decide'; insightId: string; decision: InsightDecision }
  | { type: 'dismissInsight'; insightId: string }
  | { type: 'setTheme'; theme: Persisted['theme'] }
  | { type: 'setSetting'; key: keyof Settings; value: boolean }
  | { type: 'setReminders'; patch: Partial<Reminders> }
  | { type: 'setLevers'; levers: Levers }
  | { type: 'awardMilestone'; id: string }
  | { type: 'readNotification'; id: string }
  | { type: 'readAllNotifications'; ids: string[] }
  | { type: 'serverConfig'; config: ServerConfig | null; reachable: boolean }
  | { type: 'setProviders'; providers: ProviderInfo[] }
  | { type: 'syncStart' }
  | { type: 'syncDone'; days: SyncedDay[]; errors: State['syncErrors']; at: number }

/* ------------------------------------------------------- sample history */
const sampleHistory = generateHistory(TODAY)
const sampleMeasurements = generateMeasurements(TODAY)
const emptyHistory = generateEmptyHistory(TODAY)

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

/**
 * Add an event to the feed, newest first, and keep the feed bounded.
 *
 * An event already in the feed is left alone rather than duplicated: saving
 * the same meal twice is one meal, and re-entering a screen is not news.
 */
const EVENT_LIMIT = 60
function record(events: AppNotification[], event: AppNotification): AppNotification[] {
  if (events.some((e) => e.id === event.id)) return events
  return [event, ...events].slice(0, EVENT_LIMIT)
}

/** The milestones the app can put into words. */
const MILESTONE_COPY: Record<string, { title: string; body: string }> = {
  'first-meal': {
    title: 'First meal logged',
    body: 'Food is the one thing a wearable cannot see. You have started filling that gap.',
  },
  'first-workout': {
    title: 'First workout logged',
    body: 'How a session felt is now part of your record, not just how long it was.',
  },
  'baseline-ready': {
    title: 'Your baseline is ready',
    body: 'Jumbo now has something to compare each day against.',
  },
}

function composeDays(p: Persisted, live: SyncedDay[]): DayRecord[] {
  // Sample data is shown only when the person chose it. In live mode with
  // nothing synced yet the history is the empty calendar, not the sample
  // one: someone who picked "I'll do it later" is told they have no data,
  // rather than being shown somebody else's and left to assume it is theirs.
  const base = p.dataMode === 'demo'
    ? sampleHistory
    : live.length ? fromLive(live) : emptyHistory
  return base.map((d) => {
    const extraMeals = p.addedMeals[d.date]
    const extraWorkout = p.addedWorkouts[d.date]
    const extraSleep = p.addedSleep[d.date]
    const note = p.addedNotes[d.date]
    if (!extraMeals && !extraWorkout && !extraSleep && !note) return d
    return {
      ...d,
      meals: extraMeals ? [...d.meals, ...extraMeals].sort((a, b) => a.time.localeCompare(b.time)) : d.meals,
      workout: extraWorkout ?? d.workout,
      // A session someone logged by hand is movement, and until this line it
      // was not: the workout was stored, shown on Capture, and then ignored
      // by every figure on Today, because movement is read from steps and
      // active minutes and a logged workout touched neither. Someone with no
      // wearable could record a two-hour ride and watch the app tell them
      // they had done nothing.
      //
      // The larger of the two wins rather than the sum. A tracker's active
      // minutes very likely already contain the ride, so adding them would
      // count it twice; the max says "at least this much", which is the most
      // the app can honestly claim from two overlapping accounts of one day.
      activeMinutes: extraWorkout
        ? Math.max(d.activeMinutes, extraWorkout.minutes)
        : d.activeMinutes,
      // A night written by hand fills a night nothing measured. A device's
      // own reading is left alone: it saw the whole night, and a person
      // remembering "about seven" should not overwrite it.
      sleepHours: extraSleep && d.sleepHours === 0 ? extraSleep.hours : d.sleepHours,
      bedtimeHour: extraSleep?.bedtimeHour !== undefined && d.bedtimeHour === 0
        ? extraSleep.bedtimeHour : d.bedtimeHour,
      sleepEfficiency: extraSleep?.efficiency !== undefined && d.sleepEfficiency === 0
        ? extraSleep.efficiency : d.sleepEfficiency,
      restDay: extraWorkout ? false : d.restDay,
      notes: note ?? d.notes,
    }
  })
}

type Runtime = Pick<State,
  'server' | 'serverReachable' | 'providers' | 'liveDays' | 'syncErrors' | 'lastSyncAt'
  | 'syncing' | 'bootstrapped' | 'selectedDate' | 'chat' | 'cloud'>

const emptyRuntime: Runtime = {
  server: null, serverReachable: null, providers: [],
  liveDays: [], syncErrors: [], lastSyncAt: null, syncing: false,
  bootstrapped: false,
  selectedDate: TODAY,
  chat: [],
  cloud: { status: cloudConfigured ? 'signedOut' : 'off', user: null, message: null },
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
  cloud: s.cloud,
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
        // Absent in state stored before saved videos kept their own copy.
        savedVideoData: action.payload.savedVideoData ?? {},
        plan: action.payload.plan ?? 'free',
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
    /**
     * Ends the session on this device without deleting anything. Records stay
     * where they are; the person lands back at the start and signs in again.
     */
    case 'signOut': return next({ onboarded: false, phoneVerified: false })

    case 'cloudUser':
      return next({}, {
        cloud: {
          status: action.user ? 'syncing' : (cloudConfigured ? 'signedOut' : 'off'),
          user: action.user,
          message: null,
        },
      })
    case 'cloudStatus':
      return next({}, {
        cloud: { ...rt.cloud, status: action.status, message: action.message ?? null },
      })

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
          ? {
            ...m,
            text: action.text,
            followUps: action.followUps,
            visualization: action.visualization ?? undefined,
            pending: false,
            error: undefined,
          }
          : m)),
      }
    case 'chatFail':
      return {
        ...state,
        chat: state.chat.map((m) => (m.id === action.id
          ? { ...m, pending: false, error: action.message }
          : m)),
      }
    /**
     * Asking the same question again after a failure.
     *
     * The failed turn is put back into its waiting state in place, so the
     * thread stays one question and one answer. Appending a fresh pair would
     * leave the error on screen and the question written out twice.
     */
    case 'chatRetry':
      return {
        ...state,
        chat: state.chat.map((m) => (m.id === action.id
          ? { ...m, text: '', followUps: undefined, visualization: undefined, error: undefined, pending: true }
          : m)),
      }
    case 'chatClear': return { ...state, chat: [] }
    case 'resetAll':
      return derive({ ...defaultPersisted, theme: p.theme }, {
        ...emptyRuntime, bootstrapped: true,
        server: rt.server, serverReachable: rt.serverReachable, providers: rt.providers,
      })

    case 'addMeal':
      return next({
        addedMeals: { ...p.addedMeals, [action.date]: [...(p.addedMeals[action.date] ?? []), action.meal] },
        events: record(p.events, {
          id: `ev-meal-${action.meal.id}`,
          kind: 'meal',
          route: 'capture',
          at: new Date().toISOString(),
          title: action.meal.method === 'camera' ? 'Meal analysis complete' : 'Meal saved',
          body: action.meal.method === 'camera'
            ? `Your ${action.meal.slot.toLowerCase()} photo was read and added to the day.`
            : `${action.meal.slot} was added to the day.`,
        }),
      })
    case 'addCustomFood': {
      // Typed twice, kept once. Matching on the name is what makes the
      // second chapati find the first rather than stacking up beside it.
      const name = action.food.name.trim().toLowerCase()
      const without = p.customFoods.filter((f) => f.name.trim().toLowerCase() !== name)
      return next({ customFoods: [action.food, ...without].slice(0, 300) })
    }
    case 'removeMeal':
      return next({ addedMeals: { ...p.addedMeals, [action.date]: (p.addedMeals[action.date] ?? []).filter((m) => m.id !== action.mealId) } })
    case 'savePlan': {
      // Saving an edited plan replaces it in place, so a plan keeps its
      // identity, its history and its position rather than becoming a
      // second copy of itself.
      const existing = p.plans.findIndex((x) => x.id === action.plan.id)
      const plans = existing >= 0
        ? p.plans.map((x, i) => (i === existing ? action.plan : x))
        : [action.plan, ...p.plans]
      return next({ plans })
    }

    case 'removePlan':
      // The sessions stay. They happened, and the name was copied into each
      // one precisely so deleting the plan does not erase the history.
      return next({ plans: p.plans.filter((x) => x.id !== action.planId) })

    /**
     * A finished session.
     *
     * Two things happen at once and they have to stay together: the plan
     * records that it was done, and the day gets a real workout. Without
     * the second the session would show on the plan and nowhere else —
     * exactly the bug that made a logged ride count for nothing on Today.
     */
    case 'finishSession':
      return next({
        plans: p.plans.map((x) => (x.id === action.plan.id
          ? { ...x, lastDoneAt: Date.now(), timesDone: x.timesDone + 1 }
          : x)),
        // The history, newest first. Capped: a person who trains daily for
        // three years should not carry a thousand rows in localStorage.
        sessions: [{
          id: action.workoutId,
          planId: action.plan.id,
          planName: action.plan.name,
          date: action.date,
          minutes: action.minutes,
          done: action.done,
          total: action.plan.blocks.length,
          intensity: action.intensity,
          effort: action.effort,
          note: action.note,
          at: Date.now(),
        }, ...p.sessions].slice(0, 200),
        addedWorkouts: {
          ...p.addedWorkouts,
          [action.date]: {
            id: action.workoutId,
            time: action.time,
            type: planWorkoutType(action.plan.blocks),
            minutes: action.minutes,
            intensity: action.intensity,
            perceivedEffort: action.effort,
            note: action.note ? `${action.plan.name} — ${action.note}` : action.plan.name,
            source: 'manual',
          },
        },
        events: record(p.events, {
          id: `ev-session-${action.workoutId}`,
          kind: 'workout',
          route: 'capture',
          at: new Date().toISOString(),
          title: 'Session finished',
          body: `${action.plan.name}, ${action.minutes} minutes, added to the day.`,
        }),
      })

    case 'logWorkout':
      return next({
        addedWorkouts: { ...p.addedWorkouts, [action.date]: action.workout },
        events: record(p.events, {
          id: `ev-workout-${action.workout.id}`,
          kind: 'workout',
          route: 'capture',
          at: new Date().toISOString(),
          title: 'Workout saved',
          body: `${action.workout.type}, ${action.workout.minutes} minutes, added to the day.`,
        }),
      })
    case 'removeWorkout': {
      const w = { ...p.addedWorkouts }; delete w[action.date]
      return next({ addedWorkouts: w })
    }
    case 'logSleep':
      return next({
        addedSleep: { ...p.addedSleep, [action.date]: action.sleep },
        events: record(p.events, {
          id: `ev-sleep-${action.date}`,
          kind: 'insight',
          route: 'capture',
          at: new Date().toISOString(),
          title: 'Sleep saved',
          body: `${hoursToHM(action.sleep.hours)} recorded for the night.`,
        }),
      })
    case 'removeSleep': {
      const sl = { ...p.addedSleep }; delete sl[action.date]
      return next({ addedSleep: sl })
    }
    case 'setNote': return next({ addedNotes: { ...p.addedNotes, [action.date]: action.note } })
    case 'addMeasurement': return next({ addedMeasurements: [action.measurement, ...p.addedMeasurements] })

    case 'toggleChannel':
      return next({
        followedChannels: p.followedChannels.includes(action.channelId)
          ? p.followedChannels.filter((c) => c !== action.channelId)
          : [...p.followedChannels, action.channelId],
      })
    case 'toggleSavedVideo': {
      const { id } = action.video
      if (p.savedVideos.includes(id)) {
        const data = { ...p.savedVideoData }
        delete data[id]
        return next({ savedVideos: p.savedVideos.filter((v) => v !== id), savedVideoData: data })
      }
      // The video travels with the id, so Saved still has something to draw
      // once the search that turned it up is gone.
      return next({
        savedVideos: [...p.savedVideos, id],
        savedVideoData: { ...p.savedVideoData, [id]: action.video },
      })
    }

    case 'decide': return next({ decisions: { ...p.decisions, [action.insightId]: action.decision } })
    case 'dismissInsight': return next({ dismissed: [...p.dismissed, action.insightId] })
    case 'setTheme': return next({ theme: action.theme })
    case 'setSetting': return next({ settings: { ...p.settings, [action.key]: action.value } })
    case 'setReminders': return next({ reminders: { ...p.reminders, ...action.patch } })
    case 'setLevers': return next({ levers: action.levers })
    case 'awardMilestone': {
      if (p.milestones.includes(action.id)) return state
      const said = MILESTONE_COPY[action.id]
      return next({
        milestones: [...p.milestones, action.id],
        // Only a milestone the app has words for becomes a notification.
        // A bare id is not something to tell someone about.
        events: said
          ? record(p.events, {
            id: `ev-milestone-${action.id}`,
            kind: 'achievement',
            route: 'you',
            at: new Date().toISOString(),
            ...said,
          })
          : p.events,
      })
    }

    case 'readNotification':
      return p.readNotifications.includes(action.id)
        ? state
        : next({ readNotifications: [...p.readNotifications, action.id] })
    case 'readAllNotifications':
      return next({ readNotifications: [...new Set([...p.readNotifications, ...action.ids])] })

    case 'serverConfig': return next({}, { server: action.config, serverReachable: action.reachable })
    case 'setProviders': return next({}, { providers: action.providers })
    case 'syncStart': return next({}, { syncing: true })
    case 'syncDone': {
      // Defensive: a server answering 200 with the wrong shape is a bad
      // sync, not a reason for the whole app to fail to render.
      const days = Array.isArray(action.days) ? action.days : []
      const hasLive = days.length > 0
      return derive(
        { ...p, dataMode: hasLive ? 'live' : p.dataMode },
        { ...rt, liveDays: days, syncErrors: Array.isArray(action.errors) ? action.errors : [], lastSyncAt: action.at, syncing: false },
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
  /** End the session on this device, in the account and in the app. */
  leave: () => Promise<void>
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => derive(defaultPersisted, emptyRuntime))

  // The newest state, for the async account work below. Reading `state`
  // inside a promise gives whatever it was when the effect was created,
  // which is how a sync quietly writes back an old copy.
  const stateRef = useRef(state)
  stateRef.current = state

  // Read once. `bootstrapped` gates the writer below, so a double-mount in
  // development can never overwrite stored state with defaults.
  useEffect(() => {
    let payload: Partial<Persisted> = {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      // Valid JSON is not necessarily a state. The literal `null`, an array
      // or a number all parse cleanly and then throw the moment anything
      // reads a field off them — which, on boot, is a white screen rather
      // than a bad setting. Only an object is worth hydrating from.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Partial<Persisted>
      }
    } catch { /* corrupt storage must never block the app */ }
    dispatch({ type: 'hydrate', payload })
  }, [])

  useEffect(() => {
    if (!state.bootstrapped) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedOf(state)))
      // When this device last wrote. The account's copy carries the same
      // idea as a server timestamp, and the two are compared to decide
      // which side's preferences win in a merge.
      localStorage.setItem('jumbo.savedAt', String(Date.now()))
    } catch { /* private mode */ }
  }, [state])

  /*
   * The account.
   *
   * Nothing below runs when accounts are not configured: the app stays
   * exactly as it was, on this device, and the interface says so rather
   * than offering a sign-in that cannot work.
   */
  useEffect(() => {
    if (!cloudConfigured) return
    let live = true
    void currentUser().then((user) => { if (live) dispatch({ type: 'cloudUser', user }) })
    const stop = onAuthChange((user) => dispatch({ type: 'cloudUser', user }))
    return () => { live = false; stop() }
  }, [])

  /*
   * Signing in pulls the account's records and merges them with this
   * device's, then writes the result back. Merged, not replaced: a meal
   * logged on a phone and a workout logged on a laptop both survive. See
   * lib/merge.ts.
   */
  const signedInAs = state.cloud.user?.id ?? null
  useEffect(() => {
    if (!cloudConfigured || !signedInAs || !state.bootstrapped) return
    let live = true
    ;(async () => {
      dispatch({ type: 'cloudStatus', status: 'syncing' })
      const pulled = await pullAndMerge(persistedOf(stateRef.current))
      if (!live) return
      if (!pulled.ok) {
        dispatch({ type: 'cloudStatus', status: 'error', message: pulled.message })
        return
      }
      dispatch({ type: 'hydrate', payload: pulled.data })
      const wrote = await push(pulled.data)
      if (!live) return
      dispatch(wrote.ok
        ? { type: 'cloudStatus', status: 'synced' }
        : { type: 'cloudStatus', status: 'error', message: wrote.message })
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInAs, state.bootstrapped])

  /*
   * Afterwards, changes are pushed on a delay.
   *
   * Typing a note fires the reducer on every keystroke, and a write per
   * keystroke is a write the database does not need and the person's
   * connection does not want. Two seconds of quiet, then one write.
   */
  useEffect(() => {
    if (!cloudConfigured || !signedInAs || !state.bootstrapped) return
    if (state.cloud.status === 'syncing') return
    const t = window.setTimeout(() => {
      void push(persistedOf(stateRef.current)).then((r) => {
        dispatch(r.ok
          ? { type: 'cloudStatus', status: 'synced' }
          : { type: 'cloudStatus', status: 'error', message: r.message })
      })
    }, 2000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, signedInAs])

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

  /**
   * Leaving the app on this device.
   *
   * Two things end, in an order that matters: the Supabase session first,
   * so the sync effects stop the moment there is no account, and then the
   * app's own session. The records stay exactly where they are, on the
   * device and in the account, and signing back in brings both together.
   */
  const leave = useCallback(async () => {
    if (cloudConfigured) await signOutCloud()
    dispatch({ type: 'signOut' })
  }, [])

  const value = useMemo(
    () => ({ state, dispatch, refreshProviders, sync, leave }),
    [state, refreshProviders, sync, leave],
  )
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
