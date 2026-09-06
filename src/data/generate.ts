import { mulberry32, clamp, round, iso, addDays } from '../lib/util'
import type { DayRecord, Measurement, WorkoutType, MealEntry, FoodItem } from './types'
import { FOODS } from './foods'

const SEED = 20260906

/** Days-before-today that carry a late bedtime, so the cluster is reproducible. */
const LATE_NIGHT_OFFSETS = [2, 4, 5, 9, 11, 16, 19]
export const HISTORY_DAYS = 182

/**
 * Builds a coherent ~6 month history. The signals are correlated on purpose —
 * late bedtimes depress HRV, hard sessions raise resting HR the next day,
 * rest days restore it — so the pattern insights the app surfaces are real
 * relationships in the data rather than decorative noise.
 */
export function generateHistory(todayISO: string): DayRecord[] {
  const rnd = mulberry32(SEED)
  const days: DayRecord[] = []
  const start = addDays(todayISO, -(HISTORY_DAYS - 1))

  let weight = 78.4
  let bodyFat = 22.6
  let hrvBase = 46
  let rhrBase = 61
  let fatigue = 0

  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = addDays(start, i)
    const d = new Date(date + 'T12:00:00')
    const dow = d.getDay()
    const progress = i / (HISTORY_DAYS - 1)

    // Gentle real-world drift: things improve, unevenly.
    const drift = progress * 1.0

    // --- Sleep -----------------------------------------------------------
    const fromEnd = HISTORY_DAYS - 1 - i
    // A real cluster of late nights in the last three weeks — the kind of thing
    // a person half-notices and a pattern engine should be able to name.
    const lateCluster = fromEnd < 22 && LATE_NIGHT_OFFSETS.includes(fromEnd) ? 1.5 : 0
    const weekendLate = dow === 5 || dow === 6 ? 1.05 : 0
    const bedtime = clamp(
      22.7 + weekendLate + lateCluster + (rnd() - 0.5) * 1.5 - drift * 0.25,
      21.4, 26,
    )
    let sleepHours = clamp(
      7.55 + drift * 0.35 - (bedtime - 23) * 0.55 + (rnd() - 0.5) * 1.05,
      4.6, 9.6,
    )
    if (dow === 0) sleepHours += 0.35
    const sleepEfficiency = clamp(85 + drift * 2 - (bedtime - 23) * 1.9 + (rnd() - 0.5) * 6, 68, 97)

    // --- Training --------------------------------------------------------
    // The last seven days carry a deliberate training ramp.
    const rampWeek = fromEnd < 7
    const restDay = rampWeek ? fromEnd === 4 : dow === 1 ? rnd() < 0.62 : rnd() < 0.2
    let workout: DayRecord['workout']
    if (!restDay) {
      const pool: WorkoutType[] =
        dow === 6 ? ['Hike', 'Run', 'Cycle'] :
        dow === 0 ? ['Yoga', 'Walk', 'Mobility'] :
        ['Run', 'Strength', 'Cycle', 'Strength', 'Row', 'Swim']
      const type = pool[Math.floor(rnd() * pool.length)]
      const hard = rnd() < 0.28 + progress * 0.1
      const intensity: 1 | 2 | 3 = hard ? 3 : rnd() < 0.5 ? 2 : 1
      const base = type === 'Strength' ? 48 : type === 'Hike' ? 96 : type === 'Yoga' ? 40 : 52
      const rampIntensity: 1 | 2 | 3 = rampWeek ? (intensity < 3 ? ((intensity + 1) as 2 | 3) : 3) : intensity
      workout = {
        id: `w-${date}`,
        type,
        minutes: Math.round((base + (rnd() - 0.4) * 22 + progress * 6) * (rampWeek ? 1.22 : 1)),
        intensity: rampIntensity,
        perceivedEffort: clamp(Math.round(rampIntensity * 2.6 + (rnd() - 0.5) * 2), 2, 10),
        source: 'imported',
      }
      fatigue = clamp(fatigue + rampIntensity * 0.62, 0, 5.2)
    } else {
      fatigue = clamp(fatigue - 1.9, 0, 5.2)
    }

    // --- Movement --------------------------------------------------------
    const stepBase = dow === 0 || dow === 6 ? 9200 : 7800
    const steps = Math.round(
      clamp(stepBase + drift * 1500 + (workout ? workout.minutes * 24 : -600) + (rnd() - 0.5) * 3200, 1800, 21000),
    )
    const activeMinutes = Math.round(clamp(steps / 145 + (workout?.minutes ?? 0) * 0.62 + (rnd() - 0.5) * 8, 8, 190))

    // --- Heart & recovery -------------------------------------------------
    hrvBase += (48 + drift * 7 - hrvBase) * 0.045
    rhrBase += (60 - drift * 3.4 - rhrBase) * 0.045
    const sleepDebt = clamp(7.6 - sleepHours, -1.2, 3)
    const lateness = clamp(bedtime - 23.2, -1, 2.4)
    const hrv = round(clamp(
      hrvBase - fatigue * 3.4 - sleepDebt * 2.6 - lateness * 3.6 + (rnd() - 0.5) * 5,
      22, 96,
    ), 0)
    const restingHR = round(clamp(
      rhrBase + fatigue * 1.5 + sleepDebt * 1.2 + lateness * 0.9 + (rnd() - 0.5) * 2.8,
      44, 78,
    ), 0)

    // --- Body -------------------------------------------------------------
    weight += (77.1 - weight) * 0.006 + (rnd() - 0.5) * 0.24
    bodyFat += (19.4 - bodyFat) * 0.0055 + (rnd() - 0.5) * 0.13

    // --- Meals ------------------------------------------------------------
    const meals = buildDayMeals(date, rnd, progress)

    days.push({
      date,
      sleepHours: round(sleepHours, 2),
      sleepEfficiency: round(sleepEfficiency, 0),
      bedtimeHour: round(bedtime, 2),
      steps,
      activeMinutes,
      restingHR,
      hrv,
      weightKg: round(weight, 1),
      bodyFatPct: round(bodyFat, 1),
      workout,
      meals,
      restDay,
    })
  }

  // Today is still unfolding — strip what has not happened yet.
  const last = days[days.length - 1]
  const hour = new Date().getHours()
  last.meals = last.meals.filter((m) => Number(m.time.slice(0, 2)) <= hour)
  last.steps = Math.round(last.steps * clamp((hour + 1) / 20, 0.08, 1))
  last.activeMinutes = Math.round(last.activeMinutes * clamp((hour + 1) / 20, 0.08, 1))
  if (hour < 17 && last.workout) last.workout = undefined
  return days
}

function buildDayMeals(date: string, rnd: () => number, progress: number): MealEntry[] {
  const slots: Array<{ slot: MealEntry['slot']; time: string; pick: number }> = [
    { slot: 'Breakfast', time: rnd() < 0.5 ? '07:40' : '08:25', pick: 0 },
    { slot: 'Lunch', time: rnd() < 0.5 ? '12:30' : '13:15', pick: 1 },
    { slot: 'Dinner', time: rnd() < 0.5 ? '19:10' : '20:05', pick: 2 },
  ]
  if (rnd() < 0.55) slots.push({ slot: 'Snack', time: '16:20', pick: 3 })

  return slots.map((s, idx) => {
    const templates = MEAL_TEMPLATES[s.slot]
    const t = templates[Math.floor(rnd() * templates.length)]
    const dayScale = 0.78
    const items: FoodItem[] = t.map((key, k) => {
      const base = FOODS[key]
      const scale = (0.85 + rnd() * 0.4 + progress * 0.05) * dayScale
      return {
        id: `${date}-${idx}-${k}`,
        name: base.name,
        portion: base.portion,
        grams: Math.round(base.grams * scale),
        kcal: Math.round(base.kcal * scale),
        protein: round(base.protein * scale, 1),
        carbs: round(base.carbs * scale, 1),
        fat: round(base.fat * scale, 1),
        confidence: 1,
      }
    })
    return {
      id: `m-${date}-${idx}`,
      time: s.time,
      slot: s.slot,
      items,
      method: 'imported',
      confirmed: true,
    }
  })
}

const MEAL_TEMPLATES: Record<MealEntry['slot'], string[][]> = {
  Breakfast: [
    ['oats', 'blueberries', 'greekYogurt'],
    ['eggs', 'sourdough', 'avocado'],
    ['greekYogurt', 'granola', 'banana'],
  ],
  Lunch: [
    ['chickenBreast', 'brownRice', 'broccoli'],
    ['salmon', 'quinoa', 'mixedGreens'],
    ['lentilSoup', 'sourdough', 'mixedGreens'],
  ],
  Dinner: [
    ['salmon', 'sweetPotato', 'broccoli'],
    ['tofu', 'brownRice', 'mixedGreens'],
    ['chickenBreast', 'pasta', 'tomatoSauce'],
    ['steak', 'sweetPotato', 'mixedGreens'],
  ],
  Snack: [
    ['almonds', 'apple'],
    ['proteinShake'],
    ['darkChocolate', 'walnuts'],
  ],
}

/** Point-in-time measurements: lab panels, DEXA scans, lab-grade fitness tests. */
export function generateMeasurements(todayISO: string): Measurement[] {
  const rnd = mulberry32(SEED + 7)
  const out: Measurement[] = []
  const push = (
    kind: Measurement['kind'], daysAgo: number, value: number, unit: string,
    source: string, context?: string,
  ) => {
    out.push({ id: `${kind}-${daysAgo}`, kind, date: addDays(todayISO, -daysAgo), value, unit, source, context })
  }

  // VO₂ max — watch estimate, monthly
  const vo2Points = [175, 145, 116, 86, 57, 28, 3]
  vo2Points.forEach((d, i) => {
    push('vo2max', d, round(41.2 + i * 0.62 + (rnd() - 0.5) * 0.5, 1), 'ml/kg/min', 'Training Watch',
      i === vo2Points.length - 1 ? 'Estimated from running heart-rate data' : undefined)
  })

  // DEXA — two scans, six months apart
  push('bodyFat', 178, 24.1, '%', 'DEXA scan', 'Whole-body scan, morning, fasted')
  push('bodyFat', 22, 20.8, '%', 'DEXA scan', 'Whole-body scan, morning, fasted')
  push('leanMass', 178, 57.4, 'kg', 'DEXA scan')
  push('leanMass', 22, 59.1, 'kg', 'DEXA scan')
  push('boneDensity', 178, 1.14, 'g/cm²', 'DEXA scan', 'Lumbar spine, Z-score +0.4')
  push('boneDensity', 22, 1.16, 'g/cm²', 'DEXA scan', 'Lumbar spine, Z-score +0.5')
  push('waist', 178, 88, 'cm', 'Manual')
  push('waist', 22, 84, 'cm', 'Manual')

  // Blood panels — two draws
  const panels: Array<[Measurement['kind'], number, number, string]> = [
    ['apoB', 96, 74, 'mg/dL'],
    ['ldl', 112, 96, 'mg/dL'],
    ['hdl', 52, 58, 'mg/dL'],
    ['triglycerides', 118, 92, 'mg/dL'],
    ['hba1c', 5.4, 5.2, '%'],
    ['crp', 1.6, 0.9, 'mg/L'],
    ['vitaminD', 24, 38, 'ng/mL'],
  ]
  panels.forEach(([kind, before, after, unit]) => {
    push(kind, 190, before, unit, 'Lab panel')
    push(kind, 34, after, unit, 'Lab panel')
  })

  push('gripStrength', 120, 44, 'kg', 'Manual', 'Right hand, best of three')
  push('gripStrength', 16, 47, 'kg', 'Manual', 'Right hand, best of three')

  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export const TODAY = iso(new Date())
