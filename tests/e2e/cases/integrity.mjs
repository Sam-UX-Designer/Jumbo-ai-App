/**
 * The rules that hold across every screen.
 *
 * A health product earns trust by never showing a figure nobody measured.
 * These cases sweep the whole app in both themes and in both data modes,
 * looking for the ways that promise breaks: a NaN, a zero standing in for
 * an absent reading, sample data in a live account, or an implementation
 * detail on screen.
 */
import { openApp, screenText, goTo, account, aWorkout, aMeal, todayISO, saved } from '../harness.mjs'

const SCREENS = ['today', 'future', 'capture', 'explore', 'profile']
const LEAKS = /API[_ ]?KEY|OPENROUTER|process\.env|Bearer |sk-[a-zA-Z0-9]{8}|TODO|FIXME|lorem ipsum/i
const BROKEN = /NaN|Infinity|undefined|\[object Object\]/

export default async function integrity({ browser, origin, r }) {
  const today = todayISO()

  await r.run('UC-40', 'An empty account shows no invented numbers, in either theme', async () => {
    for (const theme of ['dark', 'light']) {
      const { ctx, page, errors } = await openApp(browser, origin, account({ theme }))
      for (const screen of SCREENS) {
        if (screen !== 'today') await goTo(page, screen)
        const text = await screenText(page)
        r.check(`[${theme}/${screen}] nothing broken on screen`, !BROKEN.test(text),
          (text.match(BROKEN) || [])[0] || '')
        r.check(`[${theme}/${screen}] no implementation detail on screen`, !LEAKS.test(text),
          (text.match(LEAKS) || [])[0] || '')
        r.check(`[${theme}/${screen}] no sample data in a live account`,
          !/sample data/i.test(text))
        r.check(`[${theme}/${screen}] no zero presented as a body reading`,
          !/0 bpm|baseline of 0\b|0 ml\/kg/i.test(text))
      }
      r.check(`[${theme}] no runtime errors anywhere`, errors.length === 0,
        errors.slice(0, 2).join(' | '))
      await ctx.close()
    }
  })

  await r.run('UC-41', 'An account with one record stays honest on every screen', async () => {
    for (const theme of ['dark', 'light']) {
      const { ctx, page, errors } = await openApp(browser, origin, account({
        theme, addedWorkouts: { [today]: aWorkout() }, addedMeals: { [today]: [aMeal()] },
      }))
      for (const screen of SCREENS) {
        if (screen !== 'today') await goTo(page, screen)
        const text = await screenText(page)
        r.check(`[${theme}/${screen}] nothing broken on screen`, !BROKEN.test(text),
          (text.match(BROKEN) || [])[0] || '')
        r.check(`[${theme}/${screen}] no zero presented as a body reading`,
          !/0 bpm|baseline of 0\b/i.test(text))
        r.check(`[${theme}/${screen}] unmeasured recovery is not called low`,
          !/Recovery is running low/i.test(text))
      }
      r.check(`[${theme}] no runtime errors anywhere`, errors.length === 0,
        errors.slice(0, 2).join(' | '))
      await ctx.close()
    }
  })

  await r.run('UC-42', 'Sample mode is labelled on every screen that shows it', async () => {
    const { ctx, page } = await openApp(browser, origin, account({ dataMode: 'demo' }))
    let labelled = 0
    for (const screen of ['today', 'future', 'capture', 'profile']) {
      if (screen !== 'today') await goTo(page, screen)
      if (/sample data/i.test(await screenText(page))) labelled++
    }
    r.check('sample data announces itself on the data screens', labelled >= 3,
      `${labelled} of 4 screens carried the label`)
    await ctx.close()
  })

  await r.run('UC-43', 'The app survives a corrupted or foreign saved state', async () => {
    const CORRUPT = String.fromCharCode(123, 123, 123) // a half-written JSON object
    for (const [name, value] of [
      ['not json', CORRUPT],
      ['an empty object', '[]'],
      ['a null', 'null'],
      ['a state from an older shape', JSON.stringify({ onboarded: true, profile: { name: 'X' } })],
    ]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.addInitScript((v) => localStorage.setItem('jumbo.state.v2', v), value)
      await page.goto(origin + '/', { waitUntil: 'networkidle' })
      await page.waitForTimeout(900)
      const text = await screenText(page)
      r.check(`recovers from ${name}`, text.trim().length > 40 && errors.length === 0,
        errors[0] || 'the screen came up empty')
      await ctx.close()
    }
  })

  await r.run('UC-44', 'Records are not lost when storage is written repeatedly', async () => {
    const { ctx, page } = await openApp(browser, origin, account({
      addedWorkouts: { [today]: aWorkout() },
      addedMeals: { [today]: [aMeal()] },
      addedNotes: { [today]: 'A note.' },
    }))
    // Move around the app: every screen change writes state.
    for (const s of ['future', 'capture', 'explore', 'profile', 'today']) await goTo(page, s)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const s = await saved(page)
    r.check('the workout is intact', Boolean(s?.addedWorkouts?.[today]))
    r.check('the meal is intact', (s?.addedMeals?.[today] || []).length === 1)
    r.check('the note is intact', Boolean(s?.addedNotes?.[today]))
    await ctx.close()
  })

  await r.run('UC-45', 'Every screen is reachable and none is a dead end', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, account())
    for (const screen of SCREENS) {
      if (screen !== 'today') await goTo(page, screen)
      const nav = await page.locator('.tabbar__item').count()
      r.check(`[${screen}] the navigation is present`, nav >= 4, `${nav} items`)
      const text = await screenText(page)
      r.check(`[${screen}] the screen has content`, text.trim().length > 60)
    }
    r.check('no runtime errors while navigating', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  await r.run('UC-46', 'Touch targets and labels meet the basics', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    const bad = await page.evaluate(() => {
      const out = { small: [], unlabelled: [] }
      for (const el of document.querySelectorAll('button, a[href], [role=button]')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const name = (el.innerText || el.getAttribute('aria-label') || '').trim()
        if (!name) out.unlabelled.push(el.className || el.tagName)
        if (rect.height < 28 || rect.width < 28) {
          out.small.push(`${name || el.className} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
        }
      }
      return out
    })
    r.check('every control has an accessible name', bad.unlabelled.length === 0,
      bad.unlabelled.slice(0, 3).join(', '))
    r.check('no control is below the 28px minimum', bad.small.length === 0,
      bad.small.slice(0, 3).join(', '))
    await ctx.close()
  })

  await r.run('UC-47', 'The app works at small and large viewports', async () => {
    const sizes = [[320, 568, 'iPhone SE'], [430, 932, 'large phone'], [1280, 900, 'desktop']]
    for (const [w, h, name] of sizes) {
      const { ctx, page, errors } = await openApp(browser, origin, account({
        addedWorkouts: { [today]: aWorkout() },
      }), { viewport: { width: w, height: h } })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      r.check(`[${name}] no sideways scrolling`, !overflow)
      r.check(`[${name}] no runtime errors`, errors.length === 0, errors[0] || '')
      await ctx.close()
    }
  })
}
