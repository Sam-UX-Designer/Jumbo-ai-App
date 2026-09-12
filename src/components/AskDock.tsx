import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { useNavigate, type Route } from './Nav'
import { QUICK_ACTIONS } from '../lib/useChat'
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
 * Above it, one row of quick actions chosen for the screen you are on:
 * Today asks about today, Capture about food, Explore about what to watch.
 * Tapping one opens the conversation with that question already asked. There
 * is one Ask Jumbo behind all of them, not five.
 */
export function AskDock({ screen }: { screen: Route }) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const chips = QUICK_ACTIONS[screen] ?? QUICK_ACTIONS.today
  const open = (question?: string) => { haptic('selection'); navigate('chat', question) }

  /**
   * Publish the dock's real height so the screen above can reserve exactly
   * that much room. Guessing it left the last of the content sitting under
   * the chips, and the height moves with the chip row, the font size and the
   * safe area.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () => {
      document.documentElement.style.setProperty('--dock-h', `${Math.ceil(el.offsetHeight)}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--dock-h')
    }
  }, [screen])

  return (
    <div className="askdock" ref={ref}>
      <ul className="askdock__chips" aria-label="Ask Jumbo about this screen">
        {chips.map((q) => (
          <li key={q.text}>
            <button className="qchip" onClick={() => open(q.text)}>
              <Icon name={q.icon} size={15} style={{ color: q.colour }} />
              {q.text}
            </button>
          </li>
        ))}
      </ul>

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
