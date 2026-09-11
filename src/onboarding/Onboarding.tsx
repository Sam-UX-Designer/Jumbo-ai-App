import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/onboarding.css'
import { AiOrb, Icon, type IconName } from '../components/Icon'
import { AssetImage, BrandMark, BrandWordmark, Mascot, SourceLogo } from '../components/Asset'
import { Confidence, ErrorNotice, ProvenanceTag, Switch, UnavailableNotice } from '../components/UI'
import { Sparkline } from '../components/Charts'
import { useStore } from '../state/store'
import { api, type ProviderInfo } from '../lib/api'
import { nativeBridge } from '../lib/native'
import type { GoalKey } from '../data/types'
import { celebrate, haptic, playSound } from '../lib/feedback'
import { lastN } from '../lib/analytics'
import { QUICK_PROMPTS } from '../lib/useChat'
import { requestNotificationPermission } from '../lib/reminders'
import { hoursToHM, round } from '../lib/util'

/**
 * The journey, in the order the storyboard sets out: who you are, what you
 * want, what you already have, what Jumbo made of it, and what happens next.
 * Fourteen short screens rather than one long form.
 */
const STEPS = [
  'welcome', 'you', 'verify', 'goals', 'connect', 'permissions', 'import',
  'summary', 'insight', 'ask', 'preview', 'celebrate', 'reminders', 'ready',
] as const
type Step = (typeof STEPS)[number]

const PERMISSIONS: Array<{ key: string; label: string; detail: string; icon: IconName; colour: string }> = [
  { key: 'sleep',    label: 'Sleep',             detail: 'Duration, efficiency and bedtime',  icon: 'sleep',   colour: 'var(--sleep)' },
  { key: 'steps',    label: 'Steps',             detail: 'Daily steps and active minutes',    icon: 'steps',   colour: 'var(--movement)' },
  { key: 'workouts', label: 'Workouts',          detail: 'Type, duration and intensity',      icon: 'training',colour: 'var(--training)' },
  { key: 'heart',    label: 'Heart rate',        detail: 'Resting heart rate and HRV',        icon: 'heart',   colour: 'var(--recovery)' },
  { key: 'body',     label: 'Body measurements', detail: 'Weight, body fat and lean mass',    icon: 'measure', colour: 'var(--measure)' },
]

const GOALS: Array<{ key: GoalKey; label: string; detail: string; icon: IconName }> = [
  { key: 'energy',      label: 'More energy',    detail: 'Steadier through the day', icon: 'bolt' },
  { key: 'fitness',     label: 'Get fitter',     detail: 'Capacity you can feel',    icon: 'training' },
  { key: 'sleep',       label: 'Sleep better',   detail: 'Longer, more regular',     icon: 'sleep' },
  { key: 'nutrition',   label: 'Eat better',     detail: 'Without counting it all',  icon: 'plate' },
  { key: 'aging',       label: 'Healthy ageing', detail: 'Play the long game',       icon: 'leaf' },
  { key: 'consistency', label: 'Be consistent',  detail: 'Keep the streak going',    icon: 'today' },
]

export function Onboarding() {
  const { state, dispatch, sync } = useStore()
  const [step, setStep] = useState<Step>('welcome')
  const idx = STEPS.indexOf(step)
  const go = (s: Step) => { haptic('selection'); setStep(s) }

  const exploreWithSamples = () => {
    dispatch({ type: 'setDataMode', mode: 'demo' })
    // A sample tour needs a name to greet. It is sample data, labelled as
    // such everywhere it appears, and the person can change it in You.
    if (!state.profile.name.trim()) dispatch({ type: 'setProfile', profile: { name: 'Alex' } })
    dispatch({ type: 'finishOnboarding' })
  }

  return (
    <div className="ob">
      <div className="ob__inner">
        <div className="ob__top">
          {idx > 0 && idx < STEPS.length - 1 ? (
            <button className="icon-btn" aria-label="Go back" onClick={() => go(STEPS[idx - 1])}>
              <Icon name="back" size={20} />
            </button>
          ) : (
            <BrandMark size={34} />
          )}
          <div className="ob__progress" role="progressbar" aria-valuenow={idx + 1}
            aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Setup progress">
            {STEPS.map((s, i) => <span key={s} className={`ob__tick${i <= idx ? ' is-done' : ''}`} />)}
          </div>
          {idx > 0 && idx < STEPS.length - 1 && (
            <button className="btn btn--ghost btn--sm" onClick={exploreWithSamples}>Skip</button>
          )}
        </div>

        {step === 'welcome' && <Welcome onNext={() => go('you')} onSkip={exploreWithSamples} />}
        {step === 'you' && <YouStep onNext={() => go('verify')} />}
        {step === 'verify' && <VerifyStep onNext={() => go('goals')} />}
        {step === 'goals' && <GoalsStep onNext={() => go('connect')} />}
        {step === 'connect' && <ConnectStep onNext={() => go('permissions')} onSkip={() => { dispatch({ type: 'setDataMode', mode: 'demo' }); go('permissions') }} />}
        {step === 'permissions' && <PermissionsStep onNext={() => go('import')} />}
        {step === 'import' && <ImportStep onNext={() => go('summary')} onSync={sync} />}
        {step === 'summary' && <SummaryStep onNext={() => go('insight')} />}
        {step === 'insight' && <InsightStep onNext={() => go('ask')} />}
        {step === 'ask' && <AskStep onNext={() => go('preview')} />}
        {step === 'preview' && <PreviewStep onNext={() => go('celebrate')} />}
        {step === 'celebrate' && <CelebrateStep onNext={() => go('reminders')} />}
        {step === 'reminders' && <RemindersStep onNext={() => go('ready')} />}
        {step === 'ready' && (
          <ReadyStep
            onStart={() => {
              dispatch({ type: 'awardMilestone', id: 'baseline-ready' })
              dispatch({ type: 'finishOnboarding' })
            }}
          />
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- welcome */
function Welcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <>
      <div className="ob__body">
        <div className="ob-hero">
          <AssetImage asset="welcomeHero" alt="" rounded="card" loading="eager" className="ob-art ob-art--wide" />
          <BrandWordmark height={30} />
          <div className="stack stack-4">
            <h1 className="t-hero">Your health,<br />joined up.</h1>
            <p className="t-body dim" style={{ maxWidth: '32ch' }}>
              Jumbo reads the data you already have and shows how sleep, food and movement
              connect. Today, and over years.
            </p>
          </div>
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            <span className="tag">Connect once</span>
            <span className="tag">Nothing to type</span>
            <span className="tag">You stay in charge</span>
          </div>
        </div>
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>
          Get started <Icon name="chevron" size={16} />
        </button>
        <button className="btn btn--ghost btn--block" onClick={onSkip}>Look around with sample data</button>
        <p className="t-caption dim2" style={{ textAlign: 'center' }}>
          Jumbo is a wellness companion, not a medical device.
        </p>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- you */
function YouStep({ onNext }: { onNext: () => void }) {
  const { state, dispatch } = useStore()
  const [touched, setTouched] = useState(false)
  const name = state.profile.name.trim()
  const phone = state.profile.phone.trim()
  const phoneOk = /^\+?[\d\s().-]{7,}$/.test(phone)
  const ready = name.length >= 1 && phoneOk

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">First, who are you?</h1>
          <p className="t-callout dim">Two things, and that is the whole account. Your number is how Jumbo recognises you.</p>
        </div>

        <div className="stack stack-5">
          <div className="field">
            <label className="field__label" htmlFor="ob-name">Your name</label>
            <input
              id="ob-name" className="input input--lg" value={state.profile.name} maxLength={48}
              autoComplete="given-name" placeholder="Sam"
              onChange={(e) => dispatch({ type: 'setProfile', profile: { name: e.target.value } })}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ob-phone">Phone number</label>
            <input
              id="ob-phone" className="input input--lg" type="tel" inputMode="tel"
              autoComplete="tel" placeholder="+44 7700 900123" value={state.profile.phone}
              aria-invalid={touched && !phoneOk}
              aria-describedby="ob-phone-hint"
              onBlur={() => setTouched(true)}
              onChange={(e) => dispatch({ type: 'setProfile', profile: { phone: e.target.value } })}
            />
            {touched && !phoneOk
              ? <span className="field__error">That does not look like a phone number yet.</span>
              : <span className="field__hint" id="ob-phone-hint">Stored on this device. Jumbo does not send it anywhere.</span>}
          </div>
        </div>

        {name && (
          <div className="card card--brand row row--top rise" style={{ gap: 'var(--s-3)' }}>
            <AiOrb size="sm" />
            <p className="t-callout">Good to meet you, {name.split(' ')[0]}. Next, what you would like to improve.</p>
          </div>
        )}
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={!ready}>Continue</button>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- verify */
/**
 * Six-digit verification.
 *
 * There is no SMS provider wired to this build, so Jumbo does not claim to
 * have sent a text. It generates the code on the device and shows it, saying
 * exactly why. The flow — masked number, six boxes, resend timer — is real;
 * only the delivery is missing, and the screen says so.
 */
function VerifyStep({ onNext }: { onNext: () => void }) {
  const { state, dispatch } = useStore()
  const [code, setCode] = useState(() => newCode())
  const [entered, setEntered] = useState<string[]>(Array(6).fill(''))
  const [wrong, setWrong] = useState(false)
  const [seconds, setSeconds] = useState(30)
  const boxes = useRef<Array<HTMLInputElement | null>>([])

  const masked = maskPhone(state.profile.phone)
  const full = entered.join('')

  useEffect(() => {
    if (seconds <= 0) return
    const t = window.setTimeout(() => setSeconds((v) => v - 1), 1000)
    return () => window.clearTimeout(t)
  }, [seconds])

  useEffect(() => { boxes.current[0]?.focus() }, [])

  // Six digits in: check them, and move on when they match.
  useEffect(() => {
    if (full.length < 6) { setWrong(false); return }
    if (full === code) {
      haptic('success')
      dispatch({ type: 'setPhoneVerified', verified: true })
      window.setTimeout(onNext, 320)
    } else {
      haptic('error')
      setWrong(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, code])

  const put = (i: number, value: string) => {
    const digits = value.replace(/\D/g, '')
    if (!digits) {
      setEntered((e) => e.map((c, n) => (n === i ? '' : c)))
      return
    }
    // Pasting the whole code fills every box at once.
    setEntered((e) => {
      const next = [...e]
      for (let n = 0; n < digits.length && i + n < 6; n++) next[i + n] = digits[n]
      return next
    })
    boxes.current[Math.min(5, i + digits.length)]?.focus()
  }

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">Is this number yours?</h1>
          <p className="t-callout dim">
            Enter the six-digit code for <span className="strong">{masked}</span>.
          </p>
        </div>

        <div className="otp" role="group" aria-label="Six digit verification code">
          {entered.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { boxes.current[i] = el }}
              className={`otp__box num${wrong ? ' is-wrong' : ''}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={digit}
              aria-label={`Digit ${i + 1}`}
              aria-invalid={wrong}
              onChange={(e) => put(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !entered[i] && i > 0) boxes.current[i - 1]?.focus()
              }}
            />
          ))}
        </div>

        <p className="t-caption" aria-live="polite" style={{ color: wrong ? 'var(--critical)' : 'var(--ink-3)' }}>
          {wrong ? 'That code does not match. Check it and try again.' : '\u00a0'}
        </p>

        <div className="notice notice--setup" role="note">
          <Icon name="info" size={18} style={{ color: 'var(--caution)', flex: 'none', marginTop: 2 }} />
          <div className="stack stack-1">
            <span className="t-caption strong">No SMS service is connected</span>
            <p className="t-caption dim">
              Jumbo has not sent you a text, and will not pretend it did. Your code is{' '}
              <span className="num strong" style={{ color: 'var(--ink)', letterSpacing: '.14em' }}>{code}</span>.
              Wire an SMS provider to the server and this arrives on your phone instead.
            </p>
          </div>
        </div>

        <button
          className="btn btn--ghost"
          style={{ alignSelf: 'flex-start' }}
          disabled={seconds > 0}
          onClick={() => {
            haptic('selection')
            setCode(newCode()); setEntered(Array(6).fill('')); setWrong(false); setSeconds(30)
            boxes.current[0]?.focus()
          }}
        >
          {seconds > 0 ? `Resend code (0:${String(seconds).padStart(2, '0')})` : 'Resend code'}
        </button>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" disabled={full !== code} onClick={onNext}>
          Verify
        </button>
      </div>
    </>
  )
}

const newCode = () => String(Math.floor(100000 + Math.random() * 900000))

/** Keeps the last two digits, so the person can check it is their number. */
function maskPhone(phone: string) {
  const trimmed = phone.trim()
  if (trimmed.length < 4) return trimmed || 'your number'
  return `${trimmed.slice(0, 3)} ${'•'.repeat(Math.max(2, trimmed.length - 5))} ${trimmed.slice(-2)}`
}

/* ----------------------------------------------------------------- goals */
function GoalsStep({ onNext }: { onNext: () => void }) {
  const { state, dispatch } = useStore()
  const chosen = state.goals

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">What would you like to improve?</h1>
          <p className="t-callout dim">Pick as many as fit. You can change them any time.</p>
        </div>

        <div className="goal-grid">
          {GOALS.map((g) => {
            const on = chosen.includes(g.key)
            return (
              <button
                key={g.key} type="button" className="goal" aria-pressed={on}
                onClick={() => { haptic(on ? 'impactLight' : 'selection'); dispatch({ type: 'toggleGoal', goal: g.key }) }}
              >
                {on && <span className="goal__check pop" aria-hidden="true"><Icon name="check" size={13} strokeWidth={3} /></span>}
                <Icon name={g.icon} size={22} style={{ color: on ? 'var(--accent-text)' : 'var(--ink-3)' }} />
                <span className="t-callout strong goal__title">{g.label}</span>
                <span className="t-caption dim2">{g.detail}</span>
              </button>
            )
          })}
        </div>

        <p className="t-caption dim2" aria-live="polite">
          {chosen.length === 0 ? 'Choose at least one.' : `${chosen.length} selected.`}
        </p>
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={chosen.length === 0}>
          Continue
        </button>
      </div>
    </>
  )
}

/* --------------------------------------------------------------- connect */
const SOURCE_ICON: Record<string, IconName> = {
  apple_health: 'phone', health_connect: 'phone',
  whoop: 'watch', oura: 'ring', fitbit: 'watch', withings: 'scale', garmin: 'watch',
}

function ConnectStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { state } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ id: string; message: string; missing?: string[]; docs?: string; kind: 'setup' | 'error' } | null>(null)
  const bridge = nativeBridge()

  const connectable = state.providers.filter((p) => p.transport === 'oauth' ? p.ready : Boolean(bridge))
  const connected = state.providers.filter((p) => p.connection)

  const connect = async (p: ProviderInfo) => {
    setFailure(null)
    setBusy(p.id)
    if (p.transport === 'native' && bridge) {
      try {
        await bridge.requestPermissions(['sleep', 'steps', 'workouts', 'restingHeartRate', 'hrv', 'weight'])
        celebrate('confirm', false)
        onNext()
      } catch (err) {
        setFailure({ id: p.id, kind: 'error', message: (err as Error).message })
      }
      setBusy(null)
      return
    }
    const r = await api.connect(p.id)
    setBusy(null)
    if (r.ok) window.location.href = r.data.authorizeUrl
    else if (r.kind === 'setup') setFailure({ id: p.id, kind: 'setup', message: r.message, missing: r.missing, docs: r.docs })
    else setFailure({ id: p.id, kind: 'error', message: r.message })
  }

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">Connect what you already use</h1>
          <p className="t-callout dim">
            Jumbo reads history from these and never writes to them. You will see exactly what each
            one shares before anything is imported.
          </p>
        </div>

        {state.serverReachable === false && (
          <UnavailableNotice
            title="Sources can’t be reached right now"
            message="You can carry on with sample data and connect a source later from your profile."
          />
        )}

        <div className="stack stack-3">
          {state.providers.map((p) => {
            const isConnected = Boolean(p.connection)
            const canConnect = p.transport === 'oauth' ? p.ready : Boolean(bridge)
            return (
              <div key={p.id} className="card stack stack-3">
                <div className="row" style={{ gap: 'var(--s-3)' }}>
                  <SourceLogo providerId={p.id} connected={isConnected} fallbackIcon={SOURCE_ICON[p.id] ?? 'link'} />
                  <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="t-callout strong">{p.name}</span>
                    <span className="t-caption dim2">{p.blurb}</span>
                  </div>
                  <button
                    className={`btn btn--sm none ${isConnected ? 'btn--secondary' : canConnect ? 'btn--primary' : 'btn--secondary'}`}
                    disabled={isConnected || busy === p.id || !canConnect}
                    onClick={() => void connect(p)}
                  >
                    {isConnected ? <><Icon name="check" size={14} /> Connected</>
                      : busy === p.id ? <span className="spinner" />
                      : canConnect ? 'Connect' : 'Unavailable'}
                  </button>
                </div>

                {!canConnect && (
                  <p className="t-caption dim2">
                    {p.transport === 'native'
                      ? `${p.reason} You can connect it from the Jumbo app.`
                      : 'Not available to connect in Jumbo yet.'}
                  </p>
                )}
                {failure?.id === p.id && failure.kind === 'setup' && (
                  <UnavailableNotice title="Not available yet" message="This source can’t be connected right now. You can carry on and add it later." compact />
                )}
                {failure?.id === p.id && failure.kind === 'error' && (
                  <ErrorNotice title="That did not work" message={failure.message} />
                )}
              </div>
            )
          })}
        </div>

        <div className="notice" role="note">
          <Icon name="lock" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
          <p className="t-caption dim">
            Imported data stays on this device. You can disconnect any source later and Jumbo stops
            reading from it immediately.
          </p>
        </div>
      </div>

      <div className="ob__foot">
        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={onNext}
          disabled={connected.length === 0}
        >
          {connected.length ? `Import from ${connected.length} ${connected.length === 1 ? 'source' : 'sources'}` : 'Connect a source to continue'}
        </button>
        <button className="btn btn--ghost btn--block" onClick={onSkip}>
          {connectable.length ? 'Not now, explore with sample data' : 'Explore with sample data'}
        </button>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- import */
interface Found { key: string; label: string; icon: IconName; value: string; colour: string }

function ImportStep({ onNext, onSync }: { onNext: () => void; onSync: () => Promise<void> }) {
  const { state } = useStore()
  const [revealed, setRevealed] = useState(0)
  const [started, setStarted] = useState(false)

  const days = state.days
  const found: Found[] = useMemo(() => {
    const w = lastN(days, 28)
    const sleepAvg = w.length ? w.reduce((a, d) => a + d.sleepHours, 0) / w.length : 0
    return [
      { key: 'sleep', label: 'Sleep', icon: 'sleep', colour: 'var(--sleep)',
        value: `${days.length} nights · ${hoursToHM(sleepAvg)} average` },
      { key: 'steps', label: 'Movement', icon: 'steps', colour: 'var(--movement)',
        value: `${Math.round(w.reduce((a, d) => a + d.steps, 0) / Math.max(1, w.length)).toLocaleString()} steps a day` },
      { key: 'training', label: 'Training', icon: 'training', colour: 'var(--training)',
        value: `${days.filter((d) => d.workout).length} sessions found` },
      { key: 'heart', label: 'Heart', icon: 'heart', colour: 'var(--recovery)',
        value: `Resting HR and HRV across ${days.length} days` },
      { key: 'measure', label: 'Measurements', icon: 'measure', colour: 'var(--measure)',
        value: `${state.measurements.length} results` },
    ]
  }, [days, state.measurements.length])

  useEffect(() => {
    if (started) return
    setStarted(true)
    void onSync()
    const timers = found.map((_, i) =>
      window.setTimeout(() => {
        setRevealed((r) => Math.max(r, i + 1))
        haptic('impactLight')
        if (i === found.length - 1) playSound('confirm')
      }, 520 + i * 460),
    )
    return () => timers.forEach(window.clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = revealed >= found.length

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">
            {done
              ? <>Jumbo found <span className="brandy num">{days.length}</span> days of your history</>
              : 'Reading your history…'}
          </h1>
          <p className="t-callout dim">
            {done
              ? 'Six months already in place. Nothing to type.'
              : 'This happens on your device and takes a few seconds.'}
          </p>
        </div>

        <div className="card stack stack-1">
          {found.map((f, i) => {
            const ok = i < revealed
            return (
              <div className="import-row" key={f.key}>
                {ok ? (
                  <span className="import-check pop" aria-hidden="true"><Icon name="check" size={14} strokeWidth={2.6} /></span>
                ) : (
                  <span className="spinner" style={{ width: 26, height: 26 }} aria-hidden="true" />
                )}
                <span style={{ color: ok ? f.colour : 'var(--ink-4)', flex: 'none' }}>
                  <Icon name={f.icon} size={18} motion={ok ? 'active' : 'none'} />
                </span>
                <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="t-callout strong">{f.label}</span>
                  <span className="t-caption dim2 import-count">{ok ? f.value : 'Importing…'}</span>
                </div>
              </div>
            )
          })}
        </div>

        {done && (
          <div className="card stack stack-3 rise">
            <div className="row row--between">
              <span className="t-caption dim">Your sleep, last eight weeks</span>
              {state.dataMode === 'live' ? <ProvenanceTag kind="observed" /> : <span className="tag tag--demo">Sample data</span>}
            </div>
            <Sparkline
              values={lastN(days, 56).map((d) => d.sleepHours)}
              colour="var(--sleep)" width={300} height={48}
              label="Sleep duration over the last eight weeks"
            />
            <p className="t-caption dim2">Already enough to see a pattern. No setup week required.</p>
          </div>
        )}

        <span className="sr-only" role="status" aria-live="polite">
          {done ? 'Import complete.' : `Imported ${revealed} of ${found.length}.`}
        </span>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={!done}>
          {done ? 'Build my baseline' : 'Importing…'}
        </button>
      </div>
    </>
  )
}

/* ----------------------------------------------------------- permissions */
/**
 * What Jumbo will read, before the platform's own prompt appears. Declining
 * is a first-class answer: the app carries on and says which parts are dark.
 */
function PermissionsStep({ onNext }: { onNext: () => void }) {
  const { state, dispatch } = useStore()
  const granted = PERMISSIONS.filter((p) => state.permissions[p.key]).length

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">What Jumbo would like to read.</h1>
          <p className="t-callout dim">
            Turn off anything you would rather keep to yourself. You can change this at any time,
            and Jumbo will tell you what it can no longer see.
          </p>
        </div>

        <ul className="card stack stack-1">
          {PERMISSIONS.map((perm) => (
            <li key={perm.key} className="import-row">
              <span style={{ color: state.permissions[perm.key] ? perm.colour : 'var(--ink-4)', flex: 'none' }}>
                <Icon name={perm.icon} size={20} />
              </span>
              <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                <span className="t-callout strong">{perm.label}</span>
                <span className="t-caption dim2">{perm.detail}</span>
              </div>
              <Switch
                checked={Boolean(state.permissions[perm.key])}
                label={perm.label}
                onChange={(v) => dispatch({ type: 'setPermission', key: perm.key, value: v })}
              />
            </li>
          ))}
        </ul>

        <p className="t-caption dim2" aria-live="polite">
          {granted === 0
            ? 'Nothing selected. Jumbo will still work, with far less to go on.'
            : `${granted} of ${PERMISSIONS.length} allowed.`}
        </p>

        <div className="notice" role="note">
          <Icon name="lock" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
          <p className="t-caption dim">
            Jumbo only ever reads. It never writes back to a health app, and imported records stay
            on this device.
          </p>
        </div>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>Allow access</button>
        <button className="btn btn--ghost btn--block" onClick={() => {
          PERMISSIONS.forEach((perm) => dispatch({ type: 'setPermission', key: perm.key, value: false }))
          onNext()
        }}>
          Not now
        </button>
      </div>
    </>
  )
}

/* --------------------------------------------------------- data summary */
function SummaryStep({ onNext }: { onNext: () => void }) {
  const { state } = useStore()
  const b = state.baseline
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => { setReady(true); haptic('success') }, 1250)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">
            {ready ? 'Jumbo has learned your usual rhythm.' : 'Reading your usual rhythm…'}
          </h1>
          <p className="t-callout dim">
            {ready
              ? `Here is what your last ${b.daysOfHistory} days look like. Your own numbers, not an average of other people.`
              : 'Reading six months of history.'}
          </p>
        </div>

        {!ready ? (
          <div className="stack stack-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}
          </div>
        ) : (
          <div className="stack stack-4 rise">
            <div className="grid grid--2">
              <Tile label="Sleep" value={b.sleepHours.toFixed(1)} unit="h a night" />
              <Tile label="Steps" value={b.steps.toLocaleString()} unit="a day" />
              <Tile label="Resting HR" value={String(b.restingHR)} unit="bpm" />
              <Tile label="Aerobic fitness" value={b.vo2max.toFixed(1)} unit="ml/kg/min" />
            </div>

          </div>
        )}
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={!ready}>
          {ready ? 'See what Jumbo noticed' : 'Just a moment…'}
        </button>
      </div>
    </>
  )
}

/* --------------------------------------------------------- first insight */
function InsightStep({ onNext }: { onNext: () => void }) {
  const { state } = useStore()
  const recent = lastN(state.days, 21)
  const earlier = state.days.slice(-42, -21)
  const avg = (xs: typeof recent) => xs.reduce((a, d) => a + d.sleepHours, 0) / Math.max(1, xs.length)
  const sleepDelta = round(avg(recent) - avg(earlier), 1)
  const rhrDelta = round(
    recent.reduce((a, d) => a + d.restingHR, 0) / Math.max(1, recent.length)
    - earlier.reduce((a, d) => a + d.restingHR, 0) / Math.max(1, earlier.length),
    1,
  )

  useEffect(() => { haptic('success') }, [])

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">Jumbo noticed something.</h1>
          <p className="t-callout dim">
            The first pattern in your own history. Not advice yet — just what is there.
          </p>
        </div>

        <div className="card card--brand stack stack-3 rise">
          <div className="row row--between">
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              <Mascot size={34} />
              <span className="eyebrow">Sleep</span>
            </div>
            <Confidence value={0.62} compact />
          </div>
          <p className="t-body">
            Your sleep has moved {sleepDelta >= 0 ? 'up' : 'down'} by {Math.abs(sleepDelta).toFixed(1)} hours a
            night over the last three weeks, and your resting heart rate has
            {rhrDelta === 0 ? ' held steady' : rhrDelta > 0 ? ` risen ${Math.abs(rhrDelta).toFixed(1)} bpm` : ` fallen ${Math.abs(rhrDelta).toFixed(1)} bpm`} alongside it.
          </p>
          <p className="t-caption dim">
            An association across 42 days of your own data — not a cause. Jumbo will keep watching
            it, and there is nothing to do about it yet.
          </p>
        </div>

        <div className="notice" role="note">
          <Icon name="lock" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
          <p className="t-caption dim">
            Everything Jumbo says carries a confidence and a limitation. When the data cannot
            support a claim, it says so instead of making one.
          </p>
        </div>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>Continue</button>
      </div>
    </>
  )
}

function Tile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card card--quiet stack stack-1" style={{ padding: 'var(--s-4)' }}>
      <span className="t-caption dim">{label}</span>
      <span className="t-title2 num">{value}</span>
      <span className="t-caption dim2">{unit}</span>
    </div>
  )
}

/* ------------------------------------------------------- AI introduction */
function AskStep({ onNext }: { onNext: () => void }) {
  const { state } = useStore()
  const first = state.profile.name.trim().split(' ')[0]

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">Ask Jumbo anything.</h1>
          <p className="t-callout dim">
            Your personal health companion. It answers from your own records, and says so when
            they cannot answer.
          </p>
        </div>

        <div className="ob-hero" style={{ gap: 'var(--s-5)' }}>
          <Mascot size={104} label="Jumbo" />
          <ul className="stack stack-2" style={{ width: '100%' }}>
            {QUICK_PROMPTS.slice(0, 4).map((q) => (
              <li key={q} className="card card--quiet row row--between" style={{ padding: 'var(--s-4)' }}>
                <span className="t-callout">{q}</span>
                <Icon name="chevron" size={15} style={{ color: 'var(--ink-3)', flex: 'none' }} />
              </li>
            ))}
          </ul>
        </div>

        <p className="t-caption dim2">
          {first ? `${first}, these ` : 'These '}are live once setup finishes — every answer is
          generated against your data, never a canned reply.
        </p>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>Continue</button>
      </div>
    </>
  )
}

/* --------------------------------------------------------- future preview */
function PreviewStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">Want to see where your habits lead?</h1>
          <p className="t-callout dim">
            Not a prediction. A way to explore what your current pattern could point towards, and
            what changes when you change one thing.
          </p>
        </div>

        <AssetImage
          asset="futurePath" alt="" rounded="card" loading="eager" className="ob-art ob-art--band"
        />

        <div className="notice" role="note">
          <Icon name="info" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
          <p className="t-caption dim">
            Jumbo models directions, not dates. It says nothing about disease and nothing about how
            long you will live.
          </p>
        </div>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>Explore my future</button>
        <button className="btn btn--ghost btn--block" onClick={onNext}>Maybe later</button>
      </div>
    </>
  )
}

/* ----------------------------------------------------------- celebration */
function CelebrateStep({ onNext }: { onNext: () => void }) {
  const { state } = useStore()
  const first = state.profile.name.trim().split(' ')[0]

  // The one moment in setup that earns confetti, a sound and a haptic.
  useEffect(() => { celebrate('milestone') }, [])

  return (
    <>
      <div className="ob__body">
        <div className="ob-hero" style={{ alignItems: 'center', textAlign: 'center' }}>
          <AssetImage asset="celebration" alt="" rounded="none" loading="eager" className="ob-art ob-art--square" />
          <div className="stack stack-3">
            <h1 className="t-title1">{first ? `You’re all set, ${first}!` : 'You’re all set!'}</h1>
            <p className="t-body dim" style={{ maxWidth: '30ch' }}>
              Your health is connected. Jumbo gets sharper the more you use it.
            </p>
          </div>
        </div>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>
          Set my reminders
        </button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- reminders */
const REMINDER_ROWS: Array<{ key: 'breakfast' | 'lunch' | 'dinner' | 'workout'; label: string; icon: IconName; colour: string }> = [
  { key: 'breakfast', label: 'Breakfast', icon: 'plate',    colour: 'var(--nutrition)' },
  { key: 'lunch',     label: 'Lunch',     icon: 'plate',    colour: 'var(--nutrition)' },
  { key: 'dinner',    label: 'Dinner',    icon: 'plate',    colour: 'var(--nutrition)' },
  { key: 'workout',   label: 'Workout',   icon: 'training', colour: 'var(--training)' },
]

function RemindersStep({ onNext }: { onNext: () => void }) {
  const { state, dispatch } = useStore()
  const r = state.reminders

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">When should Jumbo check in?</h1>
          <p className="t-callout dim">
            Set the moments that matter. Jumbo nudges once and then leaves you alone — it will not
            nag you about one you ignored.
          </p>
        </div>

        <ul className="card stack stack-1">
          {REMINDER_ROWS.map((row) => (
            <li key={row.key} className="import-row">
              <span style={{ color: r[row.key] ? row.colour : 'var(--ink-4)', flex: 'none' }}>
                <Icon name={row.icon} size={20} />
              </span>
              <span className="grow t-callout strong">{row.label}</span>
              <input
                type="time"
                className="input"
                style={{ width: 128, minHeight: 42 }}
                value={r[row.key] || '08:00'}
                aria-label={`${row.label} time`}
                onChange={(e) => dispatch({ type: 'setReminders', patch: { [row.key]: e.target.value } })}
              />
              <Switch
                checked={Boolean(r[row.key])}
                label={`${row.label} reminder`}
                onChange={(on) => dispatch({
                  type: 'setReminders',
                  patch: { [row.key]: on ? (r[row.key] || defaultTime(row.key)) : '' },
                })}
              />
            </li>
          ))}
        </ul>

        <div className="notice" role="note">
          <Icon name="bell" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
          <p className="t-caption dim">
            A browser can only raise a notification while Jumbo is open. In the app they arrive
            whether it is open or not. Either way, you can change these in Profile.
          </p>
        </div>
      </div>

      <div className="ob__foot">
        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={() => {
            void requestNotificationPermission()
            dispatch({ type: 'setReminders', patch: { enabled: true } })
            haptic('success')
            onNext()
          }}
        >
          Set reminders
        </button>
        <button
          className="btn btn--ghost btn--block"
          onClick={() => { dispatch({ type: 'setReminders', patch: { enabled: false } }); onNext() }}
        >
          I’ll do this later
        </button>
      </div>
    </>
  )
}

const defaultTime = (key: string) =>
  key === 'breakfast' ? '08:00' : key === 'lunch' ? '13:00' : key === 'dinner' ? '19:30' : '18:00'

/* ----------------------------------------------------------------- ready */
function ReadyStep({ onStart }: { onStart: () => void }) {
  const { state } = useStore()
  const first = state.profile.name.trim().split(' ')[0]

  // The celebration already fired two screens ago. One flourish per journey.
  useEffect(() => { haptic('success') }, [])

  return (
    <>
      <div className="ob__body">
        <div className="ob-hero" style={{ alignItems: 'center', textAlign: 'center' }}>
          <AssetImage asset="ready" alt="" rounded="none" loading="eager" className="ob-art ob-art--square" />
          <div className="stack stack-3">
            <h1 className="t-title1">Good to go{first ? `, ${first}` : ''}!</h1>
            <p className="t-body dim" style={{ maxWidth: '30ch' }}>
              You’re ready to build a healthier, brighter tomorrow with Jumbo.
            </p>
          </div>
          <ul className="card card--quiet stack stack-3" style={{ width: '100%', textAlign: 'left' }}>
            {[
              ['Account created', true],
              ['Data connected', state.dataMode === 'live' || state.baseline.daysOfHistory > 0],
              ['Goals set', state.goals.length > 0],
              ['Reminders configured', state.reminders.enabled],
            ].map(([label, done]) => (
              <li key={String(label)} className="row" style={{ gap: 'var(--s-3)' }}>
                <span
                  className="import-check"
                  style={{ background: done ? 'var(--brand)' : 'var(--surface-3)', color: done ? 'var(--brand-ink)' : 'var(--ink-3)' }}
                  aria-hidden="true"
                >
                  <Icon name={done ? 'check' : 'minus'} size={14} strokeWidth={2.6} />
                </span>
                <span className="t-callout">{String(label)}</span>
              </li>
            ))}
          </ul>

          <p className="t-caption dim2">
            Next: photograph a meal. It is the one thing your devices cannot see.
          </p>
        </div>
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onStart}>Let’s go</button>
      </div>
    </>
  )
}
