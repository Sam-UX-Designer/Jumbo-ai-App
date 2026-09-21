import type { Baseline, DayRecord } from '../data/types'
import { hasData } from './analytics'
import type { Muscle, TrainingPlan } from '../data/training'
import { planMuscles } from '../data/training'

/**
 * What to train today, read out of what this person actually recorded.
 *
 * The rule the rest of the app lives by applies here with more force than
 * anywhere else: a training recommendation made from nothing is a
 * recommendation made up. A person who has recorded nothing is told that
 * plainly and offered a plan to start from, rather than handed a
 * confident-sounding "go easy today" derived from silence.
 *
 * Everything below is arithmetic on the person's own days. Nothing here
 * calls a model, so the suggestion is instant, works offline, and cannot
 * change its mind between two openings of the same screen.
 */

export type SuggestionKind = 'unknown' | 'train' | 'easy' | 'rest'

export interface Suggestion {
  kind: SuggestionKind
  /** The recommendation, in a few words. */
  headline: string
  /** The one line under it. */
  detail: string
  /**
   * Why, each item a fact from the person's own record. Empty when the
   * answer is "unknown", because there is nothing to cite.
   */
  because: string[]
  /** Roughly how long, when there is enough to say. */
  minutes: number | null
  /** What to work, when the record supports a preference. */
  focus: Muscle | null
  /** Whether a saved plan fits the suggestion. Filled by the screen. */
  planId?: string
}

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Consecutive days ending today on which something was trained. */
function trainingStreak(days: DayRecord[], todayISO: string): number {
  const byDate = new Map(days.map((d) => [d.date, d]))
  let streak = 0
  const cursor = new Date(`${todayISO}T00:00:00Z`)
  for (let i = 0; i < 14; i++) {
    const d = byDate.get(iso(cursor))
    const trained = Boolean(d && (d.workout || d.activeMinutes >= 30))
    if (!trained) break
    streak++
    cursor.setTime(cursor.getTime() - DAY)
  }
  return streak
}

/** Days since anything was trained. Null when nothing ever was. */
function daysSinceTraining(days: DayRecord[], todayISO: string): number | null {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const cursor = new Date(`${todayISO}T00:00:00Z`)
  for (let i = 0; i < 30; i++) {
    const d = byDate.get(iso(cursor))
    if (d && (d.workout || d.activeMinutes >= 30)) return i
    cursor.setTime(cursor.getTime() - DAY)
  }
  return null
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * Is recovery below this person's own baseline?
 *
 * Returns null when nothing measured it, which is the common case on the
 * web with no wearable connected — and null must never be read as "fine"
 * or as "poor". A heart rate of zero is not a slow heart.
 */
function recoveryBelowBaseline(recent: DayRecord[], base: Baseline): boolean | null {
  const hrv = recent.map((d) => d.hrv).filter((v) => v > 0)
  const rhr = recent.map((d) => d.restingHR).filter((v) => v > 0)
  if (!hrv.length && !rhr.length) return null

  const signals: boolean[] = []
  if (hrv.length && base.hrv > 0) signals.push(mean(hrv) < base.hrv * 0.93)
  if (rhr.length && base.restingHR > 0) signals.push(mean(rhr) > base.restingHR * 1.05)
  if (!signals.length) return null
  return signals.some(Boolean)
}

/** Sleep short enough, against their own baseline, to matter for training. */
function sleptShort(recent: DayRecord[], base: Baseline): boolean | null {
  const nights = recent.slice(0, 2).map((d) => d.sleepHours).filter((v) => v > 0)
  if (!nights.length || base.sleepHours <= 0) return null
  return mean(nights) < base.sleepHours - 1
}

/**
 * The muscle group least recently trained, across the plans actually used.
 *
 * Only plans the person has done count. A plan sitting unused says nothing
 * about what their body has had, and rotating away from a group they have
 * never trained would be guessing.
 */
function leastRecentFocus(plans: TrainingPlan[]): Muscle | null {
  const done = plans.filter((p) => p.lastDoneAt)
  if (done.length < 2) return null
  const lastFor = new Map<Muscle, number>()
  for (const p of done) {
    for (const m of planMuscles(p.blocks)) {
      lastFor.set(m, Math.max(lastFor.get(m) ?? 0, p.lastDoneAt ?? 0))
    }
  }
  let oldest: Muscle | null = null
  let when = Infinity
  for (const [m, at] of lastFor) {
    if (m === 'full body') continue
    if (at < when) { when = at; oldest = m }
  }
  return oldest
}

/**
 * Today's suggestion.
 *
 * `todayISO` is passed rather than read from the clock so the same day can
 * be reasoned about in a test without the answer changing at midnight.
 */
export function suggestSession(
  days: DayRecord[],
  baseline: Baseline,
  plans: TrainingPlan[],
  todayISO: string,
): Suggestion {
  const recorded = days.filter(hasData)

  // Nothing to go on. Say so — do not dress silence up as advice.
  if (recorded.length === 0) {
    return {
      kind: 'unknown',
      headline: 'Nothing recorded yet',
      detail:
        'Jumbo suggests sessions from what you have actually done, so there is nothing to base one on yet. '
        + 'Build a plan or have Jumbo write one, and the suggestions start after your first session.',
      because: [],
      minutes: null,
      focus: null,
    }
  }

  const recent = [...recorded]
    .filter((d) => d.date <= todayISO)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)

  const streak = trainingStreak(days, todayISO)
  const since = daysSinceTraining(days, todayISO)
  const tired = recoveryBelowBaseline(recent, baseline)
  const short = sleptShort(recent, baseline)
  const focus = leastRecentFocus(plans)
  const because: string[] = []

  // Hard days back to back, with nothing measured saying otherwise.
  if (streak >= 4) {
    because.push(`${streak} days in a row with training recorded`)
    if (tired === true) because.push('recovery signals below your own baseline')
    return {
      kind: 'rest',
      headline: 'Take today off',
      detail:
        'Four days straight is where most people stop gaining from the work and start paying for it. '
        + 'A walk still counts as a good day.',
      because,
      minutes: null,
      focus: null,
    }
  }

  if (tired === true) {
    const hrv = recent.map((d) => d.hrv).filter((v) => v > 0)
    const rhr = recent.map((d) => d.restingHR).filter((v) => v > 0)
    if (hrv.length) because.push(`HRV averaging ${Math.round(mean(hrv))} ms against a ${baseline.hrv} ms baseline`)
    if (rhr.length) because.push(`resting heart rate ${Math.round(mean(rhr))} bpm against ${baseline.restingHR} bpm`)
    return {
      kind: 'easy',
      headline: 'Keep it easy today',
      detail:
        'Your own recovery numbers are down on where they usually sit. Something light keeps the habit '
        + 'without adding to what your body is already working through.',
      because,
      minutes: 25,
      focus: 'full body',
    }
  }

  if (short === true) {
    because.push('short sleep on the last night or two, against your own average')
    return {
      kind: 'easy',
      headline: 'Something lighter',
      detail:
        'You slept less than you usually do. Training on short sleep costs more and returns less, '
        + 'so this is a day for movement rather than a hard session.',
      because,
      minutes: 30,
      focus: focus ?? 'full body',
    }
  }

  if (since === null) {
    because.push('no session recorded in the last 30 days')
    return {
      kind: 'train',
      headline: 'A good day to start',
      detail: 'Nothing recorded recently. The first session back is the one that matters; make it an easy one.',
      because,
      minutes: 30,
      focus: 'full body',
    }
  }

  if (since >= 3) {
    because.push(`${since} days since your last recorded session`)
    return {
      kind: 'train',
      headline: 'A good day to train',
      detail: 'You are rested and nothing in your numbers says otherwise.',
      because,
      minutes: 40,
      focus: focus ?? 'full body',
    }
  }

  if (streak >= 1) because.push(`${streak} day${streak > 1 ? 's' : ''} in a row so far`)
  if (tired === false) because.push('recovery signals at or above your baseline')
  if (since !== null) because.push(`last session ${since === 0 ? 'today' : `${since} day${since > 1 ? 's' : ''} ago`}`)

  return {
    kind: 'train',
    headline: 'A good day to train',
    detail: focus
      ? `${focus[0].toUpperCase()}${focus.slice(1)} has gone the longest without a session.`
      : 'Nothing in your record argues against a full session today.',
    because,
    minutes: 40,
    focus,
  }
}

/** The saved plan that best fits a suggestion, or null when none does. */
export function planFor(suggestion: Suggestion, plans: TrainingPlan[]): TrainingPlan | null {
  if (!plans.length || suggestion.kind === 'rest' || suggestion.kind === 'unknown') return null
  const wanted = suggestion.minutes ?? 40

  const scored = plans.map((p) => {
    let score = 0
    if (suggestion.focus && planMuscles(p.blocks).includes(suggestion.focus)) score += 3
    // An easy day wants a shorter session; a training day wants a real one.
    score -= Math.abs(p.minutes - wanted) / 20
    // Something not done lately beats the one done yesterday.
    const days = p.lastDoneAt ? (Date.now() - p.lastDoneAt) / DAY : 14
    score += Math.min(days, 14) / 7
    return { plan: p, score }
  }).sort((a, b) => b.score - a.score)

  return scored[0]?.plan ?? null
}
