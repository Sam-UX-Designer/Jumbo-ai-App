import { useEffect, useMemo, useState } from 'react'
import './styles/base.css'
import { NavProvider, Sidebar, TabBar, type Route } from './components/Nav'
import { ToastProvider, useToast } from './components/UI'
import { Onboarding } from './onboarding/Onboarding'
import { Today } from './screens/Today'
import { Future } from './screens/Future'
import { Capture } from './screens/Capture'
import { Explore } from './screens/Explore'
import { Measurements } from './screens/Measurements'
import { You } from './screens/You'
import { StoreProvider, useStore } from './state/store'
import { consistencyStreak } from './lib/analytics'
import { scheduleReminders } from './lib/reminders'
import { haptic } from './lib/feedback'

const TITLES: Record<Route, string> = {
  today: 'Today', future: 'Future', capture: 'Capture',
  explore: 'Explore', you: 'Profile', measurements: 'Measurements',
}

function Shell() {
  const { state } = useStore()
  const [route, setRoute] = useState<Route>('today')
  const toast = useToast()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = `${TITLES[route]} · Jumbo`
  }, [route])

  // Reminders fire while Jumbo is open; Profile says so plainly.
  useEffect(
    () => scheduleReminders(state.reminders, (kind) => {
      haptic('impactLight')
      toast({ text: `${kind[0].toUpperCase()}${kind.slice(1)} reminder`, icon: 'bell' })
    }),
    [state.reminders, toast],
  )

  const streak = useMemo(() => consistencyStreak(state.days, state.baseline), [state.days, state.baseline])

  if (!state.onboarded) return <Onboarding />

  return (
    <NavProvider navigate={setRoute}>
      <div className="app">
        <a className="skip-link" href="#main">Skip to content</a>
        <div className="shell">
          <Sidebar route={route} onNavigate={setRoute} name={state.profile.name} streak={streak} />
          <main className="main" id="main" key={route} tabIndex={-1}>
            {route === 'today' && <Today onNavigate={setRoute} />}
            {route === 'future' && <Future />}
            {route === 'capture' && <Capture />}
            {route === 'explore' && <Explore />}
            {route === 'measurements' && <Measurements />}
            {route === 'you' && <You onNavigate={setRoute} />}
          </main>
        </div>
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
