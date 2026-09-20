/**
 * The rules that hold across every screen.
 *
 * A health product earns trust by never showing a figure nobody measured.
 * These cases sweep the whole app in both themes and in both data modes,
 * looking for the ways that promise breaks: a NaN, a zero standing in for
 * an absent reading, sample data in a live account, or an implementation
 * detail on screen.
 */
import { openApp, screenText, goTo, account, aWorkout, aMeal, todayISO, saved, openAsk } from '../harness.mjs'

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

  await r.run('UC-48', 'The app icon is installed everywhere, at the right size', async () => {
    const { ctx, page } = await openApp(browser, origin, account())

    const links = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel*=icon], link[rel=manifest]')]
        .map((l) => ({ rel: l.rel, href: new URL(l.href).pathname })))

    const icon = links.find((l) => l.rel === 'icon')
    const apple = links.find((l) => l.rel === 'apple-touch-icon')
    const manifestLink = links.find((l) => l.rel === 'manifest')
    r.check('a browser-tab icon is declared', Boolean(icon))
    r.check('an iOS home-screen icon is declared', Boolean(apple))
    r.check('a web manifest is declared, so Android can install it', Boolean(manifestLink))

    // Each one has to be a real PNG of the size it claims, and small enough
    // that a browser tab does not cost a megabyte.
    const png = async (path, expect, maxKb) => {
      const res = await page.request.get(origin + path)
      r.check(`${path} is served`, res.status() === 200, `status ${res.status()}`)
      if (res.status() !== 200) return
      const buf = Buffer.from(await res.body())
      r.check(`${path} is a PNG`, buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a')
      const dim = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
      r.check(`${path} is ${expect}`, dim === expect, `actual ${dim}`)
      r.check(`${path} is under ${maxKb} KB`, buf.length < maxKb * 1024,
        `${(buf.length / 1024).toFixed(0)} KB — an icon should not weigh this much`)
    }
    if (icon) await png(icon.href, '32x32', 20)
    if (apple) await png(apple.href, '180x180', 60)

    if (manifestLink) {
      const res = await page.request.get(origin + manifestLink.href)
      r.check('the manifest is served', res.status() === 200, `status ${res.status()}`)
      if (res.status() === 200) {
        const m = JSON.parse(Buffer.from(await res.body()).toString())
        r.check('the manifest names the app', Boolean(m.name && m.short_name))
        r.check('it installs as an app, not a tab', m.display === 'standalone')
        r.check('it carries a 192 and a 512 icon',
          m.icons?.some((i) => i.sizes === '192x192') && m.icons?.some((i) => i.sizes === '512x512'),
          JSON.stringify(m.icons?.map((i) => i.sizes)))
        r.check('one icon is maskable, so Android does not letterbox it',
          m.icons?.some((i) => (i.purpose || '').includes('maskable')))
        for (const i of m.icons || []) {
          const ir = await page.request.get(origin + i.src)
          r.check(`${i.src} is served`, ir.status() === 200, `status ${ir.status()}`)
        }
      }
    }

    // And nothing on the page may still reach for the full-size master.
    const heavy = await page.evaluate(() =>
      [...document.querySelectorAll('img, link')]
        .map((e) => e.getAttribute('href') || e.getAttribute('src') || '')
        .filter((u) => /favicon\.png|jumbo-mark\.png/.test(u)))
    r.check('no slot still loads the megabyte master', heavy.length === 0, heavy.join(', '))
    await ctx.close()
  })

  await r.run('UC-49', 'The typing field clears the tab bar on every phone', async () => {
    // A phone with a home indicator makes the bar taller by the size of the
    // inset. The conversation is sized against the bar's real height, so if
    // that height is measured wrong the composer ends up behind the bar and
    // the person cannot type at all. Both shapes of phone are checked.
    const phones = [
      ['flat screen', 390, 844, 0],
      ['home indicator', 393, 852, 34],
      ['small flat screen', 320, 568, 0],
      ['large, home indicator', 430, 932, 34],
    ]
    for (const [name, w, h, inset] of phones) {
      const { ctx, page } = await openApp(browser, origin, account(), {
        viewport: { width: w, height: h },
      })
      // The test browser reports no safe area, so the inset is applied the
      // same way the device would: through the token the bar pads itself by.
      if (inset) {
        await page.addStyleTag({ content: `:root { --safe-b: ${inset}px !important; }` })
        await page.waitForTimeout(400)
      }
      await openAsk(page)
      await page.waitForTimeout(600)
      const m = await page.evaluate(() => {
        const composer = document.querySelector('.chat__composer')
        const bar = document.querySelector('.tabbar')
        const input = document.querySelector('.chat__input')
        if (!composer || !bar || !input) return null
        const c = composer.getBoundingClientRect()
        const b = bar.getBoundingClientRect()
        const i = input.getBoundingClientRect()
        const over = document.elementFromPoint(i.left + i.width / 2, i.top + i.height / 2)
        return {
          overlap: Math.round(c.bottom - b.top),
          onScreen: i.top >= 0 && i.bottom <= window.innerHeight,
          topmost: over ? String(over.className || over.tagName) : 'nothing',
          published: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim(),
          real: `${Math.round(b.height)}px`,
        }
      })
      r.check(`[${name}] the conversation is open`, Boolean(m))
      if (m) {
        r.check(`[${name}] the bar's published height matches its real one`,
          m.published === m.real, `published ${m.published}, really ${m.real}`)
        r.check(`[${name}] the field does not sit behind the bar`, m.overlap <= 0,
          `${m.overlap}px behind it`)
        r.check(`[${name}] the field is on screen`, m.onScreen)
        r.check(`[${name}] the field is what a tap would reach`,
          /chat__input/.test(m.topmost), `tapping there reaches "${m.topmost}"`)
      }
      await ctx.close()
    }
  })
}
