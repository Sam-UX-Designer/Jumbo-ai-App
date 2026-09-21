/**
 * Training: suggestions, plans, and the session that becomes a workout.
 *
 * The promise this feature makes is narrow and easy to break. A suggestion
 * has to come from what the person actually recorded — an account with
 * nothing in it must be told so, not handed a confident guess. A plan the
 * person wrote and a plan a model drafted must stay distinguishable
 * forever. And a session they worked through has to reach the day's
 * figures, or it is theatre.
 */
import {
  openApp, screenText, goTo, saved, account, aWorkout, todayISO, startApi,
} from '../harness.mjs'

const SECRETY = /API[_ ]?KEY|OPENROUTER|process\.env|Bearer |sk-[a-zA-Z0-9]|undefined is not/i

/** Capture → Training, the way a person gets there. */
async function openTraining(page) {
  await goTo(page, 'capture')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Workout suggestions and plans/i }).click()
  await page.waitForTimeout(700)
}

/** Build a plan by hand from the library. */
async function buildPlan(page, name, movements) {
  await page.getByRole('button', { name: /^Build a plan$/ }).first().click()
  await page.waitForTimeout(500)
  await page.locator('#plan-name').fill(name)
  for (const m of movements) {
    await page.getByRole('button', { name: new RegExp(`^${m}`) }).first().click()
    await page.waitForTimeout(120)
  }
  await page.getByRole('button', { name: /^Save plan$/ }).click()
  await page.waitForTimeout(700)
}

export default async function training({ browser, origin, r }) {
  const today = todayISO()

  await r.run('UC-60', 'An empty account is told there is nothing to suggest from', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, account())
    await openTraining(page)
    const text = await page.locator('.suggest').innerText()
    r.check('it says there is nothing recorded yet', /nothing recorded yet/i.test(text))
    r.check('it does not recommend a session anyway',
      !/good day to train|keep it easy|take today off/i.test(text),
      'a recommendation from no data is a recommendation invented')
    r.check('it cites no evidence, because there is none',
      await page.locator('.suggest__why li').count() === 0)
    r.check('it offers both ways to get a plan',
      await page.getByRole('button', { name: /^Build a plan$/ }).count() > 0
      && await page.getByRole('button', { name: /Ask Jumbo/ }).count() > 0)
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  await r.run('UC-61', 'A suggestion is made from the person’s own record, and says why', async () => {
    const { ctx, page } = await openApp(browser, origin, account({
      addedWorkouts: { [today]: aWorkout() },
    }))
    await openTraining(page)
    const text = await page.locator('.suggest').innerText()
    r.check('a recommendation is made', /good day to train|keep it easy|something lighter|take today off/i.test(text))
    r.check('it shows what it was based on',
      await page.locator('.suggest__why li').count() > 0,
      'a suggestion with no stated reason cannot be argued with')
    r.check('no zero is presented as a body reading', !/0 bpm|baseline of 0\b/i.test(text))
    r.check('no implementation detail on screen', !SECRETY.test(await screenText(page)))
    await ctx.close()
  })

  await r.run('UC-62', 'A plan can be built by hand, and is kept', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, account())
    await openTraining(page)
    await buildPlan(page, 'My session', ['Bodyweight squat', 'Push-up', 'Plank'])

    r.check('the plan is on screen', await page.locator('.plan-card').count() === 1)
    const s = await saved(page)
    const plan = s?.plans?.[0]
    r.check('it is written to storage', Boolean(plan))
    r.check('with the name that was typed', plan?.name === 'My session', plan?.name)
    r.check('with every movement picked', plan?.blocks?.length === 3, `${plan?.blocks?.length}`)
    r.check('marked as the person’s own', plan?.source === 'you', plan?.source)
    r.check('and an estimated duration derived from the blocks', plan?.minutes > 0)

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    r.check('it survives a reload', ((await saved(page))?.plans || []).length === 1)
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  await r.run('UC-63', 'Jumbo can draft a plan, and nothing is saved until it is accepted', async () => {
    const api = await startApi()
    const { ctx, page, errors } = await openApp(browser, api.origin, account())
    await openTraining(page)
    await page.getByRole('button', { name: /Ask Jumbo/ }).first().click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Write me a session' }).click()
    await page.waitForTimeout(1800)

    r.check('the draft is shown in full first', await page.locator('.draft__row').count() >= 3)
    r.check('nothing is saved yet', ((await saved(page))?.plans || []).length === 0,
      'a plan must not be kept before the person has seen it')

    const sent = api.calls.find((c) => c.path === '/api/ai/plan')?.payload
    r.check('the request was made', Boolean(sent))
    r.check('the movement library travelled with it',
      (sent?.library || []).length > 10,
      'without it the model names movements Jumbo cannot show')
    const flat = JSON.stringify(sent ?? {})
    r.check('no health data was sent to draft a plan',
      !/sleepHours|restingHR|hrv|steps/.test(flat),
      'a plan is built from what they asked for, not from their body')

    await page.getByRole('button', { name: 'Save this plan' }).click()
    await page.waitForTimeout(800)
    const plan = (await saved(page))?.plans?.[0]
    r.check('once accepted it is kept', Boolean(plan))
    r.check('and is marked as Jumbo’s, not theirs', plan?.source === 'jumbo', plan?.source)
    r.check('the card says so on screen', /By Jumbo/i.test(await screenText(page)))
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close(); await api.close()
  })

  await r.run('UC-64', 'With the AI unavailable, plans can still be built by hand', async () => {
    const api = await startApi({ failPlan: true })
    const { ctx, page } = await openApp(browser, api.origin, account())
    await openTraining(page)
    await page.getByRole('button', { name: /Ask Jumbo/ }).first().click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Write me a session' }).click()
    await page.waitForTimeout(1800)

    const text = await screenText(page)
    r.check('the failure is admitted', /again|did not come back|could ?n.t|unavailable/i.test(text))
    r.check('no key names or stack traces reach the person', !SECRETY.test(text))
    r.check('nothing half-made was saved', ((await saved(page))?.plans || []).length === 0)

    // And the other path still works entirely.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await buildPlan(page, 'Still works', ['Bodyweight squat', 'Plank'])
    r.check('building one by hand is unaffected',
      ((await saved(page))?.plans || []).length === 1,
      'an AI outage must not take the feature with it')
    await ctx.close(); await api.close()
  })

  await r.run('UC-65', 'A session worked through is logged and counts towards the day', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, account())
    await openTraining(page)
    await buildPlan(page, 'Full body', ['Bodyweight squat', 'Push-up', 'Plank'])

    await page.locator('.plan-card').getByRole('button', { name: /^Start/ }).click()
    await page.waitForTimeout(600)
    r.check('the session opens', await page.locator('.session').count() > 0)

    const items = page.locator('.session__item')
    const n = await items.count()
    r.check('every movement is listed', n === 3, `${n} listed`)
    for (let i = 0; i < n; i++) { await items.nth(i).click(); await page.waitForTimeout(120) }
    r.check('ticking them off registers',
      await page.locator('.session__item[aria-pressed="true"]').count() === n)

    await page.getByRole('button', { name: /Finish session/ }).click()
    await page.waitForTimeout(600)
    r.check('the duration can be corrected before saving',
      await page.getByRole('button', { name: /Increase duration/i }).count() > 0,
      'a phone that locked mid-session would otherwise force a wrong figure')
    await page.getByRole('button', { name: 'Save to today' }).click()
    await page.waitForTimeout(900)

    const s = await saved(page)
    const workout = s?.addedWorkouts?.[today]
    r.check('a real workout is written to the day', Boolean(workout))
    r.check('it names the plan', /Full body/.test(workout?.note ?? ''), workout?.note)
    r.check('with a duration', workout?.minutes > 0)
    r.check('and the kind of training it was', workout?.type === 'Strength', workout?.type)
    r.check('the plan records that it was done', s?.plans?.[0]?.timesDone === 1)
    r.check('and when', Boolean(s?.plans?.[0]?.lastDoneAt))

    await goTo(page, 'today')
    await page.waitForTimeout(800)
    const text = await screenText(page)
    r.check('it reaches the figures on Today', /active min/i.test(text),
      'a session that shows on its plan and nowhere else is theatre')
    r.check('Movement is no longer blank', !/Movement\s*\n\s*–/.test(text))
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  await r.run('UC-66', 'Leaving a session part-way logs nothing', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    await openTraining(page)
    await buildPlan(page, 'Quick one', ['Bodyweight squat', 'Plank'])
    await page.locator('.plan-card').getByRole('button', { name: /^Start/ }).click()
    await page.waitForTimeout(600)
    await page.locator('.session__item').first().click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Close session' }).click()
    await page.waitForTimeout(500)

    r.check('it asks before abandoning the session',
      /leave this session/i.test(await screenText(page)),
      'one stray tap must not throw away a session in progress')
    await page.getByRole('button', { name: /^Leave$/ }).click()
    await page.waitForTimeout(700)

    const s = await saved(page)
    r.check('no workout was written', !s?.addedWorkouts?.[today],
      'an unfinished session is not a workout')
    r.check('the plan is not marked as done', s?.plans?.[0]?.timesDone === 0)
    r.check('and the plan is still there', (s?.plans || []).length === 1)
    await ctx.close()
  })

  await r.run('UC-67', 'A plan can be edited and deleted, and deleting asks first', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    await openTraining(page)
    await buildPlan(page, 'Before', ['Bodyweight squat', 'Plank'])

    await page.getByRole('button', { name: /^Edit/ }).first().click()
    await page.waitForTimeout(500)
    await page.locator('#plan-name').fill('After')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(700)

    const s1 = await saved(page)
    r.check('the edit is kept', s1?.plans?.[0]?.name === 'After', s1?.plans?.[0]?.name)
    r.check('editing did not make a second copy', (s1?.plans || []).length === 1,
      `${(s1?.plans || []).length} plans`)

    await page.getByRole('button', { name: /^Delete After$/ }).click()
    await page.waitForTimeout(500)
    r.check('deleting asks first', /delete/i.test(await screenText(page)))
    await page.getByRole('button', { name: /^Delete plan$/ }).click()
    await page.waitForTimeout(700)
    r.check('and then it is gone', ((await saved(page))?.plans || []).length === 0)
    await ctx.close()
  })
}
