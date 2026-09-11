import { useEffect, useMemo, useRef } from 'react'
import { DayRing } from './Rings'
import { useStore } from '../state/store'
import { dailyProgress, type DailyProgress } from '../lib/analytics'
import { addDays, dayLabel } from '../lib/util'
import { haptic } from '../lib/feedback'

const EMPTY: DailyProgress = {
  sleep: 0, movement: 0, nourish: 0, recovery: 0, overall: 0, restDay: false,
}

/**
 * The week strip.
 *
 * Each day carries the same four colours as the hero rings, so a glance down
 * the week reads as shape rather than number. Days after today are shown —
 * a week you can see the whole of is more useful than one that stops
 * mid-air — but they are not selectable, because there is nothing there yet.
 */
export function DateRail({
  selected, onSelect,
}: { selected: string; onSelect: (date: string) => void }) {
  const { state } = useStore()
  const current = useRef<HTMLButtonElement>(null)

  const week = useMemo(() => {
    // Five days behind, today, and one ahead.
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
        progress: record ? dailyProgress(record, state.baseline) : EMPTY,
        hasRecord: Boolean(record),
      }
    })
  }, [state.today, state.days, state.baseline])

  // Keep the selected day in view when the week is wider than the screen.
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selected])

  return (
    <div className="daterail" role="group" aria-label="Choose a day">
      {week.map((d) => {
        const isSelected = d.date === selected
        return (
          <button
            key={d.date}
            ref={isSelected ? current : undefined}
            className={`daterail__day${isSelected ? ' is-selected' : ''}`}
            aria-pressed={isSelected}
            aria-label={`${d.label} ${d.number}${d.isToday ? ', today' : ''}${d.future ? ', not yet' : ''}`}
            disabled={d.future || !d.hasRecord}
            onClick={() => { haptic('selection'); onSelect(d.date) }}
          >
            <span className="daterail__label">{d.label}</span>
            <span className="daterail__num num">{d.number}</span>
            <span className="daterail__ring"><DayRing progress={d.progress} size={26} /></span>
            {d.isToday && <span className="daterail__today">Today</span>}
          </button>
        )
      })}
    </div>
  )
}
