import { useEffect, useMemo, useState } from 'react'
import './styles/base.css'
import { NavProvider, Sidebar, TabBar, type Route } from './components/Nav'
import { AskDock } from './components/AskDock'
import { ToastProvider, useToast } from './components/UI'
import { Onboarding } from './onboarding/Onboarding'
import { Today } from './screens/Today'
import { Future } from './screens/Future'
import { Capture } from './screens/Capture'
import { Explore } from './screens/Explore'
import { Measurements } from './screens/Measurements'
import { You } from './screens/You'
import { Chat } from './screens/Chat'
import { StoreProvider, useStore } from './state/store'
import { consistencyStreak } from './lib/analytics'
import { scheduleReminders } from './lib/reminders'
import { haptic } from './lib/feedback'

const TITLES: Record<Route, string> = {
  today: 'Today', future: 'AI Future', capture: 'Capture',
  explore: 'Explore', you: 'Profile', measurements: 'Measurements',
  chat: 'Ask Jumbo',
}

function Shell() {
  const { state } = useStore()
  const [route, setRoute] = useState<Route>('today')
  // A question handed to the chat from another screen, asked once on arrival.
  const [handover, setHandover] = useState<string | undefined>()
  // Where Ask Jumbo was opened from, so closing it returns you there rather
  // than dropping you on Today.
  const [origin, setOrigin] = useState<Route>('today')
  const toast = useToast()

  const navigate = (next: Route, question?: string) => {
    setHandover(next === 'chat' ? question : undefined)
    if (next === 'chat' && route !== 'chat') setOrigin(route)
    setRoute(next)
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = `${TITLES[route]} · Jumbo`
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
            className={`main${route === 'chat' ? '' : ' main--dock'}`}
            id="main" key={route} tabIndex={-1}
          >
            {route === 'today' && <Today />}
            {route === 'future' && <Future />}
            {route === 'capture' && <Capture />}
            {route === 'explore' && <Explore />}
            {route === 'measurements' && <Measurements />}
            {route === 'chat' && <Chat initialQuestion={handover} onClose={() => navigate(origin)} />}
            {route === 'you' && <You onNavigate={setRoute} />}
          </main>
        </div>
        {route !== 'chat' && <AskDock screen={route} />}
        <TabBar route={route} onNavigate={setRoute} />
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
