import { Icon } from './Icon'
import { useNavigate } from './Nav'
import { FUTURE_PROMPTS } from '../lib/useChat'
import { haptic } from '../lib/feedback'

/**
 * The way into Ask Jumbo, on every screen.
 *
 * It sits above the tab bar and looks like the composer it leads to, so the
 * gesture is the one people already have: tap the field, start typing. The
 * field itself is a button rather than an input — tapping it opens the real
 * conversation with its composer focused, which is one keyboard rather than
 * two and keeps the thread in one place.
 *
 * `chips` puts a single horizontally scrolling row of questions directly
 * above the field. AI Future uses it; nothing else needs to.
 */
export function AskDock({ chips = false }: { chips?: boolean }) {
  const navigate = useNavigate()
  const open = (question?: string) => { haptic('selection'); navigate('chat', question) }

  return (
    <div className="askdock">
      {chips && (
        <ul className="askdock__chips" aria-label="Ask Jumbo a common question">
          {FUTURE_PROMPTS.map((q) => (
            <li key={q.text}>
              <button className="qchip" onClick={() => open(q.text)}>
                <Icon name={q.icon} size={15} style={{ color: q.colour }} />
                {q.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="askdock__field" onClick={() => open()}>
        <Icon name="sparkles" size={18} style={{ color: 'var(--brand)', flex: 'none' }} />
        <span className="askdock__placeholder">Ask JUMBO…</span>
        <span className="askdock__go" aria-hidden="true">
          <Icon name="arrow-up" size={17} strokeWidth={2.3} />
        </span>
      </button>
    </div>
  )
}
