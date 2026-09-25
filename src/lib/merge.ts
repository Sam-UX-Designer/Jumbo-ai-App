import type { Persisted } from '../state/store'

/**
 * Bringing two devices' records together.
 *
 * The obvious way to sync a blob is last-write-wins: whoever saved most
 * recently overwrites the other. For a health record that is not a sync, it
 * is a deletion. Log lunch on your phone, log a workout on your laptop, and
 * whichever pushed second erases the other. Nobody would find out until
 * they went looking for a meal that used to be there.
 *
 * So each field is merged by what it is:
 *
 *   • Records keyed by id or by date are unioned. Nothing a person recorded
 *     is ever dropped because the other device had not seen it yet.
 *   • Where both sides hold something for the same day, the newer save wins
 *     that day only, not the whole map.
 *   • Preferences, which are a statement of intent rather than a record,
 *     take the newer side. Changing the theme on your phone should change
 *     it on your laptop, not merge into some third theme.
 *
 * `mine` is this device. `theirs` is what the server had. `theirsIsNewer`
 * says which save happened last, and only settles the preferences.
 */

const byId = <T extends { id: string }>(a: T[] = [], b: T[] = []): T[] => {
  const seen = new Map<string, T>()
  for (const item of [...a, ...b]) {
    if (item && typeof item.id === 'string') seen.set(item.id, item)
  }
  return [...seen.values()]
}

const uniq = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])]

/** One entry per day, taking the newer device's where both wrote one. */
function perDay<T>(
  mine: Record<string, T> = {},
  theirs: Record<string, T> = {},
  theirsIsNewer: boolean,
): Record<string, T> {
  const out: Record<string, T> = { ...theirs, ...mine }
  for (const date of Object.keys(out)) {
    const a = mine[date]
    const b = theirs[date]
    if (a !== undefined && b !== undefined) out[date] = theirsIsNewer ? b : a
  }
  return out
}

/** Meals are a list per day, so a day can hold both devices' meals. */
function mealsPerDay(
  mine: Record<string, Array<{ id: string }>> = {},
  theirs: Record<string, Array<{ id: string }>> = {},
): Record<string, Array<{ id: string }>> {
  const out: Record<string, Array<{ id: string }>> = {}
  for (const date of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    out[date] = byId(mine[date] ?? [], theirs[date] ?? [])
  }
  return out
}

export function mergeStates(
  mine: Partial<Persisted>,
  theirs: Partial<Persisted>,
  theirsIsNewer: boolean,
): Partial<Persisted> {
  const newer = theirsIsNewer ? theirs : mine
  const older = theirsIsNewer ? mine : theirs

  return {
    // Preferences and identity: a statement of intent, so the last one wins.
    ...older,
    ...newer,

    // Everything a person recorded: never dropped, whichever device holds it.
    addedMeals: mealsPerDay(
      mine.addedMeals as Record<string, Array<{ id: string }>>,
      theirs.addedMeals as Record<string, Array<{ id: string }>>,
    ) as Persisted['addedMeals'],
    addedWorkouts: perDay(mine.addedWorkouts, theirs.addedWorkouts, theirsIsNewer),
    addedSleep: perDay(mine.addedSleep, theirs.addedSleep, theirsIsNewer),
    addedNotes: perDay(mine.addedNotes, theirs.addedNotes, theirsIsNewer),
    addedMeasurements: byId(mine.addedMeasurements, theirs.addedMeasurements),

    // Plans and the sessions done against them.
    plans: byId(mine.plans, theirs.plans),
    sessions: byId(mine.sessions, theirs.sessions)
      .sort((a, b) => b.at - a.at)
      .slice(0, 200),

    // Things that happened, and what has been seen.
    events: byId(mine.events, theirs.events)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 200),
    readNotifications: uniq(mine.readNotifications, theirs.readNotifications),
    dismissed: uniq(mine.dismissed, theirs.dismissed),
    milestones: uniq(mine.milestones, theirs.milestones),
    followedChannels: uniq(mine.followedChannels, theirs.followedChannels),
    savedVideos: uniq(mine.savedVideos, theirs.savedVideos),
    savedVideoData: { ...theirs.savedVideoData, ...mine.savedVideoData },
    decisions: { ...theirs.decisions, ...newer.decisions },

    // Being onboarded anywhere means being onboarded. Signing out on one
    // device must not sign you out of the account on the other.
    onboarded: Boolean(mine.onboarded || theirs.onboarded),
    phoneVerified: Boolean(mine.phoneVerified || theirs.phoneVerified),
  }
}
