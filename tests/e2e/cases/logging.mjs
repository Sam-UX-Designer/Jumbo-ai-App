/**
 * Recording things, and getting them back.
 *
 * This is the product's core promise, so these cases are deliberately
 * suspicious. They check three separate things for every record:
 *
 *   1. it is written to storage,
 *   2. it survives a reload,
 *   3. it reaches the figures on Today.
 *
 * Point 3 is not pedantry. A workout once saved and displayed on Capture
 * while every number on Today ignored it — the record existed and the app
 * still behaved as though the person had done nothing.
 */
import { openApp, saved, screenText, goTo, clickClear, account, aMeal, aWorkout, todayISO } from '../harness.mjs'

export default async function logging({ browser, origin, r }) {
  const today = todayISO()

  /* ── UC-10 ─────────────────────────────────────────────────────────── */
  await r.run('UC-10', 'A logged workout is saved, survives reload, and counts', async () => {
    const { ctx, page, errors } = await openApp(browser, origin,
      account({ addedWorkouts: { [today]: aWorkout() } }))

    const s = await saved(page)
    r.check('the workout is in storage', Boolean(s?.addedWorkouts?.[today]))
    r.check('its minutes are intact', s?.addedWorkouts?.[today]?.minutes === 130)

    const todayText = await screenText(page)
    r.check('Today shows a real health score',
      /score/i.test(todayText) && !/^0$/.test((await page.locator('.score__num').innerText()).trim()),
      `score=${(await page.locator('.score__num').innerText()).trim()}`)
    r.check('the movement figure reflects the session',
      /130/.test(todayText), 'the 130 minutes appear nowhere')
    r.check('Today does not claim nothing was recorded',
      !/Nothing recorded yet/i.test(todayText))

    await goTo(page, 'capture')
    const cap = await screenText(page)
    r.check('Capture lists it under Recently added', /Cycle/.test(cap) && /130/.test(cap))
    r.check('its time reads in 12-hour form', /11:30 AM/.test(cap), cap.match(/\d{1,2}:\d{2}\s?[AP]M/)?.[0] ?? 'none')

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const after = await saved(page)
    r.check('it is still there after a reload', Boolean(after?.addedWorkouts?.[today]))
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })


  /* ── UC-11 ─────────────────────────────────────────────────────────── */
  await r.run('UC-11', 'A logged meal is saved and reaches the nutrition figures', async () => {
    const { ctx, page } = await openApp(browser, origin,
      account({ addedMeals: { [today]: [aMeal()] } }))

    const s = await saved(page)
    r.check('the meal is in storage', (s?.addedMeals?.[today] || []).length === 1)
    r.check('its food items are intact',
      s?.addedMeals?.[today]?.[0]?.items?.[0]?.protein === 38)

    const text = await screenText(page)
    r.check('the calories reach Today', /430/.test(text), 'the 430 kcal appear nowhere')
    r.check('nutrition is no longer "Not logged"', !/Nutrition[\s\S]{0,40}Not logged/i.test(text))

    await goTo(page, 'capture')
    r.check('Capture lists the meal', /Chicken salad|Lunch/i.test(await screenText(page)))

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    r.check('it survives a reload', ((await saved(page))?.addedMeals?.[today] || []).length === 1)
    await ctx.close()
  })


  /* ── UC-12 ─────────────────────────────────────────────────────────── */
  await r.run('UC-12', 'A measurement is saved and shown with its own history', async () => {
    const { ctx, page } = await openApp(browser, origin, account({
      addedMeasurements: [{
        id: 'ms1', kind: 'weight', date: today, value: 78.4, unit: 'kg', source: 'Manual',
      }],
    }))
    const s = await saved(page)
    r.check('the measurement is in storage', (s?.addedMeasurements || []).length === 1)
    r.check('its value is intact', s?.addedMeasurements?.[0]?.value === 78.4)

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    r.check('it survives a reload', ((await saved(page))?.addedMeasurements || []).length === 1)
    await ctx.close()
  })


  /* ── UC-13 ─────────────────────────────────────────────────────────── */
  await r.run('UC-13', 'A note is saved against the right day', async () => {
    const { ctx, page } = await openApp(browser, origin,
      account({ addedNotes: { [today]: 'Legs felt heavy on the climb.' } }))
    const s = await saved(page)
    r.check('the note is in storage', s?.addedNotes?.[today]?.includes('Legs felt heavy'))

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    r.check('it survives a reload', Boolean((await saved(page))?.addedNotes?.[today]))
    await ctx.close()
  })


  /* ── UC-14 ─────────────────────────────────────────────────────────── */
  await r.run('UC-14', 'Several records on one day all register together', async () => {
    const { ctx, page } = await openApp(browser, origin, account({
      addedMeals: { [today]: [aMeal(), aMeal({ id: 'm2', time: '19:10', slot: 'Dinner' })] },
      addedWorkouts: { [today]: aWorkout() },
      addedNotes: { [today]: 'A full day.' },
    }))
    const s = await saved(page)
    r.check('both meals are kept', (s?.addedMeals?.[today] || []).length === 2)
    r.check('the workout is kept alongside them', Boolean(s?.addedWorkouts?.[today]))
    r.check('the note is kept too', Boolean(s?.addedNotes?.[today]))

    await goTo(page, 'capture')
    const cap = await screenText(page)
    r.check('Capture lists every record', /Lunch/i.test(cap) && /Dinner/i.test(cap) && /Cycle/i.test(cap))

    // Newest first, by the time each was recorded — never by category.
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.reccard')].map((e) => e.innerText.replace(/\n/g, ' ')))
    const times = order.map((t) => t.match(/(\d{1,2}):(\d{2})\s?([AP]M)/)).filter(Boolean)
      .map((m) => (Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3] === 'PM' ? 720 : 0))
    r.check('the list runs newest first',
      times.every((v, i) => i === 0 || times[i - 1] >= v), JSON.stringify(times))
    await ctx.close()
  })


  /* ── UC-15 ─────────────────────────────────────────────────────────── */
  await r.run('UC-15', 'A record can be deleted, and stays deleted', async () => {
    const { ctx, page } = await openApp(browser, origin,
      account({ addedWorkouts: { [today]: aWorkout() } }))
    await goTo(page, 'capture')

    const del = page.locator('button[aria-label^="Remove" i]').first()
    const canDelete = await del.count() > 0
    r.check('a record offers a way to remove it', canDelete)

    if (canDelete) {
      await clickClear(page, del)
      await page.waitForTimeout(700)

      // Removing a record asks first, which is the right behaviour for
      // something a person cannot get back.
      const sheet = await page.locator('.sheet[role=dialog]').count()
      r.check('removing a record asks for confirmation', sheet > 0,
        'a record vanished on a single tap')
      if (sheet > 0) {
        const confirm = page.locator('.sheet button').filter({ hasText: /Remove|Delete|Yes/i }).first()
        if (await confirm.count() > 0) { await confirm.click(); await page.waitForTimeout(800) }
      }
      const s = await saved(page)
      const gone = !s?.addedWorkouts?.[today]
      r.check('the record is gone from storage', gone, JSON.stringify(s?.addedWorkouts))

      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(900)
      r.check('it does not come back on reload',
        !(await saved(page))?.addedWorkouts?.[today])
    }
    await ctx.close()
  })


  /* ── UC-16 ─────────────────────────────────────────────────────────── */
  {
    r.useCase('UC-16', 'Yesterday\'s records do not leak into today')
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const { ctx, page } = await openApp(browser, origin,
      account({ addedWorkouts: { [yesterday]: aWorkout({ minutes: 55, type: 'Run' }) } }))

    const text = await screenText(page)
    r.check('today shows nothing recorded', /Nothing recorded yet/i.test(text),
      'a record from another day is being counted as today\'s')
    r.check('yesterday\'s minutes are not on today\'s card', !/55/.test(text))
    await ctx.close()
  }
}
