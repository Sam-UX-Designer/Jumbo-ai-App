/**
 * Getting into the app for the first time.
 *
 * The sharp edge here is the data-mode choice. Sample data is a real
 * feature and a real liability: shown to someone who did not ask for it, it
 * is a stranger's health record wearing their name. These cases check that
 * it is never reached by accident.
 */
import { openApp, saved, screenText, account } from '../harness.mjs'

/** Walk a fresh install as far as the connect step. */
async function toConnect(page) {
  await page.getByRole('button', { name: /Get started/i }).click()
  await page.waitForTimeout(400)
  const inputs = page.locator('.ob__body input')
  await inputs.nth(0).fill('Sam')
  await inputs.nth(1).fill('+44 7700 900123')
  await page.waitForTimeout(250)
  await page.locator('.ob__foot button.btn--primary').first().click()
  await page.waitForTimeout(500)
  const code = (await page.locator('.notice--setup .num.strong').first().innerText()).trim()
  await page.locator('.otp__box').first().fill(code)
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /More energy/i }).first().click()
  await page.waitForTimeout(250)
  await page.locator('.ob__foot button.btn--primary').first().click()
  await page.waitForTimeout(900)
  return code
}

export default async function onboarding({ browser, origin, r }) {
  /* ── UC-01 ─────────────────────────────────────────────────────────── */
  await r.run('UC-01', 'A new person can complete setup and reach the app', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, null)

    r.check('the app opens on the welcome screen',
      /Get started/i.test(await screenText(page)))

    const code = await toConnect(page)
    r.check('the six-digit code is accepted and setup advances',
      /Connect what you already use/i.test(await screenText(page)), `code was ${code}`)

    // Finish by carrying on without connecting.
    await page.locator('.ob__foot button.btn--secondary').first().click()
    await page.waitForTimeout(700)
    for (let i = 0; i < 14; i++) {
      const b = page.locator('.ob__foot button.btn--primary').first()
      if (await b.count() === 0) break
      if (!(await b.isEnabled())) { await page.waitForTimeout(700); continue }
      await b.click()
      await page.waitForTimeout(700)
    }

    const s = await saved(page)
    r.check('setup is recorded as finished', s?.onboarded === true, `onboarded=${s?.onboarded}`)
    r.check('the name the person typed was kept', s?.profile?.name === 'Sam', `name=${s?.profile?.name}`)
    r.check('the goal the person picked was kept', (s?.goals || []).length > 0, `goals=${JSON.stringify(s?.goals)}`)
    r.check('no runtime errors during setup', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })


  /* ── UC-02 ─────────────────────────────────────────────────────────── */
  await r.run('UC-02', 'Sample data is never given to someone who did not ask', async () => {
    const { ctx, page } = await openApp(browser, origin, null)
    const fresh = await saved(page)
    r.check('a brand-new install is not in sample mode',
      !fresh || fresh.dataMode !== 'demo', `dataMode=${fresh?.dataMode}`)

    await toConnect(page)
    const text = await screenText(page)
    r.check('the connect step names all three ways forward',
      /Connect an app/i.test(text) && /Do it later/i.test(text) && /sample data/i.test(text))

    const primary = page.locator('.ob__foot button.btn--primary').first()
    const secondary = page.locator('.ob__foot button.btn--secondary').first()
    const ghost = page.locator('.ob__foot button.btn--ghost').first()
    r.check('none of the three choices is blocked',
      await primary.isEnabled() && await secondary.isEnabled() && await ghost.isEnabled())

    await secondary.click()
    await page.waitForTimeout(700)
    const after = await saved(page)
    r.check('choosing "do it later" keeps the person on their own data',
      after?.dataMode === 'live', `dataMode=${after?.dataMode}`)
    await ctx.close()
  })


  /* ── UC-03 ─────────────────────────────────────────────────────────── */
  await r.run('UC-03', 'Sample data can be chosen deliberately, and left again', async () => {
    const { ctx, page } = await openApp(browser, origin, null)
    await toConnect(page)
    await page.locator('.ob__foot button.btn--ghost').first().click()
    await page.waitForTimeout(700)
    r.check('choosing sample data selects it',
      (await saved(page))?.dataMode === 'demo')

    // It must be labelled wherever it is shown. The remaining steps include
    // an import that takes a moment, so this waits rather than racing it.
    for (let i = 0; i < 14; i++) {
      const b = page.locator('.ob__foot button.btn--primary').first()
      if (await b.count() === 0) break
      if (!(await b.isEnabled())) { await page.waitForTimeout(700); continue }
      await b.click(); await page.waitForTimeout(700)
    }
    r.check('the app declares it is showing sample data',
      /sample data/i.test(await screenText(page)))
    await ctx.close()
  })


  /* ── UC-04 ─────────────────────────────────────────────────────────── */
  await r.run('UC-04', 'Leaving sample data asks first and can be cancelled', async () => {
    const { ctx, page } = await openApp(browser, origin, account({ dataMode: 'demo' }))
    await page.locator('.tabbar__item').last().click()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /Settings/i }).first().click().catch(() => {})
    await page.waitForTimeout(800)

    const hasExit = /Turn off sample data/i.test(await screenText(page))
    r.check('there is a visible way out of sample mode', hasExit)

    if (hasExit) {
      await page.getByRole('button', { name: /Turn off sample data/i }).first().click()
      await page.waitForTimeout(600)
      r.check('it asks before changing anything',
        /Turn off sample data\?/i.test(await screenText(page)))
      r.check('nothing changed while the question is open',
        (await saved(page))?.dataMode === 'demo')

      await page.getByRole('button', { name: /^Cancel$/i }).first().click()
      await page.waitForTimeout(500)
      r.check('cancelling leaves sample mode on',
        (await saved(page))?.dataMode === 'demo')

      await page.getByRole('button', { name: /Turn off sample data/i }).first().click()
      await page.waitForTimeout(500)
      await page.getByRole('button', { name: /Turn it off/i }).first().click()
      await page.waitForTimeout(800)
      r.check('confirming returns to the person\'s own data',
        (await saved(page))?.dataMode === 'live')
    }
    await ctx.close()
  })

}
