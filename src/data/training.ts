/**
 * Training: the exercise library, and the shape of a plan.
 *
 * Two kinds of thing live here and they are not the same kind of thing.
 *
 * The library is reference data — the names of exercises and how they are
 * performed. It is general knowledge, true for everyone, and writing it
 * down is not inventing anything about a person. The same is true of
 * `foods.ts`.
 *
 * A plan is the opposite: it belongs to one person, it is either written by
 * them or generated for them, and nothing in this file ships one. An
 * account with no plans has no plans.
 */

export type Equipment = 'none' | 'dumbbells' | 'barbell' | 'kettlebell' | 'machines' | 'bands'

export type Muscle =
  | 'legs' | 'glutes' | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'full body'

/** What a movement is for, which is also how the day counts it. */
export type Effort = 'strength' | 'cardio' | 'mobility'

export interface Exercise {
  id: string
  name: string
  kind: Effort
  muscles: Muscle[]
  /** Everything this can be done with. 'none' means bodyweight. */
  equipment: Equipment[]
  /** Reps, or a held/worked duration. Decides which field the form shows. */
  measure: 'reps' | 'time'
  /** One line on doing it well. Form, not medical advice. */
  cue: string
}

export const EQUIPMENT: Array<{ id: Equipment; label: string }> = [
  { id: 'none', label: 'Just me' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'machines', label: 'Machines' },
  { id: 'bands', label: 'Bands' },
]

export const MUSCLES: Muscle[] = [
  'full body', 'legs', 'glutes', 'chest', 'back', 'shoulders', 'arms', 'core',
]

export const EXPERIENCE = [
  { id: 'new', label: 'New to this', blurb: 'Starting out, or starting again after a long break.' },
  { id: 'returning', label: 'Getting back', blurb: 'Trained before. Coming back after time away.' },
  { id: 'regular', label: 'Training regularly', blurb: 'Training most weeks already.' },
] as const

export type Level = (typeof EXPERIENCE)[number]['id']

/**
 * The library.
 *
 * Chosen so that every muscle group can be trained with nothing at all —
 * most people opening this app are at home, and a library that assumes a
 * squat rack is a library most people cannot use.
 */
export const EXERCISES: Exercise[] = [
  /* ---- legs and glutes ---- */
  { id: 'squat-bw', name: 'Bodyweight squat', kind: 'strength', muscles: ['legs', 'glutes'], equipment: ['none'], measure: 'reps',
    cue: 'Sit back as though reaching for a chair. Knees track over the toes.' },
  { id: 'squat-goblet', name: 'Goblet squat', kind: 'strength', muscles: ['legs', 'glutes'], equipment: ['dumbbells', 'kettlebell'], measure: 'reps',
    cue: 'Hold the weight at your chest. Elbows inside the knees at the bottom.' },
  { id: 'squat-back', name: 'Back squat', kind: 'strength', muscles: ['legs', 'glutes'], equipment: ['barbell'], measure: 'reps',
    cue: 'Brace before you descend. Depth you can control beats depth you cannot.' },
  { id: 'lunge', name: 'Reverse lunge', kind: 'strength', muscles: ['legs', 'glutes'], equipment: ['none', 'dumbbells'], measure: 'reps',
    cue: 'Step back, not forward. Back knee towards the floor, front shin upright.' },
  { id: 'split-squat', name: 'Bulgarian split squat', kind: 'strength', muscles: ['legs', 'glutes'], equipment: ['none', 'dumbbells'], measure: 'reps',
    cue: 'Rear foot raised behind you. Most of the weight stays on the front leg.' },
  { id: 'hinge-rdl', name: 'Romanian deadlift', kind: 'strength', muscles: ['legs', 'glutes', 'back'], equipment: ['dumbbells', 'barbell', 'kettlebell'], measure: 'reps',
    cue: 'Push the hips back with a long spine. You should feel it behind the thighs.' },
  { id: 'hip-thrust', name: 'Hip thrust', kind: 'strength', muscles: ['glutes'], equipment: ['none', 'dumbbells', 'barbell'], measure: 'reps',
    cue: 'Shoulders on a bench or sofa. Finish with the hips level, not arched.' },
  { id: 'glute-bridge', name: 'Glute bridge', kind: 'strength', muscles: ['glutes', 'core'], equipment: ['none'], measure: 'reps',
    cue: 'Heels close to you. Squeeze at the top rather than pushing higher.' },
  { id: 'calf-raise', name: 'Calf raise', kind: 'strength', muscles: ['legs'], equipment: ['none', 'dumbbells'], measure: 'reps',
    cue: 'All the way up, all the way down. The bottom half is the half people skip.' },
  { id: 'step-up', name: 'Step-up', kind: 'strength', muscles: ['legs', 'glutes'], equipment: ['none', 'dumbbells'], measure: 'reps',
    cue: 'Drive through the heel of the top foot. Step down quietly.' },
  { id: 'leg-press', name: 'Leg press', kind: 'strength', muscles: ['legs', 'glutes'], equipment: ['machines'], measure: 'reps',
    cue: 'Feet flat. Stop before the lower back lifts off the pad.' },
  { id: 'wall-sit', name: 'Wall sit', kind: 'strength', muscles: ['legs'], equipment: ['none'], measure: 'time',
    cue: 'Thighs parallel, back flat to the wall. Breathe normally.' },

  /* ---- push ---- */
  { id: 'pushup', name: 'Push-up', kind: 'strength', muscles: ['chest', 'arms', 'core'], equipment: ['none'], measure: 'reps',
    cue: 'One line from head to heels. Hands under the shoulders, elbows back.' },
  { id: 'pushup-incline', name: 'Incline push-up', kind: 'strength', muscles: ['chest', 'arms'], equipment: ['none'], measure: 'reps',
    cue: 'Hands on a table or step. The higher the hands, the easier it is.' },
  { id: 'bench', name: 'Bench press', kind: 'strength', muscles: ['chest', 'arms', 'shoulders'], equipment: ['barbell', 'dumbbells'], measure: 'reps',
    cue: 'Shoulder blades pinched back. Lower to the chest under control.' },
  { id: 'db-press', name: 'Dumbbell chest press', kind: 'strength', muscles: ['chest', 'arms'], equipment: ['dumbbells'], measure: 'reps',
    cue: 'On a bench or the floor. Wrists stacked over the elbows.' },
  { id: 'ohp', name: 'Overhead press', kind: 'strength', muscles: ['shoulders', 'arms'], equipment: ['dumbbells', 'barbell', 'kettlebell'], measure: 'reps',
    cue: 'Ribs down, glutes tight. Press up, not forward.' },
  { id: 'lateral-raise', name: 'Lateral raise', kind: 'strength', muscles: ['shoulders'], equipment: ['dumbbells', 'bands'], measure: 'reps',
    cue: 'Light weight, no swing. Lead with the elbows to shoulder height.' },
  { id: 'dip', name: 'Bench dip', kind: 'strength', muscles: ['arms', 'chest'], equipment: ['none'], measure: 'reps',
    cue: 'Hands on the edge behind you. Keep the shoulders down, away from the ears.' },
  { id: 'tricep-ext', name: 'Triceps extension', kind: 'strength', muscles: ['arms'], equipment: ['dumbbells', 'bands'], measure: 'reps',
    cue: 'Elbows still and pointing up. Only the forearm moves.' },

  /* ---- pull ---- */
  { id: 'row-db', name: 'Dumbbell row', kind: 'strength', muscles: ['back', 'arms'], equipment: ['dumbbells', 'kettlebell'], measure: 'reps',
    cue: 'Pull towards the hip, not the chest. Do not let the torso rotate.' },
  { id: 'row-band', name: 'Band row', kind: 'strength', muscles: ['back', 'arms'], equipment: ['bands'], measure: 'reps',
    cue: 'Anchor at chest height. Squeeze the shoulder blades, then let them travel.' },
  { id: 'row-inverted', name: 'Inverted row', kind: 'strength', muscles: ['back', 'arms'], equipment: ['none'], measure: 'reps',
    cue: 'Under a sturdy table. The straighter the body, the harder it gets.' },
  { id: 'pullup', name: 'Pull-up', kind: 'strength', muscles: ['back', 'arms'], equipment: ['none'], measure: 'reps',
    cue: 'Start from a dead hang. Chest to the bar, shoulders away from the ears.' },
  { id: 'lat-pulldown', name: 'Lat pulldown', kind: 'strength', muscles: ['back', 'arms'], equipment: ['machines'], measure: 'reps',
    cue: 'Lean back slightly. Drive the elbows down rather than pulling with the hands.' },
  { id: 'face-pull', name: 'Face pull', kind: 'strength', muscles: ['shoulders', 'back'], equipment: ['bands', 'machines'], measure: 'reps',
    cue: 'Pull towards the forehead, hands finishing wide. Slow on the way back.' },
  { id: 'curl', name: 'Biceps curl', kind: 'strength', muscles: ['arms'], equipment: ['dumbbells', 'barbell', 'bands'], measure: 'reps',
    cue: 'Elbows pinned to the ribs. No swinging at the hips.' },

  /* ---- core ---- */
  { id: 'plank', name: 'Plank', kind: 'strength', muscles: ['core'], equipment: ['none'], measure: 'time',
    cue: 'Squeeze the glutes. A short hard plank beats a long sagging one.' },
  { id: 'side-plank', name: 'Side plank', kind: 'strength', muscles: ['core'], equipment: ['none'], measure: 'time',
    cue: 'Stack the hips and lift them high. Same time on each side.' },
  { id: 'deadbug', name: 'Dead bug', kind: 'strength', muscles: ['core'], equipment: ['none'], measure: 'reps',
    cue: 'Lower back pressed to the floor throughout. Slow beats many.' },
  { id: 'hollow', name: 'Hollow hold', kind: 'strength', muscles: ['core'], equipment: ['none'], measure: 'time',
    cue: 'Lower back flat. Drop the legs higher if it lifts.' },
  { id: 'carry', name: 'Farmer carry', kind: 'strength', muscles: ['core', 'full body'], equipment: ['dumbbells', 'kettlebell'], measure: 'time',
    cue: 'Walk tall with heavy weight. Shoulders down, ribs stacked over the hips.' },

  /* ---- cardio ---- */
  { id: 'walk-brisk', name: 'Brisk walk', kind: 'cardio', muscles: ['full body'], equipment: ['none'], measure: 'time',
    cue: 'Fast enough that talking takes a little effort.' },
  { id: 'run-easy', name: 'Easy run', kind: 'cardio', muscles: ['full body'], equipment: ['none'], measure: 'time',
    cue: 'Conversational the whole way. If you cannot talk, slow down.' },
  { id: 'intervals', name: 'Intervals', kind: 'cardio', muscles: ['full body'], equipment: ['none'], measure: 'time',
    cue: 'Hard effort, then easy, repeated. Finish feeling you had one more in you.' },
  { id: 'row-erg', name: 'Rowing machine', kind: 'cardio', muscles: ['full body', 'back'], equipment: ['machines'], measure: 'time',
    cue: 'Legs, then back, then arms. Reverse that on the way in.' },
  { id: 'cycle', name: 'Cycling', kind: 'cardio', muscles: ['legs', 'full body'], equipment: ['none', 'machines'], measure: 'time',
    cue: 'Spin rather than grind. Cadence high enough that the knees stay happy.' },
  { id: 'jump-rope', name: 'Skipping', kind: 'cardio', muscles: ['full body', 'legs'], equipment: ['none'], measure: 'time',
    cue: 'Small jumps, wrists doing the work. Land softly.' },
  { id: 'burpee', name: 'Burpee', kind: 'cardio', muscles: ['full body'], equipment: ['none'], measure: 'reps',
    cue: 'Step back rather than jump if the lower back complains.' },

  /* ---- mobility ---- */
  { id: 'hip-flexor', name: 'Hip flexor stretch', kind: 'mobility', muscles: ['legs'], equipment: ['none'], measure: 'time',
    cue: 'Half kneeling, glute squeezed, hips forward. Do not arch the back.' },
  { id: 'thoracic', name: 'Thoracic rotation', kind: 'mobility', muscles: ['back', 'shoulders'], equipment: ['none'], measure: 'time',
    cue: 'Rotate from the upper back, hips still. Breathe out at the end of the range.' },
  { id: 'hamstring', name: 'Hamstring stretch', kind: 'mobility', muscles: ['legs'], equipment: ['none'], measure: 'time',
    cue: 'Long spine, hinge from the hip. Mild tension, never pain.' },
  { id: 'shoulder-cars', name: 'Shoulder circles', kind: 'mobility', muscles: ['shoulders'], equipment: ['none'], measure: 'time',
    cue: 'Slow, controlled circles through the biggest range you own.' },
  { id: 'cat-cow', name: 'Cat–cow', kind: 'mobility', muscles: ['back', 'core'], equipment: ['none'], measure: 'time',
    cue: 'Move one vertebra at a time, in time with the breath.' },
  { id: 'nineties', name: '90/90 hip switch', kind: 'mobility', muscles: ['legs', 'glutes'], equipment: ['none'], measure: 'time',
    cue: 'Both knees at right angles. Switch sides without using the hands, if you can.' },
]

export const exerciseById = (id: string): Exercise | undefined =>
  EXERCISES.find((e) => e.id === id)

/* ============================================================ plans */

/** One line of a plan: a movement, and how much of it. */
export interface PlanBlock {
  exerciseId: string
  /**
   * The name as it was when the plan was made. Denormalised on purpose: a
   * plan somebody wrote must still read correctly if the library is ever
   * reworded, and a plan Jumbo wrote may name a movement the library does
   * not carry.
   */
  name: string
  sets: number
  /** One of these two, matching the exercise's own measure. */
  reps?: number
  seconds?: number
  restSeconds: number
  note?: string
}

export interface TrainingPlan {
  id: string
  name: string
  /** "Upper body", "Legs and core" — what the session is for, in a phrase. */
  focus: string
  level: Level
  equipment: Equipment[]
  blocks: PlanBlock[]
  /** Estimated, from the blocks. Shown as "about", because it is. */
  minutes: number
  /** Who made it. Shown wherever the plan is, never hidden. */
  source: 'you' | 'jumbo'
  createdAt: number
  lastDoneAt?: number
  timesDone: number
  /** Jumbo's one line on why this plan, for the ones Jumbo wrote. */
  rationale?: string
}

/**
 * A session that was actually done.
 *
 * The plan already counted how many times it had been done, but a count is
 * not a history: someone who finishes a session and then goes looking for
 * it has nothing to find. Each one is kept whole, with the plan's name
 * copied in so the record survives the plan being deleted.
 */
export interface PlanSession {
  id: string
  planId: string
  planName: string
  /** The day it was logged against, matching the workout it created. */
  date: string
  minutes: number
  /** Movements ticked off, and how many the plan holds. */
  done: number
  total: number
  intensity: 1 | 2 | 3
  effort?: number
  note?: string
  at: number
}

/**
 * How long a plan takes, from its own blocks.
 *
 * Work plus rest plus a little for moving between movements. It is an
 * estimate and the interface says so; what it must not do is drift away
 * from the plan, which is why nothing stores a typed-in duration.
 */
export function planMinutes(blocks: PlanBlock[]): number {
  if (!blocks.length) return 0
  const seconds = blocks.reduce((total, b) => {
    const work = b.seconds ?? (b.reps ?? 10) * 3.5
    return total + b.sets * (work + b.restSeconds)
  }, 0)
  // A minute of setup per movement, which is where the time really goes.
  return Math.max(5, Math.round((seconds + blocks.length * 60) / 60))
}

/** What a plan trains, gathered from its blocks for the summary line. */
export function planMuscles(blocks: PlanBlock[]): Muscle[] {
  const seen = new Set<Muscle>()
  for (const b of blocks) {
    for (const m of exerciseById(b.exerciseId)?.muscles ?? []) seen.add(m)
  }
  return MUSCLES.filter((m) => seen.has(m))
}

/** How a block reads on one line: "3 × 10" or "3 × 40s". */
export function blockAmount(b: PlanBlock): string {
  if (b.seconds) return `${b.sets} × ${b.seconds}s`
  return `${b.sets} × ${b.reps ?? 10}`
}

/**
 * The workout type a finished session is logged as.
 *
 * A session has to land in the same record as everything else the person
 * logs, so it goes in as a WorkoutEntry. Strength work is strength; a
 * session that is mostly cardio is logged as what it mostly was.
 */
export function planWorkoutType(blocks: PlanBlock[]): 'Strength' | 'Run' | 'Mobility' | 'Other' {
  if (!blocks.length) return 'Other'
  const kinds = blocks.map((b) => exerciseById(b.exerciseId)?.kind ?? 'strength')
  const count = (k: Effort) => kinds.filter((x) => x === k).length
  const strength = count('strength')
  const cardio = count('cardio')
  const mobility = count('mobility')
  if (strength >= cardio && strength >= mobility) return 'Strength'
  if (cardio >= mobility) return 'Run'
  return 'Mobility'
}
