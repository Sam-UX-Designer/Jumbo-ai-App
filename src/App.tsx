import { useEffect, useMemo, useRef, useState } from 'react'
import './styles/base.css'
import { NavProvider, Sidebar, TabBar, type ChatFocus, type Route } from './components/Nav'
import { AskDock } from './components/AskDock'
import { ToastProvider, useToast } from './components/UI'
import { Onboarding } from './onboarding/Onboarding'
import { Today } from './screens/Today'
import { Future } from './screens/Future'
import { Capture } from './screens/Capture'
import { Explore } from './screens/Explore'
import { Measurements } from './screens/Measurements'
import { You } from './screens/You'
import { Settings } from './screens/Settings'
import { Subscribe } from './screens/Subscribe'
import { Notifications } from './screens/Notifications'
import { Chat } from './screens/Chat'
import { StoreProvider, useStore } from './state/store'
import { consistencyStreak } from './lib/analytics'
import { scheduleReminders } from './lib/reminders'
import { haptic } from './lib/feedback'

const TITLES: Record<Route, string> = {
  today: 'Today', future: 'AI Future', capture: 'Capture',
  explore: 'Explore', you: 'Profile', measurements: 'Measurements',
  chat: 'Ask Jumbo', settings: 'Settings', subscribe: 'Plans',
  notifications: 'Notifications',
}

function Shell() {
  const { state } = useStore()
  const [route, setRoute] = useState<Route>('today')
  // A question handed to the chat from another screen, asked once on arrival.
  const [handover, setHandover] = useState<string | undefined>()
  // Where Ask Jumbo was opened from, so closing it returns you there rather
  // than dropping you on Today.
  const [origin, setOrigin] = useState<Route>('today')
  // What the conversation is about, when it was opened from a specific
  // thing — a meal, so far. Kept across the trip so going back reopens it.
  const [focus, setFocus] = useState<ChatFocus | null>(null)
  /**
   * The group inside Settings a menu row asked for. Settings is one scroll
   * rather than seven pushed screens, so arriving lands on the right group
   * instead of always at the top.
   *
   * A ref, not state: clearing it after the scroll would re-run the effect
   * below, which would then take its scroll-to-top branch and undo the very
   * scroll it had just performed.
   */
  const anchor = useRef<string | null>(null)
  const toast = useToast()

  const navigate = (next: Route, question?: string, nextFocus?: ChatFocus) => {
    setHandover(next === 'chat' ? question : undefined)
    if (next === 'chat') {
      if (route !== 'chat') setOrigin(route)
      setFocus(nextFocus ?? null)
    } else {
      // Leaving the conversation for anywhere but the screen it came from
      // drops the subject; returning to that screen keeps it.
      if (next !== origin) setFocus(null)
    }
    setRoute(next)
  }

  useEffect(() => {
    document.title = `${TITLES[route]} · Jumbo`
    const to = anchor.current
    anchor.current = null
    // The group is in the DOM by now: effects run after the commit that
    // rendered the new route.
    const el = to ? document.getElementById(to) : null
    if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' })
    else window.scrollTo({ top: 0, behavior: 'auto' })
  }, [route])

  // Reminders fire while Jumbo is open; Profile says so plainly. Acting on
  // one lands on Capture, which is what the reminder is asking for.
  useEffect(
    () => scheduleReminders(state.reminders, (kind) => {
      haptic('impactLight')
      setRoute('capture')
      toast({ text: `${kind[0].toUpperCase()}${kind.slice(1)} reminder`, icon: 'bell' })
    }),
    [state.reminders, toast],
  )

  const streak = useMemo(() => consistencyStreak(state.days, state.baseline), [state.days, state.baseline])

  if (!state.onboarded) return <Onboarding />

  return (
    <NavProvider navigate={navigate}>
      <div className="app">
        <a className="skip-link" href="#main">Skip to content</a>
        <div className="shell">
          <Sidebar route={route} onNavigate={setRoute} name={state.profile.name} streak={streak} />
          <main
            className={`main${route === 'chat' || route === 'settings' || route === 'subscribe' || route === 'notifications' ? '' : ' main--dock'}`}
            id="main" key={route} tabIndex={-1}
          >
            {route === 'today' && <Today />}
            {route === 'future' && <Future />}
            {route === 'capture' && (
              <Capture reopenMeal={focus?.kind === 'meal' ? focus : null} />
            )}
            {route === 'explore' && <Explore />}
            {route === 'measurements' && <Measurements />}
            {route === 'chat' && (
              <Chat initialQuestion={handover} focus={focus} onClose={() => navigate(origin)} />
            )}
            {route === 'you' && (
              <You onNavigate={(r, to) => { anchor.current = to ?? null; setRoute(r) }} />
            )}
            {route === 'settings' && <Settings onNavigate={setRoute} />}
            {route === 'subscribe' && <Subscribe onNavigate={setRoute} />}
            {route === 'notifications' && <Notifications onNavigate={setRoute} />}
          </main>
        </div>
        {route !== 'chat' && route !== 'settings' && route !== 'subscribe' && route !== 'notifications'
          && <AskDock screen={route} />}
        <TabBar route={route} origin={origin} onNavigate={setRoute} />
      </div>
    </NavProvider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  )
}
