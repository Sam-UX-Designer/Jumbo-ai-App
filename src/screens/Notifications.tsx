import { useMemo, useState } from 'react'
import '../styles/notifications.css'
import { Icon } from '../components/Icon'
import { Empty } from '../components/UI'
import { useStore } from '../state/store'
import { useNavigate, type Route } from '../components/Nav'
import {
  FILTERS, GROUP_ORDER, KIND, SAMPLE_NOTIFICATIONS,
  byNewest, groupOf, inFilter, whenLabel,
  type AppNotification, type NotificationFilter,
} from '../data/notifications'
import { haptic } from '../lib/feedback'

/**
 * Everything Jumbo has told you.
 *
 * One list, ordered by when each thing happened and nothing else. The five
 * filters narrow what is in the list; they never change its order. The
 * groups are the reader's own calendar days, so something from last night
 * sits under Yesterday at breakfast rather than being called "9h ago".
 *
 * What is in the list depends on which data the app is running on, and the
 * screen says which. On recorded data it is only real events: a meal the
 * app analysed, a workout you logged, a milestone you reached. On sample
 * data it is the sample set, marked as such at the top, the same way every
 * other sample surface in the app is marked.
 */
export function Notifications({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<NotificationFilter>('all')

  const all = useMemo(
    () => (state.dataMode === 'demo' ? SAMPLE_NOTIFICATIONS : state.events).slice().sort(byNewest),
    [state.dataMode, state.events],
  )
  const read = useMemo(() => new Set(state.readNotifications), [state.readNotifications])

  /** How many unread there are in each filter, for the badges. */
  const counts = useMemo(() => {
    const out: Record<NotificationFilter, number> = {
      all: 0, insights: 0, goals: 0, achievements: 0, system: 0,
    }
    for (const n of all) {
      if (read.has(n.id)) continue
      out.all += 1
      out[KIND[n.kind].filter] += 1
    }
    return out
  }, [all, read])

  // Filter first, then group. The order inside a group is the order the
  // list already has, which is newest first.
  const shown = all.filter((n) => inFilter(n, filter))
  const groups = GROUP_ORDER
    .map((name) => ({ name, items: shown.filter((n) => groupOf(n.at) === name) }))
    .filter((g) => g.items.length > 0)

  const open = (n: AppNotification) => {
    haptic('selection')
    dispatch({ type: 'readNotification', id: n.id })
    if (n.route) navigate(n.route)
  }

  const markAll = () => {
    haptic('impactLight')
    dispatch({ type: 'readAllNotifications', ids: all.map((n) => n.id) })
  }

  return (
    <div className="stack stack-5">
      <header className="stack stack-4">
        <div className="noti-head">
          <button
            className="icon-btn icon-btn--edge noti-head__back"
            aria-label="Back"
            onClick={() => { haptic('selection'); onNavigate('today') }}
          >
            <Icon name="back" size={19} />
          </button>
          <h1 className="noti-head__title">Notifications</h1>
          <p className="noti-head__sub">Stay updated on your health journey</p>
          <button
            className="noti-head__mark"
            onClick={markAll}
            disabled={counts.all === 0}
          >
            Mark all read
          </button>
        </div>

        {state.dataMode === 'demo' && (
          <span className="sample-pill"><Icon name="flag" size={12} /> Sample data</span>
        )}
      </header>

      {all.length > 0 && (
        <div className="noti-filters rail" role="group" aria-label="Filter notifications">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`notifilter${filter === f.id ? ' is-on' : ''}`}
              style={{ '--tint': f.tint } as React.CSSProperties}
              aria-pressed={filter === f.id}
              onClick={() => { haptic('selection'); setFilter(f.id) }}
            >
              <Icon name={f.icon} size={18} strokeWidth={2} />
              {f.label}
              {counts[f.id] > 0 && (
                <span className="notibadge" aria-label={`${counts[f.id]} unread`}>
                  {counts[f.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {all.length === 0 ? (
        <Empty
          icon="bell"
          title="Nothing yet"
          body="When Jumbo analyses a meal, notices a pattern or marks something you have reached, it lands here."
        />
      ) : shown.length === 0 ? (
        <p className="t-callout dim2 noti-none">
          Nothing under {FILTERS.find((f) => f.id === filter)?.label}.
        </p>
      ) : (
        groups.map((group) => (
          <section className="stack stack-3" key={group.name}>
            <h2 className="noti-group">{group.name}</h2>
            <ul className="stack stack-3 stagger">
              {group.items.map((n) => {
                const meta = KIND[n.kind]
                const unread = !read.has(n.id)
                return (
                  <li key={n.id}>
                    <button
                      className={`noti${unread ? ' is-unread' : ''}`}
                      style={{ '--tint': meta.tint } as React.CSSProperties}
                      onClick={() => open(n)}
                    >
                      <span className="noti__mark" aria-hidden="true">
                        <Icon name={meta.icon} size={21} strokeWidth={1.9} />
                      </span>

                      <span className="noti__body">
                        <span className="noti__title">{n.title}</span>
                        <span className="noti__text">{n.body}</span>
                        {typeof n.progress === 'number' && (
                          <span className="noti__bar">
                            <span
                              className="noti__fill"
                              style={{ transform: `scaleX(${Math.max(0, Math.min(1, n.progress))})` }}
                            />
                            <span className="noti__pct">{Math.round(n.progress * 100)}%</span>
                          </span>
                        )}
                      </span>

                      <span className="noti__end">
                        <span className="noti__when">
                          {whenLabel(n.at)}
                          {unread && <span className="noti__dot" aria-label="Unread" />}
                        </span>
                        <Icon name="chevron" size={18} className="noti__chev" />
                      </span>

                      <span className="sr-only">{meta.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
