/**
 * Detection and typing for the native health bridge described in docs/NATIVE.md.
 * If the bridge is absent, native sources are unavailable and the UI says so.
 * Nothing here ever fabricates a connection or a reading.
 */

export type HealthType =
  | 'sleep' | 'steps' | 'activeMinutes' | 'workouts'
  | 'restingHeartRate' | 'hrv' | 'vo2max'
  | 'weight' | 'bodyFat' | 'leanMass' | 'nutrition'

export interface NativeDay {
  date: string
  sleepHours?: number
  sleepEfficiency?: number
  bedtimeHour?: number
  steps?: number
  activeMinutes?: number
  restingHR?: number
  hrv?: number
  vo2max?: number
  weightKg?: number
  bodyFatPct?: number
  leanMassKg?: number
  workout?: { type: string; minutes: number; intensity?: 1 | 2 | 3 }
  source: string
}

export interface JumboNativeBridge {
  platform: 'ios' | 'android'
  available(): Promise<{ healthkit: boolean; healthConnect: boolean }>
  requestPermissions(types: HealthType[]): Promise<{ granted: HealthType[]; denied: HealthType[] }>
  read(request: { types: HealthType[]; from: string; to: string }): Promise<NativeDay[]>
  onUpdate?(cb: () => void): () => void
}

declare global {
  interface Window { JumboNative?: JumboNativeBridge }
}

export const nativeBridge = (): JumboNativeBridge | null =>
  typeof window !== 'undefined' && window.JumboNative ? window.JumboNative : null

export const ALL_HEALTH_TYPES: HealthType[] = [
  'sleep', 'steps', 'activeMinutes', 'workouts',
  'restingHeartRate', 'hrv', 'vo2max',
  'weight', 'bodyFat', 'leanMass', 'nutrition',
]

/** Which platform this browser is on, used only to explain what is missing. */
export function guessPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}
