import { createContext, useContext, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { BrandMark } from './Asset'
import { haptic } from '../lib/feedback'

export type Route =
  | 'today' | 'future' | 'capture' | 'explore' | 'you' | 'measurements' | 'chat'
  | 'settings' | 'subscribe'

/**
 * Navigation, available to anything on screen. The avatar sits in the top
 * right of every top-level screen and has to reach the profile from there;
 * threading a callback through five screens to do it would be worse.
 */
/**
 * What a conversation is about, when it was opened from something specific.
 * Ask Jumbo is one implementation; this is how a screen tells it which meal
 * the question concerns without a second chat.
 */
export interface ChatFocus {
  kind: 'meal'
  /** The day the meal belongs to, so going back can reopen it. */
  date: string
  mealId: string
  /** A compact description of the meal, sent to the AI as the subject. */
  summary: unknown
}

type Navigate = (route: Route, question?: string, focus?: ChatFocus) => void

const NavCtx = createContext<Navigate>(() => {})

/**
 * Navigating to the chat can carry the question that sent you there, so a
 * quick prompt is asked on arrival rather than only prefilled.
 */
export const useNavigate = () => useContext(NavCtx)

export function NavProvider({ navigate, children }: { navigate: Navigate; children: ReactNode }) {
  return <NavCtx.Provider value={navigate}>{children}</NavCtx.Provider>
}

interface NavItem { route: Route; label: string; icon: IconName }

/**
 * Four destinations around one action. Capture is the centre button rather
 * than a fifth tab because adding something is the thing people come back to
 * do, and it should be reachable without aiming.
 */
const LEFT: NavItem[] = [
  { route: 'today',  label: 'Today',     icon: 'today' },
  { route: 'future', label: 'AI Future', icon: 'future' },
]

const RIGHT: NavItem[] = [
  { route: 'explore', label: 'Explore', icon: 'explore' },
  { route: 'you',     label: 'You',     icon: 'profile' },
]

export const PRIMARY: NavItem[] = [
  ...LEFT,
  { route: 'capture', label: 'Capture', icon: 'capture' },
  ...RIGHT,
]

const SIDEBAR: NavItem[] = [
  ...LEFT,
  { route: 'chat',    label: 'Ask Jumbo',    icon: 'ai' },
  { route: 'capture', label: 'Capture',      icon: 'capture' },
  { route: 'measurements', label: 'Measurements', icon: 'measure' },
  ...RIGHT,
]

export function TabBar({
  route, origin, onNavigate,
}: {
  route: Route
  /**
   * The screen Ask Jumbo was opened from. The conversation has no tab of its
   * own, and it can be opened from any of them, so the tab that stays lit is
   * the one Back will return to — anything else tells you that you are
   * somewhere you are not.
   */
  origin?: Route
  onNavigate: (r: Route) => void
}) {
  const go = (r: Route) => { haptic('selection'); onNavigate(r) }

  const tab = (item: NavItem) => {
    // Measurements, settings and the conversation are reached from inside a
    // section, so the tab they belong to stays lit rather than nothing being
    // current.
    const current = route === item.route
      || (item.route === 'you' && (route === 'measurements' || route === 'settings' || route === 'subscribe'))
      || (route === 'chat' && item.route === origin)
    return (
      <button
        key={item.route}
        className="tabbar__item"
        aria-current={current ? 'page' : undefined}
        onClick={() => go(item.route)}
      >
        <Icon name={item.icon} size={23} strokeWidth={current ? 2.1 : 1.75} />
        <span>{item.label}</span>
      </button>
    )
  }

  return (
    <nav className="tabbar" aria-label="Primary">
      {LEFT.map(tab)}

      <button
        className={`tabbar__fab${route === 'capture' ? ' is-current' : ''}`}
        aria-label="Add to today"
        aria-current={route === 'capture' ? 'page' : undefined}
        onClick={() => go('capture')}
      >
        <Icon name="plus" size={26} strokeWidth={2.4} />
      </button>

      {RIGHT.map(tab)}
    </nav>
  )
}

export function Sidebar({
  route, onNavigate, name, streak,
}: { route: Route; onNavigate: (r: Route) => void; name: string; streak: number }) {
  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <BrandMark size={34} />
        <div className="stack" style={{ gap: 0 }}>
          <span className="t-body strong">Jumbo</span>
          <span className="t-caption dim2">{name || 'Your companion'}</span>
        </div>
      </div>

      {SIDEBAR.map((item) => (
        <button
          key={item.route}
          className="sidebar__item"
          aria-current={route === item.route ? 'page' : undefined}
          onClick={() => onNavigate(item.route)}
        >
          <Icon name={item.icon} size={20} strokeWidth={route === item.route ? 2.1 : 1.75} />
          <span className="t-callout">{item.label}</span>
        </button>
      ))}

      <div className="sidebar__spacer" />

      <div className="card card--quiet stack stack-1" style={{ padding: 'var(--s-4)' }}>
        <span className="t-caption dim">Consistency</span>
        <span className="t-title3 num">{streak} {streak === 1 ? 'day' : 'days'}</span>
        <span className="t-caption dim2">Rest days count.</span>
      </div>
    </nav>
  )
}
