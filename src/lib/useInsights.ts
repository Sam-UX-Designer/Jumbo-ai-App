import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { api, type AiInsight } from './api'
import { buildInsights, buildSummary } from './analytics'
import type { Insight } from '../data/types'

export type InsightEngine = 'claude' | 'on-device' | 'off'

export interface InsightState {
  engine: InsightEngine
  model: string | null
  insights: Insight[]
  loading: boolean
  /** Set when Claude was expected but could not run. Shown, never hidden. */
  problem: { kind: 'setup' | 'error'; message: string; missing?: string[] } | null
  refresh: () => void
}

/**
 * Insights come from one of two real analyses, and the UI always says which:
 *   'claude'    — the Claude API reading a summary of the person's own data.
 *   'on-device' — Jumbo's own statistics, computed in the browser.
 * Neither is scripted, and neither runs when the person has turned pattern
 * analysis off.
 */
export function useInsights(): InsightState {
  const { state } = useStore()
  const [remote, setRemote] = useState<AiInsight[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<InsightState['problem']>(null)
  const [nonce, setNonce] = useState(0)
  const inFlight = useRef(false)

  const aiConfigured = Boolean(state.server?.ai.configured)
  const enabled = state.settings.aiPatterns

  const local = useMemo(
    () => (enabled ? buildInsights(state.days, state.baseline, state.measurements) : []),
    [enabled, state.days, state.baseline, state.measurements],
  )

  const summary = useMemo(
    () => (enabled && aiConfigured ? buildSummary(state.days, state.baseline, state.measurements) : null),
    [enabled, aiConfigured, state.days, state.baseline, state.measurements],
  )

  useEffect(() => {
    if (!summary || inFlight.current) return
    let cancelled = false
    inFlight.current = true
    setLoading(true)
    setProblem(null)

    void (async () => {
      const r = await api.insights(summary)
      inFlight.current = false
      if (cancelled) return
      setLoading(false)
      if (r.ok) {
        setRemote(r.data.insights)
      } else {
        setRemote(null)
        setProblem(
          r.kind === 'setup'
            ? { kind: 'setup', message: r.message, missing: r.missing }
            : { kind: 'error', message: r.kind === 'offline' ? 'Jumbo’s API is not reachable, so the on-device analysis is being shown instead.' : r.message },
        )
      }
    })()

    return () => { cancelled = true }
  }, [summary, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  if (!enabled) {
    return { engine: 'off', model: null, insights: [], loading: false, problem: null, refresh }
  }

  if (remote?.length) {
    return {
      engine: 'claude',
      model: state.server?.ai.model ?? null,
      insights: remote as unknown as Insight[],
      loading,
      problem,
      refresh,
    }
  }

  return { engine: 'on-device', model: null, insights: local, loading, problem, refresh }
}
