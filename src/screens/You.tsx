import '../styles/profile.css'
import { Icon, type IconName } from '../components/Icon'
import { AvatarButton, ProfilePhotoPicker } from '../components/Asset'
import { DemoBadge, useConfirm, useToast } from '../components/UI'
import { useStore } from '../state/store'
import type { Route } from '../components/Nav'
import { consistencyStreak, dailyProgress } from '../lib/analytics'
import { planById } from '../data/plans'
import { haptic } from '../lib/feedback'

/** One row of the grouped menu: where it goes, and what it is about. */
interface MenuRow {
  id: string
  icon: IconName
  colour: string
  title: string
  sub: string
  /** The group inside Settings this row lands on. */
  anchor: string
}

const MENU: MenuRow[] = [
  { id: 'goals', icon: 'target', colour: 'var(--brand)', title: 'Your goals', sub: 'What Jumbo shows you first', anchor: 'goals' },
  { id: 'sources', icon: 'phone', colour: 'var(--recovery)', title: 'Connected sources', sub: 'Apple Health, Oura, Garmin and more', anchor: 'sources' },
  { id: 'data', icon: 'measure', colour: 'var(--sleep)', title: 'Your data', sub: 'Export, or clear it from this device', anchor: 'data' },
  { id: 'reminders', icon: 'bell', colour: 'var(--nutrition)', title: 'Reminders', sub: 'Meal, workout and check-in nudges', anchor: 'reminders' },
  { id: 'settings', icon: 'settings', colour: 'var(--ink-2)', title: 'App settings', sub: 'Appearance, feel and privacy', anchor: 'account' },
]

/**
 * You.
 *
 * A summary, not a control panel. Who you are, four numbers worth knowing,
 * and the way through to everything that can be changed. The switches
 * themselves live in Settings, because a screen that is both a profile and
 * a settings panel is neither.
 */
export function You({ onNavigate }: { onNavigate: (r: Route, anchor?: string) => void }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const { confirm, node: confirmNode } = useConfirm()

  const streak = consistencyStreak(state.days, state.baseline)
  const connected = state.providers.filter((p) => p.connection).length
  const firstName = state.profile.name.trim().split(' ')[0]
  // The same figure Today shows in the middle of its rings, for the day
  // being looked at, rather than a second score computed a second way.
  const day = state.days[state.days.length - 1]
  const score = day ? Math.round(dailyProgress(day, state.baseline).overall * 100) : 0

  const plan = planById(state.plan)
  const isFree = state.plan === 'free'

  const open = (anchor: string) => { haptic('selection'); onNavigate('settings', anchor) }

  return (
    <div className="stack stack-5">
      {/*
        This is the one screen that is about the person rather than about
        their day, so the photograph is the page rather than a control in
        its corner. Tapping it changes it; it does not navigate, because
        you are already here.
      */}
      <header className="you-head">
        <h1 className="you-head__title">You</h1>
        <ProfilePhotoPicker
          size={104}
          onError={(message) => toast({ text: message, icon: 'info', tone: 'warning' })}
        />
        <p className="you-head__say">
          {firstName ? `${firstName}, keep going` : 'Your profile and your progress'}
          {' '}<span aria-hidden="true">🌱</span>
        </p>
      </header>

      {state.dataMode === 'demo' && <DemoBadge />}

      {/* ────────────────────────────────────────── who, and how it is going */}
      <section className="card prof">
        <button className="prof__top" onClick={() => open('account')}>
          <span className="grow stack" style={{ gap: 3, minWidth: 0 }}>
            <span className="prof__name">
              {state.profile.name || 'Add your name'}
            </span>
            <span className="prof__meta">
              {state.baseline.daysOfHistory} days
              {connected > 0 ? ` · ${connected} connected` : ''}
              {streak > 0 ? ` · ${streak}-day streak` : ''}
            </span>
            <span className="prof__say">Small steps. A healthier, brighter you.</span>
          </span>
          <Icon name="chevron" size={17} style={{ flex: 'none', color: 'var(--ink-3)' }} />
        </button>

        {/* Four figures Jumbo actually holds. Nothing here is invented: an
            empty streak shows as zero rather than as encouragement. */}
        <div className="prof__stats">
          <Stat icon="target" colour="var(--brand)" value={state.goals.length} label="Goals" />
          <Stat icon="today" colour="var(--sleep)" value={state.baseline.daysOfHistory} label="Days active" />
          <Stat icon="bolt" colour="var(--nutrition)" value={streak} label="Day streak" />
          <Stat icon="heart" colour="var(--recovery)" value={score} label="Health score" />
        </div>
      </section>

      {/* ───────────────────────────────────────────────────── the plan ─────
          What plan this person is actually on. There is no billing yet, so
          for now this always reads Free and the card offers the plans rather
          than claiming a subscription nobody bought. */}
      <button className="plancard" onClick={() => { haptic('selection'); onNavigate('subscribe') }}>
        <span className="plancard__icon">
          <Icon name={isFree ? 'sparkles' : (plan.icon as IconName)} size={19} />
        </span>
        <span className="grow stack" style={{ gap: 3, minWidth: 0, textAlign: 'left' }}>
          <span className="plancard__title">{isFree ? 'JUMBO Pro' : plan.name}</span>
          <span className="plancard__sub">
            {isFree
              ? 'Unlock deeper insights, advanced analysis and personalised plans.'
              : `${plan.pitch} ${plan.credits.toLocaleString('en-IN')} AI credits a month.`}
          </span>
        </span>
        <span className="plancard__cta">{isFree ? 'Explore plans' : 'Manage plan'}</span>
      </button>

      {/* ─────────────────────────────────────────────────────────── the menu */}
      <nav className="group" aria-label="Settings">
        {MENU.map((row) => (
          <button key={row.id} className="row-item" onClick={() => open(row.anchor)}>
            <span
              className="row-item__icon"
              style={{ background: `color-mix(in srgb, ${row.colour} 18%, transparent)`, color: row.colour }}
            >
              <Icon name={row.icon} size={16} />
            </span>
            <span className="grow stack" style={{ gap: 1, minWidth: 0 }}>
              <span className="row-item__title">{row.title}</span>
              <span className="row-item__sub">{row.sub}</span>
            </span>
            <Icon name="chevron" size={16} style={{ flex: 'none', color: 'var(--ink-3)' }} />
          </button>
        ))}
      </nav>

      {/* ────────────────────────────────────────────────────────── sign out */}
      <nav className="group" aria-label="Session">
        <button
          className="row-item row-item--danger"
          onClick={() => confirm({
            title: 'Sign out of Jumbo?',
            body: 'Your records stay on this device. You will start again from the welcome screen.',
            confirmLabel: 'Sign out',
            onConfirm: () => { dispatch({ type: 'signOut' }); haptic('impactLight') },
          })}
        >
          <span
            className="row-item__icon"
            style={{ background: 'color-mix(in srgb, var(--critical) 18%, transparent)', color: 'var(--critical)' }}
          >
            <Icon name="signout" size={16} />
          </span>
          <span className="grow row-item__title">Sign out</span>
        </button>
      </nav>

      <p className="t-caption dim2">
        Jumbo is a wellness and longevity companion. It does not diagnose, treat or monitor medical
        conditions, and its projections are not clinical predictions. If something in your data
        worries you, speak to a clinician.
      </p>

      {confirmNode}
    </div>
  )
}

function Stat({
  icon, colour, value, label,
}: { icon: IconName; colour: string; value: number; label: string }) {
  return (
    <div className="prof__stat">
      <Icon name={icon} size={15} style={{ color: colour }} />
      <b className="num">{value}</b>
      <span>{label}</span>
    </div>
  )
}

/** Kept so the avatar in every other header still resolves from here. */
export { AvatarButton }
