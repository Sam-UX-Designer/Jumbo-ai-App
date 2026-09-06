/**
 * Purposeful haptics only — capture, completion, milestones, important state
 * changes. Never decorative, and never the sole channel for information:
 * every haptic here accompanies a visible change on screen.
 */
type Pattern = 'tap' | 'select' | 'success' | 'milestone' | 'warning'

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  select: 12,
  success: [14, 40, 22],
  milestone: [18, 50, 26, 50, 34],
  warning: [26, 60, 26],
}

let enabled = true

export function setHapticsEnabled(v: boolean) {
  enabled = v
}

export function haptic(pattern: Pattern = 'tap') {
  if (!enabled) return
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && pattern === 'tap') return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    /* Haptics are an enhancement — silence is the correct fallback. */
  }
}

export const hapticsSupported = () =>
  typeof navigator !== 'undefined' && 'vibrate' in navigator
