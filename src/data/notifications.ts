import type { IconName } from '../components/Icon'
import type { Route } from '../components/Nav'

/* ============================================================
   Notifications

   Everything Jumbo has told you, in the order it told you.

   There are two sources and they never mix in the same run of the
   app. In live mode the list is only real events: a meal you saved and
   the app analysed, a workout you logged, a milestone you actually
   reached. Those are written by the reducer at the moment the thing
   happens, so each one carries the instant it happened rather than a
   time chosen to look plausible. With nothing recorded yet the screen
   is empty, and says so.

   In demo mode the app is running on sample data throughout, and the
   sample set below fills the screen so the surface can be seen. It is
   marked on the screen the same way every other demo surface is. It
   deliberately says nothing specific about a body: "a new insight is
   available", never "your VO2 max rose 3.9". A number nobody measured
   is not a notification, it is a lie with a timestamp.
   ============================================================ */

export type NotificationKind =
  | 'insight' | 'meal' | 'goal' | 'reminder' | 'workout' | 'achievement' | 'system'

/** The five filters, and the one that means no filter. */
export type NotificationFilter = 'all' | 'insights' | 'goals' | 'achievements' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  /** ISO instant. The only thing that orders the list. */
  at: string
  /** Where tapping it goes, when there is somewhere to go. */
  route?: Route
  /**
   * How far along the thing is, 0 to 1, shown as a bar. Only set when the
   * app genuinely knows the figure.
   */
  progress?: number
}

/* ── What each kind looks like, and which filter it answers to ────────
   The colours are Jumbo's own category tokens. A notification about a
   meal is the same blue as recovery is everywhere else, so the list
   reads as part of the app rather than as a seventh palette. */
export const KIND: Record<NotificationKind, {
  icon: IconName
  tint: string
  filter: Exclude<NotificationFilter, 'all'>
  /** Said to a screen reader in place of the coloured circle. */
  label: string
}> = {
  insight:     { icon: 'sparkles', tint: 'var(--sleep)',    filter: 'insights',     label: 'Insight' },
  meal:        { icon: 'bowl',     tint: 'var(--recovery)', filter: 'insights',     label: 'Meal' },
  goal:        { icon: 'target',   tint: 'var(--brand)',    filter: 'goals',        label: 'Goal' },
  reminder:    { icon: 'heart',    tint: 'var(--training)', filter: 'goals',        label: 'Reminder' },
  workout:     { icon: 'training', tint: 'var(--recovery)', filter: 'goals',        label: 'Workout' },
  achievement: { icon: 'trophy',   tint: 'var(--note)',     filter: 'achievements', label: 'Achievement' },
  system:      { icon: 'settings', tint: 'var(--ink-3)',    filter: 'system',       label: 'System' },
}

export const FILTERS: Array<{ id: NotificationFilter; label: string; icon: IconName; tint: string }> = [
  { id: 'all',          label: 'All',          icon: 'bell',     tint: 'var(--brand)' },
  { id: 'insights',     label: 'Insights',     icon: 'sparkles', tint: 'var(--sleep)' },
  { id: 'goals',        label: 'Goals',        icon: 'target',   tint: 'var(--brand)' },
  { id: 'achievements', label: 'Achievements', icon: 'trophy',   tint: 'var(--note)' },
  { id: 'system',       label: 'System',       icon: 'settings', tint: 'var(--ink-3)' },
]

export const inFilter = (n: AppNotification, f: NotificationFilter) =>
  f === 'all' || KIND[n.kind].filter === f

/** Newest first, on the stored instant. */
export const byNewest = (a: AppNotification, b: AppNotification) =>
  Date.parse(b.at) - Date.parse(a.at)

/* ── Grouping ─────────────────────────────────────────────────────────
   By the reader's own calendar day, not by elapsed hours: something
   from 11pm last night belongs under Yesterday at 1am, however few
   hours ago it was. */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export function groupOf(at: string, now = new Date()): string {
  const day = 86_400_000
  const today = startOfDay(now)
  const then = startOfDay(new Date(at))
  if (then >= today) return 'Today'
  if (then >= today - day) return 'Yesterday'
  if (then > today - day * 7) return 'This week'
  return 'Earlier'
}

export const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier']

/**
 * When it arrived, said the way a person would say it.
 *
 * Within the hour, minutes. Within today, hours. Yesterday, the clock
 * alone, because the group heading above it already says Yesterday and
 * repeating the word costs the title its line. Older than that, the date
 * and the clock. The stored instant is never changed; this only reads it
 * in the reader's own timezone.
 */
export function whenLabel(at: string, now = new Date()): string {
  const d = new Date(at)
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000)
  const clock = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`

  const group = groupOf(at, now)
  if (group === 'Today') return `${Math.round(mins / 60)}h ago`
  if (group === 'Yesterday') return clock
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${clock}`
}

/* ── The sample set ───────────────────────────────────────────────────
   Demo mode only. Offsets rather than fixed dates, so the groups read
   correctly whenever the app is opened. */

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const H = 3_600_000
const D = 86_400_000

export const SAMPLE_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'demo-insight', kind: 'insight', route: 'future',
    at: ago(H),
    title: 'New AI insight',
    body: 'A new insight is ready from this week’s data.',
  },
  {
    id: 'demo-goal', kind: 'goal', route: 'today',
    at: ago(H * 3),
    title: 'Goal update',
    body: 'You are making progress toward this week’s movement goal.',
    progress: 0.8,
  },
  {
    id: 'demo-achievement', kind: 'achievement', route: 'you',
    at: ago(H * 5),
    title: 'Achievement unlocked',
    body: 'Seven days of logging in a row.',
  },
  {
    id: 'demo-meal', kind: 'meal', route: 'capture',
    at: ago(H * 7),
    title: 'Meal analysis complete',
    body: 'Your lunch has been analysed and added to the day.',
  },
  {
    id: 'demo-reminder', kind: 'reminder', route: 'capture',
    at: ago(D + H * 4),
    title: 'Gentle reminder',
    body: 'Dinner has not been logged yet.',
  },
  {
    id: 'demo-workout', kind: 'workout', route: 'today',
    at: ago(D + H * 6),
    title: 'Workout suggestion',
    body: 'A light session may suit your recovery better than a hard one.',
  },
  {
    id: 'demo-system', kind: 'system', route: 'settings',
    at: ago(D * 2 + H * 8),
    title: 'App updated',
    body: 'Jumbo has been updated with new insights and improvements.',
  },
]
