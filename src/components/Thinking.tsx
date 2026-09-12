import { useEffect, useState } from 'react'
import { Mascot } from './Asset'

/**
 * Jumbo working: the mark in its usual thinking state, and one word.
 *
 * The word is the signal. It changes twice as the wait lengthens and does so
 * by fading, nothing else — no movement, no shimmer, no placeholder standing
 * in for the answer. The words are plain interface states rather than any
 * account of what the model is doing.
 */
const WORDS = ['Thinking', 'Analyzing', 'Preparing'] as const

/** When each word takes over, in milliseconds since the question was sent. */
const CHANGE_AT = [3500, 8000]

/** Long enough to read as a fade, short enough not to feel like a gap. */
const FADE_MS = 260

export function Thinking({
  size = 34,
  className = '',
}: {
  size?: number
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timers: number[] = []
    CHANGE_AT.forEach((at, i) => {
      timers.push(window.setTimeout(() => {
        // Fade the current word out, swap it, fade the next one in. Opacity
        // only: the word never moves.
        setVisible(false)
        timers.push(window.setTimeout(() => {
          setIndex(i + 1)
          setVisible(true)
        }, FADE_MS))
      }, at))
    })
    return () => timers.forEach(window.clearTimeout)
  }, [])

  return (
    <span className={`think ${className}`.trim()} role="status" aria-label="Working">
      <Mascot size={size} thinking />
      <span className="think__word" data-visible={visible ? 'true' : 'false'} aria-hidden="true">
        {WORDS[index]}
      </span>
    </span>
  )
}
