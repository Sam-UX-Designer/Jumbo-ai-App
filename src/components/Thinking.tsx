import { useEffect, useState } from 'react'
import { Mascot } from './Asset'

/**
 * Jumbo working.
 *
 * The mark in its thinking state, one word, and — once the wait has gone on
 * long enough to be worth acknowledging — how long it has been.
 *
 * The word is the signal. It changes as the wait lengthens and changes by
 * fading, nothing else: no movement, no shimmer, no placeholder standing in
 * for the answer. The words are plain interface states. They say nothing
 * about what the model is doing, because Jumbo does not know what it is
 * doing and narrating a guess would be a lie told in a friendly voice.
 */

/** Each state, and the moment it takes over, in ms since the question went. */
const STATES = [
  { at: 0, word: 'Thinking' },
  { at: 5_000, word: 'Preparing' },
  { at: 8_000, word: 'Almost there' },
  { at: 12_000, word: 'Still working' },
] as const

/**
 * The elapsed count stays away until the wait is long enough to notice.
 * A question answered in two seconds should never have been timed.
 */
const COUNT_FROM = 3_000

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
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const timers: number[] = []

    // Each state fades the current word out, swaps it, and fades the next
    // one in. Opacity only, so the word never moves as it changes.
    STATES.slice(1).forEach((state, i) => {
      timers.push(window.setTimeout(() => {
        setVisible(false)
        timers.push(window.setTimeout(() => {
          setIndex(i + 1)
          setVisible(true)
        }, FADE_MS))
      }, state.at))
    })

    const tick = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1_000,
    )

    return () => {
      timers.forEach(window.clearTimeout)
      window.clearInterval(tick)
    }
  }, [])

  const showCount = seconds * 1000 >= COUNT_FROM

  return (
    <span className={`think ${className}`.trim()}>
      <Mascot size={size} thinking />
      <span className="think__say">
        {/* Only the word is announced. A count read out every second would
            make a screen reader unusable for the length of the wait. */}
        <span
          className="think__word"
          data-visible={visible ? 'true' : 'false'}
          role="status"
        >
          {STATES[index].word}
        </span>
        <span className="think__secs num" data-visible={showCount ? 'true' : 'false'} aria-hidden="true">
          {seconds}s
        </span>
      </span>
    </span>
  )
}
