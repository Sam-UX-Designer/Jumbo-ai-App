import type { Baseline } from '../data/types'
import { clamp, round } from './util'

/**
 * The levers a person can actually pull. Each one is a weekly behaviour, not a
 * target score — the point of the Trajectory screen is to ask "what if this
 * pattern continues", so every input is something you could keep doing.
 */
export interface Levers {
  sleepHours: number        // average nightly hours
  cardioMinutes: number     // easy/moderate aerobic minutes per week
  strengthSessions: number  // sessions per week
  steps: number             // typical daily steps
  proteinPerKg: number      // g per kg body weight per day
}

export interface Projected {
  vo2max: number
  restingHR: number
  bodyFatPct: number
  leanMassKg: number
  recoveryIndex: number   // 0–100, a composite of HRV + sleep consistency
  /** Half-width of the plausible range for each headline figure. */
  band: { vo2max: number; restingHR: number; bodyFatPct: number; leanMassKg: number; recoveryIndex: number }
}

export const MONTH_OPTIONS = [12, 36, 60] as const
export type Horizon = (typeof MONTH_OPTIONS)[number]

export function leversFromBaseline(b: Baseline): Levers {
  return {
    sleepHours: b.sleepHours,
    cardioMinutes: Math.round(clamp(b.weeklyActiveMinutes * 0.55, 40, 400) / 5) * 5,
    strengthSessions: Math.round(clamp(b.strengthPerWeek, 0, 6)),
    steps: Math.round(b.steps / 500) * 500,
    proteinPerKg: round(clamp(b.proteinG / b.weightKg, 0.6, 2.4), 1),
  }
}

/**
 * A transparent, deliberately simple model. It is not a clinical prediction:
 * it takes well-described directional relationships between training, sleep,
 * protein and body composition, applies them to *this person's* baseline, and
 * widens its uncertainty band the further out it looks.
 *
 * Every relationship used here is listed in RELATIONSHIPS below and shown in
 * the UI, so the person can see what the model believes and judge it.
 */
export function project(base: Baseline, l: Levers, months: Horizon): Projected {
  const years = months / 12

  // --- VO₂ max -----------------------------------------------------------
  // Aerobic volume drives gains with diminishing returns; ageing subtracts a
  // slow background decline. Adaptation front-loads, so we damp with sqrt(t).
  const cardioDose = Math.log2(1 + l.cardioMinutes / 60)            // ~0 at 0 min, ~2.6 at 300 min
  const strengthDose = Math.min(l.strengthSessions, 4) * 0.28
  const sleepFactor = clamp((l.sleepHours - 5.8) / 1.6, 0.25, 1.15) // recovery gates adaptation
  const headroom = clamp((58 - base.vo2max) / 16, 0.25, 1.25)       // trained people gain slower
  const vo2Gain = (cardioDose * 1.55 + strengthDose) * sleepFactor * headroom * Math.sqrt(years)
  const vo2Decline = 0.42 * years                                   // background age-related drift
  const vo2max = clamp(base.vo2max + vo2Gain - vo2Decline, 18, 70)

  // --- Resting heart rate -------------------------------------------------
  const rhrDrop = (cardioDose * 1.5 + (l.sleepHours - 6.6) * 0.9) * Math.sqrt(years)
  const restingHR = clamp(base.restingHR - rhrDrop, 38, 90)

  // --- Body composition ---------------------------------------------------
  // Energy balance is not modelled directly (the app does not ask people to
  // count calories). Movement volume and protein sufficiency are used as
  // directional proxies, which is why the band on this figure is the widest.
  const stepEffect = (l.steps - 6500) / 4200
  const proteinEffect = clamp((l.proteinPerKg - 1.0) / 0.6, -0.8, 1.4)
  const fatChange = -(stepEffect * 0.85 + cardioDose * 0.55 + l.strengthSessions * 0.32) * years
    + clamp(1.1 - sleepFactor, 0, 0.6) * years
  const bodyFatPct = clamp(base.bodyFatPct + fatChange, 8, 42)

  const leanBase = base.weightKg * (1 - base.bodyFatPct / 100)
  const leanChange = (Math.min(l.strengthSessions, 4) * 0.42 + proteinEffect * 0.5) * sleepFactor * Math.sqrt(years)
    - 0.28 * years // age-related loss without a stimulus
  const leanMassKg = clamp(leanBase + leanChange, 30, 90)

  // --- Recovery index -----------------------------------------------------
  const loadPenalty = clamp((l.cardioMinutes / 60 + l.strengthSessions) - 8, 0, 8) * 1.6
  const recoveryIndex = clamp(
    46 + (l.sleepHours - 6.8) * 13 + cardioDose * 3.4 - loadPenalty + (l.proteinPerKg - 1) * 3,
    5, 98,
  )

  // Uncertainty grows with the horizon. Body composition is the least certain.
  const t = Math.sqrt(years)
  return {
    vo2max: round(vo2max, 1),
    restingHR: round(restingHR, 0),
    bodyFatPct: round(bodyFatPct, 1),
    leanMassKg: round(leanMassKg, 1),
    recoveryIndex: round(recoveryIndex, 0),
    band: {
      vo2max: round(1.5 + 1.9 * t, 1),
      restingHR: round(2 + 2.4 * t, 0),
      bodyFatPct: round(1.3 + 2.3 * t, 1),
      leanMassKg: round(0.7 + 1.2 * t, 1),
      recoveryIndex: round(6 + 7 * t, 0),
    },
  }
}

/** A month-by-month path, used to draw the projection curve. */
export function projectPath(base: Baseline, l: Levers, months: Horizon, pick: (p: Projected) => number) {
  const pts: Array<{ month: number; value: number; lo: number; hi: number }> = []
  for (let m = 0; m <= months; m++) {
    const scaled = project(base, l, (m === 0 ? 0.0001 : m) as Horizon)
    const v = pick(scaled)
    const key = pickBandKey(pick)
    const band = scaled.band[key]
    pts.push({ month: m, value: v, lo: v - band, hi: v + band })
  }
  return pts
}

function pickBandKey(pick: (p: Projected) => number): keyof Projected['band'] {
  const probe: Projected = {
    vo2max: 1, restingHR: 2, bodyFatPct: 3, leanMassKg: 4, recoveryIndex: 5,
    band: { vo2max: 0, restingHR: 0, bodyFatPct: 0, leanMassKg: 0, recoveryIndex: 0 },
  }
  const map: Record<number, keyof Projected['band']> = {
    1: 'vo2max', 2: 'restingHR', 3: 'bodyFatPct', 4: 'leanMassKg', 5: 'recoveryIndex',
  }
  return map[pick(probe)] ?? 'vo2max'
}

export interface RelationshipNote {
  lever: string
  effect: string
  strength: 'Well established' | 'Reasonably supported' | 'Directional only'
}

/**
 * Shown in the UI so the model is inspectable. These are plain-language
 * summaries of widely described directional relationships — they are not
 * citations, and they are not tuned to any individual.
 */
export const RELATIONSHIPS: RelationshipNote[] = [
  { lever: 'Aerobic minutes each week', effect: 'Raises VO₂ max and lowers resting heart rate, with diminishing returns as volume grows.', strength: 'Well established' },
  { lever: 'Strength sessions each week', effect: 'Preserves and builds lean mass; effect flattens above roughly four sessions.', strength: 'Well established' },
  { lever: 'Nightly sleep', effect: 'Gates how much of the training stimulus turns into adaptation, and drives the recovery index.', strength: 'Reasonably supported' },
  { lever: 'Daily steps', effect: 'Contributes to body-composition change independently of structured training.', strength: 'Reasonably supported' },
  { lever: 'Protein per kg', effect: 'Supports lean-mass retention alongside a strength stimulus.', strength: 'Reasonably supported' },
  { lever: 'Time itself', effect: 'A slow background decline in VO₂ max and lean mass is assumed with age.', strength: 'Directional only' },
]

export const METRIC_META = {
  vo2max:       { label: 'Aerobic fitness', unit: 'ml/kg/min', better: 'up'   as const, color: 'var(--movement)' },
  restingHR:    { label: 'Resting heart rate', unit: 'bpm',    better: 'down' as const, color: 'var(--training)' },
  bodyFatPct:   { label: 'Body fat',        unit: '%',         better: 'down' as const, color: 'var(--nutrition)' },
  leanMassKg:   { label: 'Lean mass',       unit: 'kg',        better: 'up'   as const, color: 'var(--recovery)' },
  recoveryIndex:{ label: 'Recovery',        unit: '/100',      better: 'up'   as const, color: 'var(--sleep)' },
}

/**
 * The four ready-made scenarios on the Future screen. Each one changes only
 * the habits it names, so the person can see one lever at a time rather than
 * an undifferentiated "better you".
 */
export interface Scenario {
  id: string
  label: string
  blurb: string
  accent: string
  apply: (current: Levers) => Levers
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'current',
    label: 'Carry on as you are',
    blurb: 'Your habits over the last four weeks, continued.',
    accent: 'var(--ink-2)',
    apply: (l) => ({ ...l }),
  },
  {
    id: 'sleep',
    label: 'Sleep more consistently',
    blurb: 'Half an hour more, most nights, nothing else changed.',
    accent: 'var(--sleep)',
    apply: (l) => ({ ...l, sleepHours: clamp(l.sleepHours + 0.5, 5, 9.5) }),
  },
  {
    id: 'move',
    label: 'Move more, sustainably',
    blurb: 'More easy aerobic work and a few thousand more steps.',
    accent: 'var(--movement)',
    apply: (l) => ({
      ...l,
      cardioMinutes: clamp(l.cardioMinutes + 90, 0, 420),
      steps: clamp(l.steps + 2000, 2000, 18000),
    }),
  },
  {
    id: 'strength',
    label: 'Build and keep strength',
    blurb: 'Two sessions a week, with the protein to support them.',
    accent: 'var(--training)',
    apply: (l) => ({
      ...l,
      strengthSessions: clamp(l.strengthSessions + 2, 0, 6),
      proteinPerKg: clamp(l.proteinPerKg + 0.4, 0.6, 2.4),
    }),
  },
]

/**
 * A plausible energy shape across one waking day, 6am to 11pm.
 * This is an illustration built from the projected recovery index and sleep,
 * not a measurement — the UI labels it as such.
 */
export function energyCurve(sleepHours: number, recoveryIndex: number): number[] {
  const rest = clamp((sleepHours - 5.5) / 3, 0, 1)
  const rec = clamp(recoveryIndex / 100, 0, 1)
  const ceiling = 0.42 + rest * 0.34 + rec * 0.24
  const dipDepth = 0.3 - rest * 0.15 - rec * 0.08
  const eveningHold = 0.2 + rest * 0.22 + rec * 0.2

  const hours = 18 // 6am to midnight
  return Array.from({ length: hours }, (_, i) => {
    const t = i / (hours - 1)
    const morningRamp = Math.min(1, t / 0.22)
    const afternoonDip = Math.exp(-(((t - 0.46) / 0.13) ** 2)) * dipDepth
    const eveningFade = Math.max(0, (t - 0.68) / 0.32) ** 1.6 * (1 - eveningHold)
    return clamp(ceiling * morningRamp - afternoonDip - ceiling * eveningFade, 0.04, 1)
  })
}

export type ProjMetric = keyof typeof METRIC_META
