import { useCallback, useMemo, useRef } from 'react'
import type { IconName } from '../components/Icon'
import { useStore } from '../state/store'
import { api } from './api'
import { buildSummary } from './analytics'
import { uid } from './util'
import { haptic } from './feedback'

/**
 * Asking Jumbo a question.
 *
 * Every answer is a real call to Jumbo's AI, grounded in a statistical summary of the
 * person's own records — never a canned reply. When the API is not configured
 * the send is refused with the reason rather than answered by a script, and
 * the failed turn stays on screen with a retry.
 */
export function useChat() {
  const { state, dispatch } = useStore()
  const inFlight = useRef(new Set<string>())

  const configured = Boolean(state.server?.ai.configured)
  const reachable = state.serverReachable !== false

  const summary = useMemo(
    () => buildSummary(state.days, state.baseline, state.measurements),
    [state.days, state.baseline, state.measurements],
  )

  /** The conversation so far, as the server wants it. */
  const historyRef = useRef(state.chat)
  historyRef.current = state.chat

  const run = useCallback(async (id: string, question: string) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)

    // Everything already answered, so Jumbo keeps the thread of the conversation.
    const history = historyRef.current
      .filter((m) => !m.pending && !m.error && m.text && m.id !== id)
      .map((m) => ({ role: m.role, text: m.text }))

    const result = await api.chat({
      question,
      summary,
      goals: state.goals,
      history,
    })
    inFlight.current.delete(id)

    if (result.ok) {
      dispatch({ type: 'chatReply', id, text: result.data.answer, followUps: result.data.followUps })
      haptic('impactLight')
    } else {
      dispatch({ type: 'chatFail', id, message: result.message })
    }
  }, [dispatch, summary, state.goals])

  const send = useCallback((text: string) => {
    const question = text.trim()
    if (!question) return
    const id = uid()
    haptic('impactLight')
    dispatch({ type: 'chatSend', id, text: question })
    void run(id, question)
  }, [dispatch, run])

  const retry = useCallback((id: string) => {
    const asked = state.chat.find((m) => m.id === `${id}-you`)
    if (!asked) return
    dispatch({ type: 'chatSend', id: `${id}-retry`, text: asked.text })
    void run(`${id}-retry`, asked.text)
  }, [dispatch, run, state.chat])

  const clear = useCallback(() => dispatch({ type: 'chatClear' }), [dispatch])

  return {
    messages: state.chat,
    send,
    retry,
    clear,
    /** False when a send would be refused, with `reason` saying why. */
    ready: configured && reachable,
    /**
     * Product-level, never technical. The person is told what they can do,
     * not what a server is missing.
     */
    reason: configured && reachable
      ? null
      : 'Jumbo’s answers are unavailable at the moment. Everything else in the app still works, and your records are unaffected.',
    generating: state.chat.some((m) => m.pending),
  }
}

/**
 * The questions offered above the Ask Jumbo field on AI Future. Each is a
 * real question, sent as typed.
 */
export const FUTURE_PROMPTS: Array<{ text: string; icon: IconName; colour: string }> = [
  { text: 'How can I improve my sleep?', icon: 'sleep', colour: 'var(--sleep)' },
  { text: 'What is my longevity looking like?', icon: 'heart', colour: 'var(--training)' },
  { text: 'What should I improve first?', icon: 'sparkles', colour: 'var(--brand)' },
  { text: 'How is my recovery?', icon: 'bolt', colour: 'var(--recovery)' },
  { text: 'How much protein do I need?', icon: 'plate', colour: 'var(--nutrition)' },
]

/** The example questions the spec asks onboarding and Future to offer. */
export const QUICK_PROMPTS = [
  'How am I doing?',
  'What should I improve first?',
  'How is my recovery?',
  'How can I improve my sleep?',
  'How much protein do I need?',
  'What could my future look like?',
]
