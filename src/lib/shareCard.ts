/**
 * The widget that goes on a story.
 *
 * Not a poster. What people actually post is their own photograph — the
 * shoes on the road, the shadow on the pavement — with a small card from
 * the app sitting on top of it, the way Apple's Fitness widgets do. A
 * full-bleed card made by Jumbo replaces the picture somebody wanted to
 * share. A widget sits on it and lets them keep it.
 *
 * So there are two things drawn here:
 *
 *   sticker  the card alone on a transparent canvas, at its own size, to
 *            drop onto a story by hand
 *   story    1080x1920 with the card laid over a background — their
 *            photograph if they picked one, Jumbo's own gradient if not
 *
 * The rule that governs the rest of the app governs this more strictly,
 * not less: a number nobody measured is drawn as an em dash, never as a
 * zero. The card leaves Jumbo and is read by people who cannot ask what a
 * figure meant.
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
      /** 0-1, or null when nothing was recorded. */
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

export interface ShareOptions {
  /** A photograph to lay the card over. A data URL, from their camera roll. */
  background?: string
  /** Draw the card alone, on transparency, to place by hand in Instagram. */
  stickerOnly?: boolean
}

const W = 1080
const H = 1920

/** The card's own geometry. Everything below is measured from these. */
const CARD_W = 860
const PAD = 52
const RADIUS = 52

const INK = '#FFFFFF'
const DIM = 'rgba(255,255,255,0.62)'
const FAINT = 'rgba(255,255,255,0.40)'
const BRAND = '#92E82A'

const SLEEP = '#A45CFF'
const MOVEMENT = '#00E58A'
const NUTRITION = '#FF8A16'
const RECOVERY = '#14AEFF'

/** The app's own stack. All system faces, so nothing has to load first. */
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif'
const face = (size: number, weight = 400) => weight + ' ' + size + 'px ' + FONT

/** An unmeasured value is a dash. It is never a zero. */
const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v * 100)))

const INTENSITY = ['', 'Easy', 'Steady', 'Hard'] as const

export async function drawShareCard(card: ShareCard, opts: ShareOptions = {}): Promise<Blob> {
  const body = plan(card)
  const cardH = height(body)

  const c = document.createElement('canvas')
  const g = ctx(c, opts.stickerOnly ? CARD_W : W, opts.stickerOnly ? cardH : H)

  if (opts.stickerOnly) {
    // Transparent around it, so it can be placed over anything.
    widget(g, body, 0, 0, cardH)
  } else {
    await backdrop(g, opts.background)
    widget(g, body, (W - CARD_W) / 2, (H - cardH) / 2, cardH)
  }

  return new Promise<Blob>((ok, no) => {
    c.toBlob((b) => (b ? ok(b) : no(new Error('could not draw the card'))), 'image/png')
  })
}

function ctx(c: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (!g) throw new Error('canvas unavailable')
  return g
}

/* -- what goes on the card --------------------------------------------- */
interface Stat { label: string; value: string; tint?: string }
interface Body {
  eyebrow: string
  title?: string
  hero: string
  unit: string
  stats: Stat[]
  note?: string
  date: string
}

function plan(card: ShareCard): Body {
  if (card.kind === 'session') {
    return {
      eyebrow: 'Training',
      title: card.planName,
      hero: String(card.minutes),
      unit: 'min',
      stats: [
        { label: 'Movements', value: card.done + '/' + card.total },
        { label: 'Effort', value: INTENSITY[card.intensity], tint: BRAND },
      ],
      date: card.date,
    }
  }

  if (card.kind === 'day') {
    const missing = [card.sleep, card.movement, card.nutrition, card.recovery]
      .some((v) => v === null)
    return {
      eyebrow: 'Health score',
      // Nothing recorded is said in words. A zero here would be a claim
      // about the person's day rather than about the absence of data.
      hero: card.score === null ? '—' : String(Math.round(card.score * 100)),
      unit: card.score === null ? 'nothing recorded' : 'out of 100',
      stats: [
        { label: 'Sleep', value: pct(card.sleep), tint: SLEEP },
        { label: 'Move', value: pct(card.movement), tint: MOVEMENT },
        { label: 'Food', value: pct(card.nutrition), tint: NUTRITION },
        { label: 'Recovery', value: pct(card.recovery), tint: RECOVERY },
      ],
      note: missing ? '— nothing measured it' : undefined,
      date: card.date,
    }
  }

  return {
    eyebrow: 'Meal',
    title: card.dish,
    hero: String(card.kcal),
    unit: 'kcal',
    stats: [
      { label: 'Protein', value: Math.round(card.protein) + 'g' },
      { label: 'Carbs', value: Math.round(card.carbs) + 'g' },
      { label: 'Fat', value: Math.round(card.fat) + 'g' },
    ],
    date: card.date,
  }
}

function height(b: Body): number {
  let h = PAD + 34            // header row
  h += 54                     // gap
  if (b.title) h += 52
  h += 132                    // the number
  h += 56                     // gap above the figures
  h += 86                     // the figures
  if (b.note) h += 58
  return h + PAD
}

/* -- the widget --------------------------------------------------------- */
function widget(g: CanvasRenderingContext2D, b: Body, x: number, y: number, h: number) {
  // Near-black and faintly translucent, so a photograph underneath reads
  // through it, with a hairline to lift it off a busy shot.
  g.save()
  roundRect(g, x, y, CARD_W, h, RADIUS)
  g.fillStyle = 'rgba(14, 16, 18, 0.82)'
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.12)'
  g.lineWidth = 2
  g.stroke()
  g.clip()

  const left = x + PAD
  const right = x + CARD_W - PAD
  let cursor = y + PAD + 30

  // Header: the mark, the category, and the day.
  g.textAlign = 'left'
  g.font = face(30, 800)
  g.fillStyle = BRAND
  g.letterSpacing = '1px'
  g.fillText('JUMBO', left, cursor)
  const markW = g.measureText('JUMBO').width
  g.letterSpacing = '0px'

  g.font = face(28, 600)
  g.fillStyle = FAINT
  g.fillText(b.eyebrow, left + markW + 24, cursor)

  g.textAlign = 'right'
  g.font = face(26, 500)
  g.fillStyle = FAINT
  g.fillText(shortDate(b.date), right, cursor)

  cursor += 54

  // What it was.
  if (b.title) {
    g.textAlign = 'left'
    g.font = face(40, 600)
    g.fillStyle = DIM
    g.fillText(clip(g, b.title, CARD_W - PAD * 2), left, cursor + 26)
    cursor += 52
  }

  // The number.
  g.textAlign = 'left'
  g.font = face(124, 800)
  g.fillStyle = INK
  g.fillText(b.hero, left, cursor + 104)
  const heroW = g.measureText(b.hero).width

  g.font = face(36, 600)
  g.fillStyle = DIM
  g.fillText(b.unit, left + heroW + 20, cursor + 104)
  cursor += 132 + 56

  // The figures beneath it, spread across the card.
  const span = (CARD_W - PAD * 2) / b.stats.length
  b.stats.forEach((s, i) => {
    const sx = left + span * i
    g.textAlign = 'left'
    g.font = face(48, 700)
    g.fillStyle = s.tint ?? INK
    g.fillText(s.value, sx, cursor + 34)
    g.font = face(22, 600)
    g.fillStyle = FAINT
    g.letterSpacing = '1.5px'
    g.fillText(s.label.toUpperCase(), sx, cursor + 74)
    g.letterSpacing = '0px'
  })
  cursor += 86

  if (b.note) {
    // Clear of the labels above it: at 28 the descenders of RECOVERY and
    // the dash ran into each other.
    g.textAlign = 'left'
    g.font = face(24, 500)
    g.fillStyle = FAINT
    g.fillText(b.note, left, cursor + 44)
  }

  g.restore()
}

/* -- what sits behind it ------------------------------------------------ */
async function backdrop(g: CanvasRenderingContext2D, photo?: string) {
  const img = photo ? await load(photo) : null

  if (img) {
    // Cover, not stretch: the shorter side fills and the rest is cropped.
    const scale = Math.max(W / img.width, H / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)

    // A scrim, heavier at the edges. Without it a bright photograph eats
    // the white text on the card's translucent panel.
    const veil = g.createLinearGradient(0, 0, 0, H)
    veil.addColorStop(0, 'rgba(0,0,0,0.42)')
    veil.addColorStop(0.5, 'rgba(0,0,0,0.18)')
    veil.addColorStop(1, 'rgba(0,0,0,0.48)')
    g.fillStyle = veil
    g.fillRect(0, 0, W, H)
    return
  }

  // No photograph: Jumbo's own backdrop rather than a flat black rectangle.
  g.fillStyle = '#08090B'
  g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, 640, 0, W / 2, 640, 1100)
  glow.addColorStop(0, 'rgba(146, 232, 42, 0.20)')
  glow.addColorStop(1, 'rgba(146, 232, 42, 0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)
}

/* -- odds and ends ------------------------------------------------------ */
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
  while (out.length > 1 && g.measureText(out + '…').width > max) out = out.slice(0, -1)
  return out + '…'
}

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image()
    // Data URLs only - from the record, or from a file they just picked -
    // so there is no network and nothing to taint the canvas. A broken one
    // must not take the card down with it.
    img.onload = () => ok(img)
    img.onerror = () => ok(null)
    img.src = src
  })
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** A filename somebody will recognise in their camera roll. */
export const cardFilename = (card: ShareCard, sticker = false) =>
  'jumbo-' + card.kind + (sticker ? '-sticker' : '') + '-' + card.date + '.png'
