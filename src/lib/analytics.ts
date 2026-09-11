import type { Baseline, DayRecord, Insight, Measurement } from '../data/types'
import { mean, median, round, trendPerDay, clamp, sum, hoursToHM } from './util'
import { mealTotals } from '../data/foods'

export const lastN = (days: DayRecord[], n: number) => days.slice(Math.max(0, days.length - n))

export const dayKcal = (d: DayRecord) => sum(d.meals.map((m) => mealTotals(m.items).kcal))
export const dayProtein = (d: DayRecord) => round(sum(d.meals.map((m) => mealTotals(m.items).protein)), 0)

/** A personal baseline, from the user's own imported history — not a population norm. */
export function computeBaseline(days: DayRecord[], measurements: Measurement[]): Baseline {
  const w = lastN(days, 28)
  const settled = w.slice(0, Math.max(1, w.length - 1)) // exclude the partial current day
  const vo2 = measurements.filter((m) => m.kind === 'vo2max')[0]

  const weeks = Math.max(1, settled.length / 7)
  return {
    sleepHours: round(median(settled.map((d) => d.sleepHours)), 1),
    steps: Math.round(median(settled.map((d) => d.steps))),
    restingHR: Math.round(median(settled.map((d) => d.restingHR))),
    hrv: Math.round(median(settled.map((d) => d.hrv))),
    vo2max: vo2 ? vo2.value : 42,
    bodyFatPct: round(mean(settled.slice(-7).map((d) => d.bodyFatPct)), 1),
    weightKg: round(mean(settled.slice(-7).map((d) => d.weightKg)), 1),
    proteinG: Math.round(median(settled.map(dayProtein))),
    weeklyActiveMinutes: Math.round(sum(settled.map((d) => d.activeMinutes)) / weeks),
    strengthPerWeek: round(settled.filter((d) => d.workout?.type === 'Strength').length / weeks, 1),
    computedAt: Date.now(),
    daysOfHistory: days.length,
  }
}

export interface DailyProgress {
  sleep: number
  movement: number
  nourish: number
  recovery: number
  overall: number
  restDay: boolean
}

/**
 * A single lightweight daily state — four rings, not dozens of scores.
 * On a rest day the movement target relaxes and recovery counts for more:
 * rest is a behaviour the app rewards, not a gap it penalises.
 */
export function dailyProgress(day: DayRecord, base: Baseline): DailyProgress {
  const restDay = day.restDay
  const sleepTarget = clamp(base.sleepHours, 7, 8.5)
  const sleep = clamp(day.sleepHours / sleepTarget, 0, 1)

  const stepTarget = restDay ? Math.max(4500, base.steps * 0.6) : Math.max(7000, base.steps)
  const movement = clamp(
    (day.steps / stepTarget) * 0.6 + (day.activeMinutes / (restDay ? 22 : 45)) * 0.4,
    0, 1,
  )

  const proteinTarget = Math.max(90, Math.round(base.weightKg * 1.6))
  const logged = day.meals.filter((m) => m.confirmed).length
  const nourish = clamp((dayProtein(day) / proteinTarget) * 0.65 + (logged / 3) * 0.35, 0, 1)

  const hrvRatio = base.hrv > 0 ? day.hrv / base.hrv : 1
  const rhrRatio = day.restingHR > 0 ? base.restingHR / day.restingHR : 1
  const recovery = clamp((hrvRatio * 0.55 + rhrRatio * 0.45 - 0.55) / 0.5, 0, 1)

  const weights = restDay ? [0.3, 0.15, 0.25, 0.3] : [0.28, 0.3, 0.24, 0.18]
  const overall = clamp(
    sleep * weights[0] + movement * weights[1] + nourish * weights[2] + recovery * weights[3],
    0, 1,
  )
  return { sleep, movement, nourish, recovery, overall, restDay }
}

/**
 * A consistency streak: days where the person did the sustainable thing.
 * A genuine rest day counts. A day of extreme training does not count double.
 */
export function consistencyStreak(days: DayRecord[], base: Baseline): number {
  let streak = 0
  let grace = 1 // one off day does not undo a month of showing up
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    if (i === days.length - 1 && new Date().getHours() < 20) continue // today is unfinished
    const p = dailyProgress(d, base)
    const restedWell = d.sleepHours >= base.sleepHours - 0.9
    const movedEnough = d.restDay ? true : d.steps >= Math.max(6000, base.steps * 0.72)
    if (restedWell && movedEnough && p.overall > 0.45) streak++
    else if (grace > 0) grace--
    else break
  }
  return streak
}

export function weeklySeries(days: DayRecord[], pick: (d: DayRecord) => number, weeks = 12) {
  const out: Array<{ label: string; value: number; from: string; to: string }> = []
  const total = weeks * 7
  const window = lastN(days, total)
  for (let i = 0; i < window.length; i += 7) {
    const chunk = window.slice(i, i + 7)
    if (chunk.length < 4) continue
    out.push({
      label: `W${out.length + 1}`,
      value: round(mean(chunk.map(pick)), 2),
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
    })
  }
  return out
}

export interface Delta { value: number; pct: number; direction: 'up' | 'down' | 'flat' }

export function compareWindows(days: DayRecord[], pick: (d: DayRecord) => number, n = 14): Delta {
  const recent = mean(lastN(days, n).map(pick))
  const prior = mean(days.slice(Math.max(0, days.length - n * 2), days.length - n).map(pick))
  const value = recent - prior
  const pct = prior === 0 ? 0 : (value / prior) * 100
  return { value, pct, direction: Math.abs(pct) < 1.5 ? 'flat' : pct > 0 ? 'up' : 'down' }
}

/** Pearson correlation — used only to describe patterns in this person's data. */
export function correlate(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length)
  if (n < 6) return 0
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

export { trendPerDay }

/**
 * Generates insights from the person's own records. Every insight carries its
 * observation window, the evidence behind it, an explicit confidence and a
 * named limitation — so interpretation is never mistaken for measurement.
 */
export function buildInsights(days: DayRecord[], base: Baseline, measurements: Measurement[] = []): Insight[] {
  const out: Insight[] = []
  const w = lastN(days, 28)
  const now = Date.now()

  // 1. Bedtime consistency ↔ HRV
  const bedtimes = w.map((d) => d.bedtimeHour)
  const hrvs = w.map((d) => d.hrv)
  const rho = correlate(bedtimes, hrvs)
  const lateNights = w.filter((d) => d.bedtimeHour > 23.75)
  if (lateNights.length >= 3 && rho < -0.25) {
    const lateHrv = mean(lateNights.map((d) => d.hrv))
    const earlyHrv = mean(w.filter((d) => d.bedtimeHour <= 23.75).map((d) => d.hrv))
    out.push({
      id: 'i-bedtime-hrv',
      domain: 'sleep',
      changed: `On the ${lateNights.length} nights you went to bed after 11:45pm, your overnight HRV averaged ${Math.round(lateHrv)} ms, about ${Math.round(earlyHrv - lateHrv)} ms below your other nights.`,
      why: 'HRV is one of the clearer overnight signals of how well your nervous system recovered. For you, bedtime tracks with it more closely than sleep length does.',
      evidence: [
        `${w.length} nights of your own data, last 4 weeks`,
        `Correlation between bedtime and next-morning HRV: ${rho.toFixed(2)} (moderate, negative)`,
        `Late nights: ${Math.round(lateHrv)} ms · Other nights: ${Math.round(earlyHrv)} ms`,
      ],
      confidence: 0.72,
      limitation: 'This is an association in your data, not a proven cause. Alcohol, illness and late meals also move HRV and are not all tracked here.',
      options: [
        'Pick a bedtime you can hit five nights out of seven',
        'Keep the late nights, and treat the following day as an easy one',
        'Nothing for now. Watch it for another two weeks',
      ],
      window: 'Last 28 days',
      createdAt: now,
    })
  }

  // 2. Training load vs recovery
  const load = w.map((d) => (d.workout ? d.workout.minutes * d.workout.intensity : 0))
  const recentLoad = sum(load.slice(-7))
  const priorLoad = sum(load.slice(-14, -7))
  if (priorLoad > 0 && recentLoad / priorLoad > 1.28) {
    const rhrRecent = mean(w.slice(-7).map((d) => d.restingHR))
    out.push({
      id: 'i-load-jump',
      domain: 'movement',
      changed: `Your training load rose about ${Math.round((recentLoad / priorLoad - 1) * 100)}% this week compared with last, and resting heart rate sits at ${Math.round(rhrRecent)} bpm against a baseline of ${base.restingHR}.`,
      why: 'Load can climb faster than recovery adapts. Catching that early usually means a small adjustment rather than a forced break.',
      evidence: [
        `This week: ${Math.round(recentLoad)} load units · Last week: ${Math.round(priorLoad)}`,
        `Resting HR, 7-day average: ${Math.round(rhrRecent)} bpm vs ${base.restingHR} bpm baseline`,
        `${w.filter((d) => d.restDay).length} rest days in the last 4 weeks`,
      ],
      confidence: 0.64,
      limitation: 'Load here is duration × intensity from your imported sessions. It does not know how heavy your lifts were or how you felt.',
      options: [
        'Keep next week at this week’s volume rather than adding',
        'Swap one hard session for an easy one',
        'Add a rest day and re-check in five days',
      ],
      window: 'Last 14 days',
      createdAt: now,
    })
  }

  // 3. Protein
  const protein = w.map(dayProtein)
  const proteinTarget = Math.round(base.weightKg * 1.6)
  const medProtein = median(protein)
  if (medProtein < proteinTarget * 0.88) {
    out.push({
      id: 'i-protein',
      domain: 'nutrition',
      changed: `Your typical day lands around ${Math.round(medProtein)} g of protein. For your body weight and current training, ${proteinTarget} g is a common reference range.`,
      why: 'Protein intake is one of the levers that supports lean mass while training volume rises, and lean mass is one of the things your trajectory is most sensitive to.',
      evidence: [
        `Median of ${w.length} logged days: ${Math.round(medProtein)} g`,
        `Reference range used: 1.6 g per kg of body weight (${base.weightKg} kg)`,
        `Your strength sessions: ${base.strengthPerWeek}/week`,
      ],
      confidence: 0.58,
      limitation: 'Only the meals you logged are counted, so this is likely an undercount. Reference intakes vary between guidelines and individuals.',
      options: [
        'Add one protein-forward item to breakfast',
        'Log meals for a week first, then revisit the number',
        'Not a priority right now',
      ],
      window: 'Last 28 days',
      createdAt: now,
    })
  }

  // 4. Aerobic fitness over the long window (the positive counterweight)
  const vo2 = measurements.filter((m) => m.kind === 'vo2max').sort((a, b) => (a.date < b.date ? -1 : 1))
  if (vo2.length >= 2 && vo2[vo2.length - 1].value - vo2[0].value > 1) {
    const gain = round(vo2[vo2.length - 1].value - vo2[0].value, 1)
    const weeklyCardio = Math.round(sum(lastN(days, 28).map((d) => (d.workout ? d.workout.minutes : 0))) / 4)
    out.push({
      id: 'i-fitness-up',
      domain: 'movement',
      changed: `Your estimated VO₂ max has risen ${gain} ml/kg/min over the last six months, from ${vo2[0].value} to ${vo2[vo2.length - 1].value}.`,
      why: 'Aerobic fitness is the single number in Jumbo most tied to your long-term trajectory, and it has moved in the direction you want without you chasing it.',
      evidence: [
        `${vo2.length} watch estimates between ${vo2[0].date} and ${vo2[vo2.length - 1].date}`,
        `Around ${weeklyCardio} minutes of training a week over the last month`,
        `Resting heart rate baseline: ${base.restingHR} bpm`,
      ],
      confidence: 0.74,
      limitation: 'These are watch estimates from running heart-rate data, not a lab test. They track direction well and absolute values less well.',
      options: ['Keep the current volume, it is working', 'See what it does over the next year in Trajectory', 'Nothing, just good to know'],
      window: 'Last 6 months',
      createdAt: now,
    })
  }

  // 5. Rest-day effect (reframes rest as positive)
  const restDays = w.filter((d) => d.restDay)
  const afterRest = w.filter((_, i) => i > 0 && w[i - 1].restDay)
  if (restDays.length >= 3 && afterRest.length >= 3) {
    const hrvAfterRest = mean(afterRest.map((d) => d.hrv))
    const hrvOther = mean(w.filter((_, i) => i > 0 && !w[i - 1].restDay).map((d) => d.hrv))
    if (hrvAfterRest > hrvOther + 1.5) {
      out.push({
        id: 'i-rest',
        domain: 'recovery',
        changed: `The mornings after your rest days, HRV averages ${Math.round(hrvAfterRest)} ms, around ${Math.round(hrvAfterRest - hrvOther)} ms higher than after training days.`,
        why: 'Your rest days are doing real work. Treating them as part of the plan rather than a lapse is what keeps the plan going.',
        evidence: [
          `${restDays.length} rest days in the last 4 weeks`,
          `Morning after rest: ${Math.round(hrvAfterRest)} ms · after training: ${Math.round(hrvOther)} ms`,
        ],
        confidence: 0.69,
        limitation: 'Rest days are also often lower-stress days for other reasons, which this comparison cannot separate.',
        options: ['Keep one scheduled rest day a week', 'Move rest to follow your hardest session', 'Leave it as it is'],
        window: 'Last 28 days',
        createdAt: now,
      })
    }
  }

  // 6. Step trend
  const stepTrend = trendPerDay(w.map((d) => d.steps))
  if (Math.abs(stepTrend * 28) > 900) {
    const up = stepTrend > 0
    out.push({
      id: 'i-steps',
      domain: 'movement',
      changed: `Daily steps are trending ${up ? 'up' : 'down'} by roughly ${Math.abs(Math.round(stepTrend * 7))} per week over the last month.`,
      why: up
        ? 'Walking volume is the least fragile part of most people’s activity. Rising steps usually means the routine is fitting your life.'
        : 'Walking volume tends to slip before structured training does. It is an early signal worth noticing while the fix is still small.',
      evidence: [
        `28-day fit: ${stepTrend > 0 ? '+' : ''}${Math.round(stepTrend)} steps per day`,
        `Current median: ${base.steps.toLocaleString()} steps`,
      ],
      confidence: 0.66,
      limitation: 'Step counts miss cycling, swimming and rowing, and phone-only days undercount.',
      options: up ? ['Hold the current pattern', 'See what this does to your trajectory'] : ['Add one short walk to your day', 'Check whether a schedule change caused it', 'Not now'],
      window: 'Last 28 days',
      createdAt: now,
    })
  }

  return out.sort((a, b) => b.confidence - a.confidence)
}


/**
 * The statistical summary handed to Jumbo's AI. It contains derived figures only —
 * no meal photos, no notes, no name, no phone number — so the model sees the
 * shape of the person's data and nothing that identifies them.
 */
export function buildSummary(days: DayRecord[], base: Baseline, measurements: Measurement[]) {
  const w28 = lastN(days, 28)
  const w7 = lastN(days, 7)
  const prior7 = days.slice(Math.max(0, days.length - 14), days.length - 7)
  const load = (d: DayRecord) => (d.workout ? d.workout.minutes * d.workout.intensity : 0)

  const vo2 = measurements.filter((m) => m.kind === 'vo2max').sort((a, b) => (a.date < b.date ? -1 : 1))

  return {
    daysOfHistory: days.length,
    baseline: {
      sleepHours: base.sleepHours,
      steps: base.steps,
      restingHR: base.restingHR,
      hrvMs: base.hrv,
      vo2max: base.vo2max,
      bodyFatPct: base.bodyFatPct,
      weightKg: base.weightKg,
      proteinG: base.proteinG,
      strengthSessionsPerWeek: base.strengthPerWeek,
      weeklyActiveMinutes: base.weeklyActiveMinutes,
    },
    last7Days: {
      meanSleepHours: round(mean(w7.map((d) => d.sleepHours)), 2),
      meanSteps: Math.round(mean(w7.map((d) => d.steps))),
      meanRestingHR: round(mean(w7.map((d) => d.restingHR)), 1),
      meanHrv: round(mean(w7.map((d) => d.hrv)), 1),
      trainingLoad: Math.round(sum(w7.map(load))),
      restDays: w7.filter((d) => d.restDay).length,
      medianProteinG: Math.round(median(w7.map(dayProtein))),
      loggedMeals: sum(w7.map((d) => d.meals.length)),
    },
    previous7Days: {
      meanSleepHours: round(mean(prior7.map((d) => d.sleepHours)), 2),
      meanRestingHR: round(mean(prior7.map((d) => d.restingHR)), 1),
      meanHrv: round(mean(prior7.map((d) => d.hrv)), 1),
      trainingLoad: Math.round(sum(prior7.map(load))),
    },
    last28Days: {
      meanSleepHours: round(mean(w28.map((d) => d.sleepHours)), 2),
      nightsAfter2345: w28.filter((d) => d.bedtimeHour > 23.75).length,
      hrvOnLateNights: round(mean(w28.filter((d) => d.bedtimeHour > 23.75).map((d) => d.hrv)), 1),
      hrvOnEarlyNights: round(mean(w28.filter((d) => d.bedtimeHour <= 23.75).map((d) => d.hrv)), 1),
      bedtimeToHrvCorrelation: round(correlate(w28.map((d) => d.bedtimeHour), w28.map((d) => d.hrv)), 2),
      stepTrendPerDay: Math.round(trendPerDay(w28.map((d) => d.steps))),
      medianProteinG: Math.round(median(w28.map(dayProtein))),
      restDays: w28.filter((d) => d.restDay).length,
      hrvMorningAfterRest: round(mean(w28.filter((_, i) => i > 0 && w28[i - 1].restDay).map((d) => d.hrv)), 1),
      hrvMorningAfterTraining: round(mean(w28.filter((_, i) => i > 0 && !w28[i - 1].restDay).map((d) => d.hrv)), 1),
    },
    measurements: {
      vo2maxFirst: vo2[0] ? { value: vo2[0].value, date: vo2[0].date } : null,
      vo2maxLatest: vo2.length ? { value: vo2[vo2.length - 1].value, date: vo2[vo2.length - 1].date } : null,
      count: measurements.length,
    },
    notes: 'All figures are this person\'s own records. Do not invent any number that is not present here.',
  }
}

/* ============================================================
   Home: the four headline numbers, and the day's focus.
   ============================================================ */

export interface KeyMetric {
  key: 'sleep' | 'movement' | 'nutrition' | 'recovery'
  label: string
  icon: 'sleep' | 'steps' | 'plate' | 'heart'
  colour: string
  value: string
  unit: string
  /** Change against the seven days before this one, or null when there is no basis. */
  deltaPct: number | null
  /** Used instead of a percentage where a percentage would mislead. */
  note?: string
  ring: number
}

/**
 * The four numbers Home leads with, each compared against the person's own
 * previous seven days rather than a population average. A day with no history
 * behind it reports no change rather than inventing one.
 */
export function keyMetrics(days: DayRecord[], date: string, base: Baseline): KeyMetric[] {
  const index = days.findIndex((d) => d.date === date)
  const day = index >= 0 ? days[index] : days[days.length - 1]
  const prior = index > 0 ? days.slice(Math.max(0, index - 7), index) : []
  const progress = dailyProgress(day, base)

  const change = (now: number, before: number[]) => {
    const past = mean(before.filter((v) => v > 0))
    if (!past || !now) return null
    return round(((now - past) / past) * 100, 0)
  }

  const kcal = dayKcal(day)
  const protein = dayProtein(day)
  const proteinTarget = Math.max(90, Math.round(base.weightKg * 1.6))

  return [
    {
      key: 'sleep',
      label: 'Sleep',
      icon: 'sleep',
      colour: 'var(--sleep)',
      value: day.sleepHours > 0 ? hoursToHM(day.sleepHours) : '—',
      unit: day.sleepEfficiency ? `${day.sleepEfficiency}% efficiency` : 'not recorded',
      deltaPct: change(day.sleepHours, prior.map((d) => d.sleepHours)),
      ring: progress.sleep,
    },
    {
      key: 'movement',
      label: 'Movement',
      icon: 'steps',
      colour: 'var(--movement)',
      value: day.steps > 0 ? day.steps.toLocaleString() : '—',
      unit: 'steps',
      deltaPct: change(day.steps, prior.map((d) => d.steps)),
      ring: progress.movement,
    },
    {
      key: 'nutrition',
      label: 'Nutrition',
      icon: 'plate',
      colour: 'var(--nutrition)',
      value: kcal > 0 ? kcal.toLocaleString() : '—',
      unit: 'kcal',
      deltaPct: null,
      note: day.meals.length === 0
        ? 'Nothing logged'
        : protein >= proteinTarget ? 'On target' : `${protein} of ${proteinTarget} g protein`,
      ring: progress.nourish,
    },
    {
      key: 'recovery',
      label: 'Recovery',
      icon: 'heart',
      colour: 'var(--recovery)',
      value: day.hrv > 0 ? String(Math.round(progress.recovery * 100)) : '—',
      unit: '/ 100',
      deltaPct: change(day.hrv, prior.map((d) => d.hrv)),
      ring: progress.recovery,
    },
  ]
}

export interface FocusItem {
  id: string
  title: string
  sub: string
  icon: 'steps' | 'plate' | 'sleep'
  colour: string
  progress: number
  done: boolean
}

/**
 * Today's focus: three small, finishable things, each one derived from where
 * this person actually is against their own baseline. Never a fixed list.
 */
export function todaysFocus(day: DayRecord, base: Baseline): FocusItem[] {
  const progress = dailyProgress(day, base)
  const stepTarget = day.restDay ? Math.max(4500, Math.round(base.steps * 0.6)) : Math.max(7000, Math.round(base.steps))
  const stepsShort = Math.max(0, stepTarget - day.steps)
  // Roughly 100 steps a minute at an easy walking pace.
  const walkMinutes = Math.max(10, Math.round(stepsShort / 100 / 5) * 5)

  const protein = dayProtein(day)
  const proteinTarget = Math.max(90, Math.round(base.weightKg * 1.6))

  const bedHour = Math.min(23.5, round(base.sleepHours > 0 ? 23.5 : 23, 1))
  const bedLabel = `${Math.floor(bedHour)}:${String(Math.round((bedHour % 1) * 60)).padStart(2, '0')}`

  return [
    {
      id: 'move',
      title: stepsShort > 0 ? `${walkMinutes} min walk` : 'Movement done',
      sub: stepsShort > 0 ? `${stepsShort.toLocaleString()} steps to go` : `${day.steps.toLocaleString()} steps`,
      icon: 'steps',
      colour: 'var(--movement)',
      progress: progress.movement,
      done: stepsShort === 0,
    },
    {
      id: 'protein',
      title: 'Protein target',
      sub: `${protein} / ${proteinTarget} g`,
      icon: 'plate',
      colour: 'var(--nutrition)',
      progress: clamp(protein / proteinTarget, 0, 1),
      done: protein >= proteinTarget,
    },
    {
      id: 'wind-down',
      title: 'Wind down',
      sub: `Bed by ${bedLabel}`,
      icon: 'sleep',
      colour: 'var(--sleep)',
      progress: day.bedtimeHour > 0 && day.bedtimeHour <= bedHour ? 1 : 0,
      done: day.bedtimeHour > 0 && day.bedtimeHour <= bedHour,
    },
  ]
}

/** The one-line state of the day, in the product's own voice. */
export function motivationalStatus(p: DailyProgress): { headline: string; body: string } {
  if (p.restDay) {
    return {
      headline: 'Resting',
      body: 'A rest day is part of the plan. Sleep and food are what matter today.',
    }
  }
  if (p.overall >= 0.7) {
    return {
      headline: 'On track',
      body: 'You’re building a healthier, brighter tomorrow.',
    }
  }
  if (p.recovery < 0.35) {
    return {
      headline: 'Take it easy',
      body: 'Recovery is running low. An easy day will serve you better than a hard one.',
    }
  }
  if (p.overall >= 0.4) {
    return {
      headline: 'Building',
      body: 'A normal day so far. Nothing needs fixing.',
    }
  }
  return {
    headline: 'Early days',
    body: 'The day is still young. One small thing moves it.',
  }
}
