export type MetricKey =
  | 'sleep' | 'steps' | 'workouts' | 'heart' | 'body' | 'nutrition'

export interface SourceDef {
  id: string
  name: string
  vendor: string
  kind: 'phone' | 'wearable' | 'scale' | 'lab' | 'app'
  provides: MetricKey[]
  /** What this source cannot supply — surfaced as a fillable gap, never a dead end. */
  blurb: string
  accent: string
}

export interface Connection {
  id: string
  connectedAt: number
  lastSyncMinutesAgo: number
  status: 'connected' | 'syncing' | 'stale' | 'error'
}

export interface DayRecord {
  date: string
  sleepHours: number
  sleepEfficiency: number   // %
  bedtimeHour: number       // 24h decimal, e.g. 23.5
  steps: number
  activeMinutes: number
  restingHR: number
  hrv: number               // ms
  weightKg: number
  bodyFatPct: number
  workout?: WorkoutEntry
  meals: MealEntry[]
  notes?: string
  restDay: boolean
}

/**
 * A night's sleep, as the person recorded it.
 *
 * Sleep used to reach Jumbo only from a wearable, which meant anyone
 * without one — everyone on the web, where no health app can be connected —
 * watched the headline sleep metric read "—" forever, with no way to change
 * it. This is the hand-written version: the hours are what matters, the
 * rest is offered and optional.
 */
export interface SleepEntry {
  /** Hours asleep. The one figure the day's sleep score is built from. */
  hours: number
  /** 24h decimal, e.g. 23.5 for half past eleven. Absent if not given. */
  bedtimeHour?: number
  /** 0–100. How much of the time in bed was actually asleep. */
  efficiency?: number
  /** Local wall-clock the entry was saved, for ordering against the day. */
  time?: string
  source: 'manual'
}

export interface WorkoutEntry {
  id: string
  /**
   * Local wall-clock, "18:26", the same shape and the same meaning as
   * MealEntry.time. It is the moment the session was saved, and it is what
   * orders this workout against the day's meals. Absent on a workout that
   * arrived from a wearable without one: those sync as a daily total, and
   * inventing a time for them would be a guess presented as a record.
   */
  time?: string
  type: WorkoutType
  minutes: number
  intensity: 1 | 2 | 3          // easy / moderate / hard
  perceivedEffort?: number      // 1–10, human input alongside the numbers
  note?: string
  source: 'imported' | 'manual'
}

export type WorkoutType =
  | 'Run' | 'Walk' | 'Cycle' | 'Strength' | 'Swim' | 'Yoga' | 'Mobility' | 'Hike' | 'Row' | 'Other'

/**
 * A food Jumbo did not ship with, typed in by the person.
 *
 * The built-in list is thirty-odd Western staples, which is no use to
 * somebody eating chapati and sambar. Rather than leaving them stuck at "no
 * match", anything can be added — and it is kept, so the second time they
 * eat it the name is already there.
 *
 * The numbers are theirs. Jumbo does not estimate them, and does not
 * pretend to: an empty field stays zero rather than being filled in with a
 * guess, and the totals say what was actually entered.
 */
export interface CustomFood {
  id: string
  name: string
  portion: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** When it was first added, so the newest sits nearest the search box. */
  at: number
}

export interface FoodItem {
  id: string
  name: string
  portion: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** Model confidence for this item, 0–1. Shown, never hidden. */
  confidence: number
}

export interface MealEntry {
  id: string
  time: string                  // "08:20"
  slot: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
  items: FoodItem[]
  method: 'camera' | 'manual' | 'imported'
  /** True once a human has reviewed and confirmed the AI's proposal. */
  confirmed: boolean
  /**
   * A small JPEG data URL of the photograph this meal was read from, kept so
   * the entry shows what was actually analysed. Downscaled before it is
   * stored — the full capture would exhaust localStorage within a few meals.
   */
  photo?: string
  photoSeed?: number
}

export interface Measurement {
  id: string
  kind: MeasurementKind
  date: string
  value: number
  unit: string
  source: string
  context?: string
}

export type MeasurementKind =
  | 'vo2max' | 'bodyFat' | 'leanMass' | 'boneDensity' | 'restingHR'
  | 'apoB' | 'hba1c' | 'ldl' | 'hdl' | 'triglycerides' | 'crp' | 'vitaminD'
  | 'gripStrength' | 'waist'

export interface Creator {
  id: string
  name: string
  handle: string
  field: 'Strength' | 'Nutrition' | 'Sleep' | 'Longevity' | 'Endurance' | 'Mobility'
  subscribers: string
  bio: string
  hue: number
}

export interface Video {
  id: string
  creatorId: string
  title: string
  minutes: number
  topics: GoalKey[]
  summary: string
}

export type GoalKey =
  | 'energy' | 'fitness' | 'sleep' | 'nutrition' | 'aging' | 'consistency' | 'custom'

export interface Goal {
  key: GoalKey
  label: string
  detail: string
}

/** The only identity Jumbo asks for. Phone is the account key. */
export interface Profile {
  name: string
  phone: string
  /**
   * The photo shown top right on every screen. A downscaled data URL held
   * only on this device — it is never sent to the server or to the AI.
   */
  photo?: string | null
}

/** Times Jumbo will nudge, in 24h "HH:MM". Empty string means off. */
export interface Reminders {
  enabled: boolean
  breakfast: string
  lunch: string
  dinner: string
  workout: string
}

export interface Insight {
  id: string
  domain: 'sleep' | 'movement' | 'nutrition' | 'recovery' | 'body'
  /** The six-beat structure: change → why → evidence → confidence → options → choice. */
  changed: string
  why: string
  evidence: string[]
  /** 0–1. Rendered as a labelled band, never as a bare percentage claim. */
  confidence: number
  limitation: string
  options: string[]
  window: string
  createdAt: number
}

export type InsightDecision = 'trying' | 'not-now' | 'saved'

export interface Baseline {
  sleepHours: number
  steps: number
  restingHR: number
  hrv: number
  vo2max: number
  bodyFatPct: number
  weightKg: number
  proteinG: number
  weeklyActiveMinutes: number
  strengthPerWeek: number
  computedAt: number
  daysOfHistory: number
}
