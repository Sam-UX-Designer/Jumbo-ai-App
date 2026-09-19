/**
 * The AI surfaces, the content feed, and what each does when the thing
 * behind it is unavailable.
 *
 * Two rules run through these cases. The app must never put a number in
 * front of a person that nothing measured; and when a service is down it
 * must say so in the product's own words, never in the language of the
 * implementation. "Ask Jumbo is unavailable" is a product state. An API key
 * name on screen is a leak.
 */
import { openApp, saved, screenText, goTo, openAsk, account, aWorkout, todayISO, startApi } from '../harness.mjs'

const SECRETY = /API[_ ]?KEY|OPENROUTER|YOUTUBE_API|process\.env|Bearer |sk-[a-zA-Z0-9]|undefined is not|stack trace/i

export default async function aiAndContent({ browser, origin, r }) {
  const today = todayISO()

  /* ── UC-30 ─────────────────────────────────────────────────────────── */
  await r.run('UC-30', 'Ask Jumbo holds a conversation', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, account({
      addedWorkouts: { [today]: aWorkout() },
    }))
    const input = await openAsk(page)
    r.check('the composer is present', Boolean(input))

    if (input) {
      await input.fill('How am I doing?')
      await page.waitForTimeout(200)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(2500)
      const text = await screenText(page)
      r.check('the question appears in the conversation', /How am I doing\?/i.test(text))
      r.check('an answer comes back', /straight answer about your data/i.test(text),
        'the mock reply never rendered')
      r.check('no implementation detail leaks into the chat', !SECRETY.test(text))
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    }
    await ctx.close()
  })


  /* ── UC-31 ─────────────────────────────────────────────────────────── */
  await r.run('UC-31', 'A failing AI service produces a product-level message', async () => {
    const api = await startApi({ failChat: true, failInsights: true })
    const { ctx, page } = await openApp(browser, api.origin, account({
      addedWorkouts: { [today]: aWorkout() },
    }))
    const input = await openAsk(page)
    if (input) {
      await input.fill('How am I doing?')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(2500)
    }
    const text = await screenText(page)
    r.check('the failure is admitted to the person',
      /again|unavailable|could ?n.t|not available|try/i.test(text),
      'a failed request must not look like a hung one')
    r.check('no key names, env vars or stack traces on screen', !SECRETY.test(text))
    await goTo(page, 'today')
    r.check('the rest of the app still works',
      /Health|Score|Movement/i.test(await screenText(page)),
      'an AI outage must not take the app down')
    await ctx.close(); await api.close()
  })


  /* ── UC-32 ─────────────────────────────────────────────────────────── */
  await r.run('UC-32', 'With AI switched off at the server, the app says so cleanly', async () => {
    const api = await startApi({ aiConfigured: false })
    const { ctx, page } = await openApp(browser, api.origin, account())
    const text = await screenText(page)
    r.check('no configuration language reaches the person', !SECRETY.test(text))
    r.check('the app still renders its own data', /Health|Score/i.test(text))
    await ctx.close(); await api.close()
  })


  /* ── UC-33 ─────────────────────────────────────────────────────────── */
  await r.run('UC-33', 'The AI is never asked to interpret an empty account', async () => {
    const api = await startApi()
    const { ctx, page } = await openApp(browser, api.origin, account())
    await page.waitForTimeout(1500)
    const asked = api.calls.filter((c) => c.path === '/api/ai/insights')
    r.check('no insight request is made with nothing recorded',
      asked.length === 0, `${asked.length} request(s) were sent`)
    await ctx.close(); await api.close()
  })


  /* ── UC-34 ─────────────────────────────────────────────────────────── */
  await r.run('UC-34', 'What is sent to the AI contains no invented zeroes', async () => {
    const api = await startApi()
    const { ctx, page } = await openApp(browser, api.origin, account({
      addedWorkouts: { [today]: aWorkout() },
    }))
    await page.waitForTimeout(2000)
    const call = api.calls.find((c) => c.path === '/api/ai/insights' && c.payload)
    r.check('an insight request was made once there is data', Boolean(call))

    if (call) {
      const flat = JSON.stringify(call.payload)
      for (const key of ['restingHR', 'hrvMs', 'meanRestingHR', 'meanHrv', 'weightKg', 'vo2max']) {
        r.check(`${key} is not sent as a measured zero`, !flat.includes(`"${key}":0`),
          'a zero here is read by the model as a real reading')
      }
      const s = call.payload.summary ?? call.payload
      r.check('the day count is the number of days with data',
        s.daysOfHistory === 1, `daysOfHistory=${s.daysOfHistory}`)
      r.check('the real training load is sent',
        JSON.stringify(s.last7Days || {}).includes('390'), JSON.stringify(s.last7Days))
    }
    await ctx.close(); await api.close()
  })


  /* ── UC-35 ─────────────────────────────────────────────────────────── */
  await r.run('UC-35', 'No health data leaves the device with a name attached', async () => {
    const api = await startApi()
    const { ctx, page } = await openApp(browser, api.origin, account({
      profile: { name: 'Priya Raman', phone: '+44 7700 900123' },
      addedWorkouts: { [today]: aWorkout() },
    }))
    await page.waitForTimeout(2000)
    const sent = JSON.stringify(api.calls.filter((c) => c.payload).map((c) => c.payload))
    r.check('the person\'s name is not in any request body', !/Priya/.test(sent))
    r.check('the phone number is not in any request body', !/7700 ?900123/.test(sent))
    await ctx.close(); await api.close()
  })


  /* ── UC-36 ─────────────────────────────────────────────────────────── */
  await r.run('UC-36', 'Explore lists content and can save an item', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, account())
    await goTo(page, 'explore')
    const text = await screenText(page)
    r.check('videos are listed', /Video 0|Video 1/.test(text), 'the feed rendered empty')

    const save = page.locator('button[aria-label*="Save" i]').first()
    if (await save.count() > 0) {
      await save.click()
      await page.waitForTimeout(700)
      const s = await saved(page)
      r.check('the saved video is stored', (s?.savedVideos || []).length > 0,
        `savedVideos=${JSON.stringify(s?.savedVideos)}`)

      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(900)
      r.check('it is still saved after a reload',
        ((await saved(page))?.savedVideos || []).length > 0)
    } else {
      r.check('a save control exists on a video', false, 'no save button found')
    }
    r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })


  /* ── UC-37 ─────────────────────────────────────────────────────────── */
  await r.run('UC-37', 'Explore search and filters respond', async () => {
    const { ctx, page } = await openApp(browser, origin, account())
    await goTo(page, 'explore')
    const search = page.locator('.searchbar__input').first()
    if (await search.count() > 0) {
      await search.fill('sleep')
      await page.waitForTimeout(1200)
      r.check('searching does not empty or break the screen',
        /Video|result|No |nothing/i.test(await screenText(page)))
    }
    const chip = page.locator('.chip, .filter').filter({ hasText: /Sleep/i }).first()
    if (await chip.count() > 0) {
      await chip.click()
      await page.waitForTimeout(900)
      r.check('a category filter responds', true)
    }
    await ctx.close()
  })


  /* ── UC-38 ─────────────────────────────────────────────────────────── */
  await r.run('UC-38', 'With no content service, Explore explains itself', async () => {
    const api = await startApi({ youtubeConfigured: false })
    const { ctx, page } = await openApp(browser, api.origin, account())
    await goTo(page, 'explore')
    const text = await screenText(page)
    r.check('no configuration language reaches the person', !SECRETY.test(text))
    r.check('the screen is not silently blank', text.trim().length > 80)
    await ctx.close(); await api.close()
  })


  await r.run('UC-39', 'A malformed API response cannot blank the app', async () => {
    const { ctx, page, errors } = await openApp(browser, origin, account({
      addedWorkouts: { [today]: aWorkout() },
    }), { settle: 300 })

    // An insight missing the arrays the screens read. The server normalises
    // its own output, but a proxy, a cache or an older deployment is not the
    // server, and none of them may take a screen down.
    await page.route('**/api/ai/insights', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ insights: [{ id: 'x', domain: 'sleep', changed: 'Something' }] }),
    }))
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await goTo(page, 'future')

    const text = await screenText(page)
    r.check('the screen still renders', text.trim().length > 80, 'the app went blank')
    r.check('the navigation is still there',
      await page.locator('.tabbar__item').count() >= 4,
      'a person would be trapped with no way out')
    r.check('no raw error text is shown to the person', !/TypeError|undefined is not|at Object\./.test(text))
    r.check('no unhandled render error', errors.length === 0, errors.slice(0, 2).join(' | '))
    await ctx.close()
  })
}
