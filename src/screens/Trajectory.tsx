import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { ProjectionChart } from '../components/Charts'
import { Disclosure, ProvenanceTag, ScreenHead, Segmented, SectionHead } from '../components/UI'
import { useStore } from '../state/store'
import {
  METRIC_META, MONTH_OPTIONS, RELATIONSHIPS, leversFromBaseline, project, projectPath,
  type Horizon, type Levers, type ProjMetric, type Projected,
} from '../lib/trajectory'
import { lastN } from '../lib/analytics'
import { clamp, mean, prettyDate, round } from '../lib/util'
import { haptic } from '../lib/haptics'

const PICK: Record<ProjMetric, (p: Projected) => number> = {
  vo2max: (p) => p.vo2max,
  restingHR: (p) => p.restingHR,
  bodyFatPct: (p) => p.bodyFatPct,
  leanMassKg: (p) => p.leanMassKg,
  recoveryIndex: (p) => p.recoveryIndex,
}

export function Trajectory() {
  const { state, dispatch } = useStore()
  const base = state.baseline
  const current = useMemo(() => leversFromBaseline(base), [base])
  const [levers, setLevers] = useState<Levers>(state.levers ?? current)
  const [metric, setMetric] = useState<ProjMetric>('vo2max')
  const [months, setMonths] = useState<Horizon>(12)

  const changed = JSON.stringify(levers) !== JSON.stringify(current)
  const meta = METRIC_META[metric]

  const observed = useMemo(() => observedSeries(state.days, base, metric), [state.days, base, metric])
  const projected = useMemo(() => projectPath(base, levers, months, PICK[metric]), [base, levers, months, metric])
  const asIs = useMemo(
    () => projectPath(base, current, months, PICK[metric]).map((p) => ({ month: p.month, value: p.value })),
    [base, current, months, metric],
  )

  const now = PICK[metric](project(base, current, 0.0001 as Horizon))
  const end = projected[projected.length - 1]
  const endAsIs = asIs[asIs.length - 1]
  const delta = end.value - now
  const better = meta.better === 'up' ? delta > 0 : delta < 0

  const update = (patch: Partial<Levers>) => setLevers((l) => ({ ...l, ...patch }))

  const save = () => {
    haptic('success')
    dispatch({ type: 'setLevers', levers })
  }

  const reset = () => {
    haptic('select')
    setLevers(current)
  }

  return (
    <div className="stack stack-10">
      <ScreenHead
        eyebrow="Trajectory"
        title="If this pattern continues"
        sub="Your own history on the left, a modelled path on the right. Change a habit below and the path moves."
      />

      {/* ------------------------------------------------ Metric + horizon */}
      <div className="stack stack-4">
        <div className="rail" role="group" aria-label="Choose a metric">
          {(Object.keys(METRIC_META) as ProjMetric[]).map((m) => (
            <button
              key={m} className="chip" aria-pressed={metric === m}
              onClick={() => { haptic('select'); setMetric(m) }}
            >
              <span className="dot" style={{ background: METRIC_META[m].color }} />
              {METRIC_META[m].label}
            </button>
          ))}
        </div>

        <div className="row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
          <Segmented
            ariaLabel="Projection horizon"
            value={months}
            onChange={(v) => { haptic('select'); setMonths(v as Horizon) }}
            options={MONTH_OPTIONS.map((m) => ({ value: m, label: `${m} months` }))}
          />
          {changed && (
            <button className="btn btn--ghost btn--sm" onClick={reset}>
              <Icon name="sync" size={14} /> Back to today’s pattern
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ The chart */}
      <section className="card stack stack-5" aria-labelledby="proj-head">
        <div className="row row--between" style={{ alignItems: 'flex-start' }}>
          <div className="stack stack-1">
            <h2 className="t-caption dim" id="proj-head">{meta.label} in {months} months</h2>
            <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
              <span className="t-display num" style={{ fontSize: '2.25rem' }}>{round(end.value, 1)}</span>
              <span className="t-callout dim">{meta.unit}</span>
            </div>
            <span className="t-caption dim2 num">
              plausible range {round(end.lo, 1)}–{round(end.hi, 1)} {meta.unit}
            </span>
          </div>
          <div className="stack stack-1" style={{ alignItems: 'flex-end' }}>
            <span className="t-caption dim">from {round(now, 1)} today</span>
            <span
              className="t-title3 num"
              style={{ color: better ? 'var(--positive)' : Math.abs(delta) < 0.15 ? 'var(--ink-2)' : 'var(--caution)' }}
            >
              {delta > 0 ? '+' : ''}{round(delta, 1)}
            </span>
          </div>
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
          <LegendKey color={meta.color} kind="solid" label="Measured so far" />
          <LegendKey color={meta.color} kind="dashed" label="Modelled path" />
          <LegendKey color={meta.color} kind="band" label="Plausible range" />
          {changed && <LegendKey color="var(--ink-3)" kind="dotted" label="Today’s pattern" />}
        </div>

        {changed && (
          <div className="card card--quiet stack stack-2">
            <span className="t-caption strong">Against carrying on exactly as you are</span>
            <p className="t-callout">
              {meta.label} would be{' '}
              <span className="num strong">{round(Math.abs(end.value - endAsIs.value), 1)} {meta.unit}</span>{' '}
              {end.value > endAsIs.value ? 'higher' : 'lower'} in {months} months under this scenario.
            </p>
          </div>
        )}

        <p className="t-caption dim2">
          This is a projection from a simple model, not a prediction and not a medical assessment.
          The range widens the further out it looks because the uncertainty genuinely does.
        </p>
      </section>

      {/* ------------------------------------------------ Levers */}
      <section className="section">
        <SectionHead
          title="Change something"
          sub="Each of these is a weekly habit, not a target score. Move one and watch the path above."
        />

        <div className="card stack stack-6">
          <Lever
            label="Sleep" unit="h a night" value={levers.sleepHours} baseline={current.sleepHours}
            min={5} max={9.5} step={0.25} dp={2}
            onChange={(v) => update({ sleepHours: v })}
            note="Recovery gates how much training turns into adaptation."
          />
          <Lever
            label="Easy aerobic work" unit="min a week" value={levers.cardioMinutes} baseline={current.cardioMinutes}
            min={0} max={420} step={15} dp={0}
            onChange={(v) => update({ cardioMinutes: v })}
            note="Walking, easy running, cycling, rowing — anything conversational."
          />
          <Lever
            label="Strength sessions" unit="a week" value={levers.strengthSessions} baseline={current.strengthSessions}
            min={0} max={6} step={1} dp={0}
            onChange={(v) => update({ strengthSessions: v })}
            note="The model flattens the benefit above about four sessions."
          />
          <Lever
            label="Daily steps" unit="steps" value={levers.steps} baseline={current.steps}
            min={2000} max={18000} step={500} dp={0}
            onChange={(v) => update({ steps: v })}
            note="Counted separately from structured training."
          />
          <Lever
            label="Protein" unit="g per kg" value={levers.proteinPerKg} baseline={current.proteinPerKg}
            min={0.6} max={2.4} step={0.1} dp={1}
            onChange={(v) => update({ proteinPerKg: v })}
            note={`About ${Math.round(levers.proteinPerKg * base.weightKg)} g a day at your current weight.`}
          />

          <div className="row" style={{ gap: 'var(--s-3)' }}>
            <button className="btn btn--primary grow" onClick={save} disabled={!changed}>
              Save as my scenario
            </button>
            <button className="btn btn--secondary" onClick={reset} disabled={!changed}>Reset</button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Transparency */}
      <section className="section">
        <SectionHead title="Where these numbers come from" />
        <div className="card stack stack-5">
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            <ProvenanceTag kind="observed" />
            <ProvenanceTag kind="evidence" />
            <ProvenanceTag kind="model" />
          </div>

          <div className="stack stack-3">
            <p className="t-callout">
              <span className="strong">Measured</span> — {base.daysOfHistory} days imported from your
              sources, plus {state.measurements.length} point-in-time measurements.
            </p>
            <p className="t-callout">
              <span className="strong">Evidence-informed</span> — the directional relationships below.
              They describe populations, not you specifically.
            </p>
            <p className="t-callout">
              <span className="strong">Model estimate</span> — the dashed line. It applies those
              relationships to your baseline and widens its range over time.
            </p>
          </div>

          <Disclosure summary="What the model assumes">
            <ul className="stack stack-3">
              {RELATIONSHIPS.map((r) => (
                <li key={r.lever} className="stack stack-1">
                  <div className="row row--between">
                    <span className="t-callout strong">{r.lever}</span>
                    <span className={`tag ${r.strength === 'Well established' ? 'tag--observed' : r.strength === 'Reasonably supported' ? 'tag--evidence' : 'tag--model'}`}>
                      {r.strength}
                    </span>
                  </div>
                  <p className="t-caption dim">{r.effect}</p>
                </li>
              ))}
            </ul>
            <p className="t-caption dim2">
              Not modelled: genetics, medication, illness, injury, stress, alcohol, and everything
              else that shapes a real year. Treat the direction as more informative than the number.
            </p>
          </Disclosure>

          <div className="card card--quiet row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
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

/* ---------------------------------------------------------------- pieces */
function Lever({
  label, unit, value, baseline, min, max, step, dp, onChange, note,
}: {
  label: string; unit: string; value: number; baseline: number
  min: number; max: number; step: number; dp: number
  onChange: (v: number) => void; note: string
}) {
  const diff = round(value - baseline, dp)
  const id = `lever-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="stack stack-2">
      <div className="row row--between">
        <label className="t-callout strong" htmlFor={id}>{label}</label>
        <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
          <span className="t-title3 num">{dp ? trim(value, dp) : Math.round(value).toLocaleString()}</span>
          <span className="t-caption dim">{unit}</span>
        </div>
      </div>
      <input
        id={id} className="slider" type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={`${id}-note`}
      />
      <div className="row row--between">
        <span className="t-caption dim2" id={`${id}-note`}>{note}</span>
        {Math.abs(diff) > 0.001 && (
          <span className="t-caption num dim" style={{ fontWeight: 600, flex: 'none' }}>
            {diff > 0 ? '+' : ''}{dp ? trim(diff, dp) : Math.round(diff).toLocaleString()} vs today
          </span>
        )}
      </div>
    </div>
  )
}

/** 8.10 reads as a precision the value does not have; 8.1 does not. */
const trim = (v: number, dp: number) => String(Number(v.toFixed(dp)))

function LegendKey({ color, kind, label }: { color: string; kind: 'solid' | 'dashed' | 'dotted' | 'band'; label: string }) {
  return (
    <span className="row t-caption dim" style={{ gap: 6 }}>
      <svg width="22" height="10" aria-hidden="true">
        {kind === 'band'
          ? <rect x="0" y="2" width="22" height="6" rx="2" fill={color} opacity={0.2} />
          : <line x1="0" y1="5" x2="22" y2="5" stroke={color} strokeWidth="2.2" strokeLinecap="round"
              strokeDasharray={kind === 'dashed' ? '5 4' : kind === 'dotted' ? '2 3' : undefined} />}
      </svg>
      {label}
    </span>
  )
}

/** Turns the imported history into a comparable observed series per metric. */
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
      case 'leanMassKg':
        buckets.push(mean(chunk.map((d) => d.weightKg * (1 - d.bodyFatPct / 100))));
        break
      case 'recoveryIndex':
        buckets.push(mean(chunk.map((d) =>
          clamp(46 + (d.hrv - base.hrv) * 0.9 + (d.sleepHours - 6.8) * 8, 5, 98))))
        break
      default: {
        // VO₂ max moves slowly; reconstruct a weekly path anchored on the baseline.
        const t = i / Math.max(1, window.length - 7)
        buckets.push(base.vo2max - (1 - t) * 1.6 + mean(chunk.map((d) => d.hrv - base.hrv)) * 0.02)
      }
    }
  }
  return { values: buckets.map((v) => round(v, 2)), labels }
}
