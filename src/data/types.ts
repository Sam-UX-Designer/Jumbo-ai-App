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

export interface WorkoutEntry {
  id: string
  type: WorkoutType
  minutes: number
  intensity: 1 | 2 | 3          // easy / moderate / hard
  perceivedEffort?: number      // 1–10, human input alongside the numbers
  note?: string
  source: 'imported' | 'manual'
}

export type WorkoutType =
  | 'Run' | 'Walk' | 'Cycle' | 'Strength' | 'Swim' | 'Yoga' | 'Mobility' | 'Hike' | 'Row' | 'Other'

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
