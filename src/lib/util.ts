/** Deterministic PRNG so the sample data set is identical on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const round = (v: number, dp = 0) => {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Slope per day from a simple least-squares fit. */
export function trendPerDay(xs: number[]) {
  const n = xs.length
  if (n < 2) return 0
  const mx = (n - 1) / 2
  const my = mean(xs)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (xs[i] - my)
    den += (i - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}

export const iso = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(dateISO: string, days: number) {
  const d = new Date(dateISO + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return iso(d)
}

export function dayLabel(dateISO: string) {
  return new Date(dateISO + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
}

export function prettyDate(dateISO: string) {
  return new Date(dateISO + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function prettyDateLong(dateISO: string) {
  return new Date(dateISO + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export function hoursToHM(h: number) {
  const total = Math.round(h * 60)
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`
}

export function relativeTime(minutesAgo: number) {
  if (minutesAgo < 1) return 'just now'
  if (minutesAgo < 60) return `${Math.round(minutesAgo)} min ago`
  const h = minutesAgo / 60
  if (h < 24) return `${Math.round(h)} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export function formatSigned(v: number, dp = 1, unit = '') {
  const s = round(v, dp)
  return `${s > 0 ? '+' : ''}${s}${unit}`
}
