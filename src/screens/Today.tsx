import { useMemo, useState } from 'react'
import '../styles/home.css'
import { Icon } from '../components/Icon'
import { AvatarButton, Mascot } from '../components/Asset'
import { Thinking } from '../components/Thinking'
import { DateRail } from '../components/DateRail'
import { Rings, MiniRing } from '../components/Rings'
import { Sparkline } from '../components/Charts'
import { Confidence, Sheet, UnavailableNotice } from '../components/UI'
import { useStore } from '../state/store'
import { useInsights } from '../lib/useInsights'
import { useNavigate } from '../components/Nav'
import {
  consistencyStreak, dailyProgress, dayProtein, keyMetrics, lastN,
  motivationalStatus, todaysFocus, type KeyMetric,
} from '../lib/analytics'
import { prettyDateLong } from '../lib/util'
import { haptic } from '../lib/feedback'

/** What each ring is actually built from, in plain language. */
const METRIC_EXPLAIN: Record<KeyMetric['key'], string> = {
  sleep: 'Measured against the sleep length your own history settles at, not eight hours. Short nights show up in recovery the next morning more reliably than they show up in how you feel.',
  movement: 'Steps and active minutes together, against your usual. The target relaxes on a rest day, because a rest day is meant to be restful.',
  nutrition: 'Protein against your body weight, plus how much of the day you have actually logged. Food is the one thing no wearable can see, so this ring only moves when you tell it something.',
  recovery: 'Heart-rate variability and resting heart rate read against your own baseline. It is a signal about today, not a verdict on you.',
}

/**
 * Today.
 *
 * The order is the order the questions arrive in: who am I, which day, how am
 * I doing, what does Jumbo make of it, what are the numbers, what is worth
 * doing next. Greeting and avatar at the top, the week strip under it, the
 * four rings at the centre of the screen with the score inside them.
 */
export function Today() {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const insights = useInsights()

  const date = state.selectedDate
  const day = useMemo(
    () => state.days.find((d) => d.date === date) ?? state.days[state.days.length - 1],
    [state.days, date],
  )
  const base = state.baseline
  const isToday = date === state.today

  const progress = useMemo(() => dailyProgress(day, base), [day, base])
  const metrics = useMemo(() => keyMetrics(state.days, date, base), [state.days, date, base])
  const focus = useMemo(() => todaysFocus(day, base), [day, base])
  const streak = useMemo(() => consistencyStreak(state.days, base), [state.days, base])
  const status = motivationalStatus(progress)
  const top = insights.insights.filter((i) => !state.dismissed.includes(i.id))[0]
  const [detail, setDetail] = useState<KeyMetric | null>(null)

  // The 21-day series behind whichever metric is open, so the sheet shows the
  // trend rather than restating the number.
  const detailSeries = useMemo(() => {
    if (!detail) return []
    const window = lastN(state.days, 21)
    switch (detail.key) {
      case 'sleep': return window.map((d) => d.sleepHours)
      case 'movement': return window.map((d) => d.steps)
      case 'nutrition': return window.map(dayProtein)
      default: return window.map((d) => d.hrv)
    }
  }, [detail, state.days])

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = state.profile.name.trim().split(' ')[0]

  return (
    <div className="stack stack-5">
      {/* ─────────────────────────── greeting left, bell and profile right */}
      <header className="stack stack-4">
        <div className="scr-head">
          <div className="greet">
            {/* The photograph leads: whose day this is, before the greeting. */}
            <AvatarButton size={46} />
            <div className="stack stack-1" style={{ minWidth: 0 }}>
              <p className="greet__hello">{greeting},</p>
              <h1 className="greet__name">
                {firstName || 'there'} <span aria-hidden="true">👋</span>
              </h1>
            </div>
          </div>
          <div className="scr-head__actions">
            <button
              className="round-btn"
              aria-label="Reminders"
              onClick={() => { haptic('selection'); navigate('you') }}
            >
              <Icon name="bell" size={18} />
              {state.reminders.enabled && <span className="round-btn__dot" />}
            </button>
            <button
              className="round-btn"
              aria-label="Add to today"
              onClick={() => { haptic('selection'); navigate('capture') }}
            >
              <Icon name="plus" size={19} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {state.dataMode === 'demo' && (
          <span className="sample-pill">
            <Icon name="flag" size={12} /> Sample data
          </span>
        )}

        <DateRail
          selected={date}
          onSelect={(d) => dispatch({ type: 'selectDate', date: d })}
        />
      </header>

      {/* ──────────────────────────── the rings, and the score inside them */}
      <section className="stack stack-3" aria-labelledby="score-h">
        <h2 className="sr-only" id="score-h">
          Health score for {isToday ? 'today' : prettyDateLong(date)}
        </h2>

        <div className="score-card">
          <Rings progress={progress} size={156}>
            <span className="score__num num">{Math.round(progress.overall * 100)}</span>
            <span className="score__cap">Health<br />Score</span>
          </Rings>

          <div className="score__say">
            <p className="score__state">
              <Icon name="sprout" size={20} style={{ color: 'var(--brand)', flex: 'none' }} />
              {status.headline}
            </p>
            <p className="score__body">{status.body}</p>
          </div>

          {/* Jumbo's read of the day, inside the card it is a read of. */}
          {insights.problem?.kind === 'setup' ? null
            : insights.loading && !top ? (
              <div className="insight-card">
                <Thinking size={30} />
              </div>
            ) : top ? (
              <button
                className="insight-card insight-card--tap"
                onClick={() => { haptic('selection'); navigate('future') }}
              >
                <span className="insight-card__spark">
                  <Icon name="sparkles" size={16} />
                </span>
                <span className="stack stack-1 grow" style={{ minWidth: 0, textAlign: 'left' }}>
                  <span className="t-caption">{top.changed}</span>
                  <Confidence value={top.confidence} compact />
                </span>
                <Icon name="chevron" size={15} style={{ flex: 'none', color: 'var(--ink-3)' }} />
              </button>
            ) : null}
        </div>

        {insights.problem?.kind === 'setup' && (
          <UnavailableNotice
            title="Jumbo’s read of today isn’t available"
            message="Your own numbers below are unaffected."
            compact
          />
        )}
      </section>

      {/* ───────────────────────────────────────── the four that matter */}
      <section>
        <h2 className="sr-only">Key metrics</h2>
        <ul className="metric-grid stagger">
          {metrics.map((m) => (
            <li key={m.key} style={{ display: 'flex' }}>
              <button
                className="metric"
                onClick={() => { haptic('selection'); setDetail(m) }}
                aria-label={
                  `${m.label}: ${m.value} ${m.unit}`
                  + (m.note ? `, ${m.note}` : m.deltaPct !== null ? `, ${m.deltaPct > 0 ? 'up' : 'down'} ${Math.abs(m.deltaPct)} percent against the past week` : '')
                  + '. Open details.'
                }
              >
                <Icon name={m.icon} size={22} className="metric__icon" style={{ color: m.colour }} />
                <span className="metric__label">{m.label}</span>
                <span className="metric__value num">{m.value}</span>
                <span className="metric__unit">{m.unit}</span>
                {m.note ? (
                  <span className={`metric__delta${m.note === 'On target' ? ' is-up' : ''}`}>
                    {m.note === 'On target' && <Icon name="check" size={12} strokeWidth={2.4} />}
                    {m.note}
                  </span>
                ) : m.deltaPct === null ? (
                  <span className="metric__delta">No basis</span>
                ) : (
                  <span className={`metric__delta${m.deltaPct > 0 ? ' is-up' : m.deltaPct < 0 ? ' is-down' : ''}`}>
                    {m.deltaPct !== 0 && (
                      <Icon
                        name="arrow-up" size={12} strokeWidth={2.4}
                        style={{ transform: m.deltaPct < 0 ? 'rotate(180deg)' : undefined }}
                      />
                    )}
                    {m.deltaPct > 0 ? '+' : ''}{m.deltaPct}%
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* The detail behind one number, and a way to ask about it. */}
      <Sheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.label ?? ''}
        subtitle={isToday ? 'Today, against your last 21 days' : `${prettyDateLong(date)}, against your last 21 days`}
        footer={
          <>
            <button className="btn btn--secondary" onClick={() => setDetail(null)}>Close</button>
            <button
              className="btn btn--primary grow"
              onClick={() => {
                const q = `How is my ${detail?.label.toLowerCase()} doing, and what should I do about it?`
                setDetail(null)
                navigate('chat', q)
              }}
            >
              <Icon name="sparkles" size={15} /> Ask Jumbo about this
            </button>
          </>
        }
      >
        {detail && (
          <div className="stack stack-5">
            <div className="row" style={{ gap: 'var(--s-4)' }}>
              <MiniRing value={detail.ring} colour={detail.colour} size={56} label={detail.label} />
              <div className="stack stack-1 grow" style={{ minWidth: 0 }}>
                <span className="t-display num" style={{ fontSize: 32, lineHeight: 1 }}>{detail.value}</span>
                <span className="t-caption dim2">
                  {detail.unit}
                  {detail.efficiency ? ` · ${detail.efficiency}% efficiency` : ''}
                </span>
              </div>
            </div>

            <div className="card card--quiet stack stack-3">
              <span className="eyebrow">Last 21 days</span>
              <Sparkline
                values={detailSeries} colour={detail.colour} width={280} height={54}
                label={`${detail.label} over 21 days`}
              />
              <p className="t-caption dim2">
                {detail.note
                  ? detail.note
                  : detail.deltaPct === null
                    ? 'Not enough history behind this day to compare it to anything yet.'
                    : `${detail.deltaPct > 0 ? 'Above' : detail.deltaPct < 0 ? 'Below' : 'Level with'} your previous seven days${detail.deltaPct !== 0 ? ` by ${Math.abs(detail.deltaPct)}%` : ''}.`}
              </p>
            </div>

            <p className="t-callout dim">{METRIC_EXPLAIN[detail.key]}</p>

            <p className="t-caption dim2">
              {state.dataMode === 'demo'
                ? 'Sample records, so you can see how this works.'
                : 'Measured by your connected sources.'}
            </p>
          </div>
        )}
      </Sheet>

      {/* ──────────────────────────────────────────── the way into the AI */}
      <button
        className="ask-card"
        onClick={() => { haptic('selection'); navigate('chat') }}
      >
        <Mascot size={52} />
        <span className="stack stack-1 grow" style={{ minWidth: 0, textAlign: 'left' }}>
          <span className="ask-card__title">Ask Jumbo anything</span>
          <span className="ask-card__sub">
            Personalised answers from your own data, or plan your next step.
          </span>
        </span>
        <Icon name="chevron" size={18} style={{ flex: 'none', color: 'var(--ink-3)' }} />
      </button>

      {/* ───────────────────────────────────────────────── today's focus */}
      <section className="stack stack-3">
        <div className="sec-head">
          <h2 className="sec-head__title">{isToday ? 'Today’s focus' : 'That day’s focus'}</h2>
          <button className="sec-head__link" onClick={() => navigate('capture')}>
            Add <Icon name="plus" size={14} />
          </button>
        </div>
        <ul className="focus-row">
          {focus.map((f) => (
            <li key={f.id} className={`focus${f.done ? ' is-done' : ''}`}>
              <span className="focus__top">
                <span
                  className="focus__icon"
                  style={{ background: f.done ? 'var(--brand-dim)' : 'var(--surface-2)' }}
                >
                  <Icon name={f.icon} size={16} style={{ color: f.done ? 'var(--brand)' : f.colour }} />
                </span>
                <MiniRing
                  value={f.progress}
                  colour={f.done ? 'var(--brand)' : f.colour}
                  size={26}
                  label={f.title}
                />
              </span>
              <span className="stack" style={{ minWidth: 0, gap: 2 }}>
                <span className="focus__title">{f.title}</span>
                <span className="focus__sub">{f.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ────────────────────────────────────────────────────── consistency */}
      <section className="card card--quiet row row--between" style={{ gap: 'var(--s-4)' }}>
        <div className="stack stack-1 none">
          <span className="t-caption dim">Consistency</span>
          <span className="t-title3 num">{streak} {streak === 1 ? 'day' : 'days'}</span>
        </div>
        <p className="t-caption dim2 grow" style={{ maxWidth: '26ch' }}>
          {progress.restDay
            ? 'Rest day. Recovery counts for more today.'
            : 'Built on sleeping and moving enough. One off day is forgiven.'}
        </p>
      </section>

      <button
        className="btn btn--ghost btn--block"
        onClick={() => navigate('measurements')}
        style={{ justifyContent: 'space-between' }}
      >
        <span className="row" style={{ gap: 'var(--s-2)' }}>
          <Icon name="measure" size={17} /> Measurements
        </span>
        <span className="row t-caption dim2" style={{ gap: 6 }}>
          VO₂ max {base.vo2max.toFixed(1)} <Icon name="chevron" size={14} />
        </span>
      </button>

      <p className="t-caption dim2">
        Jumbo is a wellness companion. It does not diagnose and it is not a substitute for
        professional care.
      </p>
    </div>
  )
}
