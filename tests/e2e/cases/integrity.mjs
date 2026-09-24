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

  await r.run('UC-51', 'The glass on floating controls never costs legibility', async () => {
    // The refraction is decoration and is allowed to be absent. What is not
    // allowed is a control you cannot read, a control that stops taking
    // taps, or a browser that cannot refract being left with a half-applied
    // dressing and no material at all.
    const { ctx, page, errors } = await openApp(browser, origin, account({
      addedWorkouts: { [today]: aWorkout() }, addedMeals: { [today]: [aMeal()] },
    }))
    const survey = (selector) => page.evaluate((sel) => {
      const out = []
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        // The chip row scrolls sideways, so some of it is legitimately off
        // screen. Only what a finger could actually reach is asked about.
        const onScreen = x >= 0 && x <= window.innerWidth && y >= 0 && y <= window.innerHeight
        const mid = onScreen ? document.elementFromPoint(x, y) : null
        out.push({
          name: el.className.split(' ')[0],
          glassed: el.dataset.glass === 'on',
          // Whatever happens, the control must have a background of its own.
          filled: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none',
          // And must still be the thing a finger lands on.
          reachable: !onScreen || Boolean(mid && el.contains(mid)),
          label: (el.innerText || '').trim().length > 0,
        })
      }
      return out
    }, selector)

    // Each set is asked while it is the top layer. With the menu open its
    // scrim covers the dock, and rightly so — that is not the glass.
    const dock = await survey('.askdock__field, .qchip')
    await page.locator('.tabbar__fab').click()
    await page.waitForTimeout(800)
    const menu = await survey('.quickadd__item')
    const panes = [...dock, ...menu]

    r.check('the floating controls are all present', panes.length >= 8, `${panes.length} found`)
    r.check('every one has a surface of its own', panes.every((p) => p.filled),
      panes.filter((p) => !p.filled).map((p) => p.name).join(', '))
    r.check('the dock still takes a tap', dock.every((p) => p.reachable),
      dock.filter((p) => !p.reachable).map((p) => p.name).join(', '))
    r.check('the menu still takes a tap', menu.every((p) => p.reachable),
      menu.filter((p) => !p.reachable).map((p) => p.name).join(', '))
    r.check('every one still carries its label', panes.every((p) => p.label))

    // Where it did run, it must have left a real filter behind rather than
    // an attribute and an empty promise.
    const glassed = panes.filter((p) => p.glassed)
    if (glassed.length) {
      const wired = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[data-glass="on"]')].map((el) => {
          const m = /url\("?#([\w-]+)"?\)/.exec(getComputedStyle(el).backdropFilter)
          return m?.[1] ?? null
        })
        return {
          all: ids.every(Boolean),
          resolve: ids.every((id) => id && document.getElementById(id)?.tagName === 'filter'),
          // sRGB is not a preference: without it the whole backdrop ghosts.
          srgb: [...document.querySelectorAll('svg filter')]
            .every((f) => f.getAttribute('color-interpolation-filters') === 'sRGB'),
        }
      })
      r.check('each glassed control names a filter', wired.all)
      r.check('every named filter exists', wired.resolve)
      r.check('every filter works in sRGB', wired.srgb,
        'without this the backdrop slides up and to the left')
    }

    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  await r.run('UC-52', 'A browser that cannot refract loses nothing it needs', async () => {
    // Every browser on iOS is this case, so it is the one most people will
    // actually see. The app must look finished without the effect.
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      // A WebKit browser, which is what the detection must decline for.
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) '
        + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.addInitScript(([k, v]) => {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
    }, ['jumbo.state.v2', JSON.stringify(account({ addedWorkouts: { [today]: aWorkout() } }))])
    await page.goto(origin + '/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await page.locator('.tabbar__fab').click()
    await page.waitForTimeout(800)

    const state = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('.askdock__field, .qchip, .quickadd__item')]
      return {
        glassed: document.querySelectorAll('[data-glass="on"]').length,
        filters: document.querySelectorAll('svg filter').length,
        opaque: controls.every((el) => {
          const cs = getComputedStyle(el)
          return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none'
        }),
        count: controls.length,
      }
    })
    r.check('nothing claims to be glassed', state.glassed === 0, `${state.glassed} did`)
    r.check('no filters are built for nothing', state.filters === 0, `${state.filters} built`)
    r.check('the floating controls are all still there', state.count >= 8, `${state.count}`)
    r.check('and every one still has its material', state.opaque)
    r.check('the screen reads normally',
      /Health|Score|Meal|Workout/i.test(await screenText(page)))
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })

  await r.run('UC-53', 'The landing page stands up on its own', async () => {
    // It is the page an outside visitor lands on from the marketing site, so
    // a broken image or a dead button there is worse than one inside the
    // app: nobody who sees it has any reason to try again.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    const errors = []
    const failed = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('response', (res) => {
      if (res.status() >= 400) failed.push(`${res.status()} ${new URL(res.url()).pathname}`)
    })
    await page.goto(origin + '/start/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)

    const text = await screenText(page)
    r.check('the page has its content', text.length > 800, `${text.length} characters`)
    r.check('it says what JUMBO is', /never print a number nobody measured/i.test(text))
    r.check('it does not claim to have agents', !/\bagents?\b/i.test(text)
      || /no autonomous agents/i.test(text),
      'JUMBO has no agents, and a landing page is the worst place to say it does')

    // Every image has to resolve and be the shape it reserved space for.
    for (const img of await page.locator('img').all()) {
      await img.scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
    }
    const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => ({
      src: new URL(i.src).pathname,
      loaded: i.complete && i.naturalWidth > 0,
      alt: i.alt !== null,
      // A screenshot squashed to its attribute height is the bug this catches.
      ratio: i.naturalWidth ? Math.abs(
        (i.getBoundingClientRect().width / i.getBoundingClientRect().height)
        - (i.naturalWidth / i.naturalHeight)) : 0,
    })))
    r.check('every image loads', imgs.every((i) => i.loaded),
      imgs.filter((i) => !i.loaded).map((i) => i.src).join(', '))
    r.check('every image has alt text', imgs.every((i) => i.alt))
    r.check('no image is stretched out of shape', imgs.every((i) => i.ratio < 0.02),
      imgs.filter((i) => i.ratio >= 0.02).map((i) => i.src).join(', '))
    r.check('nothing 404s', failed.length === 0, failed.slice(0, 3).join(', '))

    // The whole point of the page is the button.
    const cta = await page.evaluate(() =>
      [...document.querySelectorAll('a')].map((a) => new URL(a.href).pathname))
    r.check('it links to the app', cta.includes('/'), cta.join(', '))

    r.check('no sideways scrolling on a phone', await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))

    // And it must be readable with the script dead, since the reveal
    // animation hides every section until it runs.
    const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false })
    const plain = await noJs.newPage()
    await plain.goto(origin + '/start/', { waitUntil: 'load' })
    await plain.waitForTimeout(400)
    const visible = await plain.evaluate(() =>
      [...document.querySelectorAll('.rise')].filter((e) => getComputedStyle(e).opacity !== '0').length)
    const total = await plain.locator('.rise').count()
    r.check('every section is readable without JavaScript', visible === total,
      `${visible} of ${total} sections visible`)
    await noJs.close()
    await ctx.close()
  })


  await r.run('UC-54', 'The landing page offers a way in, and shows the app working', async () => {
    // Two complaints made this case. The first: the page had one button and
    // it went straight into the app, with no sign in and no sign up. The
    // second, and the reason the labels are checked against real storage:
    // there is no server holding accounts, so the page must not imply that
    // signing in reaches one.
    const look = async (seed) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      if (seed) {
        await page.addInitScript((v) => localStorage.setItem('jumbo.state.v2', v), JSON.stringify(seed))
      }
      await page.goto(origin + '/start/', { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      return { ctx, page, errors }
    }

    // A stranger. Both doors, both reaching the app.
    {
      const { ctx, page, errors } = await look(null)
      const doors = await page.evaluate(() => ({
        enter: [...document.querySelectorAll('[data-enter]')].map((e) => e.textContent.trim()),
        join: [...document.querySelectorAll('[data-join]')].map((e) => e.textContent.trim()),
        targets: [...new Set([...document.querySelectorAll('[data-enter],[data-join]')]
          .map((a) => new URL(a.href).pathname))],
        note: document.getElementById('where')?.textContent ?? '',
      }))
      r.check('a stranger is offered a way to sign in', doors.enter.length > 0 && doors.enter.every((t) => /sign in/i.test(t)),
        doors.enter.join(', '))
      r.check('and a way to create an account', doors.join.length > 0 && doors.join.every((t) => /create account/i.test(t)),
        doors.join.join(', '))
      r.check('both reach the app', doors.targets.length === 1 && doors.targets[0] === '/',
        doors.targets.join(', '))
      r.check('and the page says where the records will live',
        /on this device/i.test(doors.note), doors.note)
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await ctx.close()
    }

    // Somebody who already has Jumbo in this browser. The labels have to
    // stop saying "create account" at a person who already did.
    {
      const { ctx, page } = await look(account())
      const doors = await page.evaluate(() => ({
        enter: [...document.querySelectorAll('[data-enter]')].map((e) => e.textContent.trim()),
        join: [...document.querySelectorAll('[data-join]')].map((e) => e.textContent.trim()),
        note: document.getElementById('where')?.textContent ?? '',
      }))
      r.check('a returning person is not asked to sign up again',
        doors.join.every((t) => !/create account/i.test(t)), doors.join.join(', '))
      r.check('they are offered their own data back',
        doors.enter.every((t) => /continue/i.test(t)), doors.enter.join(', '))
      r.check('and told it is this browser holding it',
        /this browser/i.test(doors.note), doors.note)
      await ctx.close()
    }

    // The centre button, reproduced on the page, has to actually work.
    {
      const { ctx, page, errors } = await look(null)
      const stage = page.locator('#stage')
      const fab = page.locator('#fab')
      r.check('the add button is on the page', await fab.count() === 1)

      const before = await page.evaluate(() =>
        getComputedStyle(document.querySelector('.qa li')).opacity)
      r.check('the choices start hidden', Number(before) === 0, before)

      await fab.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await fab.click()
      await page.waitForTimeout(700)

      const open = await page.evaluate(() => ({
        state: document.getElementById('stage').dataset.open,
        expanded: document.getElementById('fab').getAttribute('aria-expanded'),
        shown: getComputedStyle(document.querySelector('.qa li')).opacity,
        items: [...document.querySelectorAll('.qa li')].map((l) => l.innerText.trim()),
      }))
      r.check('pressing it opens the menu', open.state === 'true' && Number(open.shown) > 0.9,
        `state ${open.state}, opacity ${open.shown}`)
      r.check('a screen reader is told it opened', open.expanded === 'true')

      // The demo must show what the app actually offers, or it is a lie
      // about the product rather than a picture of it.
      for (const kind of ['Meal', 'Workout', 'Sleep', 'Measure', 'Note']) {
        r.check(`the menu offers ${kind}, as the app does`,
          open.items.some((t) => t === kind), open.items.join(', '))
      }

      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      r.check('escape closes it',
        await page.evaluate(() => document.getElementById('stage').dataset.open) === 'false')
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await ctx.close()
    }
  })
}
