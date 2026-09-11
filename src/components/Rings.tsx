import { useEffect, useState } from 'react'
import type { DailyProgress } from '../lib/analytics'

/**
 * The four rings, ordered outside-in exactly as the reference shows them:
 * sleep violet, movement mint, food amber, recovery sky.
 */
export const RING_DEFS = [
  { key: 'sleep',    label: 'Sleep',    colour: 'var(--sleep)' },
  { key: 'movement', label: 'Movement', colour: 'var(--movement)' },
  { key: 'nourish',  label: 'Nutrition',colour: 'var(--nutrition)' },
  { key: 'recovery', label: 'Recovery', colour: 'var(--recovery)' },
] as const

/**
 * The health-score rings.
 *
 * Geometry is proportional to `size` so the same component holds its
 * relationships at any diameter: a stroke of 5.7% of the diameter, a gap
 * just under half a stroke, and a centre left clear for the score. The
 * fill sweeps once on mount, each ring a beat behind the one outside it,
 * then tracks state.
 */
export function Rings({
  progress, size = 212, children,
}: {
  progress: DailyProgress
  size?: number
  children?: React.ReactNode
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 90)
    return () => window.clearTimeout(t)
  }, [])

  const stroke = size * 0.049
  const gap = stroke * 0.62
  const cx = size / 2
  const step = stroke + gap

  return (
    <div className="rings" style={{ width: size, height: size }}>
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={RING_DEFS.map((r) => `${r.label} ${Math.round(progress[r.key] * 100)} percent`).join(', ')}
      >
        {RING_DEFS.map((ring, i) => {
          const r = cx - stroke / 2 - i * step
          const c = 2 * Math.PI * r
          const pct = Math.min(progress[ring.key], 1)
          return (
            <g key={ring.key} transform={`rotate(-90 ${cx} ${cx})`}>
              {/* The unfilled track: the ring's own colour, well back. */}
              <circle
                cx={cx} cy={cx} r={r} fill="none" stroke={ring.colour}
                strokeWidth={stroke} opacity={0.18}
              />
              <circle
                className="rings__fill"
                cx={cx} cy={cx} r={r} fill="none" stroke={ring.colour}
                strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={shown ? c * (1 - pct) : c}
                style={{ transitionDelay: `${i * 90}ms`, color: ring.colour }}
              />
            </g>
          )
        })}
      </svg>
      {children && <div className="rings__centre">{children}</div>}
    </div>
  )
}

/**
 * One ring on its own, for the date strip and the focus rows. Thinner in
 * proportion than the hero, because at 22px a 5.7% stroke disappears.
 */
export function MiniRing({
  value, colour, size = 46, label, track = true,
}: {
  value: number
  colour: string
  size?: number
  label: string
  track?: boolean
}) {
  const stroke = Math.max(2.5, size * 0.13)
  const r = size / 2 - stroke / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`${label}: ${Math.round(value * 100)}%`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {track && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour}
            strokeWidth={stroke} opacity={0.22} />
        )}
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(value, 1))}
          style={{ transition: 'stroke-dashoffset 700ms var(--ease)' }}
        />
      </g>
    </svg>
  )
}

/**
 * The four-colour ring used under each day in the date strip — a quarter
 * arc per dimension, so a glance down the week reads as shape not number.
 */
export function DayRing({ progress, size = 26 }: { progress: DailyProgress; size?: number }) {
  const stroke = Math.max(2.4, size * 0.115)
  const r = size / 2 - stroke / 2
  const c = 2 * Math.PI * r
  const quarter = c / 4
  // A hair of space between each quarter so the four read as four.
  const seg = quarter - stroke * 0.9

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {RING_DEFS.map((ring, i) => (
          <g key={ring.key}>
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.colour}
              strokeWidth={stroke} opacity={0.16}
              strokeDasharray={`${seg} ${c - seg}`}
              strokeDashoffset={-i * quarter}
            />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.colour}
              strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${seg * Math.min(progress[ring.key], 1)} ${c}`}
              strokeDashoffset={-i * quarter}
              style={{ transition: 'stroke-dasharray 600ms var(--ease)' }}
            />
          </g>
        ))}
      </g>
    </svg>
  )
}
