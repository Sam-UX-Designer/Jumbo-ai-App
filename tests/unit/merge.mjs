/**
 * Merging two devices' records.
 *
 * This is the one piece of the account work that can destroy something. The
 * obvious way to sync a blob is last-write-wins, and for a health record
 * that is not a sync but a deletion: log lunch on a phone, log a workout on
 * a laptop, and whichever saves second erases the other. Nobody finds out
 * until they go looking for a meal that used to be there.
 *
 * So every case below is a pair of devices that each hold something the
 * other has not seen, and the rule being checked is that nothing recorded
 * is ever dropped.
 *
 *   node tests/unit/merge.mjs
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'merge-'))
const out = join(dir, 'merge.mjs')
await build({
  entryPoints: [new URL('../../src/lib/merge.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
})
const { mergeStates } = await import(out)

let fails = 0
const ok = (name, cond, detail = '') => {
  if (!cond) fails++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// Phone logged lunch. Laptop logged a workout. Same day. Neither had seen
// the other. This is the case that destroys data under last-write-wins.
const phone = {
  addedMeals: { '2026-09-25': [{ id: 'm1', name: 'Lunch' }] },
  addedWorkouts: {},
  plans: [{ id: 'p1', name: 'Phone plan' }],
  sessions: [{ id: 's1', at: 100 }],
  addedMeasurements: [{ id: 'x1' }],
  theme: 'dark', profile: { name: 'Sam' }, milestones: ['a'],
  events: [{ id: 'e1', at: '2026-09-25T10:00:00Z' }],
}
const laptop = {
  addedMeals: { '2026-09-25': [{ id: 'm2', name: 'Dinner' }] },
  addedWorkouts: { '2026-09-25': { id: 'w1', type: 'Run' } },
  plans: [{ id: 'p2', name: 'Laptop plan' }],
  sessions: [{ id: 's2', at: 200 }],
  addedMeasurements: [{ id: 'x2' }],
  theme: 'light', profile: { name: 'Samuel' }, milestones: ['b'],
  events: [{ id: 'e2', at: '2026-09-25T11:00:00Z' }],
}

const m = mergeStates(phone, laptop, true)   // laptop saved later
ok('both meals survive the same day', (m.addedMeals['2026-09-25'] ?? []).length === 2,
   JSON.stringify(m.addedMeals['2026-09-25']?.map((x) => x.id)))
ok('the workout only one side had survives', Boolean(m.addedWorkouts['2026-09-25']))
ok('both plans survive', m.plans.length === 2, m.plans.map((p) => p.id).join(','))
ok('both sessions survive', m.sessions.length === 2)
ok('sessions come back newest first', m.sessions[0].id === 's2')
ok('both measurements survive', m.addedMeasurements.length === 2)
ok('milestones union', m.milestones.length === 2)
ok('events union', m.events.length === 2)
ok('the newer device wins the theme', m.theme === 'light', m.theme)
ok('and the profile', m.profile.name === 'Samuel', m.profile.name)

// Reverse the direction: the phone saved later.
const m2 = mergeStates(phone, laptop, false)
ok('reversed, the phone wins the theme', m2.theme === 'dark', m2.theme)
ok('reversed, records still all survive',
   (m2.addedMeals['2026-09-25'] ?? []).length === 2 && m2.plans.length === 2)

// Same day, both wrote a workout. One has to win, nothing else may be lost.
const a = { addedWorkouts: { d: { id: 'wa' } }, addedNotes: { d: 'mine' }, plans: [{ id: 'p' }] }
const b = { addedWorkouts: { d: { id: 'wb' } }, addedNotes: { d: 'theirs' }, plans: [{ id: 'p' }] }
const m3 = mergeStates(a, b, true)
ok('a clash on one day takes the newer', m3.addedWorkouts.d.id === 'wb')
ok('and the note with it', m3.addedNotes.d === 'theirs')
ok('the same plan is not duplicated', m3.plans.length === 1)

// Signing out on one device must not sign you out of the account.
ok('onboarded anywhere means onboarded',
   mergeStates({ onboarded: false }, { onboarded: true }, false).onboarded === true)

// Empty sides must not throw or wipe.
const m4 = mergeStates({}, laptop, true)
ok('an empty device adopts the account', m4.plans.length === 1 && m4.addedMeals['2026-09-25'].length === 1)
const m5 = mergeStates(phone, {}, false)
ok('an empty account adopts the device', m5.plans.length === 1)

console.log(fails ? `\n${fails} check(s) FAILED` : `\nall ${18} merge checks passed`)
process.exit(fails ? 1 : 0)
