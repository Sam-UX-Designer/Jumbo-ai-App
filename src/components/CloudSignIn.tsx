import { useState } from 'react'
import { Icon } from './Icon'
import { ErrorNotice } from './UI'
import { cloudConfigured, MIN_PASSWORD, sendReset, signIn, signUp } from '../lib/cloud'
import { haptic } from '../lib/feedback'

/**
 * One screen for both doors.
 *
 * Signing in and signing up are the same two fields, so they are the same
 * form with a word changed, rather than two screens with a decision in
 * front of them. Someone arriving at Jumbo for the first time and someone
 * coming back on a new phone both type an email and a password and press
 * one button.
 *
 * Why a password rather than a link in an email: the link works, but it
 * costs a trip out of the app to an inbox and back on every single sign in.
 * A password is typed once and then remembered by the phone's own keychain,
 * so every sign in after the first is a tap. That only happens if the
 * markup is right, which is the reason for the details below — a real form
 * element, a real submit button, and the autocomplete names browsers look
 * for. Without them no keychain offers to save anything.
 *
 * It renders nothing when accounts are not configured for this deployment.
 * A sign-in that cannot reach anything is worse than no sign-in.
 */
export function CloudSignIn({
  onDone, initialMode = 'signIn',
}: {
  onDone?: () => void
  /** Which word the form opens on. Either way the other is one tap away. */
  initialMode?: 'signIn' | 'signUp'
}) {
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'forgot'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set when the account exists but Supabase wants the email confirmed. */
  const [confirm, setConfirm] = useState(false)
  const [reset, setReset] = useState(false)

  if (!cloudConfigured) return null

  const trimmed = email.trim()
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)
  const passwordOk = password.length >= MIN_PASSWORD
  const ready = mode === 'forgot' ? emailOk : emailOk && passwordOk

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)

    const r = mode === 'signUp' ? await signUp(trimmed, password)
      : mode === 'forgot' ? await sendReset(trimmed)
      : await signIn(trimmed, password)

    setBusy(false)
    if (!r.ok) {
      haptic('error')
      setError(r.message)
      return
    }

    haptic('success')
    if (mode === 'forgot') { setReset(true); return }
    // Signing up with email confirmation switched on gives back an account
    // but no session. Saying "welcome" then would be a lie.
    if (mode === 'signUp' && !(r.data as { signedIn: boolean }).signedIn) {
      setConfirm(true)
      return
    }
    // Signed in. The store notices the session and pulls the account's
    // records down; there is nothing more for this form to do.
    onDone?.()
  }

  if (confirm) {
    return (
      <Notice
        title="Confirm your email"
        body={`Your account is made. Open the link sent to ${trimmed} and you can sign in.`}
        onBack={() => { setConfirm(false); setMode('signIn') }}
        backLabel="Back to sign in"
      />
    )
  }

  if (reset) {
    return (
      <Notice
        title="Check your email"
        body={`If there is an account for ${trimmed}, a link to set a new password is on its way. Open it on this device.`}
        onBack={() => { setReset(false); setMode('signIn') }}
        backLabel="Back to sign in"
      />
    )
  }

  const heading = mode === 'signUp' ? 'Create your account'
    : mode === 'forgot' ? 'Reset your password'
    : 'Sign in'

  return (
    /*
     * A real form, submitted properly.
     *
     * Password managers and the iOS and Android keychains watch for a form
     * submit to decide when to offer to save. Handling the click on the
     * button alone looks identical on screen and silently loses that offer,
     * which is the whole reason for choosing a password over a link.
     */
    <form className="stack stack-3" onSubmit={submit} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="cloud-email">Email</label>
        <input
          id="cloud-email" className="input" type="email" value={email}
          inputMode="email"
          // "username" rather than "email": it is the name browsers pair
          // with the password field when deciding what to save.
          autoComplete="username"
          placeholder="you@example.com"
          onChange={(e) => { setEmail(e.target.value); setError(null) }}
        />
      </div>

      {mode !== 'forgot' && (
        <div className="field">
          <label className="field__label" htmlFor="cloud-password">Password</label>
          <div className="input-wrap">
            <input
              id="cloud-password" className="input" value={password}
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signUp' ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
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
          {mode === 'signUp' && (
            <span className="field__hint">
              At least {MIN_PASSWORD} characters. Your device can remember it for you.
            </span>
          )}
        </div>
      )}

      {error && <ErrorNotice title={`${heading} did not work`} message={error} onRetry={() => submit()} />}

      <button className="btn btn--primary btn--block" type="submit" disabled={!ready || busy}>
        {busy ? 'One moment…'
          : mode === 'signUp' ? 'Create account'
          : mode === 'forgot' ? 'Email me a reset link'
          : 'Sign in'}
      </button>

      {mode === 'signIn' && (
        <div className="row row--between">
          <button type="button" className="btn btn--ghost btn--sm"
            onClick={() => { setMode('signUp'); setError(null) }}>
            Create an account
          </button>
          <button type="button" className="btn btn--ghost btn--sm"
            onClick={() => { setMode('forgot'); setError(null) }}>
            Forgot password?
          </button>
        </div>
      )}

      {mode === 'signUp' && (
        <button type="button" className="btn btn--ghost btn--block"
          onClick={() => { setMode('signIn'); setError(null) }}>
          I already have an account
        </button>
      )}

      {mode === 'forgot' && (
        <button type="button" className="btn btn--ghost btn--block"
          onClick={() => { setMode('signIn'); setError(null) }}>
          Back to sign in
        </button>
      )}

      <p className="t-caption dim2">
        {mode === 'signUp'
          ? 'Your records are kept with your account, so they are there on your phone, your laptop, and anything else you sign in on.'
          : 'Signing in brings your records to this device and keeps anything already on it.'}
      </p>
    </form>
  )
}

function Notice({
  title, body, onBack, backLabel,
}: { title: string; body: string; onBack: () => void; backLabel: string }) {
  return (
    <div className="notice notice--quiet" role="status">
      <Icon name="check" size={18} style={{ color: 'var(--brand)', flex: 'none', marginTop: 2 }} />
      <div className="stack stack-2 grow" style={{ minWidth: 0 }}>
        <span className="t-callout strong">{title}</span>
        <p className="t-caption dim">{body}</p>
        <button className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          {backLabel}
        </button>
      </div>
    </div>
  )
}
