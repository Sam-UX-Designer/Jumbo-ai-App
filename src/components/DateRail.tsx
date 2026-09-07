import { useEffect, useMemo, useRef } from 'react'
import { MiniRing } from './Rings'
import { useStore } from '../state/store'
import { dailyProgress } from '../lib/analytics'
import { addDays, dayLabel } from '../lib/util'
import { haptic } from '../lib/feedback'

/**
 * The week strip at the top of Home.
 *
 * Each day carries a ring of its own overall score, so the week reads at a
 * glance before you tap anything. Days after today are shown — a week you
 * can see the shape of is more useful than one that stops mid-air — but they
 * are not selectable, because there is nothing there yet.
 */
export function DateRail({
  selected, onSelect,
}: { selected: string; onSelect: (date: string) => void }) {
  const { state } = useStore()
  const rail = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLButtonElement>(null)

  const week = useMemo(() => {
    // Five days behind, today, and one ahead. A fixed Monday-to-Sunday week
    // leaves nothing to look at on a Monday; this always carries history.
    const start = addDays(state.today, -5)

    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i)
      const record = state.days.find((r) => r.date === date)
      return {
        date,
        label: dayLabel(date),
        number: new Date(`${date}T12:00:00`).getDate(),
        isToday: date === state.today,
        future: date > state.today,
        progress: record ? dailyProgress(record, state.baseline).overall : 0,
        hasRecord: Boolean(record),
      }
    })
  }, [state.today, state.days, state.baseline])

  // Keep the selected day in view when the week is wider than the screen.
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selected])

  return (
    <div className="daterail" ref={rail} role="group" aria-label="Choose a day">
      {week.map((d) => {
        const isSelected = d.date === selected
        return (
          <button
            key={d.date}
            ref={isSelected ? current : undefined}
            className={`daterail__day${isSelected ? ' is-selected' : ''}${d.isToday ? ' is-today' : ''}`}
            aria-pressed={isSelected}
            aria-label={`${d.label} ${d.number}${d.isToday ? ', today' : ''}${d.future ? ', not yet' : ''}`}
            disabled={d.future || !d.hasRecord}
            onClick={() => { haptic('selection'); onSelect(d.date) }}
          >
            <span className="daterail__label">{d.label}</span>
            <span className="daterail__num num">{d.number}</span>
            <span className="daterail__ring">
              <MiniRing
                value={d.progress}
                colour={isSelected ? 'var(--brand)' : 'var(--ink-3)'}
                size={22}
                label={`${d.label} ${d.number}`}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}
