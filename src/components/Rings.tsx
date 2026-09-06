import { useEffect, useState } from 'react'
import type { DailyProgress } from '../lib/analytics'

const RING_DEFS = [
  { key: 'sleep',    label: 'Sleep',    color: 'var(--sleep)' },
  { key: 'movement', label: 'Movement', color: 'var(--movement)' },
  { key: 'nourish',  label: 'Nourish',  color: 'var(--nutrition)' },
  { key: 'recovery', label: 'Recovery', color: 'var(--recovery)' },
] as const

/**
 * Four rings, one per part of the day. Values animate in once on mount and
 * then track state changes; under reduced motion they simply appear.
 */
export function Rings({ progress, size = 168 }: { progress: DailyProgress; size?: number }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 60)
    return () => window.clearTimeout(t)
  }, [])

  const stroke = size / 14
  const gap = stroke * 0.55
  const cx = size / 2

  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={RING_DEFS.map((r) => `${r.label} ${Math.round(progress[r.key] * 100)} percent`).join(', ')}
    >
      {RING_DEFS.map((ring, i) => {
        const r = cx - stroke / 2 - i * (stroke + gap)
        const c = 2 * Math.PI * r
        const pct = Math.min(progress[ring.key], 1)
        return (
          <g key={ring.key} transform={`rotate(-90 ${cx} ${cx})`}>
            <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor"
              strokeWidth={stroke} opacity={0.12} />
            <circle
              cx={cx} cy={cx} r={r} fill="none" stroke={ring.color}
              strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={shown ? c * (1 - pct) : c}
              style={{ transition: 'stroke-dashoffset 900ms var(--ease-out)' }}
            />
          </g>
        )
      })}
    </svg>
  )
}

export function RingLegend({ progress }: { progress: DailyProgress }) {
  return (
    <ul className="stack stack-2" style={{ minWidth: 0 }}>
      {RING_DEFS.map((r) => (
        <li key={r.key} className="row" style={{ gap: 'var(--s-2)' }}>
          <span className="dot" style={{ background: r.color }} />
          <span className="t-callout grow">{r.label}</span>
          <span className="t-callout num strong">{Math.round(progress[r.key] * 100)}%</span>
        </li>
      ))}
    </ul>
  )
}

/** A single ring for compact contexts. */
export function MiniRing({
  value, color, size = 44, label,
}: { value: number; color: string; size?: number; label: string }) {
  const stroke = size / 8
  const r = size / 2 - stroke / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(value * 100)}%`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} opacity={0.13} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(value, 1))}
          style={{ transition: 'stroke-dashoffset 700ms var(--ease-out)' }}
        />
      </g>
    </svg>
  )
}
