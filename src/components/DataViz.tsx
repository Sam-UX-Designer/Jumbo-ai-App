/**
 * The renderer for a visualization Jumbo's AI asked for.
 *
 * The model supplies numbers and labels only — never markup, never a drawing.
 * Everything on screen is built here, in Jumbo's own colours, so a chart in a
 * conversation looks like the rest of the product and can never carry
 * anything the model wrote.
 *
 * Values are already validated server-side; a null inside a series means the
 * record was genuinely absent and is left as a gap rather than interpolated.
 */
export interface Viz {
  type: 'line' | 'bar' | 'stacked_bar' | 'donut' | 'table' | 'metrics'
  title: string
  unit?: string
  note?: string
  categories?: string[]
  series?: Array<{ name: string; values: Array<number | null> }>
  rows?: Array<{ cells: string[] }>
  metrics?: Array<{ label: string; value: string; note?: string }>
}

/** Jumbo's category colours, in the order a multi-series chart uses them. */
const PALETTE = [
  'var(--brand)', 'var(--sleep)', 'var(--nutrition)',
  'var(--recovery)', 'var(--movement)',
]

const niceMax = (v: number) => {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / mag) * mag
}

const fmt = (n: number) =>
  (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : Number.isInteger(n) ? String(n)
    : n.toFixed(1))

export function DataViz({ viz }: { viz: Viz }) {
  const body = render(viz)
  if (!body) return null
  return (
    <figure className="viz">
      <figcaption className="viz__head">
        <span className="viz__title">{viz.title}</span>
        {viz.unit && <span className="viz__unit">{viz.unit}</span>}
      </figcaption>
      {body}
      {viz.series && viz.series.length > 1 && (
        <ul className="viz__legend">
          {viz.series.map((s, i) => (
            <li key={s.name}>
              <span className="viz__swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      {viz.note && <p className="viz__note">{viz.note}</p>}
    </figure>
  )
}

function render(viz: Viz) {
  switch (viz.type) {
    case 'metrics': return <Metrics viz={viz} />
    case 'table': return <Table viz={viz} />
    case 'donut': return <Donut viz={viz} />
    case 'line': return <Line viz={viz} />
    case 'bar':
    case 'stacked_bar': return <Bars viz={viz} stacked={viz.type === 'stacked_bar'} />
    default: return null
  }
}

/* ------------------------------------------------------------- metrics */
function Metrics({ viz }: { viz: Viz }) {
  if (!viz.metrics?.length) return null
  return (
    <div className="viz__metrics">
      {viz.metrics.map((m) => (
        <div className="viz__metric" key={m.label}>
          <span className="viz__metric-value num">{m.value}</span>
          <span className="viz__metric-label">{m.label}</span>
          {m.note && <span className="viz__metric-note">{m.note}</span>}
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- table */
function Table({ viz }: { viz: Viz }) {
  if (!viz.categories?.length || !viz.rows?.length) return null
  return (
    <div className="viz__scroll">
      <table className="viz__table">
        <thead>
          <tr>{viz.categories.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {viz.rows.map((r, i) => (
            <tr key={i}>{r.cells.map((c, j) => <td key={j} className={j ? 'num' : undefined}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------- line */
const W = 320
const H = 150
const PAD = { l: 6, r: 6, t: 10, b: 20 }

function Line({ viz }: { viz: Viz }) {
  const cats = viz.categories ?? []
  const series = viz.series ?? []
  if (!cats.length || !series.length) return null

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null)
  if (!all.length) return null
  const max = niceMax(Math.max(...all))
  const min = Math.min(0, ...all)
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (cats.length === 1 ? iw / 2 : (i / (cats.length - 1)) * iw)
  const y = (v: number) => PAD.t + ih - ((v - min) / (max - min || 1)) * ih

  return (
    <div className="viz__scroll">
      <svg className="viz__svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${viz.title}. ${series.map((s) => `${s.name}: ${s.values.filter((v) => v !== null).join(', ')}`).join('. ')}`}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih * f} y2={PAD.t + ih * f}
            stroke="var(--hairline)" strokeWidth="1" />
        ))}
        {series.map((s, si) => {
          const colour = PALETTE[si % PALETTE.length]
          // A gap stays a gap: each unbroken run is its own path.
          const runs: string[] = []
          let run: string[] = []
          s.values.forEach((v, i) => {
            if (v === null) { if (run.length) runs.push(run.join(' ')); run = []; return }
            run.push(`${run.length ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
          })
          if (run.length) runs.push(run.join(' '))
          return (
            <g key={s.name}>
              {runs.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={colour} strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {s.values.map((v, i) => (v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r="2.6" fill={colour} />
              )))}
            </g>
          )
        })}
        {cats.map((c, i) => (
          (i === 0 || i === cats.length - 1 || cats.length <= 7) && (
            <text key={c + i} x={x(i)} y={H - 6} className="viz__tick"
              textAnchor={i === 0 ? 'start' : i === cats.length - 1 ? 'end' : 'middle'}>{c}</text>
          )
        ))}
      </svg>
      <span className="viz__max">max {fmt(max)}{viz.unit ? ` ${viz.unit}` : ''}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- bars */
function Bars({ viz, stacked }: { viz: Viz; stacked: boolean }) {
  const cats = viz.categories ?? []
  const series = viz.series ?? []
  if (!cats.length || !series.length) return null

  const totals = cats.map((_, i) =>
    stacked ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : Math.max(...series.map((s) => s.values[i] ?? 0)))
  const max = niceMax(Math.max(...totals, 0))

  return (
    <div className="viz__bars">
      {cats.map((c, i) => (
        <div className="viz__bar-col" key={c + i}>
          <div className="viz__bar-stack" style={{ flexDirection: stacked ? 'column-reverse' : 'row' }}>
            {series.map((s, si) => {
              const v = s.values[i]
              if (v === null || v === undefined) return null
              const share = (v / max) * 100
              return (
                <span
                  key={s.name}
                  className="viz__bar"
                  title={`${s.name}: ${fmt(v)}${viz.unit ? ` ${viz.unit}` : ''}`}
                  style={{
                    height: stacked ? `${share}%` : '100%',
                    width: stacked ? '100%' : `${100 / series.length}%`,
                    ...(stacked ? {} : { alignSelf: 'flex-end' }),
                    background: PALETTE[si % PALETTE.length],
                    ...(stacked ? {} : { transform: `scaleY(${share / 100})`, transformOrigin: 'bottom' }),
                  }}
                />
              )
            })}
          </div>
          <span className="viz__tick-label">{c}</span>
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- donut */
function Donut({ viz }: { viz: Viz }) {
  const cats = viz.categories ?? []
  const values = viz.series?.[0]?.values ?? []
  const total = values.reduce((a: number, v) => a + (v ?? 0), 0)
  if (!cats.length || !total) return null

  const size = 132
  const stroke = 20
  const r = size / 2 - stroke / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="viz__donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`${viz.title}. ${cats.map((k, i) => `${k} ${values[i] ?? 0}`).join(', ')}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {cats.map((k, i) => {
            const v = values[i] ?? 0
            const len = (v / total) * c
            const el = (
              <circle key={k} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={PALETTE[i % PALETTE.length]} strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
            )
            offset += len
            return el
          })}
        </g>
      </svg>
      <ul className="viz__slices">
        {cats.map((k, i) => (
          <li key={k}>
            <span className="viz__swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="grow">{k}</span>
            <span className="num">{Math.round(((values[i] ?? 0) / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
