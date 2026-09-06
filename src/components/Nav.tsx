import { Icon, type IconName } from './Icon'
import { haptic } from '../lib/haptics'

export type Route =
  | 'today' | 'trajectory' | 'capture' | 'insights' | 'you'
  | 'measurements' | 'explore'

interface NavItem { route: Route; label: string; icon: IconName }

/** Five primary destinations on mobile — the platform limit for a tab bar. */
export const PRIMARY: NavItem[] = [
  { route: 'today',      label: 'Today',      icon: 'today' },
  { route: 'trajectory', label: 'Trajectory', icon: 'trajectory' },
  { route: 'capture',    label: 'Capture',    icon: 'capture' },
  { route: 'insights',   label: 'Insights',   icon: 'insights' },
  { route: 'you',        label: 'You',        icon: 'profile' },
]

/** On a wide window there is room to show everything at once. */
export const SECONDARY: NavItem[] = [
  { route: 'measurements', label: 'Measurements', icon: 'measure' },
  { route: 'explore',      label: 'Explore',      icon: 'explore' },
]

export function TabBar({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {PRIMARY.map((item) => {
        const current = route === item.route ||
          (item.route === 'you' && (route === 'measurements' || route === 'explore'))
        return (
          <button
            key={item.route}
            className="tabbar__item"
            aria-current={current ? 'page' : undefined}
            onClick={() => { haptic('select'); onNavigate(item.route) }}
          >
            <Icon name={item.icon} size={22} strokeWidth={current ? 2 : 1.7} />
            <span>{item.label}</span>
            <span className="tabbar__dot" aria-hidden="true" />
          </button>
        )
      })}
    </nav>
  )
}

export function Sidebar({
  route, onNavigate, name, streak,
}: { route: Route; onNavigate: (r: Route) => void; name: string; streak: number }) {
  const items = [...PRIMARY.filter((i) => i.route !== 'you'), ...SECONDARY,
    { route: 'you' as Route, label: 'Profile & goals', icon: 'profile' as IconName }]

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <span className="mark" aria-hidden="true">J</span>
        <div className="stack" style={{ gap: 0 }}>
          <span className="t-body strong">Jumbo</span>
          <span className="t-caption dim2">{name}</span>
        </div>
      </div>

      {items.map((item) => (
        <button
          key={item.route}
          className="sidebar__item"
          aria-current={route === item.route ? 'page' : undefined}
          onClick={() => onNavigate(item.route)}
        >
          <Icon name={item.icon} size={20} strokeWidth={route === item.route ? 2 : 1.7} />
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
