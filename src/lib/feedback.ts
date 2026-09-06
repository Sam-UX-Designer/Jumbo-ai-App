/**
 * Haptics, sound and celebration — the three feedback channels.
 *
 * All three are reserved for real events: a capture, a confirmation, a
 * completed session, a milestone. None of them fire on ordinary taps, and each
 * has its own switch in Profile because people want different things from them.
 */

/* ============================================================ haptics */

/**
 * Patterns modelled on the platform haptic vocabulary: selection is a single
 * crisp tick, notification success is a light-then-firm pair, and impact
 * strength maps to how consequential the action was. The Vibration API gives
 * duration only, so these are the closest honest approximation a browser can
 * make — they are timed, not random buzzes.
 */
export type Haptic =
  | 'selection'      // moving between options
  | 'impactLight'    // a small confirmed action
  | 'impactMedium'   // a state change with consequence
  | 'impactHeavy'    // a destructive or irreversible action
  | 'success'        // notification: success
  | 'warning'        // notification: warning
  | 'error'          // notification: error
  | 'milestone'      // a genuine achievement

const PATTERNS: Record<Haptic, number | number[]> = {
  selection: 7,
  impactLight: 10,
  impactMedium: 16,
  impactHeavy: 26,
  success: [12, 46, 22],
  warning: [20, 60, 20],
  error: [26, 50, 26, 50, 26],
  milestone: [14, 40, 20, 40, 30, 60, 42],
}

let hapticsOn = true
export const setHapticsEnabled = (v: boolean) => { hapticsOn = v }
export const hapticsSupported = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export function haptic(kind: Haptic = 'selection') {
  if (!hapticsOn || !hapticsSupported()) return
  try { navigator.vibrate(PATTERNS[kind]) } catch { /* enhancement only */ }
}

/* ============================================================== sound */

export type Sound = 'confirm' | 'complete' | 'milestone' | 'capture'

let soundOn = true
let ctx: AudioContext | null = null

export const setSoundEnabled = (v: boolean) => { soundOn = v }

/**
 * Browsers cannot read the hardware silent switch, so Profile carries an
 * explicit sound toggle rather than pretending to respect it. Audio is
 * synthesised, so nothing is fetched and nothing plays before a real gesture.
 */
function audio(): AudioContext | null {
  if (!soundOn) return null
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface Note { freq: number; at: number; dur: number; gain?: number }

const VOICES: Record<Sound, Note[]> = {
  // A single soft tick.
  capture: [{ freq: 1180, at: 0, dur: 0.05, gain: 0.1 }],
  // Two rising notes: "done".
  confirm: [
    { freq: 784, at: 0, dur: 0.09 },
    { freq: 1046, at: 0.075, dur: 0.13 },
  ],
  // A major triad, brief and warm.
  complete: [
    { freq: 659, at: 0, dur: 0.1 },
    { freq: 880, at: 0.085, dur: 0.11 },
    { freq: 1318, at: 0.17, dur: 0.22 },
  ],
  // A fuller flourish, saved for genuine milestones.
  milestone: [
    { freq: 523, at: 0, dur: 0.1 },
    { freq: 659, at: 0.08, dur: 0.1 },
    { freq: 784, at: 0.16, dur: 0.1 },
    { freq: 1046, at: 0.24, dur: 0.3 },
    { freq: 1568, at: 0.3, dur: 0.32, gain: 0.06 },
  ],
}

export function playSound(kind: Sound) {
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime

  VOICES[kind].forEach(({ freq, at, dur, gain = 0.085 }) => {
    const osc = ac.createOscillator()
    const amp = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    amp.gain.setValueAtTime(0.0001, now + at)
    amp.gain.exponentialRampToValueAtTime(gain, now + at + 0.012)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + at + dur)
    osc.connect(amp).connect(ac.destination)
    osc.start(now + at)
    osc.stop(now + at + dur + 0.02)
  })
}

/* ========================================================= confetti */

const COLOURS = ['#92E82A', '#2ED8A7', '#6E7BFF', '#FFA53D', '#B57BFF']

/**
 * A single short burst on a throwaway canvas. Not a loop, not a background
 * effect: it runs for well under a second and removes itself.
 */
export function confetti(origin: { x: number; y: number } = { x: 0.5, y: 0.42 }) {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:400'
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  document.body.appendChild(canvas)

  const g = canvas.getContext('2d')
  if (!g) { canvas.remove(); return }
  g.scale(dpr, dpr)

  const w = window.innerWidth
  const h = window.innerHeight
  const pieces = Array.from({ length: 84 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9
    const speed = 5.5 + Math.random() * 8
    return {
      x: origin.x * w,
      y: origin.y * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.34,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      life: 1,
    }
  })

  const start = performance.now()
  const DURATION = 1500

  const frame = (t: number) => {
    const elapsed = t - start
    g.clearRect(0, 0, w, h)
    pieces.forEach((p) => {
      p.vy += 0.28
      p.vx *= 0.992
      p.x += p.vx
      p.y += p.vy
      p.rot += p.spin
      p.life = Math.max(0, 1 - elapsed / DURATION)
      g.save()
      g.globalAlpha = p.life
      g.translate(p.x, p.y)
      g.rotate(p.rot)
      g.fillStyle = p.colour
      g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62)
      g.restore()
    })
    if (elapsed < DURATION) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

/** The three channels together, for a real completion. */
export function celebrate(kind: Sound = 'complete', withConfetti = true) {
  haptic(kind === 'milestone' ? 'milestone' : 'success')
  playSound(kind)
  if (withConfetti) confetti()
}
