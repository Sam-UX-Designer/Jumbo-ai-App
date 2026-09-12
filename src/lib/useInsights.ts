import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { api, type AiInsight } from './api'
import { buildInsights, buildSummary } from './analytics'
import type { Insight } from '../data/types'

export type InsightEngine = 'jumbo-ai' | 'on-device' | 'off'

export interface InsightState {
  engine: InsightEngine
  model: string | null
  insights: Insight[]
  loading: boolean
  /** Set when Jumbo's AI was expected but could not run. Shown, never hidden. */
  problem: { kind: 'setup' | 'error'; message: string; missing?: string[] } | null
  refresh: () => void
}

/**
 * Insights come from one of two real analyses, and the UI always says which:
 *   'jumbo-ai'  — Jumbo's AI reading a summary of the person's own data.
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

  /**
   * The summary as content rather than as an object.
   *
   * Every action rebuilds `days` and `baseline`, so `summary` is a new object
   * many times over a single session even when not one figure in it has
   * moved. Asking for it by identity would send a paid request each time
   * someone tapped a date. This is what actually changed, and it is the only
   * thing the request below watches.
   */
  const summaryKey = useMemo(() => (summary ? JSON.stringify(summary) : null), [summary])
  const summaryRef = useRef(summary)
  summaryRef.current = summary

  /**
   * One request per distinct summary, and the newest one always wins.
   *
   * There is deliberately no "already asking" guard here. A guard would make
   * the newer request return early while the older one it was waiting on gets
   * discarded as stale, leaving the card waiting for an answer nothing is
   * going to bring.
   */
  useEffect(() => {
    const asked = summaryRef.current
    if (!asked) return
    let cancelled = false
    setLoading(true)
    setProblem(null)

    void (async () => {
      const r = await api.insights(asked)
      // A newer request is running and owns the loading state from here.
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
  }, [summaryKey, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  if (!enabled) {
    return { engine: 'off', model: null, insights: [], loading: false, problem: null, refresh }
  }

  if (remote?.length) {
    return {
      engine: 'jumbo-ai',
      model: state.server?.ai.model ?? null,
      insights: remote as unknown as Insight[],
      loading,
      problem,
      refresh,
    }
  }

  return { engine: 'on-device', model: null, insights: local, loading, problem, refresh }
}
