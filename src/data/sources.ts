import type { SourceDef, MetricKey } from './types'

export const METRIC_LABEL: Record<MetricKey, string> = {
  sleep: 'Sleep',
  steps: 'Steps & walking',
  workouts: 'Workouts',
  heart: 'Heart & fitness',
  body: 'Body composition',
  nutrition: 'Nutrition',
}

export const METRIC_DETAIL: Record<MetricKey, string> = {
  sleep: 'Nightly duration, efficiency and bedtime consistency',
  steps: 'Daily step count and active minutes',
  workouts: 'Type, duration and intensity of sessions',
  heart: 'Resting heart rate, HRV and VO₂ max estimates',
  body: 'Weight, body fat, lean mass and waist',
  nutrition: 'Meals, energy and protein intake',
}

export const SOURCES: SourceDef[] = [
  {
    id: 'health',
    name: 'Phone Health',
    vendor: 'Apple Health / Google Fit',
    kind: 'phone',
    provides: ['sleep', 'steps', 'workouts', 'heart', 'body'],
    blurb: 'Everything your phone already collects, in one connection.',
    accent: 'var(--movement)',
  },
  {
    id: 'ring',
    name: 'Sleep Ring',
    vendor: 'Ōura-style ring',
    kind: 'wearable',
    provides: ['sleep', 'heart'],
    blurb: 'Detailed sleep stages, HRV and overnight recovery signals.',
    accent: 'var(--sleep)',
  },
  {
    id: 'watch',
    name: 'Training Watch',
    vendor: 'Garmin-style watch',
    kind: 'wearable',
    provides: ['workouts', 'heart', 'steps'],
    blurb: 'Session-level training data and fitness estimates.',
    accent: 'var(--recovery)',
  },
  {
    id: 'scale',
    name: 'Smart Scale',
    vendor: 'Withings-style scale',
    kind: 'scale',
    provides: ['body'],
    blurb: 'Weight and body composition trends over time.',
    accent: 'var(--heart)',
  },
  {
    id: 'lab',
    name: 'Lab Results',
    vendor: 'Clinic or at-home panel',
    kind: 'lab',
    provides: ['body'],
    blurb: 'Blood biomarkers and DEXA scans you already have.',
    accent: 'var(--nutrition)',
  },
]

/** Nutrition is deliberately absent from every source: it becomes the gap. */
export const ALL_METRICS: MetricKey[] = ['sleep', 'steps', 'workouts', 'heart', 'body', 'nutrition']
