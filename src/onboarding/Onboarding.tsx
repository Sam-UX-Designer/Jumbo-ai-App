import { useEffect, useMemo, useState } from 'react'
import '../styles/onboarding.css'
import { Icon, type IconName } from '../components/Icon'
import { Confidence, ProvenanceTag, Stepper } from '../components/UI'
import { Sparkline } from '../components/Charts'
import { useStore } from '../state/store'
import { SOURCES, METRIC_LABEL, METRIC_DETAIL, ALL_METRICS } from '../data/sources'
import type { GoalKey, MetricKey } from '../data/types'
import { haptic } from '../lib/haptics'
import { lastN } from '../lib/analytics'
import { hoursToHM, round } from '../lib/util'

const STEPS = ['welcome', 'goal', 'connect', 'import', 'gaps', 'baseline', 'win'] as const
type Step = (typeof STEPS)[number]

const GOALS: Array<{ key: GoalKey; label: string; detail: string; icon: IconName }> = [
  { key: 'energy',      label: 'More energy',    detail: 'Feel steadier through the day', icon: 'bolt' },
  { key: 'fitness',     label: 'Get fitter',     detail: 'Build capacity you can feel',   icon: 'dumbbell' },
  { key: 'sleep',       label: 'Sleep better',   detail: 'Longer, more regular nights',   icon: 'sleep' },
  { key: 'nutrition',   label: 'Eat better',     detail: 'Without counting everything',   icon: 'plate' },
  { key: 'aging',       label: 'Healthy ageing', detail: 'Play the long game',            icon: 'leaf' },
  { key: 'consistency', label: 'Be consistent',  detail: 'Keep the streak that matters',  icon: 'today' },
]

const SOURCE_ICON: Record<string, IconName> = {
  health: 'phone', ring: 'ring', watch: 'watch', scale: 'scale', lab: 'lab',
}

export function Onboarding() {
  const { state, dispatch } = useStore()
  const [step, setStep] = useState<Step>('welcome')
  const [goal, setGoal] = useState<GoalKey | null>(state.goal)
  const [customGoal, setCustomGoal] = useState(state.customGoal)
  const [picked, setPicked] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState<MetricKey[]>([])

  const idx = STEPS.indexOf(step)
  const go = (s: Step) => { haptic('select'); setStep(s) }

  const covered = useMemo(() => {
    const set = new Set<MetricKey>()
    picked.forEach((id) => SOURCES.find((s) => s.id === id)?.provides.forEach((m) => set.add(m)))
    return set
  }, [picked])

  const gaps = ALL_METRICS.filter((m) => !covered.has(m))

  /** Skipping is always available and never punished — it connects the phone
   *  source so the app is explorable immediately with sample data. */
  const skipToApp = () => {
    dispatch({ type: 'setGoal', goal: goal ?? 'energy', custom: customGoal })
    dispatch({ type: 'connect', sourceId: 'health' })
    dispatch({ type: 'finishOnboarding', sampleMode: true })
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
            <span className="mark" aria-hidden="true">J</span>
          )}
          <div className="ob__progress" role="progressbar" aria-valuenow={idx + 1}
            aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Setup progress">
            {STEPS.map((s, i) => <span key={s} className={`ob__tick${i <= idx ? ' is-done' : ''}`} />)}
          </div>
          {idx > 0 && idx < STEPS.length - 1 && (
            <button className="btn btn--ghost btn--sm" onClick={skipToApp}>Skip</button>
          )}
        </div>

        {step === 'welcome' && <Welcome onNext={() => go('goal')} onSkip={skipToApp} />}

        {step === 'goal' && (
          <GoalStep
            goal={goal} custom={customGoal}
            onPick={(g) => { haptic('select'); setGoal(g) }}
            onCustom={setCustomGoal}
            onNext={() => {
              dispatch({ type: 'setGoal', goal: goal ?? 'energy', custom: customGoal })
              go('connect')
            }}
          />
        )}

        {step === 'connect' && (
          <ConnectStep
            picked={picked}
            onToggle={(id) => {
              haptic('select')
              setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
            }}
            onNext={() => {
              picked.forEach((id) => dispatch({ type: 'connect', sourceId: id }))
              setImporting(true)
              go('import')
            }}
          />
        )}

        {step === 'import' && (
          <ImportStep
            metrics={[...covered]}
            running={importing}
            done={importDone}
            onProgress={(m) => setImportDone((d) => (d.includes(m) ? d : [...d, m]))}
            onComplete={() => { setImporting(false); haptic('success') }}
            onNext={() => go('gaps')}
          />
        )}

        {step === 'gaps' && (
          <GapsStep
            gaps={gaps}
            onNext={() => go('baseline')}
          />
        )}

        {step === 'baseline' && <BaselineStep onNext={() => { haptic('milestone'); go('win') }} />}

        {step === 'win' && (
          <WinStep
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

/* ---------------------------------------------------------------- Welcome */
function Welcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <>
      <div className="ob__body">
        <div className="ob-hero">
          <div className="ob-orb" aria-hidden="true">J</div>
          <div className="stack stack-4">
            <h1 className="t-display">Your health,<br />finally joined up.</h1>
            <p className="t-body dim" style={{ maxWidth: '34ch' }}>
              Jumbo reads the data you already have and shows you how sleep, food and
              movement connect — today, and over years.
            </p>
          </div>
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            <span className="tag">One-tap connect</span>
            <span className="tag">Nothing to type</span>
            <span className="tag">You stay in charge</span>
          </div>
        </div>
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>
          Get started
          <Icon name="chevron" size={16} />
        </button>
        <button className="btn btn--ghost btn--block" onClick={onSkip}>
          Look around with sample data first
        </button>
        <p className="t-caption dim2" style={{ textAlign: 'center' }}>
          Jumbo is a wellness companion, not a medical device.
        </p>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- Goal */
function GoalStep({
  goal, custom, onPick, onCustom, onNext,
}: {
  goal: GoalKey | null
  custom: string
  onPick: (g: GoalKey) => void
  onCustom: (v: string) => void
  onNext: () => void
}) {
  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">What would you like to improve?</h1>
          <p className="t-callout dim">Pick one. You can change it any time, and it only shapes what Jumbo shows you first.</p>
        </div>

        <div className="goal-grid">
          {GOALS.map((g) => (
            <button
              key={g.key} type="button" className="goal" aria-pressed={goal === g.key}
              onClick={() => onPick(g.key)}
            >
              <Icon name={g.icon} size={22} className="goal__icon" />
              <span className="t-callout strong goal__title">{g.label}</span>
              <span className="t-caption dim2">{g.detail}</span>
            </button>
          ))}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="custom-goal">Something else? (optional)</label>
          <input
            id="custom-goal" className="input" value={custom} maxLength={80}
            placeholder="e.g. run a half marathon without breaking down"
            onChange={(e) => { onCustom(e.target.value); if (e.target.value) onPick('custom') }}
          />
        </div>
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={!goal}>
          Continue
        </button>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Connect */
function ConnectStep({
  picked, onToggle, onNext,
}: { picked: string[]; onToggle: (id: string) => void; onNext: () => void }) {
  const [expanded, setExpanded] = useState<string | null>('health')

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">Connect what you already use</h1>
          <p className="t-callout dim">
            Jumbo reads history from these — it never writes to them. You will see exactly what
            each one contributes before anything is imported.
          </p>
        </div>

        <div className="stack stack-3">
          {SOURCES.map((s) => {
            const on = picked.includes(s.id)
            const open = expanded === s.id
            return (
              <div key={s.id} className={`src${on ? ' is-on' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-3)' }}>
                <div className="row" style={{ gap: 'var(--s-3)' }}>
                  <span className="src__badge" aria-hidden="true"><Icon name={SOURCE_ICON[s.id]} size={20} /></span>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="t-callout strong">{s.name}</span>
                    <span className="t-caption dim2">{s.vendor}</span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn--sm ${on ? 'btn--secondary' : 'btn--primary'}`}
                    onClick={() => onToggle(s.id)}
                    aria-pressed={on}
                  >
                    {on ? <><Icon name="check" size={14} /> Connected</> : 'Connect'}
                  </button>
                </div>

                <button
                  type="button" className="btn btn--ghost btn--sm"
                  style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : s.id)}
                >
                  <Icon name="chevron" size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--d-fast)' }} />
                  What this shares
                </button>

                {open && (
                  <div className="stack stack-2" style={{ paddingLeft: 2 }}>
                    <p className="t-caption dim">{s.blurb}</p>
                    <ul className="stack stack-1">
                      {s.provides.map((m) => (
                        <li key={m} className="row" style={{ gap: 'var(--s-2)', alignItems: 'flex-start' }}>
                          <Icon name="check" size={14} style={{ color: 'var(--accent)', marginTop: 3, flex: 'none' }} />
                          <span className="t-caption">
                            <span className="strong">{METRIC_LABEL[m]}</span>
                            <span className="dim2"> — {METRIC_DETAIL[m]}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="card card--quiet row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
          <Icon name="lock" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
          <p className="t-caption dim">
            Imported data stays on this device by default. You can disconnect any source later and
            choose whether its history stays or goes.
          </p>
        </div>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={!picked.length}>
          {picked.length ? `Import from ${picked.length} ${picked.length === 1 ? 'source' : 'sources'}` : 'Choose at least one'}
        </button>
      </div>
    </>
  )
}

/* ----------------------------------------------------------------- Import */
function ImportStep({
  metrics, running, done, onProgress, onComplete, onNext,
}: {
  metrics: MetricKey[]
  running: boolean
  done: MetricKey[]
  onProgress: (m: MetricKey) => void
  onComplete: () => void
  onNext: () => void
}) {
  const { state } = useStore()
  const days = state.days

  useEffect(() => {
    if (!running) return
    const timers = metrics.map((m, i) =>
      window.setTimeout(() => {
        onProgress(m)
        if (i === metrics.length - 1) onComplete()
      }, 420 + i * 380),
    )
    return () => timers.forEach(window.clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const finished = done.length >= metrics.length
  const window28 = lastN(days, 28)

  const summary: Record<MetricKey, string> = {
    sleep: `${window28.length} nights · ${hoursToHM(window28.reduce((a, d) => a + d.sleepHours, 0) / window28.length)} average`,
    steps: `${days.length} days · ${Math.round(window28.reduce((a, d) => a + d.steps, 0) / window28.length).toLocaleString()} a day`,
    workouts: `${days.filter((d) => d.workout).length} sessions found`,
    heart: `Resting HR and HRV · ${days.length} days`,
    body: `${days.length} weigh-ins · 2 DEXA scans · 2 blood panels`,
    nutrition: 'Not available from these sources',
  }

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">{finished ? 'Here’s what we found' : 'Reading your history…'}</h1>
          <p className="t-callout dim">
            {finished
              ? `Six months of your own data, already in place. Nothing to type.`
              : 'This happens on your device. It usually takes a few seconds.'}
          </p>
        </div>

        <div className="card stack stack-1" style={{ padding: 'var(--s-4) var(--s-5)' }}>
          {metrics.map((m) => {
            const ok = done.includes(m)
            return (
              <div className="import-row" key={m}>
                {ok ? (
                  <span className="import-check pop" aria-hidden="true"><Icon name="check" size={14} strokeWidth={2.4} /></span>
                ) : (
                  <span className="spinner" style={{ width: 24, height: 24 }} aria-hidden="true" />
                )}
                <div className="grow stack" style={{ gap: 1 }}>
                  <span className="t-callout strong">{METRIC_LABEL[m]}</span>
                  <span className="t-caption dim2">{ok ? summary[m] : 'Importing…'}</span>
                </div>
              </div>
            )
          })}
        </div>

        {finished && (
          <div className="card stack stack-3 rise">
            <div className="row row--between">
              <span className="t-caption dim">Your sleep, last 8 weeks</span>
              <ProvenanceTag kind="observed" />
            </div>
            <Sparkline
              values={lastN(days, 56).map((d) => d.sleepHours)}
              color="var(--sleep)" width={280} height={44}
              label="Sleep duration over the last eight weeks"
            />
            <p className="t-caption dim2">
              Already enough to see a pattern — no setup week required.
            </p>
          </div>
        )}

        <span className="sr-only" role="status" aria-live="polite">
          {finished ? 'Import complete.' : `Imported ${done.length} of ${metrics.length}.`}
        </span>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext} disabled={!finished}>
          {finished ? 'Continue' : 'Importing…'}
        </button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- Gaps */
function GapsStep({ gaps, onNext }: { gaps: MetricKey[]; onNext: () => void }) {
  const { state, dispatch } = useStore()
  const [waist, setWaist] = useState(state.manualGapValues.waist ?? 84)

  if (!gaps.length) {
    return (
      <>
        <div className="ob__body">
          <div className="stack stack-3">
            <h1 className="t-title1">Nothing missing</h1>
            <p className="t-callout dim">Your sources cover everything Jumbo uses. You can add more detail any time from Capture.</p>
          </div>
        </div>
        <div className="ob__foot">
          <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>Continue</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">One gap to fill</h1>
          <p className="t-callout dim">
            Your sources cover everything except {gaps.map((g) => METRIC_LABEL[g].toLowerCase()).join(' and ')}.
            Nothing here is required — Jumbo works without it, just with wider uncertainty.
          </p>
        </div>

        {gaps.includes('nutrition') && (
          <div className="card stack stack-4">
            <div className="row" style={{ gap: 'var(--s-3)' }}>
              <span className="src__badge" aria-hidden="true"><Icon name="camera" size={20} /></span>
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="t-callout strong">Meals — take a photo instead</span>
                <span className="t-caption dim2">Jumbo proposes the items, you correct them. About five seconds a meal.</span>
              </div>
            </div>
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              <span className="tag tag--observed">Camera</span>
              <span className="tag">Manual entry</span>
              <span className="tag">Import from another app</span>
            </div>
            <p className="t-caption dim2">You’ll set this up in a moment — it lives in Capture.</p>
          </div>
        )}

        <div className="card stack stack-4">
          <div className="stack stack-1">
            <span className="t-callout strong">Waist measurement (optional)</span>
            <span className="t-caption dim2">
              A tape measure adds a body-composition signal your scale can’t see. Skip it if you’d rather not.
            </span>
          </div>
          <div className="row row--between">
            <Stepper value={waist} onChange={setWaist} min={50} max={160} unit="cm" label="waist measurement" />
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => { haptic('success'); dispatch({ type: 'setGapValue', key: 'waist', value: waist }) }}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onNext}>Continue</button>
        <button className="btn btn--ghost btn--block" onClick={onNext}>Skip for now</button>
      </div>
    </>
  )
}

/* --------------------------------------------------------------- Baseline */
function BaselineStep({ onNext }: { onNext: () => void }) {
  const { state } = useStore()
  const b = state.baseline
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 1300)
    return () => window.clearTimeout(t)
  }, [])

  const recent = lastN(state.days, 21)
  const earlier = state.days.slice(-42, -21)
  const sleepDelta = round(
    recent.reduce((a, d) => a + d.sleepHours, 0) / recent.length -
    earlier.reduce((a, d) => a + d.sleepHours, 0) / earlier.length, 1,
  )

  return (
    <>
      <div className="ob__body">
        <div className="stack stack-3">
          <h1 className="t-title1">{ready ? 'Your baseline' : 'Working out your baseline…'}</h1>
          <p className="t-callout dim">
            {ready
              ? `Built from your own ${b.daysOfHistory} days — not an average of other people.`
              : 'Reading six months of history.'}
          </p>
        </div>

        {!ready ? (
          <div className="stack stack-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
          </div>
        ) : (
          <div className="stack stack-4 rise">
            <div className="grid grid--2">
              <BaseTile label="Sleep"      value={b.sleepHours.toFixed(1)} unit="h a night" />
              <BaseTile label="Steps"      value={b.steps.toLocaleString()} unit="a day" />
              <BaseTile label="Resting HR" value={String(b.restingHR)} unit="bpm" />
              <BaseTile label="VO₂ max"    value={b.vo2max.toFixed(1)} unit="ml/kg/min" />
            </div>

            <div className="card stack stack-3">
              <div className="row row--between">
                <span className="eyebrow">First insight</span>
                <Confidence value={0.78} compact />
              </div>
              <p className="t-body">
                Your sleep has moved {sleepDelta >= 0 ? 'up' : 'down'} by {Math.abs(sleepDelta).toFixed(1)} hours
                a night over the last three weeks, and your resting heart rate followed it.
              </p>
              <p className="t-caption dim">
                An association in your own data across 42 days. Jumbo will keep watching it — you don’t
                need to do anything with this yet.
              </p>
              <div className="row" style={{ gap: 'var(--s-2)' }}>
                <ProvenanceTag kind="observed" />
                <ProvenanceTag kind="evidence" />
              </div>
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

function BaseTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card card--quiet stack stack-1" style={{ padding: 'var(--s-4)' }}>
      <span className="t-caption dim">{label}</span>
      <span className="t-title2 num">{value}</span>
      <span className="t-caption dim2">{unit}</span>
    </div>
  )
}

/* -------------------------------------------------------------- First win */
function WinStep({ onStart }: { onStart: () => void }) {
  useEffect(() => { haptic('milestone') }, [])
  return (
    <>
      <div className="ob__body">
        <div className="ob-hero" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="win-badge" aria-hidden="true"><Icon name="check" size={44} strokeWidth={2.2} /></div>
          <div className="stack stack-3">
            <h1 className="t-title1">Your Jumbo baseline is ready</h1>
            <p className="t-body dim" style={{ maxWidth: '32ch' }}>
              Six months of history, one personal baseline, and a first pattern to watch.
              That’s the hard part done.
            </p>
          </div>
          <div className="card card--quiet stack stack-2" style={{ width: '100%', textAlign: 'left' }}>
            <span className="eyebrow">Next</span>
            <p className="t-callout">
              Photograph your next meal. It’s the one thing your devices can’t see — and it
              closes the last gap in your picture.
            </p>
          </div>
        </div>
      </div>
      <div className="ob__foot">
        <button className="btn btn--primary btn--lg btn--block" onClick={onStart}>
          Open Jumbo
        </button>
      </div>
    </>
  )
}
