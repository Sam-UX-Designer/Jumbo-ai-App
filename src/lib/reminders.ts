import type { Reminders } from '../data/types'

/**
 * Reminders, implemented honestly.
 *
 * A web page can only raise a notification while it is running. There is no
 * reliable background timer in a browser without a service worker and a push
 * server, so Jumbo schedules its reminders in-page and says so plainly in
 * Profile rather than promising alerts it cannot deliver. In the native shell
 * the same schedule is handed to the OS.
 */

export type ReminderKind = 'breakfast' | 'lunch' | 'dinner' | 'workout'

const COPY: Record<ReminderKind, { title: string; body: string }> = {
  breakfast: { title: 'Breakfast', body: 'A photo takes five seconds and closes the biggest gap in your data.' },
  lunch: { title: 'Lunch', body: 'Snap the plate before you eat. Jumbo will do the rest.' },
  dinner: { title: 'Dinner', body: 'Last meal of the day. One photo completes today.' },
  workout: { title: 'Training', body: 'Your usual session time. Rest counts too if today is a rest day.' },
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window
export const notificationPermission = (): NotificationPermission =>
  notificationsSupported() ? Notification.permission : 'denied'

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

interface Scheduled { kind: ReminderKind; timer: number }
let scheduled: Scheduled[] = []

const clearAll = () => {
  scheduled.forEach((s) => window.clearTimeout(s.timer))
  scheduled = []
}

function msUntil(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const target = new Date()
  target.setHours(Number(m[1]), Number(m[2]), 0, 0)
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1)
  return target.getTime() - Date.now()
}

/**
 * Arms the next occurrence of each enabled reminder. Re-arms itself after
 * firing, so an open tab keeps the routine going day to day.
 */
export function scheduleReminders(
  reminders: Reminders,
  onFire: (kind: ReminderKind) => void,
) {
  clearAll()
  if (!reminders.enabled) return clearAll

  ;(Object.keys(COPY) as ReminderKind[]).forEach((kind) => {
    const time = reminders[kind]
    if (!time) return
    const delay = msUntil(time)
    if (delay === null) return

    const timer = window.setTimeout(() => {
      fire(kind)
      onFire(kind)
      scheduleReminders(reminders, onFire)   // re-arm for tomorrow
    }, delay)
    scheduled.push({ kind, timer })
  })

  return clearAll
}

function fire(kind: ReminderKind) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const { title, body } = COPY[kind]
  try {
    new Notification(`Jumbo · ${title}`, { body, tag: `jumbo-${kind}`, icon: '/favicon.svg' })
  } catch { /* some browsers require a service worker registration; degrade quietly */ }
}

export function nextReminderLabel(reminders: Reminders): string | null {
  if (!reminders.enabled) return null
  const upcoming = (Object.keys(COPY) as ReminderKind[])
    .map((k) => ({ kind: k, in: msUntil(reminders[k]) }))
    .filter((x): x is { kind: ReminderKind; in: number } => x.in !== null)
    .sort((a, b) => a.in - b.in)[0]
  if (!upcoming) return null
  const hours = Math.floor(upcoming.in / 3_600_000)
  const mins = Math.round((upcoming.in % 3_600_000) / 60_000)
  const when = hours > 0 ? `${hours} h ${mins} min` : `${mins} min`
  return `${COPY[upcoming.kind].title} in ${when}`
}

export const REMINDER_LABELS: Record<ReminderKind, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', workout: 'Workout',
}
