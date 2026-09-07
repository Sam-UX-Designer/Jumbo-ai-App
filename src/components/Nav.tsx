import { createContext, useContext, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { BrandMark } from './Asset'
import { haptic } from '../lib/feedback'

export type Route = 'today' | 'future' | 'capture' | 'explore' | 'you' | 'measurements'

/**
 * Navigation, available to anything on screen. The avatar sits in the top
 * right of every top-level screen and has to reach the profile from there;
 * threading a callback through five screens to do it would be worse.
 */
const NavCtx = createContext<(route: Route) => void>(() => {})
export const useNavigate = () => useContext(NavCtx)

export function NavProvider({ navigate, children }: { navigate: (r: Route) => void; children: ReactNode }) {
  return <NavCtx.Provider value={navigate}>{children}</NavCtx.Provider>
}

interface NavItem { route: Route; label: string; icon: IconName }

/**
 * Five destinations, and only five. Trajectory and Insights were one idea
 * split across two tabs; they are now a single place called Future.
 */
export const PRIMARY: NavItem[] = [
  { route: 'today',   label: 'Today',   icon: 'today' },
  { route: 'future',  label: 'Future',  icon: 'future' },
  { route: 'capture', label: 'Capture', icon: 'capture' },
  { route: 'explore', label: 'Explore', icon: 'explore' },
  { route: 'you',     label: 'You',     icon: 'profile' },
]

const SIDEBAR: NavItem[] = [
  ...PRIMARY.slice(0, 3),
  { route: 'measurements', label: 'Measurements', icon: 'measure' },
  ...PRIMARY.slice(3),
]

export function TabBar({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {PRIMARY.map((item) => {
        const current = route === item.route || (item.route === 'you' && route === 'measurements')
        return (
          <button
            key={item.route}
            className="tabbar__item"
            aria-current={current ? 'page' : undefined}
            onClick={() => { haptic('selection'); onNavigate(item.route) }}
          >
            <Icon name={item.icon} size={23} strokeWidth={current ? 2.1 : 1.75} />
            <span>{item.label}</span>
          </button>
        )
      })}
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
