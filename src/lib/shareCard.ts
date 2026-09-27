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
      kind: 'meals'
      /**
       * The day's meals as they were logged — the photograph if one was
       * taken, what was in it, and which meal it was. One entry per meal,
       * not per food, so the card reads the way the app's own list does.
       */
      meals: Array<{ name: string; slot: string; photo?: string }>
      /** How many separate foods, across all of them. */
      items: number
      /**
       * The day's calories, or null when they chose not to put a number on
       * it. See the note on ShareOptions.calories.
       */
      kcal: number | null
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
  /**
   * Put the calorie total on a card about food. Off unless asked for.
   *
   * This is a deliberate default, not an oversight. The literature on diet
   * and fitness trackers is consistent that calorie-forward design is the
   * part that does harm to people already vulnerable to disordered eating,
   * and the standing recommendation is to lead with food rather than with
   * numbers. A card is the worst place to break that rule: it leaves the
   * app, it is seen by people who did not choose to look at it, and a
   * number on it invites comparison from strangers. So the plate leads and
   * the figure is something a person opts into for their own post.
   */
  calories?: boolean
}

const W = 1080
const H = 1920

/** The card's own geometry. Everything below is measured from these. */
const CARD_W = 860
const PAD = 52
const RADIUS = 52
/** A plate in the food card's strip. */
const THUMB = 108
/** One logged meal: its plate, what was in it, which meal it was. */
const ROW = 132


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
  const body = plan(card, opts)
  const cardH = height(body)
  // Plates have to be loaded before a single stroke is drawn, or the card
  // is handed over with holes in it.
  const plates = body.rows?.length
    ? await Promise.all(body.rows.map((r) => (r.photo ? load(r.photo) : Promise.resolve(null))))
    : []

  const c = document.createElement('canvas')
  const g = ctx(c, opts.stickerOnly ? CARD_W : W, opts.stickerOnly ? cardH : H)

  if (opts.stickerOnly) {
    // Transparent around it, so it can be placed over anything.
    widget(g, body, 0, 0, cardH, plates)
  } else {
    await backdrop(g, opts.background)
    /*
     * Centred, and checked against Instagram's own furniture: it lays the
     * name and progress bar over roughly the top 250px and the reply bar
     * over the bottom 250px. A card of this height sits well inside both.
     */
    widget(g, body, (W - CARD_W) / 2, (H - cardH) / 2, cardH, plates)
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
interface Ring { value: number | null; colour: string }
interface Body {
  eyebrow: string
  title?: string
  hero: string
  unit: string
  stats: Stat[]
  note?: string
  date: string
  /** Drawn beside the number, the way Apple's Activity widget does. */
  rings?: Ring[]
  /**
   * Meals as they were logged: the plate, what was in it, which meal.
   *
   * A strip of photographs above a list of names was the first attempt and
   * it read as neither — you could not tell which plate went with which
   * food. Together in a row is how the app shows them and how somebody
   * looking at the card expects to read them.
   */
  rows?: Array<{ name: string; meta: string; photo?: string }>
  /**
   * Text where the big number would be.
   *
   * A card about food has no number worth enlarging — "1 thing eaten" is
   * not a headline, and the calorie total is deliberately not the lead.
   * What the person actually wants to show is the food, so the food is
   * what gets the size.
   */
}

const RING_D = 236
/** How many meals fit before the card gets too tall for a story. */
const MAX_ROWS = 4

function plan(card: ShareCard, opts: ShareOptions): Body {
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
      /*
       * The rings are the point of this card. A viewer reads four arcs in
       * an instant and reads "39 out of 100" not at all, which is why
       * Apple's rings travel and a bare number never has. Outside in, the
       * same order and colours as the app itself.
       */
      rings: [
        { value: card.sleep, colour: SLEEP },
        { value: card.movement, colour: MOVEMENT },
        { value: card.nutrition, colour: NUTRITION },
        { value: card.recovery, colour: RECOVERY },
      ],
    }
  }

  if (card.kind === 'meals') {
    const n = card.items
    const stats: Stat[] = [
      { label: 'Logged', value: n + (n === 1 ? ' item' : ' items') },
    ]
    // The calorie total is opt-in. See the note on ShareOptions.calories.
    if (card.kcal !== null && opts.calories) {
      stats.push({ label: 'Total', value: card.kcal + ' kcal' })
    }
    return {
      eyebrow: 'Today\u2019s food',
      hero: '',
      unit: '',
      stats,
      date: card.date,
      rows: card.meals.map((m) => ({ name: m.name, meta: m.slot, photo: m.photo })),
    }
  }

  if (card.kind !== 'meal') throw new Error('unknown card')
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
  if (b.rows?.length) h += ROW * Math.min(b.rows.length, MAX_ROWS) + 20
  if (b.title) h += 52
  // A big number (possibly beside rings), unless the meals took the space.
  if (!b.rows?.length) h += b.rings?.length ? Math.max(132, RING_D) : 132
  if (b.stats.length) {
    h += 56                   // gap above the figures
    h += 86                   // the figures
  }
  if (b.note) h += 58
  return h + PAD
}

/* -- the widget --------------------------------------------------------- */
function widget(
  g: CanvasRenderingContext2D,
  b: Body,
  x: number,
  y: number,
  h: number,
  plates: Array<HTMLImageElement | null> = [],
) {
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

  /*
   * The meals, drawn the way the app lists them: the plate, then what was
   * in it, then which meal it was. A photograph and a name that are not on
   * the same line are two facts nobody can join up.
   */
  if (b.rows?.length) {
    const shown = b.rows.slice(0, MAX_ROWS)
    shown.forEach((row, i) => {
      const ry = cursor + i * ROW
      const img = plates[i]

      g.save()
      roundRect(g, left, ry, THUMB, THUMB, 26)
      if (img) {
        g.clip()
        const scale = Math.max(THUMB / img.width, THUMB / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        g.drawImage(img, left + (THUMB - dw) / 2, ry + (THUMB - dh) / 2, dw, dh)
      } else {
        // Typed rather than photographed. A plain tile says so without
        // leaving a hole where the others have a picture.
        g.fillStyle = 'rgba(255,255,255,0.06)'
        g.fill()
        g.strokeStyle = 'rgba(255,255,255,0.10)'
        g.lineWidth = 2
        g.stroke()
        g.beginPath()
        g.arc(left + THUMB / 2, ry + THUMB / 2, 26, 0, Math.PI * 2)
        g.strokeStyle = 'rgba(255,255,255,0.22)'
        g.lineWidth = 3
        g.stroke()
      }
      g.restore()

      const tx = left + THUMB + 26
      g.textAlign = 'right'
      g.font = face(26, 600)
      g.fillStyle = FAINT
      g.fillText(row.meta, right, ry + 50)
      const metaW = g.measureText(row.meta).width

      // A meal of two or three things has a long name. Drop a size before
      // cutting it: "Rolled oats, Blueberries" told in full beats
      // "Rolled oats, Blueberr…".
      const room = right - tx - metaW - 30
      g.textAlign = 'left'
      g.fillStyle = INK
      g.font = face(42, 700)
      if (g.measureText(row.name).width > room) g.font = face(34, 700)
      g.fillText(clip(g, row.name, room), tx, ry + 50)

      if (row.photo === undefined) {
        g.font = face(22, 500)
        g.fillStyle = FAINT
        g.fillText('Typed in', tx, ry + 88)
      }
    })

    // Say plainly when there were more than fit.
    if (b.rows.length > shown.length) {
      g.textAlign = 'left'
      g.font = face(26, 500)
      g.fillStyle = FAINT
      g.fillText('+ ' + (b.rows.length - shown.length) + ' more', left, cursor + shown.length * ROW + 12)
    }
    cursor += ROW * shown.length + 20
  }

  // What it was.
  if (b.title) {
    g.textAlign = 'left'
    g.font = face(40, 600)
    g.fillStyle = DIM
    g.fillText(clip(g, b.title, CARD_W - PAD * 2), left, cursor + 26)
    cursor += 52
  }

  if (!b.rows?.length) {
  // The number, and the rings beside it where there are rings.
  const block = b.rings?.length ? Math.max(132, RING_D) : 132
  const heroBase = cursor + (block - 132) / 2 + 104

  g.textAlign = 'left'
  g.font = face(124, 800)
  g.fillStyle = INK
  g.fillText(b.hero, left, heroBase)
  const heroW = g.measureText(b.hero).width

  g.font = face(36, 600)
  g.fillStyle = DIM
  g.fillText(b.unit, left + heroW + 20, heroBase)

  if (b.rings?.length) {
    rings(g, right - RING_D / 2, cursor + block / 2, RING_D, b.rings)
  }

  cursor += block
  if (b.stats.length) cursor += 56
  }

  // The figures beneath it, spread across the card.
  const span = (CARD_W - PAD * 2) / b.stats.length
  if (b.stats.length) b.stats.forEach((s, i) => {
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
  if (b.stats.length) cursor += 86

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

/**
 * The rings, outside in, drawn the way the app draws them.
 *
 * An unmeasured ring is the faint track and nothing else. Drawing it as a
 * closed-nothing arc would be the same lie as printing a zero: a day
 * nobody took a heart reading on would look like a day of no recovery, and
 * on a card leaving the app there is nobody to ask.
 */
function rings(g: CanvasRenderingContext2D, cx: number, cy: number, d: number, set: Ring[]) {
  const stroke = d * 0.057
  const step = stroke * 1.5
  set.forEach((ring, i) => {
    const r = d / 2 - stroke / 2 - i * step
    if (r <= stroke) return

    g.lineWidth = stroke
    g.lineCap = 'round'

    g.globalAlpha = 0.16
    g.strokeStyle = ring.colour
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1

    if (ring.value === null || ring.value <= 0) return
    g.strokeStyle = ring.colour
    g.beginPath()
    // From twelve o'clock, clockwise, like every ring anybody has seen.
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ring.value))
    g.stroke()
  })
  g.lineCap = 'butt'
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
