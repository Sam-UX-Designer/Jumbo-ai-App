import { useEffect, useState } from 'react'
import { Mascot } from './Asset'

/**
 * Jumbo working.
 *
 * The mark, one word with three moving dots, and how long it has been.
 *
 * Two things run independently and neither restarts. The magic cycle is CSS
 * on the mark and keeps going for as long as this component is mounted, so a
 * change of word never interrupts it. The clock counts from the moment the
 * question went and keeps counting until the real answer arrives, however
 * long that is — the last state does not mean Jumbo has given up.
 *
 * The words are plain interface states. They say nothing about what the
 * model is doing, because Jumbo does not know what it is doing and narrating
 * a guess would be a lie told in a friendly voice.
 */

/** Each state, and the moment it takes over, in ms since the question went. */
const STATES = [
  { at: 0, word: 'Thinking' },
  { at: 5_000, word: 'Preparing' },
  { at: 8_000, word: 'Almost there' },
  { at: 12_000, word: 'Still working' },
] as const

/**
 * The clock waits out the first beat. A question answered inside a second
 * should never have been timed, and a "0s" that flashes and vanishes is
 * the layout shift this state exists to avoid.
 */
const COUNT_FROM = 1_000

/** Long enough to read as a fade, short enough not to feel like a gap. */
const FADE_MS = 280

export function Thinking({
  size = 34,
  className = '',
}: {
  size?: number
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [ms, setMs] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const timers: number[] = []

    // Each state fades the current word out, swaps it, and fades the next
    // one in. Opacity only, so the word never moves as it changes and the
    // row never reflows around it.
    STATES.slice(1).forEach((state, i) => {
      timers.push(window.setTimeout(() => {
        setVisible(false)
        timers.push(window.setTimeout(() => {
          setIndex(i + 1)
          setVisible(true)
        }, FADE_MS))
      }, state.at))
    })

    // Runs until unmount, which is when the answer arrives.
    const tick = window.setInterval(() => setMs(Date.now() - started), 250)

    return () => {
      timers.forEach(window.clearTimeout)
      window.clearInterval(tick)
    }
  }, [])

  const seconds = Math.floor(ms / 1000)

  return (
    <span className={`think ${className}`.trim()}>
      <Mascot size={size} thinking />
      <span className="think__say">
        {/* Only the word is announced. A count read out every second would
            make a screen reader unusable for the length of the wait. */}
        <span className="think__line" role="status">
          <span className="think__word" data-visible={visible ? 'true' : 'false'}>
            {STATES[index].word}
          </span>
          {/* Three dots, always all three, animated by opacity so the line
              keeps its width and nothing beside it moves. */}
          <span className="think__dots" aria-hidden="true">
            <i /><i /><i />
          </span>
        </span>
        <span
          className="think__secs num"
          data-visible={ms >= COUNT_FROM ? 'true' : 'false'}
          aria-hidden="true"
        >
          {seconds}s
        </span>
      </span>
    </span>
  )
}
