import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { Avatar, BrandMark } from './Asset'
import { useStore } from '../state/store'
import { haptic } from '../lib/feedback'
import { useGlassGroup } from '../lib/useGlass'

export type Route =
  | 'today' | 'future' | 'capture' | 'explore' | 'you' | 'measurements' | 'chat'
  | 'settings' | 'subscribe' | 'notifications' | 'training'

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
  { route: 'future', label: 'Lifestyle', icon: 'future' },
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
  { route: 'training', label: 'Training',      icon: 'training' },
  { route: 'measurements', label: 'Measurements', icon: 'measure' },
  ...RIGHT,
]

/**
 * What the centre button offers.
 *
 * These used to live one screen away: the + opened Capture, and the person
 * picked a kind there. That is two taps and a screen change to write down a
 * glass of water, and the kinds themselves were invisible until you had
 * already committed to going. Putting them on the button makes the choice
 * the first thing you see, and it is where a thumb already is.
 */
export type QuickKind = 'meal' | 'workout' | 'sleep' | 'measurement' | 'note'

export const QUICK_ADD: Array<{ kind: QuickKind; label: string; icon: IconName; tint: string }> = [
  { kind: 'meal',        label: 'Meal',    icon: 'camera',   tint: 'var(--nutrition)' },
  { kind: 'workout',     label: 'Workout', icon: 'training', tint: 'var(--movement)' },
  { kind: 'sleep',       label: 'Sleep',   icon: 'sleep',    tint: 'var(--sleep)' },
  { kind: 'measurement', label: 'Measure', icon: 'measure',  tint: 'var(--measure)' },
  { kind: 'note',        label: 'Note',    icon: 'note',     tint: 'var(--note)' },
]

export function TabBar({
  route, origin, onNavigate, onQuickAdd,
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
  /** Chosen from the centre button: go to Capture with this kind already open. */
  onQuickAdd?: (kind: QuickKind) => void
}) {
  const go = (r: Route) => { haptic('selection'); onNavigate(r) }
  const [adding, setAdding] = useState(false)

  // Escape closes it, as it closes everything else that covers the screen.
  useEffect(() => {
    if (!adding) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdding(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [adding])

  // Moving to another screen closes it too, so it can never be left hanging
  // over a screen it does not belong to.
  useEffect(() => { setAdding(false) }, [route])
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
    // The safe area arrives as padding, and a ResizeObserver watching the
    // default content box never fires for padding alone — the bar grew by
    // the home indicator's inset while `--nav-h` stayed at its flat-screen
    // value, and the chat composer ended up behind the bar. Watch the
    // border box, which is what `offsetHeight` actually measures.
    const ro = new ResizeObserver(publish)
    ro.observe(el, { box: 'border-box' })
    // Padding written from `env()` can also settle after the first paint
    // without the box ever changing size, so take one more reading once the
    // browser has laid the bar out for real.
    const settle = requestAnimationFrame(publish)
    window.addEventListener('resize', publish)
    window.visualViewport?.addEventListener('resize', publish)
    return () => {
      cancelAnimationFrame(settle)
      window.removeEventListener('resize', publish)
      window.visualViewport?.removeEventListener('resize', publish)
      ro.disconnect()
      document.documentElement.style.removeProperty('--nav-h')
    }
  }, [])

  /* The menu sits over whatever screen you opened it from, so it is the
     one place in the app where a lot of glass is stacked over live
     content. A firmer rim than the dock's: these are the panes you are
     meant to notice arriving. */
  const menu = useRef<HTMLUListElement>(null)
  useGlassGroup(menu, '.quickadd__item',
    { scale: -96, chroma: 5, border: 13, blur: 14 }, [adding])

  const tab = (item: NavItem) => {
    // Measurements, settings and the conversation are reached from inside a
    // section, so the tab they belong to stays lit rather than nothing being
    // current.
    const current = route === item.route
      || (item.route === 'you' && (route === 'measurements' || route === 'settings' || route === 'subscribe'))
      // Notifications is reached from the bell on Today and Back returns
      // there, so Today stays lit rather than no tab at all.
      || (item.route === 'today' && route === 'notifications')
      // Training is opened from Capture and Back returns there.
      || (item.route === 'capture' && route === 'training')
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

      {adding && (
        <>
          <button
            className="quickadd__scrim"
            aria-label="Close"
            onClick={() => { haptic('selection'); setAdding(false) }}
          />
          <ul className="quickadd" role="menu" aria-label="What would you like to add?" ref={menu}>
            {QUICK_ADD.map((q, i) => (
              <li key={q.kind} role="none" style={{ '--i': i } as React.CSSProperties}>
                <button
                  className="quickadd__item" role="menuitem"
                  style={{ '--tint': q.tint } as React.CSSProperties}
                  onClick={() => {
                    haptic('impactLight')
                    setAdding(false)
                    if (onQuickAdd) onQuickAdd(q.kind)
                    else onNavigate('capture')
                  }}
                >
                  <span className="quickadd__icon"><Icon name={q.icon} size={20} /></span>
                  <span className="quickadd__label">{q.label}</span>
                </button>
              </li>
            ))}
            {/* The way to the day itself. Without this the Capture screen —
                where everything already recorded is listed — could only be
                reached by opening a form and closing it again, which is a
                strange price to pay for looking at what you logged. */}
            <li role="none" style={{ '--i': QUICK_ADD.length } as React.CSSProperties}>
              <button
                className="quickadd__item quickadd__item--quiet" role="menuitem"
                onClick={() => { haptic('selection'); setAdding(false); onNavigate('capture') }}
              >
                <span className="quickadd__label">See today’s records</span>
              </button>
            </li>
          </ul>
        </>
      )}

      <button
        className={`tabbar__fab${route === 'capture' ? ' is-current' : ''}${adding ? ' is-open' : ''}`}
        aria-label={adding ? 'Close the add menu' : 'Add to today'}
        aria-expanded={adding}
        aria-haspopup="menu"
        aria-current={route === 'capture' && !adding ? 'page' : undefined}
        onClick={() => { haptic('selection'); setAdding((v) => !v) }}
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
