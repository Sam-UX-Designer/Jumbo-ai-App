import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import type { Persisted } from '../state/store'
import { mergeStates } from './merge'

/**
 * The account, and the record that follows it between devices.
 *
 * Jumbo worked for a long time with no server at all: everything a person
 * recorded lived in one browser, which meant a second device was a second
 * unrelated person and there was no way to get an account back. This is
 * what fixes that, and nothing else about how the app stores things
 * changes. Local storage is still the truth the interface reads from; the
 * cloud is a copy that is pulled on sign in and pushed after changes.
 *
 * It is entirely optional. With no credentials configured the app behaves
 * exactly as it did before, on this device only, and says so rather than
 * showing a sign-in that cannot work.
 *
 * On the key in the browser: Supabase's anon key is designed to be public
 * and belongs in the client. What keeps one person out of another's health
 * record is Row Level Security on the table, which supabase/schema.sql sets
 * up. The service_role key, which bypasses all of it, is never used here
 * and must never be put in this file or in any VITE_ variable.
 */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined

/*
 * The publishable key, with the older name still accepted.
 *
 * Supabase now issues `sb_publishable_...` keys, which can be rotated on
 * their own without invalidating every session. The JWT-shaped `anon` key
 * still works and older deployments may have been set up with it, so both
 * names are read and the newer one wins.
 */
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

/** Whether accounts are available at all in this deployment. */
export const cloudConfigured = Boolean(URL_ && KEY)

let client: SupabaseClient | null = null

function db(): SupabaseClient | null {
  if (!cloudConfigured) return null
  if (!client) {
    client = createClient(URL_!, KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Password reset comes back as a fragment on the URL. Letting the
        // client read it is what turns the click in that email into a
        // recovery session; it is stripped from the address bar afterwards.
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export interface CloudUser { id: string; email: string | null }

const asUser = (s: Session | null): CloudUser | null =>
  (s?.user ? { id: s.user.id, email: s.user.email ?? null } : null)

/** Who is signed in on this device, if anyone. */
export async function currentUser(): Promise<CloudUser | null> {
  const c = db()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return asUser(data.session)
}

/** Called whenever the signed-in person changes, including on first load. */
export function onAuthChange(fn: (user: CloudUser | null) => void): () => void {
  const c = db()
  if (!c) return () => {}
  const { data } = c.auth.onAuthStateChange((_event, session) => fn(asUser(session)))
  return () => data.subscription.unsubscribe()
}

export type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string }

/**
 * Wording for the person, never for the developer.
 *
 * Supabase's own errors name tables, policies and rate limits. None of that
 * belongs on screen, so each one is translated and the original is left in
 * the console for whoever is debugging.
 */
function plain(error: { message?: string; status?: number; code?: string } | null, fallback: string): string {
  const raw = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/invalid[_ ]login|invalid[_ ]credentials|invalid login/i.test(raw)) {
    return 'That email and password do not match an account. Check them and try again.'
  }
  if (/already registered|already been registered|user_already_exists/i.test(raw)) {
    return 'There is already an account with that email. Sign in instead.'
  }
  if (/password.*(short|least|weak)|weak_password/i.test(raw)) {
    return `Please use a password of at least ${MIN_PASSWORD} characters.`
  }
  if (/email.*not confirmed|email_not_confirmed/i.test(raw)) {
    return 'Please confirm your email first. The confirmation link is in your inbox.'
  }
  if (/rate limit|too many|over_request_rate/i.test(raw)) {
    return 'That is a few too many attempts. Please wait a minute and try again.'
  }
  if (/invalid|expired/i.test(raw)) {
    return 'That link has expired. Ask for a new one and it will work.'
  }
  if (/network|fetch|failed to fetch/i.test(raw)) {
    return 'Jumbo could not reach its service. Check your connection and try again.'
  }
  return fallback
}

/**
 * The shortest password Jumbo will accept.
 *
 * Supabase enforces its own minimum server-side and rejects anything under
 * it. Checking the same number here means the person is told before they
 * submit rather than after a round trip.
 */
export const MIN_PASSWORD = 8

/**
 * Create the account.
 *
 * Whether this signs the person straight in depends on one setting in the
 * project: with email confirmation off, Supabase returns a session and they
 * are in; with it on, it returns a user and no session, and they have to
 * click a link first. Both are real, so rather than assuming one, this
 * reports which happened and the interface says the truth either way.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<CloudResult<{ signedIn: boolean }>> {
  const c = db()
  if (!c) return { ok: false, message: 'Accounts are not set up on this copy of Jumbo yet.' }

  const { data, error } = await c.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) {
    console.error('[jumbo] sign up', error)
    return { ok: false, message: plain(error, 'That account could not be created. Please try again.') }
  }
  return { ok: true, data: { signedIn: Boolean(data.session) } }
}

/** Sign in to an account that already exists. */
export async function signIn(email: string, password: string): Promise<CloudResult<null>> {
  const c = db()
  if (!c) return { ok: false, message: 'Accounts are not set up on this copy of Jumbo yet.' }

  const { error } = await c.auth.signInWithPassword({ email: email.trim(), password })
  if (error) {
    console.error('[jumbo] sign in', error)
    return { ok: false, message: plain(error, 'Jumbo could not sign you in. Please try again.') }
  }
  return { ok: true, data: null }
}

/**
 * Start a password reset.
 *
 * The one place an email is still unavoidable. Without it a forgotten
 * password is a lost account, and every record with it.
 */
export async function sendReset(email: string): Promise<CloudResult<null>> {
  const c = db()
  if (!c) return { ok: false, message: 'Accounts are not set up on this copy of Jumbo yet.' }

  const { error } = await c.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  })
  if (error) {
    console.error('[jumbo] reset', error)
    return { ok: false, message: plain(error, 'That reset email could not be sent. Please try again.') }
  }
  return { ok: true, data: null }
}

/** Finish a reset, or change the password from inside the app. */
export async function setPassword(password: string): Promise<CloudResult<null>> {
  const c = db()
  if (!c) return { ok: false, message: 'Accounts are not set up on this copy of Jumbo yet.' }

  const { error } = await c.auth.updateUser({ password })
  if (error) {
    console.error('[jumbo] set password', error)
    return { ok: false, message: plain(error, 'That password could not be saved. Please try again.') }
  }
  return { ok: true, data: null }
}

/**
 * Fires when someone arrives from a reset email.
 *
 * Supabase signs them in on a recovery session so they can set a new
 * password. That is a session like any other, so without watching for this
 * the app would simply let them in and never ask for the new password.
 */
export function onPasswordRecovery(fn: () => void): () => void {
  const c = db()
  if (!c) return () => {}
  const { data } = c.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') fn()
  })
  return () => data.subscription.unsubscribe()
}

export async function signOutCloud(): Promise<void> {
  await db()?.auth.signOut()
}

const OWNER = 'jumbo.accountId'

/**
 * Whether the records sitting in this browser belong to the person now
 * signed in.
 *
 * Two people sharing a laptop is the case this exists for. Signing out
 * deliberately deletes nothing, so when the next person signs in, a
 * browserful of somebody else's meals and workouts is still there — and
 * merging is exactly the wrong thing to do with it. Their records would be
 * absorbed into an account that is not theirs and pushed to the server.
 *
 * Records made before there was ever an account have no owner recorded, and
 * those do merge: that is the person who used Jumbo for a week and then
 * signed up, and losing their week would be its own bug.
 */
function localOwner(uid: string): 'mine' | 'nobody' | 'someone else' {
  let owner: string | null = null
  try { owner = localStorage.getItem(OWNER) } catch { /* private mode */ }
  if (owner === null) return 'nobody'
  return owner === uid ? 'mine' : 'someone else'
}

/**
 * Bring this device's records together with the account's.
 *
 * Both sides are merged rather than one overwriting the other, so a meal
 * logged on a phone and a workout logged on a laptop both survive. See
 * lib/merge.ts for which fields merge and which take the newer save.
 */
export async function pullAndMerge(
  mine: Partial<Persisted>,
): Promise<CloudResult<Partial<Persisted>>> {
  const c = db()
  if (!c) return { ok: false, message: 'Accounts are not set up yet.' }

  const { data: sessionData } = await c.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) return { ok: false, message: 'You are not signed in.' }

  const { data, error } = await c
    .from('jumbo_state')
    .select('state, updated_at')
    .eq('id', uid)
    .maybeSingle()

  if (error) {
    console.error('[jumbo] pull', error)
    return { ok: false, message: plain(error, 'Your records could not be fetched just now.') }
  }

  const owner = localOwner(uid)

  // Nothing stored yet: this device's records become the account's, unless
  // they are somebody else's (see localOwner).
  if (!data) return { ok: true, data: owner === 'someone else' ? {} : mine }

  const theirs = (data.state ?? {}) as Partial<Persisted>
  if (owner === 'someone else') return { ok: true, data: theirs }

  /*
   * Which side speaks for the preferences — the name, the goals, the theme.
   *
   * Between two devices of the same account that is a question of which
   * saved last. On a device signing in to an account for the first time it
   * is not: the browser wrote its own empty state to disk a second ago,
   * simply by starting up, so by the clock the blank copy always wins and
   * the person watches their own name disappear. Nothing on a device with
   * no account behind it outranks the account.
   *
   * Records are not affected either way. Those are unioned below, so a
   * week logged here before signing up still survives.
   */
  let theirsIsNewer = true
  if (owner === 'mine') {
    const theirsAt = Date.parse(data.updated_at ?? '') || 0
    let mineAt = 0
    try { mineAt = Number(localStorage.getItem('jumbo.savedAt') ?? 0) } catch { /* private mode */ }
    theirsIsNewer = theirsAt > mineAt
  }
  return { ok: true, data: mergeStates(mine, theirs, theirsIsNewer) }
}

/** Write this device's records to the account. */
export async function push(state: Partial<Persisted>): Promise<CloudResult<null>> {
  const c = db()
  if (!c) return { ok: false, message: 'Accounts are not set up yet.' }

  const { data: sessionData } = await c.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) return { ok: false, message: 'You are not signed in.' }

  const { error } = await c.from('jumbo_state').upsert({ id: uid, state }, { onConflict: 'id' })
  if (error) {
    console.error('[jumbo] push', error)
    return { ok: false, message: plain(error, 'Your records could not be saved to your account.') }
  }
  try {
    localStorage.setItem('jumbo.savedAt', String(Date.now()))
    localStorage.setItem(OWNER, uid)
  } catch { /* private mode: the guard then treats the records as unowned */ }
  return { ok: true, data: null }
}
