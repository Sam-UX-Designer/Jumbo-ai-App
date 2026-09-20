/**
 * Glass that bends what is behind it.
 *
 * A floating control in this app is already a piece of material: it blurs
 * the scene passing behind it. This adds the other half of real glass —
 * the rim refracts. Light entering the curved edge of a thick pane is bent
 * and split, so a straight line crossing behind the edge appears to kink
 * and to fringe very slightly into colour. That is the whole effect. It
 * lives at the rim and nowhere else, because a lens that distorted its own
 * middle would be a lens you could not read through.
 *
 * How it is done: a displacement map is drawn for the control's exact
 * shape — neutral grey through the middle, meaning "leave this alone", and
 * a ramp around the edge whose red and green channels carry how far to
 * pull each pixel sideways and up. An SVG filter reads that map and moves
 * the backdrop by it, three times at slightly different strengths, keeping
 * red from one pass, green from the next and blue from the last. The
 * offset between those three is the colour fringe.
 *
 * Support, honestly: only Chromium renders an SVG filter inside
 * `backdrop-filter`. Safari — and therefore every browser on iOS — does
 * not, and neither does Firefox. Those get the frosted material the app
 * already had, which is why nothing here is allowed to carry meaning. It
 * is the difference between good glass and very good glass, never the
 * difference between a usable control and an unusable one.
 */

export interface GlassOptions {
  /** How far the rim pulls the backdrop, in pixels. Negative bulges outward. */
  scale?: number
  /** Distance between the red and blue passes. The colour fringe. */
  chroma?: number
  /** How thick the refracting rim is, in pixels. */
  border?: number
  /** Softening applied to the map, so the rim ramps rather than steps. */
  mapBlur?: number
  /** The frosting behind the refraction. */
  blur?: number
  saturate?: number
  /** The corner radius of the shape. Read from the element when omitted. */
  radius?: number
}

export interface GlassHandle {
  /** False when this browser cannot refract; the caller need do nothing. */
  supported: boolean
  /** Redraw the map. Only size changes need this, never a move. */
  refresh(): void
  destroy(): void
}

const DEFAULTS: Required<Omit<GlassOptions, 'radius'>> = {
  scale: -112,
  chroma: 6,
  border: 14,
  mapBlur: 2,
  blur: 12,
  saturate: 180,
}

/**
 * Past this, the map costs more to draw and to sample than the effect is
 * worth. Floating controls are small; a full-width panel is not glass.
 */
const MAX_SIDE = 800

let seq = 0
let host: SVGSVGElement | null = null

/** One hidden SVG holds every filter, so the page gets one extra node. */
function filterHost(): SVGSVGElement {
  if (host?.isConnected) return host
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
  document.body.appendChild(svg)
  host = svg
  return svg
}

/**
 * Can this browser put an SVG filter inside a backdrop?
 *
 * `CSS.supports` answers for the syntax, not for the rendering, and Safari
 * has claimed the syntax while drawing nothing. So the check is the syntax
 * *and* the absence of the engine known to accept it and ignore it.
 */
export function glassSupported(): boolean {
  if (typeof window === 'undefined' || !window.CSS?.supports) return false
  if (!CSS.supports('backdrop-filter', 'url(#a)')) return false
  const ua = navigator.userAgent
  const webkitOnly = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)
  return !webkitOnly
}

/** Someone who has asked for less translucency has asked for less of this. */
function unwanted(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches === true
}

/**
 * The map, drawn for one exact shape.
 *
 * Every pixel says how far to move the backdrop under it. Grey (128) is
 * "not at all", and the rim ramps away from grey in the direction of the
 * nearest edge, so the pull is always straight out through the glass. The
 * ramp is squared: almost nothing until close to the edge, then quickly
 * everything, which is how a real bevel behaves.
 */
function drawMap(w: number, h: number, radius: number, border: number): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: false })
  if (!ctx) return null

  const img = ctx.createImageData(w, h)
  const px = img.data
  const cx = w / 2
  const cy = h / 2
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  const halfW = w / 2 - r
  const halfH = h / 2 - r

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const sx = dx < 0 ? -1 : 1
      const sy = dy < 0 ? -1 : 1
      const qx = Math.abs(dx) - halfW
      const qy = Math.abs(dy) - halfH

      // Distance in from the edge, and the way out through it.
      let inset: number
      let nx = 0
      let ny = 0
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1
        inset = r - len
        nx = (qx / len) * sx
        ny = (qy / len) * sy
      } else if (qx > qy) {
        inset = r - qx
        nx = sx
      } else {
        inset = r - qy
        ny = sy
      }

      let m = 0
      if (inset < border) {
        const t = Math.max(0, inset) / border
        m = (1 - t) * (1 - t)
      }
      // Outside the shape entirely: nothing to refract.
      if (inset < 0) m = 0

      const i = (y * w + x) * 4
      px[i] = 128 + nx * m * 127
      px[i + 1] = 128 + ny * m * 127
      px[i + 2] = 128
      px[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

const NS = 'http://www.w3.org/2000/svg'
const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>) => {
  const node = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

/** Keep one channel of a pass and throw the other two away. */
const CHANNEL = {
  r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
} as const

/**
 * Give one element a refracting rim.
 *
 * Returns a handle whose `supported` says whether anything happened. When
 * it is false the element keeps whatever material its stylesheet gave it,
 * which is the point: this is applied on top of a design that already
 * works without it.
 */
export function liquidGlass(target: HTMLElement, options: GlassOptions = {}): GlassHandle {
  const o = { ...DEFAULTS, ...options }
  const inert: GlassHandle = { supported: false, refresh() {}, destroy() {} }
  if (!glassSupported() || unwanted()) return inert

  const id = `lg-${++seq}`
  const svg = filterHost()
  const filter = el('filter', {
    id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    // Without sRGB the filter works in linear light, which remaps the map's
    // neutral grey and slides the entire backdrop up and to the left. This
    // attribute is not a preference.
    'color-interpolation-filters': 'sRGB',
  })
  svg.appendChild(filter)

  let width = 0
  let height = 0

  const build = (w: number, h: number, radius: number) => {
    const map = drawMap(w, h, radius, o.border)
    if (!map) return false

    filter.replaceChildren()
    for (const [k, v] of Object.entries({ x: '0', y: '0', width: String(w), height: String(h) })) {
      filter.setAttribute(k, v)
    }

    const image = el('feImage', {
      x: '0', y: '0', width: String(w), height: String(h),
      preserveAspectRatio: 'none', result: 'map',
    })
    image.setAttribute('href', map)
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', map)
    filter.appendChild(image)
    filter.appendChild(el('feGaussianBlur', {
      in: 'map', stdDeviation: String(o.mapBlur), result: 'smap',
    }))

    // Three passes a hair apart. Their difference is the colour fringe.
    const passes: Array<[keyof typeof CHANNEL, number]> = [
      ['r', o.scale - o.chroma],
      ['g', o.scale],
      ['b', o.scale + o.chroma],
    ]
    for (const [channel, scale] of passes) {
      filter.appendChild(el('feDisplacementMap', {
        in: 'SourceGraphic', in2: 'smap', scale: String(scale),
        xChannelSelector: 'R', yChannelSelector: 'G', result: `d-${channel}`,
      }))
      filter.appendChild(el('feColorMatrix', {
        in: `d-${channel}`, type: 'matrix', values: CHANNEL[channel], result: channel,
      }))
    }
    // Screen puts the three separated channels back into one image.
    filter.appendChild(el('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }))
    filter.appendChild(el('feBlend', { in: 'rg', in2: 'b', mode: 'screen' }))
    return true
  }

  const apply = () => {
    const rect = target.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w < 8 || h < 8) return
    if (w > MAX_SIDE || h > MAX_SIDE) return
    if (w === width && h === height) return
    width = w
    height = h

    const radius = options.radius ?? (parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0)
    if (!build(w, h, radius)) return
    const stack = `blur(${o.blur}px) saturate(${o.saturate}%) url(#${id})`
    target.style.setProperty('backdrop-filter', stack)
    target.style.setProperty('-webkit-backdrop-filter', stack)
    target.dataset.glass = 'on'
  }

  apply()

  // Size only. A control that merely moves is the same piece of glass, and
  // redrawing its map mid-animation is how this gets expensive.
  const ro = new ResizeObserver(apply)
  ro.observe(target, { box: 'border-box' })

  return {
    supported: true,
    refresh: () => { width = 0; height = 0; apply() },
    destroy() {
      ro.disconnect()
      filter.remove()
      target.style.removeProperty('backdrop-filter')
      target.style.removeProperty('-webkit-backdrop-filter')
      delete target.dataset.glass
    },
  }
}
