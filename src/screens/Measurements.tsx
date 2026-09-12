import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { LineChart } from '../components/Charts'
import { DemoBadge, Empty, ProvenanceTag, ScreenHead, Segmented, SectionHead } from '../components/UI'
import { useStore } from '../state/store'
import type { Measurement, MeasurementKind } from '../data/types'
import { prettyDate, round, formatSigned } from '../lib/util'

interface KindMeta {
  label: string
  unit: string
  better: 'up' | 'down'
  group: 'fitness' | 'body' | 'blood'
  /** Commonly cited reference ranges. Ranges differ between labs and guidelines. */
  reference?: string
  note?: string
}

const META: Record<MeasurementKind, KindMeta> = {
  vo2max:       { label: 'VO₂ max',        unit: 'ml/kg/min', better: 'up',   group: 'fitness', note: 'Estimated by your watch from running heart-rate data, not measured in a lab.' },
  gripStrength: { label: 'Grip strength',  unit: 'kg',        better: 'up',   group: 'fitness', note: 'A simple proxy for whole-body strength.' },
  restingHR:    { label: 'Resting HR',     unit: 'bpm',       better: 'down', group: 'fitness' },
  bodyFat:      { label: 'Body fat',       unit: '%',         better: 'down', group: 'body', note: 'From DEXA, the most reliable of the everyday methods.' },
  leanMass:     { label: 'Lean mass',      unit: 'kg',        better: 'up',   group: 'body' },
  boneDensity:  { label: 'Bone density',   unit: 'g/cm²',     better: 'up',   group: 'body' },
  waist:        { label: 'Waist',          unit: 'cm',        better: 'down', group: 'body' },
  apoB:         { label: 'ApoB',           unit: 'mg/dL',     better: 'down', group: 'blood', reference: 'Commonly cited target under 80 mg/dL' },
  ldl:          { label: 'LDL cholesterol',unit: 'mg/dL',     better: 'down', group: 'blood', reference: 'Commonly cited target under 100 mg/dL' },
  hdl:          { label: 'HDL cholesterol',unit: 'mg/dL',     better: 'up',   group: 'blood', reference: 'Commonly cited target above 40–50 mg/dL' },
  triglycerides:{ label: 'Triglycerides',  unit: 'mg/dL',     better: 'down', group: 'blood', reference: 'Commonly cited target under 150 mg/dL' },
  hba1c:        { label: 'HbA1c',          unit: '%',         better: 'down', group: 'blood', reference: 'Commonly cited normal range under 5.7%' },
  crp:          { label: 'hs-CRP',         unit: 'mg/L',      better: 'down', group: 'blood', reference: 'Commonly cited low-risk range under 1.0 mg/L' },
  vitaminD:     { label: 'Vitamin D',      unit: 'ng/mL',     better: 'up',   group: 'blood', reference: 'Commonly cited sufficiency above 30 ng/mL' },
}

type Group = 'fitness' | 'body' | 'blood'

export function Measurements() {
  const { state } = useStore()
  const [group, setGroup] = useState<Group>('fitness')

  const byKind = useMemo(() => {
    const map = new Map<MeasurementKind, Measurement[]>()
    state.measurements.forEach((m) => {
      const arr = map.get(m.kind) ?? []
      arr.push(m)
      map.set(m.kind, arr)
    })
    // Newest first from the store; charts want oldest first.
    map.forEach((arr) => arr.sort((a, b) => (a.date < b.date ? -1 : 1)))
    return map
  }, [state.measurements])

  const kinds = ([...byKind.keys()] as MeasurementKind[]).filter((k) => META[k].group === group)
  const vo2 = byKind.get('vo2max') ?? []

  if (!state.measurements.length) {
    return (
      <div className="stack stack-8">
        <ScreenHead title="Measurements" />
        <Empty
          icon="measure" title="No measurements yet"
          body="Connect a lab or DEXA source, or add a result by hand from Capture. Jumbo keeps the source with every number."
        />
      </div>
    )
  }

  return (
    <div className="stack stack-10">
      <ScreenHead
        title="Measurements"
        sub="Lab panels, scans and tests, kept next to the daily data so you can see them move together."
      />

      {state.dataMode === 'demo' && <DemoBadge />}

      {/* VO₂ max gets the headline: it is the measurement most tied to trajectory. */}
      {vo2.length > 1 && (
        <section className="card stack stack-5">
          <div className="row row--between" style={{ alignItems: 'flex-start' }}>
            <div className="stack stack-1">
              <span className="t-caption dim">VO₂ max</span>
              <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
                <span className="t-display num" style={{ fontSize: '2.25rem' }}>{vo2[vo2.length - 1].value.toFixed(1)}</span>
                <span className="t-callout dim">ml/kg/min</span>
              </div>
              <span className="t-caption" style={{ color: 'var(--positive)' }}>
                {formatSigned(vo2[vo2.length - 1].value - vo2[0].value, 1)} since {prettyDate(vo2[0].date)}
              </span>
            </div>
            <ProvenanceTag kind="observed" />
          </div>

          <LineChart
            values={vo2.map((m) => m.value)}
            labels={vo2.map((m) => prettyDate(m.date))}
            color="var(--movement)" unit="ml/kg/min" dp={1}
          />

          <p className="t-caption dim2">
            {META.vo2max.note} Watch estimates track direction well and absolute values less well,
            the trend is the part to trust.
          </p>
        </section>
      )}

      <div>
        <Segmented
          ariaLabel="Measurement group"
          value={group}
          onChange={(v) => setGroup(v as Group)}
          options={[
            { value: 'fitness', label: 'Fitness' },
            { value: 'body', label: 'Body composition' },
            { value: 'blood', label: 'Biomarkers' },
          ]}
        />
      </div>

      <section className="section">
        <SectionHead
          title={group === 'fitness' ? 'Fitness tests' : group === 'body' ? 'Body composition' : 'Blood biomarkers'}
          sub={group === 'blood'
            ? 'Reference ranges vary between labs and guidelines. Read them with your clinician, not against them.'
            : undefined}
        />

        <ul className="stack stack-3">
          {kinds.map((k) => {
            const series = byKind.get(k)!
            return <MeasurementRow key={k} kind={k} series={series} />
          })}
          {!kinds.length && (
            <Empty icon="measure" title="Nothing in this group yet" body="Add a result from Capture and it will appear here with its history." />
          )}
        </ul>
      </section>

      <div className="card card--quiet row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
        <Icon name="info" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
        <p className="t-caption dim">
          Jumbo displays and compares your results. It does not interpret them clinically and cannot
          tell you whether a value is a problem for you. That conversation belongs with a clinician.
        </p>
      </div>
    </div>
  )
}

function MeasurementRow({ kind, series }: { kind: MeasurementKind; series: Measurement[] }) {
  const [open, setOpen] = useState(false)
  const meta = META[kind]
  const latest = series[series.length - 1]
  const first = series[0]
  const delta = latest.value - first.value
  const improved = meta.better === 'up' ? delta > 0 : delta < 0
  const same = series.length < 2 || Math.abs(delta) < 0.001

  return (
    <li className="card stack stack-3">
      <button
        className="row row--between"
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="stack stack-1" style={{ minWidth: 0 }}>
          <span className="t-callout strong">{meta.label}</span>
          <span className="t-caption dim2">{latest.source} · {prettyDate(latest.date)}</span>
        </div>
        <div className="row" style={{ gap: 'var(--s-3)' }}>
          <div className="stack stack-1" style={{ alignItems: 'flex-end' }}>
            <span className="t-title3 num">{round(latest.value, 2)} <span className="t-caption dim">{meta.unit}</span></span>
            {!same && (
              <span className="t-caption num" style={{ color: improved ? 'var(--positive)' : 'var(--caution)' }}>
                {formatSigned(delta, 2)} since {prettyDate(first.date)}
              </span>
            )}
          </div>
          <Icon name="chevron" size={16} style={{ color: 'var(--ink-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--d-fast)' }} />
        </div>
      </button>

      {open && (
        <div className="stack stack-4" style={{ paddingTop: 'var(--s-2)' }}>
          {series.length > 1 ? (
            <LineChart
              values={series.map((m) => m.value)}
              labels={series.map((m) => prettyDate(m.date))}
              color={meta.group === 'blood' ? 'var(--nutrition)' : meta.group === 'body' ? 'var(--recovery)' : 'var(--movement)'}
              unit={meta.unit} dp={2} height={110}
            />
          ) : (
            <p className="t-caption dim2">One result so far. A second one gives you a direction.</p>
          )}

          <ul className="stack stack-2">
            {[...series].reverse().map((m) => (
              <li key={m.id} className="row row--between">
                <span className="t-caption dim">{prettyDate(m.date)} · {m.source}</span>
                <span className="t-caption num strong">{round(m.value, 2)} {m.unit}</span>
              </li>
            ))}
          </ul>

          {(meta.reference || meta.note || latest.context) && (
            <div className="card card--quiet stack stack-2">
              {meta.reference && <p className="t-caption"><span className="strong">Reference:</span> {meta.reference}</p>}
              {meta.note && <p className="t-caption dim">{meta.note}</p>}
              {latest.context && <p className="t-caption dim2">{latest.context}</p>}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
