import { useEffect, useMemo, useState } from 'react'
import './styles/base.css'
import { Sidebar, TabBar, type Route } from './components/Nav'
import { ToastProvider } from './components/UI'
import { Onboarding } from './onboarding/Onboarding'
import { Today } from './screens/Today'
import { Trajectory } from './screens/Trajectory'
import { Capture } from './screens/Capture'
import { Insights } from './screens/Insights'
import { Measurements } from './screens/Measurements'
import { Explore } from './screens/Explore'
import { You } from './screens/You'
import { StoreProvider, useStore } from './state/store'
import { consistencyStreak } from './lib/analytics'

const TITLES: Record<Route, string> = {
  today: 'Today', trajectory: 'Trajectory', capture: 'Capture', insights: 'Insights',
  you: 'Profile', measurements: 'Measurements', explore: 'Explore',
}

function Shell() {
  const { state } = useStore()
  const [route, setRoute] = useState<Route>('today')

  // Scroll to the top on navigation, the way a pushed screen behaves.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: state.settings.reduceMotionPreferred ? 'auto' : 'smooth' })
    document.title = `${TITLES[route]} · Jumbo`
  }, [route, state.settings.reduceMotionPreferred])

  const streak = useMemo(
    () => (Object.keys(state.connections).length ? consistencyStreak(state.days, state.baseline) : 0),
    [state.days, state.baseline, state.connections],
  )

  if (!state.onboarded) return <Onboarding />

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="shell">
        <Sidebar route={route} onNavigate={setRoute} name={goalName(state.goal)} streak={streak} />
        <main className="main" id="main" key={route} tabIndex={-1}>
          {route === 'today' && <Today onNavigate={setRoute} />}
          {route === 'trajectory' && <Trajectory />}
          {route === 'capture' && <Capture />}
          {route === 'insights' && <Insights />}
          {route === 'measurements' && <Measurements />}
          {route === 'explore' && <Explore />}
          {route === 'you' && <You onNavigate={setRoute} />}
        </main>
      </div>
      <TabBar route={route} onNavigate={setRoute} />
    </div>
  )
}

function goalName(goal: string | null) {
  const map: Record<string, string> = {
    energy: 'More energy', fitness: 'Get fitter', sleep: 'Sleep better',
    nutrition: 'Eat better', aging: 'Healthy ageing', consistency: 'Be consistent', custom: 'Your goal',
  }
  return goal ? map[goal] ?? 'Your goal' : 'No goal set'
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
