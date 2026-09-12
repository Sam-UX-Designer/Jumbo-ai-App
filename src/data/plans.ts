/**
 * What JUMBO sells, and what each plan actually gets you.
 *
 * Two rules govern this file.
 *
 * The first is that every benefit carries `built`. A benefit marked false is
 * something JUMBO does not do yet, and it is shown as "Coming soon" rather
 * than as a reason to pay today. Selling a report the app cannot produce is
 * the one thing a health product cannot come back from, and it is easier to
 * keep that honest here, in one list, than in four screens of copy.
 *
 * The second is that every number is arithmetic on the two prices below.
 * "Save 44%" is computed from the monthly and annual figures, not written
 * down, so the claim cannot drift away from the price.
 */

export type PlanId = 'free' | 'plus' | 'pro' | 'max'

export interface Benefit {
  text: string
  /** False when JUMBO cannot do this yet. Shown as "Coming soon". */
  built: boolean
}

export interface Plan {
  id: PlanId
  name: string
  /** What this plan is for, in four words. */
  pitch: string
  /** The one word for where it sits on the ladder: start, build, understand, optimise. */
  step: string
  icon: 'leaf' | 'sparkles' | 'target' | 'shield'
  colour: string
  /** Rupees a year. 0 for Free. */
  yearly: number
  /** Rupees a month on the monthly plan. 0 for Free. */
  monthly: number
  /** AI credits included each month. */
  credits: number
  benefits: Benefit[]
}

/**
 * AI credits, in the person's own terms.
 *
 * Deliberately not tokens, requests, or a model's name: a credit is what an
 * analysis costs, and how many an analysis costs is Jumbo's problem.
 */
export const CREDITS_EXPLAINER =
  'AI credits are used when JUMBO analyses your data, meals, trends and questions.'

/** What a credit is actually spent on, all of which the app does today. */
export const CREDIT_USES = [
  { icon: 'sparkles', label: 'Health analysis' },
  { icon: 'plate', label: 'Meal analysis' },
  { icon: 'ai', label: 'Ask JUMBO' },
  { icon: 'future', label: 'AI Future' },
] as const

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'JUMBO Free',
    pitch: 'Start your journey.',
    step: 'Start',
    icon: 'leaf',
    colour: 'var(--movement)',
    yearly: 0,
    monthly: 0,
    credits: 25,
    benefits: [
      { text: 'Health dashboard and daily rings', built: true },
      { text: 'Daily tracking: meals, workouts, notes', built: true },
      { text: 'Ask JUMBO, within your credits', built: true },
      { text: 'Meal photo analysis', built: true },
      { text: 'AI insights from your own data', built: true },
      { text: 'Explore, with saving and following', built: true },
      { text: '7 days of history', built: true },
    ],
  },
  {
    id: 'plus',
    name: 'JUMBO Plus',
    pitch: 'Build better habits.',
    step: 'Build',
    icon: 'sparkles',
    colour: 'var(--recovery)',
    yearly: 999,
    monthly: 149,
    credits: 150,
    benefits: [
      { text: 'Six times the AI credits', built: true },
      { text: 'Full meal photo analysis allowance', built: true },
      { text: '12 months of history', built: true },
      { text: 'AI Future scenarios', built: true },
      { text: 'More personalised recommendations', built: true },
      { text: 'Export your data', built: true },
      { text: 'Weekly AI summary', built: false },
      { text: 'Saved AI conversations', built: false },
    ],
  },
  {
    id: 'pro',
    name: 'JUMBO Pro',
    pitch: 'Understand your health.',
    step: 'Understand',
    icon: 'target',
    colour: 'var(--brand)',
    yearly: 2499,
    monthly: 349,
    credits: 500,
    benefits: [
      { text: 'Everything in Plus', built: true },
      { text: 'Twenty times the AI credits', built: true },
      { text: 'Full history, as far back as it goes', built: true },
      { text: 'Charts and tables inside answers', built: true },
      { text: 'Advanced AI Future scenarios', built: true },
      { text: 'Long-term trend analysis', built: true },
      { text: 'Cross-category correlations', built: true },
      { text: 'Deeper nutrition analysis', built: true },
      { text: 'Monthly health report', built: false },
      { text: 'PDF report export', built: false },
      { text: 'Personalised action plans', built: false },
      { text: 'Early access to new features', built: false },
    ],
  },
  {
    id: 'max',
    name: 'JUMBO Max',
    pitch: 'Go deeper with JUMBO.',
    step: 'Optimise',
    icon: 'shield',
    colour: 'var(--ai)',
    yearly: 4999,
    monthly: 699,
    credits: 1500,
    benefits: [
      { text: 'Everything in Pro', built: true },
      { text: 'Sixty times the AI credits', built: true },
      { text: 'Deep personal health analysis', built: true },
      { text: 'Every AI Future scenario, tuned by hand', built: true },
      { text: 'Advanced data visualisations', built: true },
      { text: 'Annual health journey report', built: false },
      { text: 'AI-generated personalised plans', built: false },
      { text: 'Priority AI processing', built: false },
      { text: 'Experimental AI features', built: false },
      { text: 'Premium support', built: false },
    ],
  },
]

export const planById = (id: PlanId) => PLANS.find((p) => p.id === id) ?? PLANS[0]

/** Rupees, grouped the Indian way: 4,999 and 1,00,000. */
export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`

/** What a year of this plan works out at each month. */
export const perMonth = (plan: Plan) => Math.round(plan.yearly / 12)

/**
 * What paying yearly saves against paying monthly, as a whole percent.
 * Returns null for Free and for any plan with no monthly price to compare.
 */
export function annualSaving(plan: Plan): number | null {
  if (!plan.yearly || !plan.monthly) return null
  const twelveMonths = plan.monthly * 12
  return Math.round(((twelveMonths - plan.yearly) / twelveMonths) * 100)
}

/** The largest honest saving across the paid plans, for the annual toggle. */
export const bestSaving = Math.max(
  ...PLANS.map((p) => annualSaving(p) ?? 0),
)

/**
 * The comparison, by the things JUMBO actually does.
 *
 * Each row is one capability and what each plan gets of it. A dash means the
 * plan does not include it; it never means the capability does not exist.
 */
export interface CompareRow {
  label: string
  free: string
  plus: string
  pro: string
  max: string
  /** False when the row describes something not built yet. */
  built: boolean
}

export const COMPARISON: CompareRow[] = [
  { label: 'AI credits a month', free: '25', plus: '150', pro: '500', max: '1,500', built: true },
  { label: 'Ask JUMBO', free: 'Limited', plus: 'More', pro: 'High', max: 'Highest', built: true },
  { label: 'AI insights', free: 'Basic', plus: 'Full', pro: 'Advanced', max: 'Deep', built: true },
  { label: 'Meal photo analysis', free: 'Limited', plus: 'Full', pro: 'Advanced', max: 'Highest', built: true },
  { label: 'AI Future', free: 'Basic', plus: 'Full', pro: 'Advanced', max: 'Deep', built: true },
  { label: 'History kept', free: '7 days', plus: '12 months', pro: 'All', max: 'All', built: true },
  { label: 'Trend analysis', free: 'Basic', plus: 'Full', pro: 'Advanced', max: 'Deep', built: true },
  { label: 'Charts in answers', free: '-', plus: '-', pro: 'Yes', max: 'Yes', built: true },
  { label: 'Data export', free: '-', plus: 'Basic', pro: 'Full', max: 'Full', built: true },
  { label: 'Reports', free: '-', plus: 'Weekly', pro: 'Monthly', max: 'Monthly + annual', built: false },
  { label: 'PDF export', free: '-', plus: '-', pro: 'Yes', max: 'Yes', built: false },
  { label: 'Personalised plans', free: '-', plus: '-', pro: 'Yes', max: 'Advanced', built: false },
  { label: 'Early access', free: '-', plus: '-', pro: 'Yes', max: 'Yes', built: false },
]
