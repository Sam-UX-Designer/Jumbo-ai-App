/**
 * The test harness: a stand-in API, a browser, and the small vocabulary the
 * use cases are written in.
 *
 * The suite drives the real built app (`dist/`) against a local API that
 * answers the same shapes the production server answers. That keeps the
 * tests honest about the UI and the state layer — the parts that hold a
 * person's records — without making them depend on OpenRouter, YouTube or a
 * wearable vendor being reachable from CI.
 *
 * Where a test needs to prove behaviour against a *failing* API, it says so
 * and routes that call itself.
 */
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const DIST = join(ROOT, 'dist')

/* ── Finding a browser ────────────────────────────────────────────────────
   In order: an explicit CHROME, a Playwright install, then the usual system
   locations. The suite says which it used, because "tests passed" means
   little if nobody knows what ran them. */
export function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
    join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean)
  for (const r of roots) {
    if (!existsSync(r)) continue
    for (const d of readdirSync(r)) {
      for (const bin of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(r, d, bin)
        if (existsSync(p)) return p
      }
    }
  }
  for (const p of [
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) if (existsSync(p)) return p
  return null
}

/* ── The stand-in API ─────────────────────────────────────────────────────
   Every route the app calls, answering the production shapes. `opts` lets a
   case bend one answer — an AI that fails, a provider list that is empty —
   without rewriting the server. */
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export async function startApi(opts = {}) {
  const {
    aiConfigured = true, youtubeConfigured = true, providers = [],
    failChat = false, failInsights = false, chatDelayMs = 0,
  } = opts

  const calls = []
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const body = (req) => new Promise((ok) => {
    let b = ''
    req.on('data', (c) => { b += c })
    req.on('end', () => { try { ok(JSON.parse(b || '{}')) } catch { ok({}) } })
  })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const p = url.pathname
    if (p.startsWith('/api/')) calls.push({ path: p, method: req.method })

    if (p === '/api/config') {
      return json(res, 200, {
        ok: true,
        ai: { configured: aiConfigured, model: null },
        youtube: { configured: youtubeConfigured },
        providers: [], publicUrl: '',
      })
    }
    if (p === '/api/healthz') return json(res, 200, { ok: true, at: Date.now() })
    if (p === '/api/oauth/providers') return json(res, 200, { providers })
    if (p === '/api/health/sync') {
      return json(res, 200, { connected: [], days: [], errors: [], syncedAt: Date.now() })
    }

    if (p === '/api/ai/insights') {
      if (failInsights) return json(res, 502, { error: 'upstream' })
      const sent = await body(req)
      calls[calls.length - 1].payload = sent
      return json(res, 200, {
        model: 'test',
        insights: [{
          id: 'i1', domain: 'sleep', changed: 'A pattern worth a look',
          why: 'Because the numbers say so', evidence: ['7 nights'], confidence: 0.7,
          limitation: 'One week is a short window.',
          options: ['Try an earlier night', 'Change nothing for now'],
          window: 'last 7 days', createdAt: Date.now(),
        }],
      })
    }
    if (p === '/api/ai/chat') {
      if (chatDelayMs) await new Promise((r) => setTimeout(r, chatDelayMs))
      if (failChat) return json(res, 502, { error: 'upstream' })
      const sent = await body(req)
      calls[calls.length - 1].payload = sent
      return json(res, 200, {
        source: 'openrouter', model: 'test',
        answer: 'Here is a straight answer about your data.',
        followUps: ['And what about sleep?', 'How do I improve?'],
      })
    }
    if (p === '/api/ai/future') {
      return json(res, 200, {
        source: 'openrouter', model: 'test',
        headline: 'Where this leads',
        lifeStory: ['A plain reading of the trend.', 'And what it depends on.'],
        whatDrivesIt: ['Consistency', 'Sleep'],
        honestly: 'This is a model estimate, not a measurement.',
        confidence: 0.6,
      })
    }
    if (p === '/api/ai/food') {
      return json(res, 200, {
        items: [{
          id: 'f1', name: 'Porridge', portion: '1 bowl', grams: 300,
          kcal: 340, protein: 12, carbs: 58, fat: 7, confidence: 0.72,
        }],
      })
    }
    if (p === '/api/youtube/channels') return json(res, 200, { channels: [] })
    if (p === '/api/youtube/search') {
      const n = 8
      return json(res, 200, {
        videos: Array.from({ length: n }, (_, i) => ({
          id: `v${i}`, title: `Video ${i}`, channelTitle: 'A Channel',
          channelId: `c${i}`, thumbnail: '', publishedAt: new Date().toISOString(),
          viewCount: 1000 + i, durationSeconds: 600,
        })),
      })
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not_found' })

    // Static files, with an SPA fallback.
    let file = join(DIST, p === '/' ? 'index.html' : p.replace(/^\/+/, ''))
    try {
      const s = await stat(file)
      if (s.isDirectory()) file = join(file, 'index.html')
    } catch {
      file = join(DIST, 'index.html')
    }
    try {
      const buf = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
      res.end(buf)
    } catch {
      res.writeHead(404); res.end('not found')
    }
  })

  await new Promise((ok) => server.listen(0, ok))
  const port = server.address().port
  return {
    origin: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((ok) => server.close(ok)),
  }
}

/* ── A person's saved state ───────────────────────────────────────────────
   The shape the app persists. Cases start from `account()` and change only
   what they are about, so a test that fails says something specific. */
export const STORAGE_KEY = 'jumbo.state.v2'
export const todayISO = () => new Date().toISOString().slice(0, 10)

export function account(over = {}) {
  return {
    onboarded: true, phoneVerified: true, permissions: {},
    profile: { name: 'Sam', phone: '' }, goals: ['fitness'], dataMode: 'live',
    decisions: {}, dismissed: [], followedChannels: [], savedVideos: [], savedVideoData: {},
    plan: 'free', theme: 'dark',
    addedMeals: {}, addedWorkouts: {}, addedNotes: {}, addedMeasurements: [],
    events: [], readNotifications: [], milestones: [],
    settings: {
      reminders: {}, haptics: true, sound: true,
      aiPatterns: true, creatorPersonalisation: true,
    },
    ...over,
  }
}

/** A meal in the shape the app actually stores. */
export const aMeal = (over = {}) => ({
  id: 'm-test', time: '12:30', slot: 'Lunch', method: 'manual', confirmed: true,
  items: [{
    id: 'fi-1', name: 'Chicken salad', portion: '1 bowl', grams: 320,
    kcal: 430, protein: 38, carbs: 18, fat: 21, confidence: 0.86,
  }],
  ...over,
})

/** A night's sleep in the shape the app stores. */
export const aSleep = (over = {}) => ({
  hours: 7.5, bedtimeHour: 23.25, time: '07:10', source: 'manual', ...over,
})

export const aWorkout = (over = {}) => ({
  id: 'w-test', time: '11:30', type: 'Cycle', minutes: 130,
  intensity: 3, perceivedEffort: 10, source: 'manual', ...over,
})

/* ── Driving the app ──────────────────────────────────────────────────── */
export async function openApp(browser, origin, state, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 390, height: 844 },
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  if (state) {
    // Seed once, and only once. addInitScript runs on every navigation, so
    // writing unconditionally would restore the starting state on reload and
    // make every "survives a reload" check a test of the seed rather than of
    // the app.
    await page.addInitScript(([k, v]) => {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
    }, [STORAGE_KEY, JSON.stringify(state)])
  }
  await page.goto(origin + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(opts.settle ?? 900)
  return { ctx, page, errors }
}

/** What the app has written down, read back the way a reload would read it. */
export const saved = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORAGE_KEY)

export const screenText = (page) => page.evaluate(() => document.body.innerText)

/** Close anything modal that is covering the screen. */
export async function dismissSheets(page) {
  for (let i = 0; i < 3; i++) {
    const open = await page.locator('.sheet[role=dialog]').count()
    if (!open) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
}

/** Move to a main screen the way a person does: the tab bar. */
export async function goTo(page, screen) {
  // A sheet left open puts a scrim over the tab bar, and the click then
  // waits thirty seconds for a target it will never reach.
  await dismissSheets(page)
  const map = { today: 'Today', future: 'Lifestyle', explore: 'Explore' }
  if (screen === 'capture') {
    // The centre button raises the quick-add menu rather than navigating;
    // the records themselves are the last item in it.
    await page.locator('.tabbar__fab').click()
    await page.waitForTimeout(600)
    await page.locator('.quickadd__item').filter({ hasText: /records/i }).click()
  } else if (screen === 'profile') {
    await page.locator('.tabbar__item').last().click()
  } else {
    await page.locator('.tabbar__item', { hasText: map[screen] }).first().click()
  }
  await page.waitForTimeout(800)
}

/** Open the Ask Jumbo composer, which is a button that raises a sheet. */
export async function openAsk(page) {
  const field = page.locator('.askdock__field').first()
  if (await field.count() === 0) return null
  await field.click()
  await page.waitForTimeout(700)
  const input = page.locator('.sheet input[type=text], .sheet textarea, input[type=text], textarea').first()
  return await input.count() > 0 ? input : null
}

/* ── Reporting ────────────────────────────────────────────────────────── */
export function reporter() {
  const results = []
  let current = null
  return {
    useCase(id, title) {
      current = { id, title, checks: [], failures: [] }
      results.push(current)
      return current
    },
    /**
     * Run one case in isolation.
     *
     * A case that throws — a selector that never resolves, a sheet that
     * swallows a click — records itself as a failure and the suite carries
     * on. One broken interaction must not hide the state of everything
     * after it.
     */
    async run(id, title, body) {
      const c = this.useCase(id, title)
      const t0 = Date.now()
      try {
        await body()
      } catch (err) {
        const why = String(err && err.message ? err.message : err).split('\n')[0]
        c.checks.push({ label: 'the case ran to completion', pass: false, detail: why })
        c.failures.push(`the case could not complete — ${why}`)
      }
      c.ms = Date.now() - t0
      return c
    },
    check(label, condition, detail = '') {
      const pass = Boolean(condition)
      current.checks.push({ label, pass, detail })
      if (!pass) current.failures.push(detail ? `${label} — ${detail}` : label)
      return pass
    },
    results,
    summary() {
      const checks = results.flatMap((r) => r.checks)
      return {
        cases: results.length,
        casesFailed: results.filter((r) => r.failures.length).length,
        checks: checks.length,
        checksFailed: checks.filter((c) => !c.pass).length,
      }
    },
  }
}

/**
 * Click a control that may be sitting under the Ask Jumbo composer.
 *
 * The composer is fixed to the bottom of the window and the page reserves
 * room for it, but only once the page is scrolled. Playwright's own scroll
 * is no help: the element is already "in view", so nothing moves, and the
 * click lands on the composer painted over it. A person would scroll, so
 * this does — checking what is actually on top each time, which is the only
 * way to know the control can really be reached.
 */
export async function clickClear(page, locator) {
  const covered = async () => page.evaluate(() => {
    const el = window.__t
    if (!el) return null
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    const dock = document.querySelector('.askdock')
    return {
      clear: top === el || el.contains(top) || (top && top.contains(el)),
      overlap: dock ? r.bottom - dock.getBoundingClientRect().top : 0,
    }
  })

  await locator.evaluate((el) => { window.__t = el })
  for (let i = 0; i < 5; i++) {
    const c = await covered()
    if (!c || c.clear) break
    await page.evaluate((by) => window.scrollBy(0, by), Math.max(60, c.overlap + 32))
    await page.waitForTimeout(250)
  }
  await locator.click()
}

/** Open the centre button's quick-add menu and choose a kind. */
export async function quickAdd(page, label) {
  await page.locator('.tabbar__fab').click()
  await page.waitForTimeout(600)
  await page.locator('.quickadd__item').filter({ hasText: new RegExp(`^${label}$`, 'i') }).click()
  await page.waitForTimeout(900)
}
