import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { Avatar, BrandMark } from './Asset'
import { useStore } from '../state/store'
import { haptic } from '../lib/feedback'

export type Route =
  | 'today' | 'future' | 'capture' | 'explore' | 'you' | 'measurements' | 'chat'
  | 'settings' | 'subscribe' | 'notifications'

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
  const bar = useRef<HTMLElement>(null)
  const { state: { profile } } = useStore()

  /**
   * Publish the bar's real height. The centre action is taller than a tab
   * and the safe area varies by device, so `--tab-h` is the tab's height,
   * not the bar's. Everything that sits directly above the bar reads this
   * instead of adding the two up and being a few pixels out.
   */
  useEffect(() => {
    const el = bar.current
    if (!el) return
    const publish = () => {
      document.documentElement.style.setProperty('--nav-h', `${Math.ceil(el.offsetHeight)}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--nav-h')
    }
  }, [])

  const tab = (item: NavItem) => {
    // Measurements, settings and the conversation are reached from inside a
    // section, so the tab they belong to stays lit rather than nothing being
    // current.
    const current = route === item.route
      || (item.route === 'you' && (route === 'measurements' || route === 'settings' || route === 'subscribe'))
      // Notifications is reached from the bell on Today and Back returns
      // there, so Today stays lit rather than no tab at all.
      || (item.route === 'today' && route === 'notifications')
      || (route === 'chat' && item.route === origin)

    /**
     * The profile tab is the person, not a drawing of one. It is the only
     * place in the app the photograph appears as navigation, so it has to
     * be unmistakably the way to yourself. The ring is how it carries the
     * current state that the other four carry with colour and weight.
     */
    const glyph = item.route === 'you'
      ? <Avatar size={25} photo={profile.photo} name={profile.name} className="tabbar__face" />
      : <Icon name={item.icon} size={23} strokeWidth={current ? 2.1 : 1.75} />

    return (
      <button
        key={item.route}
        className={`tabbar__item${item.route === 'you' ? ' tabbar__item--face' : ''}`}
        aria-current={current ? 'page' : undefined}
        onClick={() => go(item.route)}
      >
        {glyph}
        <span>{item.label}</span>
      </button>
    )
  }

  return (
    <nav className="tabbar" aria-label="Primary" ref={bar}>
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
