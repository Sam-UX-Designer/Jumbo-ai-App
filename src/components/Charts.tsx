import { useId, useMemo, useState } from 'react'
import { round } from '../lib/util'

/* ============================================================
   Shared helpers
   ============================================================ */
function extent(values: number[], pad = 0.12) {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || Math.abs(hi) * 0.1 || 1
  return [lo - span * pad, hi + span * pad] as const
}

function path(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  // Catmull-Rom → cubic Bézier, for a curve that reads as a trend, not a jag.
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${round(c1x, 2)} ${round(c1y, 2)}, ${round(c2x, 2)} ${round(c2y, 2)}, ${round(p2.x, 2)} ${round(p2.y, 2)}`
  }
  return d
}

/* ============================================================
   Sparkline — a trend at a glance, never the only source of a number
   ============================================================ */
export function Sparkline({
  values, colour = 'var(--brand)', width = 88, height = 30, label,
}: { values: number[]; colour?: string; width?: number; height?: number; label: string }) {
  if (values.length < 2) return <div style={{ width, height }} aria-hidden="true" />
  const [lo, hi] = extent(values)
  const pad = 3
  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (width - pad * 2),
    y: height - ((v - lo) / (hi - lo)) * height,
  }))
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ overflow: 'visible' }}>
      <path d={path(pts)} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" opacity={0.92} />
      <circle cx={last.x} cy={last.y} r={2.7} fill={colour} />
    </svg>
  )
}

/* ============================================================
   Bar chart — weekly aggregates, scrubbable
   ============================================================ */
export interface BarPoint { label: string; value: number; sublabel?: string; muted?: boolean }

export function BarChart({
  data, color = 'var(--movement)', height = 132, unit = '', formatter,
}: {
  data: BarPoint[]
  color?: string
  height?: number
  unit?: string
  formatter?: (v: number) => string
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)
  const fmt = formatter ?? ((v: number) => `${round(v, 1)}${unit}`)

  return (
    <div>
      <div
        className="row"
        style={{ alignItems: 'flex-end', gap: 6, height, marginBottom: 'var(--s-2)' }}
        onMouseLeave={() => setActive(null)}
      >
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / max) * height)
          const isActive = active === i
          return (
            <button
              key={d.label + i}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(isActive ? null : i)}
              aria-label={`${d.sublabel ?? d.label}: ${fmt(d.value)}`}
              style={{
                flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end',
                background: 'none', border: 0, padding: 0, cursor: 'pointer', minWidth: 0,
              }}
            >
              {/* The bar is drawn at full height and scaled down from its
                  base, so growing it is a transform rather than a re-layout
                  of every bar beside it. */}
              <span
                style={{
                  // Full height in pixels; the scale below is what varies.
                  display: 'block', width: '100%', height, borderRadius: 5,
                  background: d.muted ? 'var(--hairline-firm)' : color,
                  opacity: active === null || isActive ? 1 : 0.42,
                  transformOrigin: 'bottom',
                  transform: `scaleY(${h / height})`,
                  transition: 'opacity var(--d-fast), transform var(--d-slow) var(--ease)',
                }}
              />
            </button>
          )
        })}
      </div>
      <div className="row row--between t-caption dim2" aria-live="polite">
        <span>{data[0]?.sublabel ?? data[0]?.label}</span>
        <span className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {active !== null ? `${data[active].sublabel ?? data[active].label} · ${fmt(data[active].value)}` : ''}
        </span>
        <span>{data[data.length - 1]?.sublabel ?? data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/* ============================================================
   Line chart — observed history, scrubbable
   ============================================================ */
export function LineChart({
  values, labels, color = 'var(--brand)', height = 150, unit = '', dp = 1,
}: {
  values: number[]
  labels: string[]
  color?: string
  height?: number
  unit?: string
  dp?: number
}) {
  const gid = useId()
  const [active, setActive] = useState<number | null>(null)
  const W = 320
  const H = height

  const { pts, lo, hi } = useMemo(() => {
    const [l, h] = extent(values)
    return {
      lo: l, hi: h,
      pts: values.map((v, i) => ({
        x: 3 + (i / Math.max(1, values.length - 1)) * (W - 6),
        y: H - ((v - l) / (h - l)) * H,
      })),
    }
  }, [values, H])

  if (values.length < 2) {
    return <div className="empty t-callout">Not enough history yet to draw a trend.</div>
  }

  const d = path(pts)
  const area = `${d} L ${W - 3} ${H} L 3 ${H} Z`
  const idx = active ?? values.length - 1

  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 'var(--s-2)' }}>
        <span className="t-caption dim2">{labels[idx]}</span>
        <span className="t-title3 num">{round(values[idx], dp)}<span className="t-caption dim" style={{ marginLeft: 4 }}>{unit}</span></span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        role="img"
        aria-label={`Trend from ${round(values[0], dp)} to ${round(values[values.length - 1], dp)} ${unit} across ${values.length} points`}
        onMouseLeave={() => setActive(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          setActive(Math.round(ratio * (values.length - 1)))
        }}
        style={{ overflow: 'visible', touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#g-${gid})`} />
        <path d={d} fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {active !== null && (
          <>
            <line x1={pts[idx].x} y1={0} x2={pts[idx].x} y2={H} stroke="var(--hairline-firm)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={pts[idx].x} cy={pts[idx].y} r={4} fill="var(--surface)" stroke={color} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="row row--between t-caption dim2" style={{ marginTop: 'var(--s-2)' }}>
        <span>{labels[0]}</span>
        <span className="num">{round(lo, dp)} to {round(hi, dp)} {unit}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  )
}

/* ============================================================
   Projection chart — the signature Trajectory visual.
   Observed history and modelled path are drawn differently on purpose:
   solid for what happened, dashed with a band for what the model estimates.
   ============================================================ */
export interface ProjectionProps {
  observed: number[]
  observedLabels: string[]
  projected: Array<{ month: number; value: number; lo: number; hi: number }>
  color: string
  unit: string
  dp?: number
  height?: number
  compare?: Array<{ month: number; value: number }>
}

export function ProjectionChart({
  observed, observedLabels, projected, color, unit, dp = 1, height = 208, compare,
}: ProjectionProps) {
  const gid = useId()
  const W = 340
  const H = height
  const splitX = W * 0.36

  const all = [
    ...observed,
    ...projected.map((p) => p.hi), ...projected.map((p) => p.lo),
    ...(compare?.map((c) => c.value) ?? []),
  ]
  const [lo, hi] = extent(all, 0.2)
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H

  const obsPts = observed.map((v, i) => ({ x: 3 + (i / Math.max(1, observed.length - 1)) * (splitX - 3), y: y(v) }))
  const maxM = projected[projected.length - 1]?.month || 1
  const px = (m: number) => splitX + (m / maxM) * (W - splitX - 5)
  const projPts = projected.map((p) => ({ x: px(p.month), y: y(p.value) }))
  const hiPts = projected.map((p) => ({ x: px(p.month), y: y(p.hi) }))
  const loPts = projected.map((p) => ({ x: px(p.month), y: y(p.lo) }))
  const cmpPts = compare?.map((c) => ({ x: px(c.month), y: y(c.value) })) ?? []

  const bandPath = `${path(hiPts)} L ${loPts[loPts.length - 1].x} ${loPts[loPts.length - 1].y} ${path([...loPts].reverse()).replace(/^M/, 'L')} Z`

  const end = projected[projected.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 18}`} width="100%" height={H + 18}
      role="img"
      aria-label={`Observed history followed by a modelled projection reaching ${round(end.value, dp)} ${unit}, with a plausible range of ${round(end.lo, dp)} to ${round(end.hi, dp)}.`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`obs-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Observed */}
      <path d={`${path(obsPts)} L ${splitX} ${H} L 3 ${H} Z`} fill={`url(#obs-${gid})`} />
      <path d={path(obsPts)} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />

      {/* The boundary between measurement and estimate */}
      <line x1={splitX} y1={-4} x2={splitX} y2={H} stroke="var(--hairline-firm)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <text x={splitX + 5} y={10} fontSize="9" fill="var(--ink-3)" fontWeight="600">now</text>

      {/* Comparison scenario (what today's pattern alone would do) */}
      {cmpPts.length > 1 && (
        <path d={path(cmpPts)} fill="none" stroke="var(--ink-3)" strokeWidth={1.6}
          strokeDasharray="2 4" strokeLinecap="round" opacity={0.8} vectorEffect="non-scaling-stroke" />
      )}

      {/* Modelled band + path */}
      <path d={bandPath} fill={color} opacity={0.13} />
      <path d={path(projPts)} fill="none" stroke={color} strokeWidth={2.2}
        strokeDasharray="6 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={projPts[projPts.length - 1].x} cy={projPts[projPts.length - 1].y} r={4}
        fill="var(--surface)" stroke={color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />

      <text x={0} y={H + 14} fontSize="9.5" fill="var(--ink-3)">{observedLabels[0]}</text>
      <text x={W} y={H + 14} fontSize="9.5" fill="var(--ink-3)" textAnchor="end">
        +{maxM} months
      </text>
    </svg>
  )
}

/* ============================================================
   Day curve — the Future screen's signature visual.

   Two shapes of one ordinary day: how energy tends to run now, and how it
   could run under the chosen scenario. It is an illustration built from the
   model, and the screen says so directly next to it.
   ============================================================ */
export function DayCurve({
  now, projected, height = 180, accent = 'var(--brand)',
}: { now: number[]; projected: number[]; height?: number; accent?: string }) {
  const gid = useId()
  const W = 340
  const H = height
  const pad = 4

  const toPts = (vals: number[]) =>
    vals.map((v, i) => ({
      x: pad + (i / (vals.length - 1)) * (W - pad * 2),
      y: H - 10 - v * (H - 30),
    }))

  const nowPts = toPts(now)
  const projPts = toPts(projected)
  const HOURS = ['6am', '9am', 'noon', '3pm', '6pm', '9pm']  // guides and axis labels

  return (
    <div>
    <svg
      viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label="An illustration of how energy could run across an ordinary day now, compared with the chosen scenario."
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`dc-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* hour guides */}
      {HOURS.map((label, i) => {
        const x = pad + (i / (HOURS.length - 1)) * (W - pad * 2)
        return (
          <g key={label}>
            <line x1={x} y1={8} x2={x} y2={H - 10} stroke="var(--hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />

          </g>
        )
      })}

      {/* the scenario, filled */}
      <path d={`${path(projPts)} L ${W - pad} ${H - 10} L ${pad} ${H - 10} Z`} fill={`url(#dc-${gid})`} />
      <path d={path(projPts)} fill="none" stroke={accent} strokeWidth={2.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />

      {/* today, as a quiet reference */}
      <path d={path(nowPts)} fill="none" stroke="var(--ink-3)" strokeWidth={1.8}
        strokeDasharray="3 4" strokeLinecap="round" opacity={0.85} vectorEffect="non-scaling-stroke" />
    </svg>

      <div className="row row--between" style={{ marginTop: 2 }}>
        {HOURS.map((h) => <span key={h} className="t-caption dim2">{h}</span>)}
      </div>
    </div>
  )
}
