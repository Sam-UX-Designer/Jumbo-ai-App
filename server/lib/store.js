import { randomBytes, createHmac } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { env } from './env.js'

// A serverless filesystem is read-only apart from /tmp, and that is wiped
// between cold starts. Sessions still work within an instance; persistence is
// best-effort and its absence is never fatal.
const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? '/tmp/jumbo-data' : join(process.cwd(), '.data'))
const FILE = join(DATA_DIR, 'sessions.json')

/**
 * A deliberately small session store: provider tokens keyed by an opaque
 * session id held in an httpOnly cookie. Tokens never reach the browser.
 * Swap the two functions below for a real database in production.
 */
let sessions = new Map()
let loaded = false

async function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = await readFile(FILE, 'utf8')
    sessions = new Map(Object.entries(JSON.parse(raw)))
  } catch {
    sessions = new Map()
  }
}

async function persist() {
  try {
    await mkdir(dirname(FILE), { recursive: true })
    await writeFile(FILE, JSON.stringify(Object.fromEntries(sessions), null, 2))
  } catch (err) {
    console.warn('[store] could not persist sessions:', err.message)
  }
}

export async function getSession(id) {
  await load()
  if (!id) return null
  return sessions.get(id) ?? null
}

export async function createSession() {
  await load()
  const id = randomBytes(24).toString('base64url')
  sessions.set(id, { id, createdAt: Date.now(), providers: {}, pending: {} })
  await persist()
  return id
}

export async function updateSession(id, patch) {
  await load()
  const current = sessions.get(id)
  if (!current) return null
  const next = { ...current, ...patch }
  sessions.set(id, next)
  await persist()
  return next
}

export async function setProviderTokens(id, provider, tokens) {
  const s = await getSession(id)
  if (!s) return null
  s.providers[provider] = {
    ...tokens,
    connectedAt: Date.now(),
    lastSyncAt: null,
  }
  return updateSession(id, { providers: s.providers })
}

export async function clearProvider(id, provider) {
  const s = await getSession(id)
  if (!s) return null
  delete s.providers[provider]
  return updateSession(id, { providers: s.providers })
}

/** Signed state for the OAuth round trip, so a callback cannot be forged. */
export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const secret = env.sessionSecret || 'jumbo-dev-secret'
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState(state) {
  if (typeof state !== 'string' || !state.includes('.')) return null
  const [body, sig] = state.split('.')
  const secret = env.sessionSecret || 'jumbo-dev-secret'
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  if (sig !== expected) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}
