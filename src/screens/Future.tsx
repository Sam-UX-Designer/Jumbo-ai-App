import { useEffect, useMemo, useRef, useState } from 'react'
import { AiOrb, Icon } from '../components/Icon'
import { AssetImage, Mascot } from '../components/Asset'
import { DayCurve, ProjectionChart } from '../components/Charts'
import {
  Confidence, Disclosure, Empty, ErrorNotice, ProvenanceTag, ScreenHead,
  SectionHead, Segmented, SetupNotice,
} from '../components/UI'
import { useStore } from '../state/store'
import { useInsights } from '../lib/useInsights'
import { api, type FutureNarrative } from '../lib/api'
import {
  METRIC_META, MONTH_OPTIONS, RELATIONSHIPS, SCENARIOS, energyCurve, leversFromBaseline,
  project, projectPath, type Horizon, type Levers, type ProjMetric, type Projected,
} from '../lib/trajectory'
import { lastN } from '../lib/analytics'
import { clamp, mean, prettyDate, round } from '../lib/util'
import { haptic } from '../lib/feedback'
import type { Insight, InsightDecision } from '../data/types'

const PICK: Record<ProjMetric, (p: Projected) => number> = {
  vo2max: (p) => p.vo2max,
  restingHR: (p) => p.restingHR,
  bodyFatPct: (p) => p.bodyFatPct,
  leanMassKg: (p) => p.leanMassKg,
  recoveryIndex: (p) => p.recoveryIndex,
}

const HORIZON_LABEL: Record<Horizon, string> = { 12: '1 year', 36: '3 years', 60: '5 years' }

export function Future() {
  const { state, dispatch } = useStore()
  const base = state.baseline
  const current = useMemo(() => leversFromBaseline(base), [base])

  const [scenarioId, setScenarioId] = useState('current')
  const [levers, setLevers] = useState<Levers>(state.levers ?? current)
  const [months, setMonths] = useState<Horizon>(12)
  const [tuning, setTuning] = useState(false)

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]
  const activeLevers = scenarioId === 'custom' ? levers : scenario.apply(current)

  const projected = useMemo(() => project(base, activeLevers, months), [base, activeLevers, months])
  const nowState = useMemo(() => project(base, current, 0.0001 as Horizon), [base, current])

  const nowCurve = useMemo(
    () => energyCurve(current.sleepHours, nowState.recoveryIndex),
    [current.sleepHours, nowState.recoveryIndex],
  )
  const futureCurve = useMemo(
    () => energyCurve(activeLevers.sleepHours, projected.recoveryIndex),
    [activeLevers.sleepHours, projected.recoveryIndex],
  )

  const narrative = useNarrative({ base, levers: activeLevers, projection: projected, months, key: `${scenarioId}-${months}` })
  const insights = useInsights()
  const narrativeRef = useRef<HTMLElement>(null)
  const firstName = state.profile.name.trim().split(' ')[0]

  const pickScenario = (id: string) => {
    haptic('selection')
    setScenarioId(id)
    if (id !== 'custom') setLevers(SCENARIOS.find((s) => s.id === id)!.apply(current))
  }

  return (
    <div className="stack stack-14">
      <ScreenHead
        eyebrow="Future"
        title="If this carries on"
        sub="Not a prediction. A picture of what your current pattern points towards, and what changes when you change a habit."
      />

      {/* ────────────────────────────── Jumbo, in the circular area
          reserved for the mascot artwork. Tapping it moves to the
          scenario Jumbo has written. */}
      <section className="stack stack-4">
        <AssetImage
          asset="futurePath" alt="" rounded="card" loading="eager"
          className="future-banner"
        />
        <div className="row row--top" style={{ gap: 'var(--s-4)' }}>
        <Mascot
          size={92}
          thinking={narrative.loading}
          onClick={() => {
            narrativeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            narrativeRef.current?.focus({ preventScroll: true })
          }}
          label={narrative.loading ? 'Jumbo is working on your scenario' : 'Read Jumbo’s scenario'}
        />
        <div className="card card--quiet stack stack-2 grow">
          <p className="t-body">
            {firstName ? `${firstName}, ` : ''}Jumbo has {base.daysOfHistory} days of your history to work
            from. Explore where your current habits could lead.
          </p>
          <p className="t-caption dim2">This is a modelled scenario, not a medical prediction.</p>
        </div>
        </div>
      </section>

      {/* ────────────────────────────── choose a life, and a horizon */}
      <section className="stack stack-4">
        <div className="rail" role="group" aria-label="Choose a scenario">
          {[...SCENARIOS, { id: 'custom', label: 'Tune it yourself', blurb: '', accent: 'var(--brand)' }].map((s) => (
            <button
              key={s.id}
              className="chip"
              aria-pressed={scenarioId === s.id}
              onClick={() => pickScenario(s.id)}
            >
              {s.id !== 'custom' && <span className="dot" style={{ background: s.accent }} />}
              {s.label}
            </button>
          ))}
        </div>

        {scenarioId !== 'custom' && (
          <p className="t-callout dim">{scenario.blurb}</p>
        )}

        <Segmented
          ariaLabel="How far ahead"
          value={months}
          onChange={(v) => { haptic('selection'); setMonths(v as Horizon) }}
          options={MONTH_OPTIONS.map((m) => ({ value: m, label: HORIZON_LABEL[m] }))}
        />
      </section>

      {/* ────────────────────────────── the day it could feel like */}
      <section className="card stack stack-5" ref={narrativeRef} tabIndex={-1}>
        <div className="row row--between row--top">
          <div className="stack stack-1">
            <span className="eyebrow">An ordinary day, in {HORIZON_LABEL[months].toLowerCase()}</span>
            <h2 className="t-title2">{narrative.data?.headline ?? headlineFallback(scenarioId)}</h2>
          </div>
          <AiOrb working={narrative.loading} label={narrative.loading ? 'Jumbo is thinking' : undefined} />
        </div>

        <DayCurve now={nowCurve} projected={futureCurve} accent={scenario.accent === 'var(--ink-2)' ? 'var(--brand)' : scenario.accent} />

        <div className="row row--wrap" style={{ gap: 'var(--s-4)' }}>
          <LegendKey colour={scenario.accent === 'var(--ink-2)' ? 'var(--brand)' : scenario.accent} kind="solid" label="This scenario" />
          <LegendKey colour="var(--ink-3)" kind="dotted" label="How today runs" />
        </div>

        {narrative.loading && (
          <div className="stack stack-2">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 14, width: `${92 - i * 12}%` }} />)}
          </div>
        )}

        {narrative.data && (
          <div className="stack stack-4 rise">
            {narrative.data.lifeStory.map((para, i) => (
              <p key={i} className="t-body" style={{ maxWidth: '46ch' }}>{para}</p>
            ))}

            <div className="card card--quiet stack stack-3">
              <span className="eyebrow">What is doing the work</span>
              <ul className="stack stack-2">
                {narrative.data.whatDrivesIt.map((d) => (
                  <li key={d} className="row row--top" style={{ gap: 'var(--s-2)' }}>
                    <Icon name="chevron" size={13} style={{ color: 'var(--brand)', marginTop: 4, flex: 'none' }} />
                    <span className="t-callout">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
              <Confidence value={narrative.data.confidence} />
              <span className="t-caption dim2">Written by Jumbo’s AI · {narrative.data.model}</span>
            </div>
            <p className="t-caption dim">{narrative.data.honestly}</p>
          </div>
        )}

        {narrative.problem?.kind === 'setup' && (
          <SetupNotice
            title="The written scenario is off"
            message={narrative.problem.message}
            missing={narrative.problem.missing}
            compact
          />
        )}
        {narrative.problem?.kind === 'error' && (
          <ErrorNotice title="Could not write this scenario" message={narrative.problem.message} onRetry={narrative.refresh} />
        )}

        {!narrative.data && !narrative.loading && (
          <p className="t-callout dim" style={{ maxWidth: '46ch' }}>
            {staticStory(scenarioId, projected, nowState, months)}
          </p>
        )}

        <p className="t-caption dim2">
          The curve is an illustration from Jumbo’s model, not a measurement. It shows a direction,
          not a schedule, and it says nothing about disease or life expectancy.
        </p>
      </section>

      {/* ────────────────────────────── the numbers, for those who want them */}
      <section className="section">
        <SectionHead title="The numbers behind it" sub={`Where your baseline could sit in ${HORIZON_LABEL[months].toLowerCase()}.`} />

        <div className="grid grid--2">
          {(Object.keys(METRIC_META) as ProjMetric[]).map((m) => {
            const meta = METRIC_META[m]
            const now = PICK[m](nowState)
            const then = PICK[m](projected)
            const band = projected.band[m as keyof Projected['band']]
            const delta = then - now
            const better = meta.better === 'up' ? delta > 0 : delta < 0
            return (
              <div key={m} className="card card--quiet stack stack-2" style={{ padding: 'var(--s-4)' }}>
                <span className="t-caption dim">{meta.label}</span>
                <div className="row" style={{ alignItems: 'baseline', gap: 5 }}>
                  <span className="t-title2 num">{round(then, 1)}</span>
                  <span className="t-caption dim2">{meta.unit}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span
                    className="t-caption num strong"
                    style={{ color: Math.abs(delta) < 0.15 ? 'var(--ink-3)' : better ? 'var(--positive)' : 'var(--caution)' }}
                  >
                    {delta > 0 ? '+' : ''}{round(delta, 1)}
                  </span>
                  <span className="t-caption dim2">from {round(now, 1)}</span>
                </div>
                <span className="t-caption dim2 num">range {round(then - band, 1)}–{round(then + band, 1)}</span>
              </div>
            )
          })}
        </div>

        <Disclosure summary="See the long trend">
          <TrendPanel base={base} levers={activeLevers} months={months} current={current} days={state.days} />
        </Disclosure>
      </section>

      {/* ────────────────────────────── fine control */}
      <section className="section">
        <SectionHead
          title="Change a habit"
          sub="Each one is a weekly pattern, not a target score."
          action={
            <button className="btn btn--ghost btn--sm" onClick={() => { setTuning((t) => !t); setScenarioId('custom') }}>
              {tuning ? 'Hide' : 'Open'}
            </button>
          }
        />
        {tuning && (
          <div className="card stack stack-6">
            <Lever label="Sleep" unit="h a night" value={levers.sleepHours} baseline={current.sleepHours}
              min={5} max={9.5} step={0.25} dp={2} onChange={(v) => setLevers((l) => ({ ...l, sleepHours: v }))}
              note="Recovery gates how much training turns into adaptation." />
            <Lever label="Easy aerobic work" unit="min a week" value={levers.cardioMinutes} baseline={current.cardioMinutes}
              min={0} max={420} step={15} dp={0} onChange={(v) => setLevers((l) => ({ ...l, cardioMinutes: v }))}
              note="Walking, easy running, cycling, rowing. Anything conversational." />
            <Lever label="Strength sessions" unit="a week" value={levers.strengthSessions} baseline={current.strengthSessions}
              min={0} max={6} step={1} dp={0} onChange={(v) => setLevers((l) => ({ ...l, strengthSessions: v }))}
              note="The model flattens the benefit above about four sessions." />
            <Lever label="Daily steps" unit="steps" value={levers.steps} baseline={current.steps}
              min={2000} max={18000} step={500} dp={0} onChange={(v) => setLevers((l) => ({ ...l, steps: v }))}
              note="Counted separately from structured training." />
            <Lever label="Protein" unit="g per kg" value={levers.proteinPerKg} baseline={current.proteinPerKg}
              min={0.6} max={2.4} step={0.1} dp={1} onChange={(v) => setLevers((l) => ({ ...l, proteinPerKg: v }))}
              note={`About ${Math.round(levers.proteinPerKg * base.weightKg)} g a day at your weight.`} />

            <div className="row" style={{ gap: 'var(--s-3)' }}>
              <button className="btn btn--primary grow" onClick={() => { haptic('success'); dispatch({ type: 'setLevers', levers }) }}>
                Save as my scenario
              </button>
              <button className="btn btn--secondary" onClick={() => { setLevers(current); setScenarioId('current') }}>
                Reset
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ────────────────────────────── what Jumbo noticed */}
      <section className="section">
        <SectionHead
          title="What Jumbo noticed"
          sub={
            insights.engine === 'claude' ? `Read by Jumbo’s AI${insights.model ? ` · ${insights.model}` : ''}`
              : insights.engine === 'on-device' ? 'Computed on this device from your own records'
              : 'Pattern analysis is off in your settings'
          }
        />

        {insights.problem && (
          insights.problem.kind === 'setup'
            ? <SetupNotice title="Jumbo’s AI is not connected" message={insights.problem.message} missing={insights.problem.missing} compact />
            : <ErrorNotice title="Analysis fell back to this device" message={insights.problem.message} onRetry={insights.refresh} />
        )}

        {insights.engine === 'off' ? (
          <Empty icon="lock" title="Nothing is being interpreted" body="Your data is still recorded and visible. Turn pattern analysis on in Profile to let Jumbo look for relationships." />
        ) : insights.insights.length === 0 ? (
          <Empty icon="ai" title="Nothing to flag" body="Your patterns look steady." />
        ) : (
          <ul className="stack stack-5">
            {insights.insights.filter((i) => !state.dismissed.includes(i.id)).map((i) => (
              <InsightCard
                key={i.id}
                insight={i}
                decision={state.decisions[i.id]}
                onDecide={(d) => { haptic('success'); dispatch({ type: 'decide', insightId: i.id, decision: d }) }}
                onDismiss={() => { haptic('impactLight'); dispatch({ type: 'dismissInsight', insightId: i.id }) }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ────────────────────────────── how this is built */}
      <section className="section">
        <SectionHead title="How this is built" />
        <div className="card stack stack-5">
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            <ProvenanceTag kind="observed" />
            <ProvenanceTag kind="evidence" />
            <ProvenanceTag kind="model" />
          </div>
          <div className="stack stack-3">
            <p className="t-callout">
              <span className="strong">Measured:</span> {base.daysOfHistory} days
              {state.dataMode === 'live' ? ' from your connected sources' : ' of sample history'},
              plus {state.measurements.length} point-in-time measurements.
            </p>
            <p className="t-callout"><span className="strong">Evidence-informed:</span> the relationships below. They describe populations, not you.</p>
            <p className="t-callout"><span className="strong">Model estimate:</span> everything after now, including the day curve.</p>
          </div>

          <Disclosure summary="What the model assumes">
            <ul className="stack stack-3">
              {RELATIONSHIPS.map((r) => (
                <li key={r.lever} className="stack stack-1">
                  <div className="row row--between">
                    <span className="t-callout strong">{r.lever}</span>
                    <span className={`tag ${r.strength === 'Well established' ? 'tag--measured' : r.strength === 'Reasonably supported' ? 'tag--evidence' : 'tag--model'}`}>
                      {r.strength}
                    </span>
                  </div>
                  <p className="t-caption dim">{r.effect}</p>
                </li>
              ))}
            </ul>
            <p className="t-caption dim2">
              Not modelled: genetics, medication, illness, injury, stress, alcohol, and everything else
              that shapes a real year. Read the direction, not the decimal.
            </p>
          </Disclosure>

          <div className="notice" role="note">
            <Icon name="info" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
            <p className="t-caption dim">
              If something here worries you, or you are managing a condition, talk it through with a
              clinician. Jumbo is a companion for patterns, not a diagnosis.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------- narrative */
function useNarrative({
  base, levers, projection, months, key,
}: { base: unknown; levers: unknown; projection: unknown; months: Horizon; key: string }) {
  const { state } = useStore()
  const [data, setData] = useState<FutureNarrative | null>(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<{ kind: 'setup' | 'error'; message: string; missing?: string[] } | null>(null)
  const [nonce, setNonce] = useState(0)
  const cache = useRef(new Map<string, FutureNarrative>())

  const configured = Boolean(state.server?.ai.configured)

  useEffect(() => {
    if (!configured) {
      setData(null)
      setProblem({
        kind: 'setup',
        message: 'The written scenario comes from the Claude API. Set ANTHROPIC_API_KEY on the server to turn it on. The model and the chart below work either way.',
        missing: ['ANTHROPIC_API_KEY'],
      })
      return
    }
    const cached = cache.current.get(key)
    if (cached && nonce === 0) { setData(cached); setProblem(null); return }

    let cancelled = false
    setLoading(true)
    setProblem(null)
    void (async () => {
      const r = await api.future({ baseline: base, levers, projection, horizonMonths: months })
      if (cancelled) return
      setLoading(false)
      if (r.ok) {
        cache.current.set(key, r.data)
        setData(r.data)
      } else {
        setData(null)
        setProblem(
          r.kind === 'setup'
            ? { kind: 'setup', message: r.message, missing: r.missing }
            : { kind: 'error', message: r.kind === 'offline' ? 'Jumbo’s API is not reachable.' : r.message },
        )
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, configured, nonce])

  return { data, loading, problem, refresh: () => setNonce((n) => n + 1) }
}

function headlineFallback(scenarioId: string) {
  switch (scenarioId) {
    case 'sleep': return 'Steadier days, built on steadier nights'
    case 'move': return 'More in the tank, most of the time'
    case 'strength': return 'Stronger, and holding onto it'
    case 'custom': return 'Your own combination'
    default: return 'Roughly where you are now'
  }
}

function staticStory(id: string, then: Projected, now: Projected, months: Horizon) {
  const years = months / 12
  const dRec = Math.round(then.recoveryIndex - now.recoveryIndex)
  if (id === 'current') {
    return `Keeping your current pattern for ${years === 1 ? 'a year' : `${years} years`} lands you close to where you are, with the slow drift that time brings. Recovery moves by about ${dRec} points on Jumbo’s index.`
  }
  return `On this pattern, Jumbo’s recovery index moves about ${dRec > 0 ? '+' : ''}${dRec} points over ${years === 1 ? 'a year' : `${years} years`}, and aerobic fitness by ${round(then.vo2max - now.vo2max, 1)}. The written version of this scenario needs Jumbo’s AI turned on.`
}

/* ------------------------------------------------------------ trend panel */
function TrendPanel({
  base, levers, months, current, days,
}: {
  base: ReturnType<typeof useStore>['state']['baseline']
  levers: Levers
  months: Horizon
  current: Levers
  days: ReturnType<typeof useStore>['state']['days']
}) {
  const [metric, setMetric] = useState<ProjMetric>('vo2max')
  const meta = METRIC_META[metric]
  const observed = useMemo(() => observedSeries(days, base, metric), [days, base, metric])
  const projected = useMemo(() => projectPath(base, levers, months, PICK[metric]), [base, levers, months, metric])
  const asIs = useMemo(
    () => projectPath(base, current, months, PICK[metric]).map((p) => ({ month: p.month, value: p.value })),
    [base, current, months, metric],
  )
  const changed = JSON.stringify(levers) !== JSON.stringify(current)

  return (
    <div className="stack stack-4">
      <div className="rail" role="group" aria-label="Choose a metric">
        {(Object.keys(METRIC_META) as ProjMetric[]).map((m) => (
          <button key={m} className="chip" aria-pressed={metric === m} onClick={() => setMetric(m)}>
            <span className="dot" style={{ background: METRIC_META[m].color }} />
            {METRIC_META[m].label}
          </button>
        ))}
      </div>
      <ProjectionChart
        observed={observed.values}
        observedLabels={observed.labels}
        projected={projected}
        compare={changed ? asIs : undefined}
        color={meta.color}
        unit={meta.unit}
      />
      <div className="row row--wrap" style={{ gap: 'var(--s-4)' }}>
        <LegendKey colour={meta.color} kind="solid" label="Measured" />
        <LegendKey colour={meta.color} kind="dashed" label="Modelled" />
        <LegendKey colour={meta.color} kind="band" label="Plausible range" />
        {changed && <LegendKey colour="var(--ink-3)" kind="dotted" label="Today’s pattern" />}
      </div>
    </div>
  )
}

function observedSeries(
  days: ReturnType<typeof useStore>['state']['days'],
  base: ReturnType<typeof useStore>['state']['baseline'],
  metric: ProjMetric,
) {
  const window = lastN(days, 84)
  const buckets: number[] = []
  const labels: string[] = []
  for (let i = 0; i < window.length; i += 7) {
    const chunk = window.slice(i, i + 7)
    if (chunk.length < 3) continue
    labels.push(prettyDate(chunk[0].date))
    switch (metric) {
      case 'restingHR': buckets.push(mean(chunk.map((d) => d.restingHR))); break
      case 'bodyFatPct': buckets.push(mean(chunk.map((d) => d.bodyFatPct))); break
      case 'leanMassKg': buckets.push(mean(chunk.map((d) => d.weightKg * (1 - d.bodyFatPct / 100)))); break
      case 'recoveryIndex':
        buckets.push(mean(chunk.map((d) => clamp(46 + (d.hrv - base.hrv) * 0.9 + (d.sleepHours - 6.8) * 8, 5, 98))))
        break
      default: {
        const t = i / Math.max(1, window.length - 7)
        buckets.push(base.vo2max - (1 - t) * 1.6 + mean(chunk.map((d) => d.hrv - base.hrv)) * 0.02)
      }
    }
  }
  return { values: buckets.map((v) => round(v, 2)), labels }
}

/* ----------------------------------------------------------------- lever */
function Lever({
  label, unit, value, baseline, min, max, step, dp, onChange, note,
}: {
  label: string; unit: string; value: number; baseline: number
  min: number; max: number; step: number; dp: number
  onChange: (v: number) => void; note: string
}) {
  const diff = round(value - baseline, dp)
  const id = `lever-${label.replace(/\s+/g, '-').toLowerCase()}`
  const show = (v: number) => (dp ? String(Number(v.toFixed(dp))) : Math.round(v).toLocaleString())
  return (
    <div className="stack stack-2">
      <div className="row row--between">
        <label className="t-callout strong" htmlFor={id}>{label}</label>
        <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
          <span className="t-title3 num">{show(value)}</span>
          <span className="t-caption dim">{unit}</span>
        </div>
      </div>
      <input id={id} className="slider" type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} aria-describedby={`${id}-note`} />
      <div className="row row--between">
        <span className="t-caption dim2" id={`${id}-note`}>{note}</span>
        {Math.abs(diff) > 0.001 && (
          <span className="t-caption num dim none" style={{ fontWeight: 620 }}>
            {diff > 0 ? '+' : ''}{show(diff)} vs today
          </span>
        )}
      </div>
    </div>
  )
}

function LegendKey({ colour, kind, label }: { colour: string; kind: 'solid' | 'dashed' | 'dotted' | 'band'; label: string }) {
  return (
    <span className="row t-caption dim" style={{ gap: 6 }}>
      <svg width="22" height="10" aria-hidden="true">
        {kind === 'band'
          ? <rect x="0" y="2" width="22" height="6" rx="2" fill={colour} opacity={0.24} />
          : <line x1="0" y1="5" x2="22" y2="5" stroke={colour} strokeWidth="2.4" strokeLinecap="round"
              strokeDasharray={kind === 'dashed' ? '5 4' : kind === 'dotted' ? '2 3' : undefined} />}
      </svg>
      {label}
    </span>
  )
}

/* --------------------------------------------------------- insight card */
const DOMAIN_COLOUR: Record<Insight['domain'], string> = {
  sleep: 'var(--sleep)', movement: 'var(--movement)', nutrition: 'var(--nutrition)',
  recovery: 'var(--recovery)', body: 'var(--training)',
}

function InsightCard({
  insight, decision, onDecide, onDismiss,
}: {
  insight: Insight
  decision?: InsightDecision
  onDecide: (d: InsightDecision) => void
  onDismiss: () => void
}) {
  const colour = DOMAIN_COLOUR[insight.domain] ?? 'var(--brand)'
  const [open, setOpen] = useState(false)

  return (
    <li className="card stack stack-4" style={{ borderLeft: `3px solid ${colour}` }}>
      {/* The claim and how sure Jumbo is, always visible. */}
      <button
        className="stack stack-3"
        style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
        aria-expanded={open}
        onClick={() => { haptic('selection'); setOpen((o) => !o) }}
      >
        <div className="row row--between">
          <span className="eyebrow" style={{ color: colour }}>{insight.domain}</span>
          <span className="t-caption dim2">{insight.window}</span>
        </div>
        <p className="t-body">{insight.changed}</p>
        <div className="row row--between">
          <Confidence value={insight.confidence} compact />
          <span className="row t-caption strong brandy" style={{ gap: 4 }}>
            {open ? 'Less' : 'Why it matters'}
            <Icon name="chevron" size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--d-fast)' }} />
          </span>
        </div>
      </button>

      {!open ? null : (
      <>
      <div className="stack stack-1">
        <span className="eyebrow">Why it matters</span>
        <p className="t-callout dim">{insight.why}</p>
      </div>

      <div className="card card--quiet stack stack-3">
        <span className="eyebrow">Evidence</span>
        <ul className="stack stack-2">
          {insight.evidence.map((e) => (
            <li key={e} className="row row--top" style={{ gap: 'var(--s-2)' }}>
              <span className="dot" style={{ background: colour, marginTop: 7 }} />
              <span className="t-caption">{e}</span>
            </li>
          ))}
        </ul>
        <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
          <ProvenanceTag kind="observed" />
          <ProvenanceTag kind="evidence" />
        </div>
        <Disclosure summary="What this cannot tell you">
          <p className="t-caption dim">{insight.limitation}</p>
        </Disclosure>
      </div>

      <div className="stack stack-2">
        <span className="eyebrow">What you could do</span>
        <ul className="stack stack-2">
          {insight.options.map((o) => (
            <li key={o} className="row row--top" style={{ gap: 'var(--s-2)' }}>
              <Icon name="chevron" size={13} style={{ color: 'var(--ink-3)', marginTop: 4, flex: 'none' }} />
              <span className="t-callout">{o}</span>
            </li>
          ))}
        </ul>
      </div>

      </>
      )}

      <div className="stack stack-3">
        <hr className="hairline" />
        {decision ? (
          <div className="row row--between">
            <span className="row t-callout" style={{ gap: 'var(--s-2)' }}>
              <Icon name="check" size={16} style={{ color: 'var(--positive)' }} />
              {decision === 'trying' ? 'You’re trying this' : decision === 'saved' ? 'Saved for later' : 'Parked for now'}
            </span>
            <button className="btn btn--ghost btn--sm" onClick={() => onDecide('trying')}>Change</button>
          </div>
        ) : (
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            <button className="btn btn--primary btn--sm" onClick={() => onDecide('trying')}>I’ll try this</button>
            <button className="btn btn--secondary btn--sm" onClick={() => onDecide('saved')}>Save for later</button>
            <button className="btn btn--ghost btn--sm" onClick={() => onDecide('not-now')}>Not now</button>
            <button className="btn btn--ghost btn--sm" onClick={onDismiss} style={{ marginLeft: 'auto' }}>Hide</button>
          </div>
        )}
      </div>
    </li>
  )
}
