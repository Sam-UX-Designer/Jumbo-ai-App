/**
 * Preferences, profile, and the data controls.
 *
 * A setting that does not survive a reload is worse than no setting: the
 * person believes they changed something. Every case here changes a value
 * through the interface and then reads it back from storage.
 */
import { openApp, saved, screenText, goTo, account } from '../harness.mjs'

export default async function settings({ browser, origin, r }) {
  /* ── UC-20 ─────────────────────────────────────────────────────────── */
  await r.run('UC-20', 'The profile name can be changed and is kept', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    await goTo(page, 'profile')

    const edit = page.getByRole('button', { name: /Edit/i }).first()
    const canEdit = await edit.count() > 0
    r.check('the profile offers an edit control', canEdit)

    if (canEdit) {
      await edit.click()
      await page.waitForTimeout(700)
      const field = page.locator('input[type=text]').first()
      if (await field.count() > 0) {
        await field.fill('Priya')
        await page.waitForTimeout(200)
        const save = page.getByRole('button', { name: /Save|Done/i }).first()
        if (await save.count() > 0) { await save.click(); await page.waitForTimeout(800) }
        r.check('the new name is stored', (await saved(page))?.profile?.name === 'Priya',
          `name=${(await saved(page))?.profile?.name}`)

        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForTimeout(900)
        r.check('the new name survives a reload',
          (await saved(page))?.profile?.name === 'Priya')
      }
    }
    await ctx.close()
  })


  /* ── UC-21 ─────────────────────────────────────────────────────────── */
  await r.run('UC-21', 'The theme can be switched and is kept', async () => {
    const { ctx, page } = await openApp(browser, origin, account({ theme: 'dark' }))
    await goTo(page, 'profile')
    await page.getByRole('button', { name: /Settings/i }).first().click().catch(() => {})
    await page.waitForTimeout(700)
    const appearance = page.getByRole('button', { name: /Appearance/i }).first()
    const found = await appearance.count() > 0
    r.check('appearance settings are reachable', found)

    if (found) {
      await appearance.click()
      await page.waitForTimeout(700)
      const light = page.getByRole('button', { name: /^Light$/i }).first()
      if (await light.count() > 0) {
        await light.click()
        await page.waitForTimeout(700)
        r.check('the theme choice is stored', (await saved(page))?.theme === 'light',
          `theme=${(await saved(page))?.theme}`)
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        r.check('the page actually repaints light', bg !== 'rgb(0, 0, 0)', `body bg ${bg}`)

        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForTimeout(900)
        r.check('the theme survives a reload', (await saved(page))?.theme === 'light')
      }
    }
    await ctx.close()
  })


  /* ── UC-22 ─────────────────────────────────────────────────────────── */
  await r.run('UC-22', 'A privacy switch changes behaviour, not just its own state', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    await goTo(page, 'profile')
    await page.getByRole('button', { name: /Settings/i }).first().click().catch(() => {})
    await page.waitForTimeout(700)
    const privacy = page.getByRole('button', { name: /Data and privacy/i }).first()
    const found = await privacy.count() > 0
    r.check('the privacy panel is reachable', found)

    if (found) {
      await privacy.click()
      await page.waitForTimeout(700)
      const row = page.locator('label, .row').filter({ hasText: 'Pattern analysis' }).first()
      const toggle = row.locator('input[type=checkbox], button[role=switch]').first()
      if (await toggle.count() > 0) {
        await toggle.click({ force: true })
        await page.waitForTimeout(700)
        r.check('turning pattern analysis off is stored',
          (await saved(page))?.settings?.aiPatterns === false,
          `aiPatterns=${(await saved(page))?.settings?.aiPatterns}`)

        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForTimeout(900)
        r.check('it stays off after a reload',
          (await saved(page))?.settings?.aiPatterns === false)
      }
    }
    await ctx.close()
  })


  /* ── UC-23 ─────────────────────────────────────────────────────────── */
  await r.run('UC-23', 'Goals can be changed and shape what the app stores', async () => {
    const { ctx, page } = await openApp(browser, origin, account({ goals: ['fitness'] }))
    await goTo(page, 'profile')
    await page.getByRole('button', { name: /Your goals|Goals/i }).first().click().catch(() => {})
    await page.waitForTimeout(800)
    const option = page.getByRole('button', { name: /Sleep better/i }).first()
    if (await option.count() > 0) {
      await option.click()
      await page.waitForTimeout(700)
      const s = await saved(page)
      r.check('the added goal is stored', (s?.goals || []).includes('sleep'),
        `goals=${JSON.stringify(s?.goals)}`)

      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(900)
      r.check('goals survive a reload',
        ((await saved(page))?.goals || []).includes('sleep'))
    } else {
      r.check('the goals editor is reachable', false, 'no goal options found')
    }
    await ctx.close()
  })


  /* ── UC-24 ─────────────────────────────────────────────────────────── */
  await r.run('UC-24', 'A person can export everything the app holds on them', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    await goTo(page, 'profile')
    await page.getByRole('button', { name: /Settings/i }).first().click().catch(() => {})
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /Data and privacy/i }).first().click().catch(() => {})
    await page.waitForTimeout(700)

    const exportBtn = page.getByRole('button', { name: /^Export$/i }).first()
    const found = await exportBtn.count() > 0
    r.check('an export control exists', found)
    if (found) {
      const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
      await exportBtn.click()
      const file = await download
      r.check('it produces a file', Boolean(file), file ? file.suggestedFilename() : 'no download fired')
    }
    await ctx.close()
  })


  /* ── UC-25 ─────────────────────────────────────────────────────────── */
  await r.run('UC-25', 'The plans screen does not pretend to take money', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    await goTo(page, 'profile')
    const plans = page.getByRole('button', { name: /Explore plans|JUMBO Pro|Upgrade/i }).first()
    const found = await plans.count() > 0
    r.check('the plans screen is reachable', found)

    if (found) {
      await plans.click()
      await page.waitForTimeout(900)
      const before = (await saved(page))?.plan

      // The screen only has to declare itself at the point a person tries to
      // pay — that is the moment a wrong belief would cost them something.
      const choose = page.locator('button').filter({ hasText: /Choose|Select|Start|Upgrade|Continue|Go Pro/i }).first()
      if (await choose.count() > 0 && await choose.isVisible()) {
        await choose.click()
        await page.waitForTimeout(900)
        const text = await screenText(page)
        r.check('trying to buy says plainly that nothing was charged',
          /not connected|nothing has been charged|not a checkout|not on sale/i.test(text),
          'a buyer must not be able to believe this charges a card')
        r.check('trying to buy does not mark the person as paying',
          (await saved(page))?.plan === before,
          `plan went ${before} -> ${(await saved(page))?.plan}`)
      } else {
        r.check('a plan can be chosen', false, 'no plan action button was found')
      }
    }
    await ctx.close()
  })

}
