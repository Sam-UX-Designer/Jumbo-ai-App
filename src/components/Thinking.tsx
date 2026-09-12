import { useEffect, useState } from 'react'
import { Mascot } from './Asset'

/**
 * Jumbo working, in the place the answer will appear.
 *
 * A long wait used to be the mascot alone in a wide empty space. This fills
 * that space with the shape of the answer forming, and moves through four
 * phases as the wait goes on so the screen keeps changing without ever
 * claiming to know what the model is doing.
 *
 * The phases are animation, not commentary: nothing is written, nothing is
 * narrated, and no internal reasoning is implied. The mascot's own orbit —
 * the same one used everywhere else — widens, gathers points around itself,
 * draws them in, then settles as the wait lengthens.
 *
 * Everything stops the moment the answer arrives; the caller unmounts this
 * and renders the reply in its place.
 */
type Phase = 1 | 2 | 3 | 4

/** When each phase takes over, in milliseconds since the question was sent. */
const PHASE_AT: Array<[number, Phase]> = [
  [0, 1],      // settling
  [1400, 2],   // gathering
  [4200, 3],   // drawing in
  [8000, 4],   // composing
]

export function Thinking({
  size = 40,
  lines = 3,
  className = '',
}: {
  size?: number
  /** How many shimmer lines to show. Fewer for a compact card. */
  lines?: number
  className?: string
}) {
  const [phase, setPhase] = useState<Phase>(1)

  useEffect(() => {
    const timers = PHASE_AT.slice(1).map(([at, p]) =>
      window.setTimeout(() => setPhase(p), at))
    return () => timers.forEach(window.clearTimeout)
  }, [])

  return (
    <div
      className={`think think--p${phase} ${className}`.trim()}
      role="status"
      aria-label="Working on your answer"
    >
      <span className="think__orbit">
        <Mascot size={size} thinking />
        {/* Points that gather around the mark as the wait goes on. */}
        <span className="think__dust" aria-hidden="true">
          <i /><i /><i /><i />
        </span>
      </span>

      <span className="think__lines" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="think__line" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
    </div>
  )
}
