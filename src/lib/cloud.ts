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
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

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
        // The magic link comes back as a fragment on the URL. Letting the
        // client read it is what turns the click in the email into a
        // session; it is stripped from the address bar afterwards.
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
function plain(error: { message?: string; status?: number } | null, fallback: string): string {
  const raw = error?.message ?? ''
  if (/rate limit|too many/i.test(raw)) {
    return 'That is a few too many attempts. Please wait a minute and try again.'
  }
  if (/invalid|expired/i.test(raw)) {
    return 'That link has expired. Ask for a new one and it will work.'
  }
  if (/network|fetch/i.test(raw)) {
    return 'Jumbo could not reach its service. Check your connection and try again.'
  }
  return fallback
}

/** Send the sign-in link. The same link signs up and signs in. */
export async function sendLink(email: string): Promise<CloudResult<null>> {
  const c = db()
  if (!c) return { ok: false, message: 'Accounts are not set up on this copy of Jumbo yet.' }

  const { error } = await c.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) {
    console.error('[jumbo] sign-in link', error)
    return { ok: false, message: plain(error, 'That link could not be sent. Please try again.') }
  }
  return { ok: true, data: null }
}

export async function signOutCloud(): Promise<void> {
  await db()?.auth.signOut()
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

  // Nothing stored yet: this device's records become the account's.
  if (!data) return { ok: true, data: mine }

  const theirs = (data.state ?? {}) as Partial<Persisted>
  const theirsAt = Date.parse(data.updated_at ?? '') || 0
  const mineAt = Number(localStorage.getItem('jumbo.savedAt') ?? 0)
  return { ok: true, data: mergeStates(mine, theirs, theirsAt > mineAt) }
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
  localStorage.setItem('jumbo.savedAt', String(Date.now()))
  return { ok: true, data: null }
}
