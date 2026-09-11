import { useEffect, useRef, useState } from 'react'
import '../styles/chat.css'
import { Icon } from '../components/Icon'
import { AvatarButton, Mascot } from '../components/Asset'
import { DataViz } from '../components/DataViz'
import { Markdown } from '../components/Markdown'
import { ErrorNotice, UnavailableNotice } from '../components/UI'
import { useStore } from '../state/store'
import { useChat, QUICK_PROMPTS } from '../lib/useChat'
import { useNavigate } from '../components/Nav'
import { haptic } from '../lib/feedback'

/**
 * Ask Jumbo.
 *
 * A real conversation: every reply comes from Jumbo's AI, grounded in a summary of
 * this person's own records. Nothing here is scripted, so when the API is not
 * configured the screen says so instead of answering.
 */
export function Chat({
  initialQuestion, onClose,
}: { initialQuestion?: string; onClose?: () => void }) {
  const { state } = useStore()
  const navigate = useNavigate()
  const chat = useChat()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sentInitial = useRef(false)

  const firstName = state.profile.name.trim().split(' ')[0]

  // A question handed over from another screen is asked once, on arrival.
  useEffect(() => {
    if (!initialQuestion || sentInitial.current || !chat.ready) return
    sentInitial.current = true
    chat.send(initialQuestion)
  }, [initialQuestion, chat])

  /**
   * Keep the newest turn in view by scrolling the conversation itself.
   * scrollIntoView would walk up to the document and move the whole page,
   * taking the header and the composer with it.
   */
  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' })
  }, [chat.messages])

  // Arriving with nothing to ask yet: put the caret in the field so the
  // person can type straight away.
  useEffect(() => {
    if (initialQuestion || !chat.ready) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 260)
    return () => window.clearTimeout(t)
  }, [initialQuestion, chat.ready])

  const submit = () => {
    if (!draft.trim() || !chat.ready) return
    chat.send(draft)
    setDraft('')
    inputRef.current?.focus()
  }

  const ask = (question: string) => {
    if (!chat.ready) return
    haptic('selection')
    chat.send(question)
  }

  return (
    <div className="chat">
      <header className="chat__head">
        <button className="icon-btn" aria-label="Back" onClick={() => (onClose ? onClose() : navigate('today'))}>
          <Icon name="back" size={20} />
        </button>
        <Mascot size={32} thinking={chat.generating} />
        <div className="stack" style={{ gap: 0, minWidth: 0 }}>
          <span className="t-body strong">Ask Jumbo</span>
          <span className="t-caption dim2">Grounded in your own data</span>
        </div>
        <div className="grow" />
        {chat.messages.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={chat.clear}>Clear</button>
        )}
        <AvatarButton size={36} />
      </header>

      <div className="chat__body" ref={threadRef}>
        {!chat.ready && (
          <UnavailableNotice
            title="Jumbo can’t answer right now"
            message={chat.reason ?? ''}
          />
        )}

        {chat.messages.length === 0 ? (
          <div className="chat__empty">
            <Mascot size={104} label="Jumbo" />
            <div className="stack stack-2" style={{ textAlign: 'center' }}>
              <h1 className="t-title2">
                {firstName ? `Hi ${firstName}.` : 'Hi.'} Ask me anything about your health.
              </h1>
              <p className="t-callout dim" style={{ maxWidth: '34ch', marginInline: 'auto' }}>
                I can only talk about what your data actually shows. Where it is silent, I will
                say so rather than guess.
              </p>
            </div>
            <ul className="chat__prompts">
              {QUICK_PROMPTS.map((q) => (
                <li key={q}>
                  <button className="chip" disabled={!chat.ready} onClick={() => ask(q)}>{q}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="chat__thread">
            {chat.messages.map((m) => (
              <li key={m.id} className={`bubble-row bubble-row--${m.role}`}>
                {m.role === 'jumbo' && !m.error && (
                  <Mascot size={m.pending ? 44 : 34} thinking={m.pending} />
                )}

                <div className="stack stack-3" style={{ minWidth: 0, maxWidth: '100%' }}>
                  {m.pending ? (
                    // The mascot beside this row is already in its working
                    // state. Nothing else is needed, and nothing narrates it.
                    <span className="sr-only" role="status">Working on your question</span>
                  ) : m.error ? (
                    <ErrorNotice
                      title="That answer did not come back"
                      message={m.error}
                      onRetry={() => chat.retry(m.id)}
                    />
                  ) : (
                    <div className={`bubble bubble--${m.role}`}>
                      {m.role === 'jumbo'
                        ? <Markdown text={m.text} />
                        : m.text.split('\n\n').filter(Boolean).map((para, i) => (
                          <p key={i} className="t-body">{para}</p>
                        ))}
                      {m.visualization && <DataViz viz={m.visualization} />}
                    </div>
                  )}

                  {!!m.followUps?.length && (
                    <ul className="chat__prompts chat__prompts--inline">
                      {m.followUps.map((q) => (
                        <li key={q}>
                          <button className="chip chip--sm" onClick={() => ask(q)}>{q}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div ref={endRef} />
      </div>

      <p className="chat__foot t-caption dim2">
        Jumbo is a wellness companion. It does not diagnose and it is not a substitute for
        professional care.
      </p>

      <form
        className="chat__composer"
        onSubmit={(e) => { e.preventDefault(); submit() }}
      >
        <textarea
          ref={inputRef}
          className="chat__input"
          rows={1}
          value={draft}
          disabled={!chat.ready}
          placeholder="Ask about your health…"
          aria-label="Ask Jumbo anything about your health"
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
        />
        <button
          type="submit"
          className="chat__send"
          aria-label="Send"
          disabled={!draft.trim() || !chat.ready}
        >
          <Icon name="arrow-up" size={20} strokeWidth={2.2} />
        </button>
      </form>
    </div>
  )
}
