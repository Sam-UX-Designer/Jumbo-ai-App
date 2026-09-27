/**
 * The picture that goes to Instagram.
 *
 * Drawn on a canvas at 1080×1920 — the Story frame — because that is the
 * only shape that fills the screen without Instagram cropping something
 * important out of it. Everything is drawn rather than screenshotted: a
 * screenshot of the app would carry the tab bar, the safe-area padding and
 * whatever the person had scrolled to.
 *
 * The one rule that matters here is the same one that governs the rest of
 * Jumbo: a number nobody measured is not a zero. Anything unmeasured is
 * drawn as an em dash, never as 0, and never left off in a way that makes
 * the remaining figures look like the whole picture.
 */

export type ShareCard =
  | {
      kind: 'session'
      planName: string
      minutes: number
      done: number
      total: number
      intensity: 1 | 2 | 3
      date: string
    }
  | {
      kind: 'day'
      /** 0–1, or null when nothing was recorded. */
      score: number | null
      sleep: number | null
      movement: number | null
      nutrition: number | null
      recovery: number | null
      date: string
    }
  | {
      kind: 'meal'
      dish: string
      kcal: number
      protein: number
      carbs: number
      fat: number
      date: string
      /** The meal photograph, as the data URL the record already holds. */
      photo?: string
    }

const W = 1080
const H = 1920

const INK = '#FFFFFF'
const DIM = 'rgba(255,255,255,0.56)'
const FAINT = 'rgba(255,255,255,0.30)'
const BRAND = '#92E82A'
const BG = '#08090B'

const SLEEP = '#A45CFF'
const MOVEMENT = '#00E58A'
const NUTRITION = '#FF8A16'
const RECOVERY = '#14AEFF'

/** The app's own stack. All system faces, so nothing has to load first. */
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif'
const face = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`

/** An unmeasured value is a dash. It is never a zero. */
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}`)

const INTENSITY = ['', 'Easy', 'Steady', 'Hard'] as const

export async function drawShareCard(card: ShareCard): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) throw new Error('canvas unavailable')

  frame(g)

  if (card.kind === 'session') session(g, card)
  else if (card.kind === 'day') day(g, card)
  else await meal(g, card)

  footer(g, card.date)

  return new Promise<Blob>((ok, no) => {
    c.toBlob((b) => (b ? ok(b) : no(new Error('could not draw the card'))), 'image/png')
  })
}

/* ── the frame every card shares ───────────────────────────────────────── */
function frame(g: CanvasRenderingContext2D) {
  g.fillStyle = BG
  g.fillRect(0, 0, W, H)

  // A wash of brand green behind the top third, so the card reads as Jumbo
  // at thumbnail size before a word of it is legible.
  const glow = g.createRadialGradient(W / 2, 300, 0, W / 2, 300, 900)
  glow.addColorStop(0, 'rgba(146, 232, 42, 0.16)')
  glow.addColorStop(1, 'rgba(146, 232, 42, 0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, 1200)

  g.font = face(58, 800)
  g.fillStyle = BRAND
  g.textAlign = 'center'
  g.letterSpacing = '2px'
  g.fillText('JUMBO', W / 2, 220)
  g.letterSpacing = '0px'
}

function eyebrow(g: CanvasRenderingContext2D, text: string) {
  g.font = face(30, 700)
  g.fillStyle = FAINT
  g.textAlign = 'center'
  g.letterSpacing = '6px'
  g.fillText(text.toUpperCase(), W / 2, 330)
  g.letterSpacing = '0px'
}

/** The one enormous number the card exists to show. */
function hero(g: CanvasRenderingContext2D, value: string, unit: string, y: number) {
  g.textAlign = 'center'
  g.font = face(260, 800)
  g.fillStyle = INK
  g.fillText(value, W / 2, y)

  g.font = face(44, 600)
  g.fillStyle = DIM
  g.fillText(unit, W / 2, y + 74)
}

function title(g: CanvasRenderingContext2D, text: string, y: number) {
  g.textAlign = 'center'
  g.font = face(64, 700)
  g.fillStyle = INK
  g.fillText(clip(g, text, W - 160), W / 2, y)
}

/** Three or four figures in a row along the bottom of the card. */
function stats(
  g: CanvasRenderingContext2D,
  items: Array<{ label: string; value: string; tint?: string }>,
  y: number,
) {
  const gap = W / items.length
  items.forEach((it, i) => {
    const x = gap * i + gap / 2
    g.textAlign = 'center'
    g.font = face(64, 700)
    g.fillStyle = it.tint ?? INK
    g.fillText(it.value, x, y)
    g.font = face(26, 600)
    g.fillStyle = FAINT
    g.letterSpacing = '2px'
    g.fillText(it.label.toUpperCase(), x, y + 44)
    g.letterSpacing = '0px'
  })
}

/*
 * The date, and the line above the figures.
 *
 * Both sit well inside the frame rather than against its edges: Instagram
 * lays its own controls over roughly the top and bottom 250px of a Story,
 * and anything down there is under a button.
 */
function footer(g: CanvasRenderingContext2D, date: string) {
  g.textAlign = 'center'
  g.font = face(30, 500)
  g.fillStyle = FAINT
  g.fillText(prettyDate(date), W / 2, 1600)
}

function rule(g: CanvasRenderingContext2D, y: number) {
  g.strokeStyle = 'rgba(255,255,255,0.10)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(140, y)
  g.lineTo(W - 140, y)
  g.stroke()
}

/* ── the three cards ───────────────────────────────────────────────────── */
function session(g: CanvasRenderingContext2D, s: Extract<ShareCard, { kind: 'session' }>) {
  eyebrow(g, 'Training')
  title(g, s.planName, 520)
  hero(g, String(s.minutes), s.minutes === 1 ? 'minute' : 'minutes', 900)

  rule(g, 1170)
  stats(g, [
    { label: 'Movements', value: `${s.done}/${s.total}` },
    { label: 'Effort', value: INTENSITY[s.intensity], tint: BRAND },
  ], 1330)
}

function day(g: CanvasRenderingContext2D, d: Extract<ShareCard, { kind: 'day' }>) {
  eyebrow(g, 'Health score')

  if (d.score === null) {
    // Nothing was recorded. Drawing a 0 here would be a claim about the
    // person's day rather than about the absence of data.
    title(g, 'Nothing recorded', 800)
    g.textAlign = 'center'
    g.font = face(36, 500)
    g.fillStyle = DIM
    g.fillText('No reading for this day.', W / 2, 880)
  } else {
    hero(g, String(Math.round(d.score * 100)), 'out of 100', 880)
  }

  rule(g, 1170)
  stats(g, [
    { label: 'Sleep', value: pct(d.sleep), tint: SLEEP },
    { label: 'Move', value: pct(d.movement), tint: MOVEMENT },
    { label: 'Food', value: pct(d.nutrition), tint: NUTRITION },
    { label: 'Recovery', value: pct(d.recovery), tint: RECOVERY },
  ], 1330)

  if ([d.sleep, d.movement, d.nutrition, d.recovery].some((v) => v === null)) {
    g.textAlign = 'center'
    g.font = face(26, 500)
    g.fillStyle = FAINT
    g.fillText('— means nothing measured it', W / 2, 1450)
  }
}

async function meal(g: CanvasRenderingContext2D, m: Extract<ShareCard, { kind: 'meal' }>) {
  eyebrow(g, 'Meal')

  let top = 560
  if (m.photo) {
    const img = await load(m.photo)
    if (img) {
      const size = 480
      const x = (W - size) / 2
      const y = 400
      g.save()
      roundRect(g, x, y, size, size, 48)
      g.clip()
      // Cover, not stretch: the shorter side fills and the rest is cropped.
      const scale = Math.max(size / img.width, size / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      g.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh)
      g.restore()
      top = y + size + 110
    }
  }

  title(g, m.dish, top)
  hero(g, String(m.kcal), 'kcal', top + 250)

  rule(g, 1250)
  stats(g, [
    { label: 'Protein', value: `${Math.round(m.protein)}g` },
    { label: 'Carbs', value: `${Math.round(m.carbs)}g` },
    { label: 'Fat', value: `${Math.round(m.fat)}g` },
  ], 1400)
}

/* ── odds and ends ─────────────────────────────────────────────────────── */
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Cut a long name to what fits, with an ellipsis rather than an overflow. */
function clip(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  let out = text
  while (out.length > 1 && g.measureText(`${out}…`).width > max) out = out.slice(0, -1)
  return `${out}…`
}

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image()
    // The photo is a data URL held in the record, so there is no network
    // and nothing to taint the canvas. A broken one must not take the card
    // down with it.
    img.onload = () => ok(img)
    img.onerror = () => ok(null)
    img.src = src
  })
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** A filename somebody will recognise in their camera roll. */
export const cardFilename = (card: ShareCard) => `jumbo-${card.kind}-${card.date}.png`
