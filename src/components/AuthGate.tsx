import { useEffect, useState } from 'react'
import '../styles/onboarding.css'
import { BrandMark, BrandWordmark } from './Asset'
import { CloudSignIn } from './CloudSignIn'
import { Icon } from './Icon'
import { ErrorNotice } from './UI'
import { useStore } from '../state/store'
import { cloudConfigured, MIN_PASSWORD, onPasswordRecovery, setPassword } from '../lib/cloud'
import { haptic } from '../lib/feedback'

/**
 * The door. Nothing behind it opens without an account.
 *
 * Jumbo used to let anyone straight in and keep their records in the
 * browser, which made a shared link an odd thing: whoever opened it landed
 * inside somebody's app with no account of their own, and their own logging
 * went nowhere a second device could find it. So when accounts are
 * configured, this stands in front of everything — the app, onboarding, all
 * of it — and the only way past is to sign in or make an account.
 *
 * When accounts are NOT configured, this renders its children untouched.
 * That keeps the local-only build working exactly as it always did, and it
 * is what the test suite runs against. A gate that cannot reach a server
 * would lock everybody out of a perfectly good offline app.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state } = useStore()
  const [recovering, setRecovering] = useState(false)
  /** Set when the first pull has taken long enough to stop waiting on it. */
  const [waited, setWaited] = useState(false)

  /*
   * Arriving from a reset email.
   *
   * Supabase signs the person in on a recovery session, so without watching
   * for this they would simply be let in and never asked for the new
   * password they came here to set.
   */
  useEffect(() => {
    if (!cloudConfigured) return
    return onPasswordRecovery(() => setRecovering(true))
  }, [])

  /*
   * Never hold the app hostage to a slow pull.
   *
   * The request that brings an account's records down has no deadline of
   * its own, so a stalled connection would leave someone staring at
   * "bringing your records in" with no way forward. After a few seconds the
   * app opens on what this device already has; the pull still lands when it
   * lands, and merges then.
   */
  const stillSyncing = Boolean(state.cloud.user) && state.cloud.status === 'syncing'
  useEffect(() => {
    if (!stillSyncing) { setWaited(false); return }
    const t = window.setTimeout(() => setWaited(true), 6000)
    return () => window.clearTimeout(t)
  }, [stillSyncing])

  if (!cloudConfigured) return <>{children}</>

  if (recovering) {
    return <Frame><NewPassword onDone={() => setRecovering(false)} /></Frame>
  }

  const { user, status } = state.cloud

  /*
   * Signed in, but the account's records are still coming down.
   *
   * Without this the app renders from whatever is in this browser for a
   * moment first, which for a new device means the welcome screen flashing
   * up at somebody who has had an account for months.
   */
  if (user && status === 'syncing' && !waited) {
    return (
      <Frame>
        <div className="stack stack-4" style={{ alignItems: 'center', textAlign: 'center' }}>
          <BrandMark size={44} />
          <p className="t-callout dim" role="status">Bringing your records in…</p>
        </div>
      </Frame>
    )
  }

  if (user) return <>{children}</>

  return (
    <Frame>
      <div className="stack stack-5">
        <div className="stack stack-4">
          <BrandWordmark height={30} />
          <h1 className="t-title1">Your health, joined up.</h1>
          <p className="t-body dim" style={{ maxWidth: '32ch' }}>
            Your records are kept with your account, not with this browser,
            so they are there on your phone and your laptop both.
          </p>
        </div>
        {/* "Create account" on the marketing page opens that side of the
            form rather than making them find the toggle. */}
        <CloudSignIn initialMode={wantsNewAccount() ? 'signUp' : 'signIn'} />
      </div>
    </Frame>
  )
}

/** Whether the link that brought them here asked for the sign-up side. */
function wantsNewAccount(): boolean {
  try { return new URLSearchParams(window.location.search).has('new') } catch { return false }
}

/** The onboarding shell, so the door looks like the rooms behind it. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="ob">
      <div className="ob__inner">
        <div className="ob__body" style={{ justifyContent: 'center' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** Set a new password, after arriving from the reset email. */
function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = password.length >= MIN_PASSWORD

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    const r = await setPassword(password)
    setBusy(false)
    if (r.ok) { haptic('success'); onDone() }
    else { haptic('error'); setError(r.message) }
  }

  return (
    <form className="stack stack-5" onSubmit={save} noValidate>
      <div className="stack stack-4">
        <BrandWordmark height={30} />
        <h1 className="t-title1">Set a new password</h1>
        <p className="t-body dim" style={{ maxWidth: '32ch' }}>
          Choose one and your device can remember it, so this is the last
          time you have to think about it.
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="new-password">New password</label>
        <div className="input-wrap">
          <input
            id="new-password" className="input" value={password}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            onChange={(e) => { setPw(e.target.value); setError(null) }}
          />
          <button
            type="button" className="input-wrap__btn"
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
          >
            <Icon name={show ? 'eye-off' : 'eye'} size={18} />
          </button>
        </div>
      </div>

      {error && <ErrorNotice title="That password did not save" message={error} onRetry={() => save()} />}

      <button className="btn btn--primary btn--block" type="submit" disabled={!ready || busy}>
        {busy ? 'Saving…' : 'Save password'}
      </button>
    </form>
  )
}
