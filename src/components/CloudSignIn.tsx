import { useState } from 'react'
import { Icon } from './Icon'
import { ErrorNotice } from './UI'
import { cloudConfigured, sendLink } from '../lib/cloud'
import { haptic } from '../lib/feedback'

/**
 * Signing in with an email link.
 *
 * One field and one button. There is no password to forget, no second
 * screen, and the same link works whether this is a first account or a
 * fifth device: Supabase creates the account if there is not one already,
 * so the person never has to know which of the two they are doing.
 *
 * It renders nothing at all when accounts are not configured for this
 * deployment. A sign-in that cannot reach anything is worse than no
 * sign-in, because the person types their address and waits for a mail
 * that is never coming.
 */
export function CloudSignIn({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!cloudConfigured) return null

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const send = async () => {
    if (!looksLikeEmail || busy) return
    setBusy(true)
    setError(null)
    const r = await sendLink(email)
    setBusy(false)
    if (r.ok) {
      haptic('success')
      setSent(true)
      onDone?.()
    } else {
      haptic('error')
      setError(r.message)
    }
  }

  if (sent) {
    return (
      <div className="notice notice--quiet" role="status">
        <Icon name="check" size={18} style={{ color: 'var(--brand)', flex: 'none', marginTop: 2 }} />
        <div className="stack stack-2 grow" style={{ minWidth: 0 }}>
          <span className="t-callout strong">Check your email</span>
          <p className="t-caption dim">
            A sign-in link is on its way to {email.trim()}. Open it on this
            device and Jumbo will bring your records back.
          </p>
          <button
            className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => { setSent(false); setError(null) }}
          >
            Use a different address
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack stack-3">
      <div className="field">
        <label className="field__label" htmlFor="cloud-email">Email</label>
        <input
          id="cloud-email" className="input" type="email" value={email}
          inputMode="email" autoComplete="email" placeholder="you@example.com"
          onChange={(e) => { setEmail(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
        />
      </div>

      {error && <ErrorNotice title="That link did not send" message={error} onRetry={send} />}

      <button className="btn btn--primary btn--block" disabled={!looksLikeEmail || busy} onClick={send}>
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </button>

      <p className="t-caption dim2">
        No password. The link signs you in, and creates your account if this
        is your first time. Your records then follow you to any device you
        open it on.
      </p>
    </div>
  )
}
