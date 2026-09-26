#!/usr/bin/env node
/**
 * The account suite.
 *
 * Everything else in tests/e2e runs against a build with no Supabase
 * configured, which is the local-only Jumbo and the path most of the app
 * lives on. It cannot reach the code that matters most, though: the door in
 * front of the app. Get that wrong and nobody gets in at all.
 *
 * So this builds a second copy of the app pointed at a stand-in Supabase on
 * a known port, and drives the real sign-up, sign-in, reload, sign-out and
 * second-account flows against it. The stand-in answers the shapes the real
 * client parses — a session is `access_token` + `refresh_token` +
 * `expires_in`, a PostgREST select is a bare array — so what is exercised
 * is the app's own logic, not a mock of it.
 *
 *   node tests/e2e/cloud.mjs
 */
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { findChrome, reporter } from './harness.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const OUT = join(ROOT, 'dist-cloud')
/* Fixed, because the app is compiled against it. */
const PORT = 4184
const ORIGIN = `http://127.0.0.1:${PORT}`
const STORAGE_KEY = 'jumbo.state.v2'

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m', OFF = '\x1b[0m'

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/** A token shaped like the real thing, so nothing downstream chokes on it. */
function jwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600,
  })}.test`
}

/* ── The stand-in Supabase ─────────────────────────────────────────────── */
function fakeSupabase() {
  /** email -> { id, password, confirmed } */
  const users = new Map()
  /** user id -> { state, updated_at } */
  const rows = new Map()
  /** Flipped by a case to make sign-up require a confirmation click. */
  let requireConfirm = false
  /** Flipped off to prove the app still works with no function deployed. */
  let functionUp = true

  const userObj = (u, email) => ({
    id: u.id, aud: 'authenticated', role: 'authenticated', email,
    email_confirmed_at: u.confirmed ? new Date().toISOString() : null,
    app_metadata: { provider: 'email' }, user_metadata: {},
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  })

  const session = (u, email) => ({
    access_token: jwt(u.id), token_type: 'bearer', expires_in: 3600,
    refresh_token: `r-${u.id}`, user: userObj(u, email),
  })

  return {
    users, rows,
    setRequireConfirm(v) { requireConfirm = v },
    get requireConfirm() { return requireConfirm },
    setFunctionUp(v) { functionUp = v },
    get functionUp() { return functionUp },
    userObj, session,
  }
}

async function start(sb) {
  const json = (res, code, body) => {
    res.writeHead(code, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
    res.end(JSON.stringify(body))
  }
  const read = (req) => new Promise((ok) => {
    let b = ''
    req.on('data', (c) => { b += c })
    req.on('end', () => { try { ok(JSON.parse(b || '{}')) } catch { ok({}) } })
  })
  /** The signed-in user id, from the bearer token the client sends back. */
  const whom = (req) => {
    const raw = (req.headers.authorization || '').replace(/^Bearer /, '')
    const part = raw.split('.')[1]
    if (!part) return null
    try { return JSON.parse(Buffer.from(part, 'base64url').toString()).sub ?? null } catch { return null }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const p = url.pathname

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      })
      return res.end()
    }

    /* ── the account-create function ──────────────────────────────────── */
    if (p === '/functions/v1/account-create') {
      // Not deployed. The app has to cope with this on its own.
      if (!sb.functionUp) return json(res, 404, { error: 'not found' })
      const { email, password } = await read(req)
      if (!password || password.length < 8) return json(res, 400, { error: 'password' })
      // The admin API gives a straight answer, unlike the public sign-up.
      if (sb.users.has(email)) return json(res, 409, { error: 'exists' })
      sb.users.set(email, { id: randomUUID(), password, confirmed: true })
      return json(res, 200, { ok: true })
    }

    /* ── auth ─────────────────────────────────────────────────────────── */
    if (p === '/auth/v1/signup') {
      const { email, password } = await read(req)
      if (sb.users.has(email)) {
        // With confirmation on, real Supabase will not admit the address is
        // taken — it answers success with a hollow user and sends nothing.
        if (sb.requireConfirm) {
          const u = sb.users.get(email)
          return json(res, 200, { ...sb.userObj(u, email), identities: [] })
        }
        return json(res, 400, { error_code: 'user_already_exists', msg: 'User already registered' })
      }
      if (!password || password.length < 8) {
        return json(res, 422, { error_code: 'weak_password', msg: 'Password should be at least 8 characters' })
      }
      const u = { id: randomUUID(), password, confirmed: !sb.requireConfirm }
      sb.users.set(email, u)
      // Confirmation on: an account, but no session. Confirmation off: in.
      return json(res, 200, sb.requireConfirm ? sb.userObj(u, email) : sb.session(u, email))
    }

    if (p === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type')
      const body = await read(req)
      if (grant === 'refresh_token') {
        const entry = [...sb.users.entries()].find(([, u]) => `r-${u.id}` === body.refresh_token)
        if (!entry) return json(res, 400, { error_code: 'invalid_grant', msg: 'Invalid Refresh Token' })
        return json(res, 200, sb.session(entry[1], entry[0]))
      }
      const u = sb.users.get(body.email)
      if (!u || u.password !== body.password) {
        return json(res, 400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      }
      if (!u.confirmed) {
        return json(res, 400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' })
      }
      return json(res, 200, sb.session(u, body.email))
    }

    if (p === '/auth/v1/logout') { res.writeHead(204); return res.end() }
    if (p === '/auth/v1/recover') return json(res, 200, {})

    if (p === '/auth/v1/user') {
      const uid = whom(req)
      const entry = [...sb.users.entries()].find(([, u]) => u.id === uid)
      if (!entry) return json(res, 401, { msg: 'Unauthorized' })
      if (req.method === 'PUT') {
        const b = await read(req)
        if (b.password) entry[1].password = b.password
      }
      return json(res, 200, sb.userObj(entry[1], entry[0]))
    }

    /* ── the table ────────────────────────────────────────────────────── */
    if (p === '/rest/v1/jumbo_state') {
      const uid = whom(req)
      if (!uid) return json(res, 401, { message: 'JWT missing' })
      if (req.method === 'GET') {
        // Row Level Security, in one line: only ever your own row.
        const row = sb.rows.get(uid)
        return json(res, 200, row ? [row] : [])
      }
      const b = await read(req)
      const one = Array.isArray(b) ? b[0] : b
      // The policy the real database enforces: you cannot write another
      // person's row, whatever id you put in the body.
      if (one.id && one.id !== uid) return json(res, 403, { message: 'new row violates row-level security policy' })
      sb.rows.set(uid, { state: one.state ?? {}, updated_at: new Date().toISOString() })
      res.writeHead(201, { 'access-control-allow-origin': '*' })
      return res.end()
    }

    /* ── the app's own API, enough for the screens to render ──────────── */
    if (p === '/api/config') {
      return json(res, 200, {
        ok: true, ai: { configured: false, model: null },
        youtube: { configured: false }, providers: [], publicUrl: '',
      })
    }
    if (p === '/api/healthz') return json(res, 200, { ok: true, at: Date.now() })
    if (p === '/api/oauth/providers') return json(res, 200, { providers: [] })
    if (p === '/api/health/sync') {
      return json(res, 200, { connected: [], days: [], errors: [], syncedAt: Date.now() })
    }
    if (p.startsWith('/api/')) return json(res, 200, { ok: true })

    /* ── the built app ────────────────────────────────────────────────── */
    let file = join(OUT, p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, ''))
    try {
      const buf = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      return res.end(buf)
    } catch {
      const buf = await readFile(join(OUT, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(buf)
    }
  })

  await new Promise((ok, no) => {
    server.on('error', no)
    server.listen(PORT, '127.0.0.1', ok)
  })
  return server
}

/* ── driving the app ───────────────────────────────────────────────────── */
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  if (opts.seed) {
    await page.addInitScript(([k, v]) => {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
    }, [STORAGE_KEY, JSON.stringify(opts.seed)])
  }
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  return { ctx, page, errors }
}

const text = (page) => page.evaluate(() => document.body.innerText)

async function fillAuth(page, email, password) {
  await page.fill('#cloud-email', email)
  if (password !== undefined) await page.fill('#cloud-password', password)
}

async function submitAuth(page) {
  await page.click('form button[type="submit"]')
  await page.waitForTimeout(1200)
}

async function main() {
  const exe = findChrome()
  if (!exe) { console.error(`${RED}No Chrome found.${OFF}`); process.exit(2) }

  console.log(`${BOLD}JUMBO account suite${OFF}`)
  console.log(`${DIM}building against a stand-in Supabase at ${ORIGIN}${OFF}`)
  execFileSync('npx', ['vite', 'build', '--outDir', 'dist-cloud', '--emptyOutDir'], {
    cwd: ROOT, stdio: 'pipe',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: ORIGIN,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    },
  })
  if (!existsSync(join(OUT, 'index.html'))) {
    console.error(`${RED}dist-cloud/ did not build.${OFF}`); process.exit(2)
  }

  const sb = fakeSupabase()
  const server = await start(sb)
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
  const r = reporter()
  const started = Date.now()

  try {
    /* ── UC-70 ───────────────────────────────────────────────────────── */
    await r.run('UC-70', 'A shared link opens a door, not somebody else’s app', async () => {
      const { ctx, page, errors } = await open(browser)
      const t = await text(page)
      r.check('the sign-in form is what loads', await page.locator('#cloud-email').count() === 1)
      r.check('a password field is on the same screen', await page.locator('#cloud-password').count() === 1)
      r.check('creating an account is offered here too',
        /create an account/i.test(t), 'no sign-up door on the sign-in screen')
      r.check('none of the app is reachable behind it',
        await page.locator('.tab-bar, nav .tab').count() === 0, 'the tab bar rendered for a stranger')
      r.check('onboarding did not start', !/Get started|joined up\.\s*$/i.test(t) || !/Look around/i.test(t))
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await ctx.close()
    })

    /* ── UC-71 ───────────────────────────────────────────────────────── */
    await r.run('UC-71', 'The form is one a keychain will offer to save', async () => {
      const { ctx, page } = await open(browser)
      r.check('the fields are inside a real form element',
        await page.locator('form #cloud-email').count() === 1)
      r.check('there is a real submit button',
        await page.locator('form button[type="submit"]').count() === 1)
      r.check('the email field is named the way browsers expect',
        await page.getAttribute('#cloud-email', 'autocomplete') === 'username')
      r.check('signing in asks for the current password',
        await page.getAttribute('#cloud-password', 'autocomplete') === 'current-password')
      await page.click('button:has-text("Create an account")')
      await page.waitForTimeout(250)
      r.check('creating an account asks for a new one',
        await page.getAttribute('#cloud-password', 'autocomplete') === 'new-password')
      await ctx.close()
    })

    /* ── UC-72 ───────────────────────────────────────────────────────── */
    await r.run('UC-72', 'Creating an account gets you in, and keeps you in', async () => {
      const { ctx, page, errors } = await open(browser)
      await page.click('button:has-text("Create an account")')
      await page.waitForTimeout(250)
      await fillAuth(page, 'alice@example.com', 'correct-horse')
      await submitAuth(page)

      r.check('the account was really created', sb.users.has('alice@example.com'))
      r.check('the door is gone', await page.locator('#cloud-email').count() === 0,
        'still on the sign-in screen after signing up')
      const t = await text(page)
      r.check('a new account starts at the beginning', /Get started|joined up/i.test(t))

      // Through setup, so there is something to come back to.
      await page.evaluate((k) => {
        const s = JSON.parse(localStorage.getItem(k) || '{}')
        localStorage.setItem(k, JSON.stringify({ ...s, onboarded: true, profile: { name: 'Alice', phone: '' } }))
      }, STORAGE_KEY)
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1400)

      r.check('a reload does not ask again', await page.locator('#cloud-email').count() === 0,
        'the session did not survive a reload')
      r.check('the app itself is there now', await page.locator('.tab-bar, nav').count() > 0)
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await ctx.close()
    })

    /* ── UC-73 ───────────────────────────────────────────────────────── */
    await r.run('UC-73', 'A wrong password is refused in the product’s own words', async () => {
      const { ctx, page } = await open(browser)
      await fillAuth(page, 'alice@example.com', 'not-the-password')
      await submitAuth(page)
      const t = await text(page)
      r.check('it says the pair does not match', /do not match an account/i.test(t), t.slice(0, 160))
      r.check('no implementation detail leaks',
        !/invalid_credentials|400|supabase|gotrue|JWT/i.test(t), t.slice(0, 160))
      r.check('still outside', await page.locator('#cloud-email').count() === 1)
      await ctx.close()
    })

    /* ── UC-74 ───────────────────────────────────────────────────────── */
    await r.run('UC-74', 'Signing in on a second device brings the records', async () => {
      // Alice's account already holds a row from UC-72's push.
      const uid = sb.users.get('alice@example.com').id
      sb.rows.set(uid, {
        state: { onboarded: true, profile: { name: 'Alice', phone: '' }, plans: [], sessions: [] },
        updated_at: new Date().toISOString(),
      })
      const { ctx, page, errors } = await open(browser)   // a clean browser
      await fillAuth(page, 'alice@example.com', 'correct-horse')
      await submitAuth(page)
      await page.waitForTimeout(1200)

      r.check('signed straight in', await page.locator('#cloud-email').count() === 0)
      r.check('setup is not asked for again',
        await page.locator('.tab-bar, nav').count() > 0, 'a known account was sent back to onboarding')
      const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)
      r.check('the account’s own records came down', /Alice/.test(stored || ''),
        `stored=${(stored || 'null').slice(0, 300)} | onscreen=${(await text(page)).slice(0, 120)}`)
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await ctx.close()
    })

    /* ── UC-75 ───────────────────────────────────────────────────────── */
    await r.run('UC-75', 'One person’s records never follow another into their account', async () => {
      const { ctx, page, errors } = await open(browser)
      // Alice signs in on this browser, leaving her records in it.
      await fillAuth(page, 'alice@example.com', 'correct-horse')
      await submitAuth(page)
      await page.waitForTimeout(1200)
      const afterAlice = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)
      r.check('Alice is in, with her records', /Alice/.test(afterAlice || ''),
        `stored=${(afterAlice || 'null').slice(0, 200)}`)

      // She signs out. Bob makes his own account on the same browser.
      await page.evaluate(() => { window.localStorage.setItem('jumbo.test.marker', '1') })
      await page.click('button:has-text("Create an account"), button:has-text("Sign in")').catch(() => {})
      await page.evaluate(async () => {
        // Sign out the way the app does, without hunting for the control.
        const ev = new CustomEvent('jumbo:test-signout')
        window.dispatchEvent(ev)
      })
      await ctx.close()

      // A fresh context carrying Alice's leftover records, as a shared
      // laptop would after she signed out without clearing anything.
      const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page2 = await ctx2.newPage()
      const errs2 = []
      page2.on('pageerror', (e) => errs2.push(String(e)))
      const aliceUid = sb.users.get('alice@example.com').id
      await page2.addInitScript(([k, v, owner, uid]) => {
        localStorage.setItem(k, v)
        localStorage.setItem('jumbo.accountId', uid)
        localStorage.setItem('jumbo.savedAt', String(Date.now()))
        void owner
      }, [STORAGE_KEY, afterAlice, 'x', aliceUid])
      await page2.goto(ORIGIN + '/', { waitUntil: 'networkidle' })
      await page2.waitForTimeout(700)

      await page2.click('button:has-text("Create an account")')
      await page2.waitForTimeout(250)
      await page2.fill('#cloud-email', 'bob@example.com')
      await page2.fill('#cloud-password', 'bobs-own-password')
      await page2.click('form button[type="submit"]')
      await page2.waitForTimeout(1800)

      const bobUid = sb.users.get('bob@example.com')?.id
      r.check('Bob has his own account', Boolean(bobUid) && bobUid !== aliceUid)
      const bobRow = JSON.stringify(sb.rows.get(bobUid) ?? {})
      r.check('Alice’s name never reached Bob’s account', !/Alice/.test(bobRow), bobRow.slice(0, 200))
      const bobLocal = await page2.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)
      r.check('and it is not on his screen either', !/Alice/.test(bobLocal || ''))
      r.check('Alice’s own account is untouched', /Alice/.test(JSON.stringify(sb.rows.get(aliceUid) ?? {})))
      r.check('no runtime errors', errs2.length === 0, errs2.slice(0, 2).join(' | '))
      await ctx2.close()
      void errors
    })

    /* ── UC-76 ───────────────────────────────────────────────────────── */
    await r.run('UC-76', 'With no function deployed, Jumbo falls back and stays honest', async () => {
      // Deleting supabase/functions/account-create is a supported state: the
      // app drops back to Supabase's own sign-up, which obeys the project's
      // confirmation setting and cannot say whether an address is taken.
      sb.setFunctionUp(false)
      sb.setRequireConfirm(true)
      const { ctx, page } = await open(browser)
      await page.click('button:has-text("Create an account")')
      await page.waitForTimeout(250)
      await fillAuth(page, 'carol@example.com', 'carols-password')
      await submitAuth(page)
      const t = await text(page)
      r.check('it sends them to the link rather than claiming success',
        /open the link sent to/i.test(t), t.slice(0, 220))
      r.check('and says where that link lands, so it is not a dead end',
        /takes you straight to setting jumbo up/i.test(t), t.slice(0, 220))
      r.check('it does not bounce them back to a sign-in form they cannot use',
        !/back to sign in/i.test(t), t.slice(0, 220))
      r.check('it does not pretend to have let them in',
        await page.locator('.tab-bar, nav .tab').count() === 0)
      await ctx.close()

      // The same address a second time. Supabase will not admit it is taken,
      // so Jumbo must not repeat "your account is made" at somebody who
      // already has one and send them to wait for a link that is not coming.
      const again = await open(browser)
      await again.page.click('button:has-text("Create an account")')
      await again.page.waitForTimeout(250)
      await fillAuth(again.page, 'carol@example.com', 'carols-password')
      await submitAuth(again.page)
      const t2 = await text(again.page)
      r.check('a second sign-up on the same address is sent to sign in, not to an inbox',
        /already an account with that email/i.test(t2), t2.slice(0, 220))
      r.check('and is not told a new account was made',
        !/open the link sent to/i.test(t2), t2.slice(0, 220))
      await again.ctx.close()

      sb.setRequireConfirm(false)
      sb.setFunctionUp(true)
    })

    /* ── UC-77 ───────────────────────────────────────────────────────── */
    await r.run('UC-77', 'Signing up starts at setup; signing in never does', async () => {
      // The device already holds a finished Jumbo, the way a browser does
      // that used the app before it had accounts. A new account must still
      // begin at the beginning.
      const seed = {
        onboarded: true, phoneVerified: true, permissions: {},
        profile: { name: 'Old Local Name', phone: '' }, goals: ['fitness'], dataMode: 'live',
        decisions: {}, dismissed: [], followedChannels: [], savedVideos: [], savedVideoData: {},
        plan: 'free', theme: 'dark', addedMeals: {}, addedWorkouts: {}, addedSleep: {},
        addedNotes: {}, addedMeasurements: [], plans: [], sessions: [],
        events: [], readNotifications: [], milestones: [],
      }
      const { ctx, page, errors } = await open(browser, { seed })
      await page.click('button:has-text("Create an account")')
      await page.waitForTimeout(250)
      await fillAuth(page, 'dana@example.com', 'danas-password')
      await submitAuth(page)
      await page.waitForTimeout(900)

      r.check('they are in', await page.locator('#cloud-email').count() === 0)
      const t = await text(page)
      r.check('and setup is where they land, not the app',
        /joined up|get started/i.test(t), t.slice(0, 160))
      r.check('the tab bar is not up yet',
        await page.locator('.tab-bar, nav .tab').count() === 0, 'went straight into the app')
      await ctx.close()

      // Now the other half: that same account, once through setup, signing
      // in on a clean device must not be asked to do setup again.
      const uid = sb.users.get('dana@example.com').id
      sb.rows.set(uid, {
        state: { ...seed, profile: { name: 'Dana', phone: '' } },
        updated_at: new Date().toISOString(),
      })
      const second = await open(browser)
      await fillAuth(second.page, 'dana@example.com', 'danas-password')
      await submitAuth(second.page)
      await second.page.waitForTimeout(1200)
      r.check('signing in goes straight to the app',
        await second.page.locator('.tab-bar, nav').count() > 0, 'a known account was sent back to setup')
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await second.ctx.close()
    })
    /* ── UC-79 ───────────────────────────────────────────────────────── */
    await r.run('UC-79', 'An address that already has an account is told so, plainly', async () => {
      // The whole reason supabase/functions/account-create exists. Supabase's
      // own sign-up will not answer this question once confirmation is on.
      const { ctx, page, errors } = await open(browser)
      await page.click('button:has-text("Create an account")')
      await page.waitForTimeout(250)
      await fillAuth(page, 'alice@example.com', 'a-different-password')
      await submitAuth(page)

      const t = await text(page)
      r.check('it says the address is taken', /already an account with that email/i.test(t), t.slice(0, 200))
      r.check('it points at signing in', /sign in instead/i.test(t), t.slice(0, 200))
      r.check('it does not send them to an inbox', !/open the link sent to/i.test(t), t.slice(0, 200))
      r.check('and Alice\u2019s password was not changed by the attempt',
        sb.users.get('alice@example.com').password === 'correct-horse')
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await ctx.close()
    })

    /* ── UC-80 ───────────────────────────────────────────────────────── */
    await r.run('UC-80', 'A new account goes straight to setup, with no inbox trip', async () => {
      const { ctx, page, errors } = await open(browser)
      await page.click('button:has-text("Create an account")')
      await page.waitForTimeout(250)
      await fillAuth(page, 'erin@example.com', 'erins-password')
      await submitAuth(page)
      await page.waitForTimeout(900)

      r.check('the account exists', sb.users.has('erin@example.com'))
      r.check('and needed no confirmation', sb.users.get('erin@example.com').confirmed === true)
      r.check('they are through the door', await page.locator('#cloud-email').count() === 0,
        'still on the sign-in screen')
      const t = await text(page)
      r.check('no inbox anywhere in it', !/open the link sent to|confirm your email/i.test(t), t.slice(0, 200))
      r.check('and setup is what they land on', /joined up|get started/i.test(t), t.slice(0, 160))
      r.check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '))
      await ctx.close()
    })
  } finally {
    await browser.close()
    server.close()
  }

  /* ── the tally ─────────────────────────────────────────────────────── */
  let checks = 0, failed = 0, bad = 0
  for (const c of r.results) {
    checks += c.checks.length
    failed += c.failures.length
    const ok = c.failures.length === 0
    if (!ok) bad++
    console.log(`  ${ok ? GREEN + 'pass' : RED + 'FAIL'}${OFF}  ${c.id}  ${c.title}${DIM} (${c.checks.length} checks)${OFF}`)
    for (const f of c.failures) console.log(`        ${RED}× ${f}${OFF}`)
  }
  console.log(`\n${BOLD}${'─'.repeat(52)}${OFF}`)
  console.log(`use cases : ${r.results.length - bad}/${r.results.length} passed`)
  console.log(`checks    : ${checks - failed}/${checks} passed`)
  console.log(`time      : ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(bad ? `\n${RED}${BOLD}${bad} use case(s) failed.${OFF}` : `\n${GREEN}${BOLD}All account use cases passed.${OFF}`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
