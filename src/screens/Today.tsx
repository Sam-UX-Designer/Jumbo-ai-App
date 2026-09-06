import { useMemo } from 'react'
import { Icon } from '../components/Icon'
import { Rings, RingLegend, MiniRing } from '../components/Rings'
import { Sparkline } from '../components/Charts'
import { Confidence, Empty, SectionHead } from '../components/UI'
import { useStore } from '../state/store'
import type { Route } from '../components/Nav'
import {
  buildInsights, consistencyStreak, dailyProgress, dayKcal, dayProtein, lastN,
} from '../lib/analytics'
import { hoursToHM, prettyDateLong, round } from '../lib/util'

export function Today({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state } = useStore()
  const day = state.days[state.days.length - 1]
  const base = state.baseline
  const connected = Object.keys(state.connections).length > 0

  const progress = useMemo(() => dailyProgress(day, base), [day, base])
  const streak = useMemo(() => consistencyStreak(state.days, base), [state.days, base])
  const insights = useMemo(
    () => (state.settings.aiPatterns ? buildInsights(state.days, base, state.measurements) : []),
    [state.days, base, state.measurements, state.settings.aiPatterns],
  )
  const top = insights.filter((i) => !state.dismissed.includes(i.id)).slice(0, 2)

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (!connected) {
    return (
      <div className="stack stack-6">
        <header className="stack stack-2">
          <p className="eyebrow">{prettyDateLong(day.date)}</p>
          <h1 className="t-title1">{greeting}</h1>
        </header>
        <Empty
          icon="link"
          title="Nothing connected yet"
          body="Connect a source and Jumbo fills in six months of history straight away — no setup week, nothing to type."
          action={<button className="btn btn--primary" onClick={() => onNavigate('you')}>Connect a source</button>}
        />
      </div>
    )
  }

  const kcal = dayKcal(day)
  const protein = dayProtein(day)
  const proteinTarget = Math.max(90, Math.round(base.weightKg * 1.6))
  const stateLine = describeDay(progress)

  return (
    <div className="stack stack-10">
      <header className="stack stack-2">
        <p className="eyebrow">{prettyDateLong(day.date)}</p>
        <h1 className="t-title1">{greeting}</h1>
        <p className="t-callout dim">{stateLine}</p>
      </header>

      {/* -------------------------------------------------- Daily state */}
      <section className="card stack stack-5" aria-labelledby="today-state">
        <h2 className="sr-only" id="today-state">Today’s state</h2>
        <div className="row" style={{ gap: 'var(--s-6)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: 'var(--ink)', flex: 'none' }}>
            <Rings progress={progress} size={158} />
          </div>
          <div className="grow stack stack-4" style={{ minWidth: 168 }}>
            <div className="stack stack-1">
              <span className="t-caption dim">Today so far</span>
              <div className="row" style={{ alignItems: 'baseline', gap: 4 }}>
                <span className="t-title1 num">{Math.round(progress.overall * 100)}</span>
                <span className="t-callout dim">%</span>
              </div>
            </div>
            <RingLegend progress={progress} />
          </div>
        </div>

        <hr className="hairline" />

        <div className="row row--between">
          <div className="stack stack-1">
            <span className="t-caption dim">Consistency</span>
            <span className="t-body strong num">{streak} {streak === 1 ? 'day' : 'days'}</span>
          </div>
          <p className="t-caption dim2" style={{ maxWidth: '26ch', textAlign: 'right' }}>
            {progress.restDay
              ? 'Rest day — recovery counts for more today.'
              : 'Built on sleeping and moving enough. Rest days keep it going.'}
          </p>
        </div>
      </section>

      {/* -------------------------------------------------- Domain detail */}
      <section className="section">
        <SectionHead title="Where it comes from" sub="Measured by your connected sources." />
        <div className="stack stack-3">
          <DomainRow
            icon="sleep" color="var(--sleep)" label="Sleep"
            value={day.sleepHours > 0 ? hoursToHM(day.sleepHours) : '—'}
            sub={`${day.sleepEfficiency}% efficiency · bed at ${formatBedtime(day.bedtimeHour)}`}
            ring={progress.sleep}
            spark={lastN(state.days, 21).map((d) => d.sleepHours)}
          />
          <DomainRow
            icon="steps" color="var(--movement)" label="Movement"
            value={day.steps.toLocaleString()}
            sub={`steps · ${day.activeMinutes} active minutes`}
            ring={progress.movement}
            spark={lastN(state.days, 21).map((d) => d.steps)}
          />
          <DomainRow
            icon="plate" color="var(--nutrition)" label="Meals"
            value={day.meals.length ? `${protein} g` : 'Nothing logged'}
            sub={day.meals.length
              ? `protein of ~${proteinTarget} g · ${kcal.toLocaleString()} kcal · ${day.meals.length} ${day.meals.length === 1 ? 'meal' : 'meals'}`
              : 'Photograph your next meal to close the gap'}
            ring={progress.nourish}
            spark={lastN(state.days, 21).map(dayProtein)}
            action={<button className="btn btn--secondary btn--sm" onClick={() => onNavigate('capture')}>
              <Icon name="camera" size={14} /> Log
            </button>}
          />
          <DomainRow
            icon="dumbbell" color="var(--recovery)" label="Training"
            value={day.workout ? `${day.workout.type}` : progress.restDay ? 'Rest day' : 'Nothing yet'}
            sub={day.workout
              ? `${day.workout.minutes} min · ${['easy', 'moderate', 'hard'][day.workout.intensity - 1]}`
              : progress.restDay ? 'Planned recovery — this counts' : 'Log a session when you finish'}
            ring={day.workout ? 1 : progress.restDay ? 1 : 0}
            spark={lastN(state.days, 21).map((d) => (d.workout ? d.workout.minutes : 0))}
            action={!day.workout && !progress.restDay
              ? <button className="btn btn--secondary btn--sm" onClick={() => onNavigate('capture')}>Log</button>
              : undefined}
          />
          <DomainRow
            icon="heart" color="var(--heart)" label="Recovery"
            value={`${day.hrv} ms`}
            sub={`HRV vs ${base.hrv} ms baseline · resting HR ${day.restingHR} bpm`}
            ring={progress.recovery}
            spark={lastN(state.days, 21).map((d) => d.hrv)}
          />
        </div>
      </section>

      {/* -------------------------------------------------- Insights */}
      <section className="section">
        <SectionHead
          title="What Jumbo noticed"
          sub={state.settings.aiPatterns ? 'Two things worth a moment.' : 'Pattern analysis is off in your privacy settings.'}
          action={<button className="btn btn--ghost btn--sm" onClick={() => onNavigate('insights')}>All insights</button>}
        />
        {!state.settings.aiPatterns ? (
          <Empty
            icon="lock" title="Pattern analysis is off"
            body="Your data is still recorded and visible — Jumbo just isn’t interpreting it."
            action={<button className="btn btn--secondary" onClick={() => onNavigate('you')}>Privacy settings</button>}
          />
        ) : top.length === 0 ? (
          <Empty icon="sparkle" title="Nothing to flag" body="Your patterns look steady. Jumbo will speak up when something changes." />
        ) : (
          <div className="stack stack-3">
            {top.map((i) => (
              <button
                key={i.id} className="card stack stack-3"
                style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                onClick={() => onNavigate('insights')}
              >
                <div className="row row--between">
                  <span className="eyebrow">{i.domain}</span>
                  <Confidence value={i.confidence} compact />
                </div>
                <p className="t-body">{i.changed}</p>
                <div className="row row--between">
                  <span className="t-caption dim2">{i.window}</span>
                  <span className="t-caption strong" style={{ color: 'var(--accent)' }}>
                    See the evidence <Icon name="chevron" size={12} style={{ display: 'inline', verticalAlign: -1 }} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- Next step */}
      <section className="section">
        <SectionHead title="The next useful thing" />
        <div className="card stack stack-4">
          <div className="row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
            <Icon name="sparkle" size={20} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
            <div className="stack stack-1">
              <p className="t-body strong">{nextAction(progress, day.meals.length).title}</p>
              <p className="t-callout dim">{nextAction(progress, day.meals.length).body}</p>
            </div>
          </div>
          <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm" onClick={() => onNavigate(nextAction(progress, day.meals.length).route)}>
              {nextAction(progress, day.meals.length).cta}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => onNavigate('trajectory')}>
              See where this leads
            </button>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- Shortcuts */}
      <section className="section">
        <SectionHead title="Also in Jumbo" />
        <div className="grid grid--2">
          <ShortcutCard
            icon="measure" title="Measurements"
            sub={`VO₂ max ${base.vo2max.toFixed(1)} · ${state.measurements.length} records`}
            onClick={() => onNavigate('measurements')}
          />
          <ShortcutCard
            icon="explore" title="Explore"
            sub={`${state.following.length} creators followed`}
            onClick={() => onNavigate('explore')}
          />
        </div>
        <p className="t-caption dim2" style={{ marginTop: 'var(--s-2)' }}>
          Jumbo is a wellness companion. It does not diagnose, and it is not a substitute for
          professional care.
        </p>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */
function DomainRow({
  icon, color, label, value, sub, ring, spark, action,
}: {
  icon: 'sleep' | 'steps' | 'plate' | 'dumbbell' | 'heart'
  color: string
  label: string
  value: string
  sub: string
  ring: number
  spark: number[]
  action?: React.ReactNode
}) {
  return (
    <div className="card row" style={{ gap: 'var(--s-4)', alignItems: 'center' }}>
      <div style={{ position: 'relative', color: 'var(--ink)', flex: 'none' }}>
        <MiniRing value={ring} color={color} size={46} label={label} />
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color }}>
          <Icon name={icon} size={17} />
        </span>
      </div>
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="t-caption dim">{label}</span>
        <span className="t-title3 num">{value}</span>
        <span className="t-caption dim2">{sub}</span>
      </div>
      <div className="stack stack-2" style={{ alignItems: 'flex-end', flex: 'none' }}>
        <Sparkline values={spark} color={color} width={72} height={26} label={`${label} over 21 days`} />
        {action}
      </div>
    </div>
  )
}

function ShortcutCard({
  icon, title, sub, onClick,
}: { icon: 'measure' | 'explore'; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="card stack stack-2" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={onClick}>
      <Icon name={icon} size={20} style={{ color: 'var(--accent)' }} />
      <span className="t-callout strong">{title}</span>
      <span className="t-caption dim2">{sub}</span>
    </button>
  )
}

function describeDay(p: ReturnType<typeof dailyProgress>) {
  if (p.restDay) return 'A rest day. Sleep and food are what matter today.'
  if (p.recovery < 0.35) return 'Recovery is running low — an easy day would serve you better than a hard one.'
  if (p.overall > 0.7) return 'Everything is tracking well today.'
  if (p.sleep < 0.75) return 'Short night. Expect the rest of today to feel heavier than usual.'
  return 'A normal day so far. Nothing needs fixing.'
}

function nextAction(p: ReturnType<typeof dailyProgress>, meals: number):
  { title: string; body: string; cta: string; route: Route } {
  if (meals === 0) {
    return {
      title: 'Photograph your next meal',
      body: 'Food is the one thing your devices can’t see. One photo, five seconds, and the picture is complete.',
      cta: 'Open the camera', route: 'capture',
    }
  }
  if (p.recovery < 0.4) {
    return {
      title: 'Take the easy option today',
      body: 'Your recovery signals are below your baseline. A walk or a mobility session keeps the streak without the cost.',
      cta: 'Log something easy', route: 'capture',
    }
  }
  if (p.movement < 0.5) {
    return {
      title: 'A twenty-minute walk would finish the ring',
      body: 'You’re short of your usual movement. Walking is the least fragile way to close the gap.',
      cta: 'Log a walk', route: 'capture',
    }
  }
  if (p.nourish < 0.6) {
    return {
      title: 'Protein is behind where it usually is',
      body: 'One protein-forward item at your next meal usually covers it.',
      cta: 'Log a meal', route: 'capture',
    }
  }
  return {
    title: 'You’re on track — look further out',
    body: 'This is a good moment to see what your current pattern could mean over the next year.',
    cta: 'Open Trajectory', route: 'trajectory',
  }
}

function formatBedtime(h: number) {
  const hh = Math.floor(h % 24)
  const mm = Math.round((h % 1) * 60)
  const d = new Date()
  d.setHours(hh, mm, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export { round }
