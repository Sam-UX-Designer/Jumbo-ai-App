import { useEffect, useState } from 'react'
import type { DailyProgress } from '../lib/analytics'

export const RING_DEFS = [
  { key: 'sleep',    label: 'Sleep',    colour: 'var(--sleep)' },
  { key: 'movement', label: 'Movement', colour: 'var(--movement)' },
  { key: 'nourish',  label: 'Food',     colour: 'var(--nutrition)' },
  { key: 'recovery', label: 'Recovery', colour: 'var(--recovery)' },
] as const

/**
 * Four rings, one per part of the day. They fill once on mount and then track
 * state — the only looping motion on the screen is none.
 */
export function Rings({
  progress, size = 208, children,
}: { progress: DailyProgress; size?: number; children?: React.ReactNode }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 80)
    return () => window.clearTimeout(t)
  }, [])

  const stroke = size / 13.5
  const gap = stroke * 0.5
  const cx = size / 2

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
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
              <circle cx={cx} cy={cx} r={r} fill="none" stroke={ring.colour}
                strokeWidth={stroke} opacity={0.16} />
              <circle
                cx={cx} cy={cx} r={r} fill="none" stroke={ring.colour}
                strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={shown ? c * (1 - pct) : c}
                style={{ transition: 'stroke-dashoffset 1000ms var(--ease)' }}
              />
            </g>
          )
        })}
      </svg>
      {children && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeContent: 'center',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

/** A single ring for compact contexts. */
export function MiniRing({
  value, colour, size = 46, label,
}: { value: number; colour: string; size?: number; label: string }) {
  const stroke = size / 7.5
  const r = size / 2 - stroke / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`${label}: ${Math.round(value * 100)}%`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth={stroke} opacity={0.17} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(value, 1))}
          style={{ transition: 'stroke-dashoffset 700ms var(--ease)' }}
        />
      </g>
    </svg>
  )
}
