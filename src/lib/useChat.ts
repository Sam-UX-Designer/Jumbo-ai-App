import { useCallback, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import { api } from './api'
import { buildSummary } from './analytics'
import { uid } from './util'
import { haptic } from './feedback'

/**
 * Asking Jumbo a question.
 *
 * Every answer is a real Claude call grounded in a statistical summary of the
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
    reason: !reachable
      ? 'Jumbo’s API is not running, so there is nothing to ask. Start it with npm run dev:api.'
      : !configured
        ? 'Ask Jumbo runs on the Claude API. Set ANTHROPIC_API_KEY on the server to turn it on.'
        : null,
    missing: state.server?.ai.missing ?? ['ANTHROPIC_API_KEY'],
    generating: state.chat.some((m) => m.pending),
  }
}

/** The example questions the spec asks onboarding and Future to offer. */
export const QUICK_PROMPTS = [
  'How am I doing?',
  'What should I improve first?',
  'How is my recovery?',
  'How can I improve my sleep?',
  'How much protein do I need?',
  'What could my future look like?',
]
