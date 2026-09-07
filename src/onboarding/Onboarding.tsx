import { useEffect, useMemo, useState } from 'react'
import '../styles/onboarding.css'
import { AiOrb, Icon, type IconName } from '../components/Icon'
import { AssetImage, BrandMark, BrandWordmark, SourceLogo } from '../components/Asset'
import { Confidence, ErrorNotice, ProvenanceTag, SetupNotice } from '../components/UI'
import { Sparkline } from '../components/Charts'
import { useStore } from '../state/store'
import { api, type ProviderInfo } from '../lib/api'
import { nativeBridge } from '../lib/native'
import type { GoalKey } from '../data/types'
import { celebrate, haptic, playSound } from '../lib/feedback'
import { lastN } from '../lib/analytics'
import { hoursToHM, round } from '../lib/util'

const STEPS = ['welcome', 'you', 'goals', 'connect', 'import', 'baseline', 'ready'] as const
type Step = (typeof STEPS)[number]

const GOALS: Array<{ key: GoalKey; label: string; detail: string; icon: IconName }> = [
  { key: 'energy',      label: 'More energy',    detail: 'Steadier through the day', icon: 'bolt' },
  { key: 'fitness',     label: 'Get fitter',     detail: 'Capacity you can feel',    icon: 'training' },
  { key: 'sleep',       label: 'Sleep better',   detail: 'Longer, more regular',     icon: 'sleep' },
  { key: 'nutrition',   label: 'Eat better',     detail: 'Without counting it all',  icon: 'plate' },
  { key: 'aging',       label: 'Healthy ageing', detail: 'Play the long game',       icon: 'leaf' },
  { key: 'consistency', label: 'Be consistent',  detail: 'Keep the streak going',    icon: 'today' },
]

export function Onboarding() {
  const { dispatch, sync } = useStore()
  const [step, setStep] = useState<Step>('welcome')
  const idx = STEPS.indexOf(step)
  const go = (s: Step) => { haptic('selection'); setStep(s) }

  const exploreWithSamples = () => {
    dispatch({ type: 'setDataMode', mode: 'demo' })
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
        {step === 'you' && <YouStep onNext={() => go('goals')} />}
        {step === 'goals' && <GoalsStep onNext={() => go('connect')} />}
        {step === 'connect' && <ConnectStep onNext={() => go('import')} onSkip={() => { dispatch({ type: 'setDataMode', mode: 'demo' }); go('import') }} />}
        {step === 'import' && <ImportStep onNext={() => go('baseline')} onSync={sync} />}
        {step === 'baseline' && <BaselineStep onNext={() => go('ready')} />}
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
          <SetupNotice
            title="Jumbo’s API is not running"
            message="Real connections go through Jumbo’s server. Start it with npm run dev:api, or carry on with sample data and connect later."
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
                      : `Needs ${p.missing.join(', ')} on the server.`}
                  </p>
                )}
                {failure?.id === p.id && failure.kind === 'setup' && (
                  <SetupNotice title="Not configured yet" message={failure.message} missing={failure.missing} docs={failure.docs} compact />
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

/* -------------------------------------------------------------- baseline */
function BaselineStep({ onNext }: { onNext: () => void }) {
  const { state } = useStore()
  const b = state.baseline
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => { setReady(true); haptic('success') }, 1250)
    return () => window.clearTimeout(t)
  }, [])

  const recent = lastN(state.days, 21)
  const earlier = state.days.slice(-42, -21)
  const sleepDelta = round(
    recent.reduce((a, d) => a + d.sleepHours, 0) / Math.max(1, recent.length) -
    earlier.reduce((a, d) => a + d.sleepHours, 0) / Math.max(1, earlier.length), 1,
  )

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">{ready ? 'Your baseline' : 'Working out your baseline…'}</h1>
          <p className="t-callout dim">
            {ready
              ? `Built from your own ${b.daysOfHistory} days. Not an average of other people.`
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

            <div className="card card--brand stack stack-3">
              <div className="row row--between">
                <div className="row" style={{ gap: 'var(--s-2)' }}>
                  <AiOrb size="sm" />
                  <span className="eyebrow">First insight</span>
                </div>
                <Confidence value={0.78} compact />
              </div>
              <p className="t-body">
                Your sleep has moved {sleepDelta >= 0 ? 'up' : 'down'} by {Math.abs(sleepDelta).toFixed(1)} hours a
                night over the last three weeks, and your resting heart rate followed it.
              </p>
              <p className="t-caption dim">
                An association across 42 days of your own data. Jumbo will keep watching it. There is
                nothing to do about it yet.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={!ready}>
          {ready ? 'Continue' : 'Just a moment…'}
        </button>
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

/* ----------------------------------------------------------------- ready */
function ReadyStep({ onStart }: { onStart: () => void }) {
  const { state } = useStore()
  const first = state.profile.name.trim().split(' ')[0]

  useEffect(() => { celebrate('milestone') }, [])

  return (
    <>
      <div className="ob__body">
        <div className="ob-hero" style={{ alignItems: 'center', textAlign: 'center' }}>
          <AssetImage asset="ready" alt="" rounded="none" loading="eager" className="ob-art ob-art--square" />
          <div className="stack stack-3">
            <h1 className="t-title1">{first ? `${first}, your baseline is ready` : 'Your baseline is ready'}</h1>
            <p className="t-body dim" style={{ maxWidth: '30ch' }}>
              Six months of history, one personal baseline and a first pattern to watch. That is the
              hard part done.
            </p>
          </div>
          <div className="card card--quiet stack stack-2" style={{ width: '100%', textAlign: 'left' }}>
            <span className="eyebrow">Next</span>
            <p className="t-callout">
              Photograph your next meal. It is the one thing your devices cannot see, and it closes
              the last gap in your picture.
            </p>
          </div>
        </div>
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onStart}>Open Jumbo</button>
      </div>
    </>
  )
}
