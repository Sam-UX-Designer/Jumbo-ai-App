import { useMemo } from 'react'
import { AiOrb, Icon, type IconName } from '../components/Icon'
import { Rings, MiniRing, RING_DEFS } from '../components/Rings'
import { Sparkline } from '../components/Charts'
import { Confidence, DemoBadge, Empty, SectionHead, SetupNotice } from '../components/UI'
import { useStore } from '../state/store'
import { useInsights } from '../lib/useInsights'
import type { Route } from '../components/Nav'
import { consistencyStreak, dailyProgress, dayKcal, dayProtein, lastN } from '../lib/analytics'
import { hoursToHM, prettyDateLong } from '../lib/util'

export function Today({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state } = useStore()
  const day = state.days[state.days.length - 1]
  const base = state.baseline
  const insights = useInsights()

  const progress = useMemo(() => dailyProgress(day, base), [day, base])
  const streak = useMemo(() => consistencyStreak(state.days, base), [state.days, base])
  const top = insights.insights.filter((i) => !state.dismissed.includes(i.id))[0]

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = state.profile.name.trim().split(' ')[0]

  const next = nextAction(progress, day.meals.length)

  return (
    <div className="stack stack-14">
      {/* ────────────────────────────────── How am I doing? */}
      <header className="stack stack-3">
        <div className="row row--between">
          <p className="eyebrow">{prettyDateLong(day.date)}</p>
          {state.dataMode === 'demo' && <DemoBadge inline />}
        </div>
        <h1 className="t-display">{greeting}{firstName ? `, ${firstName}` : ''}.</h1>
        <p className="t-body dim" style={{ maxWidth: '32ch' }}>{describeDay(progress)}</p>
      </header>

      <section className="stack stack-6" aria-labelledby="today-state">
        <h2 className="sr-only" id="today-state">Today’s state</h2>

        <div className="stack stack-3" style={{ alignItems: 'center' }}>
          <Rings progress={progress} size={216}>
            <span className="num" style={{ fontSize: 34, fontWeight: 660, letterSpacing: '-0.04em', lineHeight: 1 }}>
              {Math.round(progress.overall * 100)}
            </span>
          </Rings>
          <span className="t-caption dim2">
            <span className="num strong" style={{ color: 'var(--ink)' }}>{Math.round(progress.overall * 100)}%</span> of today so far
          </span>
        </div>

        <ul className="row" style={{ justifyContent: 'space-between', gap: 'var(--s-2)' }}>
          {RING_DEFS.map((r) => (
            <li key={r.key} className="stack stack-1" style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
              <span className="dot" style={{ background: r.colour }} />
              <span className="t-title3 num">{Math.round(progress[r.key] * 100)}</span>
              <span className="t-caption dim2">{r.label}</span>
            </li>
          ))}
        </ul>

        <div className="card card--quiet row row--between">
          <div className="stack stack-1">
            <span className="t-caption dim">Consistency</span>
            <span className="t-title3 num">{streak} {streak === 1 ? 'day' : 'days'}</span>
          </div>
          <p className="t-caption dim2" style={{ maxWidth: '24ch', textAlign: 'right' }}>
            {progress.restDay
              ? 'Rest day. Recovery counts for more today.'
              : 'Built on sleeping and moving enough. One off day is forgiven.'}
          </p>
        </div>
      </section>

      {/* ────────────────────────────────── What changed? */}
      <section className="section">
        <SectionHead
          title="What changed"
          sub={
            insights.engine === 'claude' ? `Read by Jumbo’s AI${insights.model ? ` · ${insights.model}` : ''}`
              : insights.engine === 'on-device' ? 'Computed on this device from your own records'
              : 'Pattern analysis is off in your settings'
          }
          action={
            insights.insights.length > 1
              ? <button className="btn btn--ghost btn--sm" onClick={() => onNavigate('future')}>See all</button>
              : undefined
          }
        />

        {insights.problem?.kind === 'setup' && (
          <SetupNotice
            title="Jumbo’s AI is not connected"
            message={insights.problem.message}
            missing={insights.problem.missing}
            compact
          />
        )}

        {insights.engine === 'off' ? (
          <Empty
            icon="lock" title="Nothing is being interpreted"
            body="Your data is still recorded and visible. Jumbo is simply not looking for patterns in it."
            action={<button className="btn btn--secondary" onClick={() => onNavigate('you')}>Settings</button>}
          />
        ) : insights.loading && !top ? (
          <div className="card row" style={{ gap: 'var(--s-4)' }}>
            <AiOrb working label="Jumbo is reading your data" />
            <div className="stack stack-2 grow">
              <div className="skeleton" style={{ height: 14, width: '82%' }} />
              <div className="skeleton" style={{ height: 14, width: '64%' }} />
            </div>
          </div>
        ) : !top ? (
          <Empty icon="ai" title="Nothing to flag" body="Your patterns look steady. Jumbo speaks up when something changes, not on a schedule." />
        ) : (
          <button
            className="card card--brand stack stack-4 rise"
            style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
            onClick={() => onNavigate('future')}
          >
            <div className="row row--between">
              <div className="row" style={{ gap: 'var(--s-2)' }}>
                <AiOrb size="sm" />
                <span className="eyebrow">{top.domain}</span>
              </div>
              <Confidence value={top.confidence} compact />
            </div>
            <p className="t-body">{top.changed}</p>
            <div className="row row--between">
              <span className="t-caption dim2">{top.window}</span>
              <span className="t-caption strong brandy">
                Why it matters <Icon name="chevron" size={12} style={{ display: 'inline', verticalAlign: -1 }} />
              </span>
            </div>
          </button>
        )}
      </section>

      {/* ────────────────────────────────── What should I do next? */}
      <section className="section">
        <SectionHead title="Next" />
        <div className="card stack stack-4">
          <div className="row row--top" style={{ gap: 'var(--s-3)' }}>
            <AiOrb size="sm" />
            <div className="stack stack-1">
              <p className="t-body strong">{next.title}</p>
              <p className="t-callout dim">{next.body}</p>
            </div>
          </div>
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            <button className="btn btn--primary btn--sm" onClick={() => onNavigate(next.route)}>{next.cta}</button>
            <button className="btn btn--ghost btn--sm" onClick={() => onNavigate('future')}>Where this leads</button>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────── The detail, if wanted */}
      <section className="section">
        <SectionHead
          title="Where it comes from"
          sub={state.dataMode === 'live' ? 'Measured by your connected sources.' : 'Sample records, so you can see how this works.'}
        />
        <div className="stack stack-3 stagger">
          <DomainRow
            icon="sleep" colour="var(--sleep)" label="Sleep" idle
            value={day.sleepHours > 0 ? hoursToHM(day.sleepHours) : '—'}
            sub={day.sleepEfficiency ? `${day.sleepEfficiency}% efficiency` : 'Not recorded'}
            ring={progress.sleep}
            spark={lastN(state.days, 21).map((d) => d.sleepHours)}
          />
          <DomainRow
            icon="steps" colour="var(--movement)" label="Movement"
            value={day.steps.toLocaleString()}
            sub={`steps · ${day.activeMinutes} active minutes`}
            ring={progress.movement}
            spark={lastN(state.days, 21).map((d) => d.steps)}
          />
          <DomainRow
            icon="plate" colour="var(--nutrition)" label="Food"
            value={day.meals.length ? `${dayProtein(day)} g` : 'Nothing logged'}
            sub={day.meals.length
              ? `protein · ${dayKcal(day).toLocaleString()} kcal · ${day.meals.length} ${day.meals.length === 1 ? 'meal' : 'meals'}`
              : 'One photo closes this gap'}
            ring={progress.nourish}
            spark={lastN(state.days, 21).map(dayProtein)}
            action={<button className="btn btn--secondary btn--sm" onClick={() => onNavigate('capture')}>
              <Icon name="camera" size={14} /> Log
            </button>}
          />
          <DomainRow
            icon="training" colour="var(--training)" label="Training"
            value={day.workout ? day.workout.type : progress.restDay ? 'Rest day' : 'Nothing yet'}
            sub={day.workout
              ? `${day.workout.minutes} min · ${['easy', 'moderate', 'hard'][day.workout.intensity - 1]}`
              : progress.restDay ? 'Planned recovery, this counts' : 'Log a session when you finish'}
            ring={day.workout || progress.restDay ? 1 : 0}
            spark={lastN(state.days, 21).map((d) => (d.workout ? d.workout.minutes : 0))}
          />
          <DomainRow
            icon="heart" colour="var(--recovery)" label="Recovery" idle
            value={day.hrv ? `${day.hrv} ms` : '—'}
            sub={day.hrv ? `HRV against your ${base.hrv} ms baseline · resting HR ${day.restingHR}` : 'Not recorded'}
            ring={progress.recovery}
            spark={lastN(state.days, 21).map((d) => d.hrv)}
          />
        </div>

        <button
          className="btn btn--ghost btn--block"
          onClick={() => onNavigate('measurements')}
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
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */
function DomainRow({
  icon, colour, label, value, sub, ring, spark, action, idle,
}: {
  icon: IconName
  colour: string
  label: string
  value: string
  sub: string
  ring: number
  spark: number[]
  action?: React.ReactNode
  idle?: boolean
}) {
  return (
    <div className="card row" style={{ gap: 'var(--s-4)' }}>
      <div style={{ position: 'relative', flex: 'none' }}>
        <MiniRing value={ring} colour={colour} size={48} label={label} />
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: colour }}>
          <Icon name={icon} size={18} motion={idle ? 'idle' : 'none'} />
        </span>
      </div>
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="t-caption dim">{label}</span>
        <span className="t-title3 num">{value}</span>
        <span className="t-caption dim2">{sub}</span>
      </div>
      <div className="stack stack-2 none" style={{ alignItems: 'flex-end' }}>
        <Sparkline values={spark} colour={colour} width={72} height={26} label={`${label} over 21 days`} />
        {action}
      </div>
    </div>
  )
}

function describeDay(p: ReturnType<typeof dailyProgress>) {
  if (p.restDay) return 'A rest day. Sleep and food are what matter today.'
  if (p.recovery < 0.35) return 'Recovery is running low. An easy day would serve you better than a hard one.'
  if (p.overall > 0.7) return 'Everything is tracking well.'
  if (p.sleep < 0.75) return 'Short night. Expect today to feel heavier than usual.'
  return 'A normal day so far. Nothing needs fixing.'
}

function nextAction(p: ReturnType<typeof dailyProgress>, meals: number):
  { title: string; body: string; cta: string; route: Route } {
  if (meals === 0) {
    return {
      title: 'Photograph your next meal',
      body: 'Food is the one thing your devices cannot see. One photo and the picture is complete.',
      cta: 'Open the camera', route: 'capture',
    }
  }
  if (p.recovery < 0.4) {
    return {
      title: 'Take the easy option today',
      body: 'Your recovery signals are below baseline. A walk or a mobility session keeps the streak without the cost.',
      cta: 'Log something easy', route: 'capture',
    }
  }
  if (p.movement < 0.5) {
    return {
      title: 'A twenty-minute walk finishes the ring',
      body: 'You are short of your usual movement. Walking is the least fragile way to close the gap.',
      cta: 'Log a walk', route: 'capture',
    }
  }
  if (p.nourish < 0.6) {
    return {
      title: 'Protein is behind where it usually sits',
      body: 'One protein-forward item at your next meal normally covers it.',
      cta: 'Log a meal', route: 'capture',
    }
  }
  return {
    title: 'You are on track. Look further out.',
    body: 'A good moment to see what this pattern could mean over the next year.',
    cta: 'Open Future', route: 'future',
  }
}
