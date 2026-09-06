import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Confidence, Sheet, Stepper, useToast } from '../components/UI'
import { useStore } from '../state/store'
import { recognise, confidenceBand, type Recognition } from '../data/foodAI'
import { FOODS, FOOD_KEYS, makeFoodItem, mealTotals, rescaleItem } from '../data/foods'
import type { FoodItem, MealEntry } from '../data/types'
import { haptic } from '../lib/haptics'
import { uid } from '../lib/util'

type Phase = 'camera' | 'thinking' | 'review' | 'saved'

/** A generated stand-in image, used only when no camera is available.
 *  It is deliberately abstract so it can never be mistaken for a photograph. */
function PlateSim({ seed }: { seed: number }) {
  const hues = [(seed * 47) % 360, (seed * 83 + 120) % 360, (seed * 29 + 240) % 360]
  return (
    <svg className="plate-sim" viewBox="0 0 160 120" role="img" aria-label="Placeholder image standing in for a meal photo">
      <rect width="160" height="120" fill="#15181c" />
      <circle cx="80" cy="62" r="42" fill="#f4f3ef" />
      <circle cx="80" cy="62" r="34" fill="#fafaf7" />
      <path d="M62 48a20 18 0 0 1 34 6 20 18 0 0 1-34-6Z" fill={`hsl(${hues[0]} 42% 52%)`} />
      <circle cx="92" cy="72" r="13" fill={`hsl(${hues[1]} 46% 58%)`} />
      <path d="M58 76c6-9 16-10 22-4-5 8-15 10-22 4Z" fill={`hsl(${hues[2]} 40% 46%)`} />
      <rect x="8" y="96" width="144" height="18" rx="6" fill="#1d2126" />
    </svg>
  )
}

export function FoodCapture({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const { dispatch } = useStore()
  const toast = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>('camera')
  const [cameraState, setCameraState] = useState<'idle' | 'live' | 'unavailable'>('idle')
  const [flash, setFlash] = useState(false)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000))
  const [rec, setRec] = useState<Recognition | null>(null)
  const [items, setItems] = useState<FoodItem[]>([])
  const [slot, setSlot] = useState<MealEntry['slot']>(guessSlot())
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')

  // Start the camera when the sheet opens; stop it whenever we leave.
  useEffect(() => {
    if (!open || phase !== 'camera') return
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, audio: false,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCameraState('live')
      } catch {
        // No camera, or permission declined. Neither is an error state for the
        // person — the flow continues with a stand-in image.
        setCameraState('unavailable')
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [open, phase])

  useEffect(() => {
    if (!open) {
      setPhase('camera'); setRec(null); setItems([]); setAdding(false); setQuery('')
      setCameraState('idle')
    }
  }, [open])

  const shoot = () => {
    haptic('success')
    setFlash(true)
    window.setTimeout(() => setFlash(false), 340)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setPhase('thinking')
    const s = Math.floor(Math.random() * 1000)
    setSeed(s)
    window.setTimeout(() => {
      const r = recognise(s)
      setRec(r)
      setItems(r.items)
      setPhase('review')
      haptic('select')
    }, 1150)
  }

  const totals = mealTotals(items)
  const band = rec ? confidenceBand(rec.confidence) : null

  const save = () => {
    if (!items.length) return
    const meal: MealEntry = {
      id: `meal-${uid()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      slot,
      items,
      method: 'camera',
      confirmed: true,
      photoSeed: seed,
    }
    dispatch({ type: 'addMeal', date, meal })
    haptic('milestone')
    setPhase('saved')
    toast({ text: `${slot} logged — ${totals.kcal} kcal, ${totals.protein} g protein`, icon: 'check' })
    window.setTimeout(onClose, 1100)
  }

  const results = query
    ? FOOD_KEYS.filter((k) => FOODS[k].name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : FOOD_KEYS.slice(0, 8)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={phase === 'review' ? 'Check this before saving' : phase === 'saved' ? 'Saved' : 'Log a meal'}
      subtitle={
        phase === 'camera' ? 'Point at the plate. One photo is enough.'
          : phase === 'thinking' ? 'Working out what’s on the plate…'
          : phase === 'review' ? 'Jumbo proposed this. Nothing is recorded until you confirm.'
          : undefined
      }
      footer={
        phase === 'review' ? (
          <>
            <button className="btn btn--secondary" onClick={() => { setPhase('camera'); setCameraState('idle') }}>
              Retake
            </button>
            <button className="btn btn--primary grow" onClick={save} disabled={!items.length}>
              Confirm meal
            </button>
          </>
        ) : undefined
      }
    >
      {/* ------------------------------------------------------- Camera */}
      {(phase === 'camera' || phase === 'thinking') && (
        <div className="stack stack-5">
          <div className="camera">
            {cameraState === 'live'
              ? <video ref={videoRef} playsInline muted aria-label="Camera preview" />
              : <PlateSim seed={seed} />}
            <span className="camera__frame" aria-hidden="true" />
            <span className={`camera__flash${flash ? ' is-on' : ''}`} aria-hidden="true" />
            {phase === 'thinking' && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)',
                display: 'grid', placeItems: 'center', color: '#fff',
              }}>
                <div className="stack stack-3" style={{ alignItems: 'center' }}>
                  <span className="spinner" style={{ borderTopColor: '#fff', width: 24, height: 24 }} />
                  <span className="t-caption">Identifying items…</span>
                </div>
              </div>
            )}
            {phase === 'camera' && (
              <span className="camera__hint">
                {cameraState === 'unavailable' ? 'No camera here — using a stand-in photo' : 'Fill the frame with the plate'}
              </span>
            )}
          </div>

          {phase === 'camera' && (
            <>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="shutter" onClick={shoot} aria-label="Take photo">
                  <span className="shutter__core" aria-hidden="true" />
                </button>
              </div>
              <div className="row" style={{ justifyContent: 'center', gap: 'var(--s-3)' }}>
                <button className="btn btn--ghost btn--sm" onClick={() => {
                  const s = Math.floor(Math.random() * 1000)
                  setSeed(s); setRec(recognise(s)); setItems(recognise(s).items); setPhase('review')
                }}>
                  Skip the photo, enter by hand
                </button>
              </div>
              <p className="t-caption dim2" style={{ textAlign: 'center' }}>
                Photos are processed on this device and are not stored by Jumbo.
              </p>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- Review */}
      {phase === 'review' && rec && (
        <div className="stack stack-5">
          <div className="row" style={{ gap: 'var(--s-3)' }}>
            <div style={{ width: 76, height: 62, borderRadius: 'var(--r-md)', overflow: 'hidden', flex: 'none' }}>
              <PlateSim seed={seed} />
            </div>
            <div className="grow stack stack-1">
              <span className="t-callout strong">{rec.dish}</span>
              <Confidence value={rec.confidence} compact />
            </div>
          </div>

          {band && band.tone !== 'high' && (
            <div
              className="card card--quiet row"
              style={{ gap: 'var(--s-3)', alignItems: 'flex-start', borderLeft: '3px solid var(--caution)' }}
              role="note"
            >
              <Icon name="info" size={18} style={{ color: 'var(--caution)', flex: 'none', marginTop: 2 }} />
              <div className="stack stack-1">
                <span className="t-caption strong">{band.label}</span>
                <p className="t-caption dim">
                  {rec.caveat ?? 'Some items may be wrong. Change anything that does not look right.'}
                </p>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="stack stack-2">
            <span className="eyebrow">Items</span>
            <div>
              {items.map((it) => (
                <div className="item-row" key={it.id}>
                  <div className="row row--between" style={{ gap: 'var(--s-2)' }}>
                    <div className="row grow" style={{ gap: 'var(--s-2)', minWidth: 0 }}>
                      <span className="t-callout strong">{it.name}</span>
                      {it.confidence < 0.99 && (
                        <span className={`conf-pill conf-pill--${it.confidence >= 0.85 ? 'high' : it.confidence >= 0.65 ? 'medium' : 'low'}`}>
                          {Math.round(it.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <button
                      className="icon-btn" style={{ flex: 'none', width: 36, height: 36 }}
                      aria-label={`Remove ${it.name}`}
                      onClick={() => { haptic('tap'); setItems((xs) => xs.filter((x) => x.id !== it.id)) }}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="row row--between" style={{ gap: 'var(--s-3)' }}>
                    <span className="t-caption dim2 num">{it.kcal} kcal · {it.protein} g protein</span>
                    <Stepper
                      value={it.grams} label={`${it.name} portion`} unit="g" step={10} min={5} max={900}
                      onChange={(g) => setItems((xs) => xs.map((x) => (x.id === it.id ? rescaleItem(x, g) : x)))}
                    />
                  </div>
                </div>
              ))}
            </div>

            {!items.length && (
              <p className="t-caption dim2">Everything removed. Add at least one item to save this meal.</p>
            )}

            <button className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              <Icon name="plus" size={14} /> Add an item
            </button>

            {adding && (
              <div className="card card--quiet stack stack-3">
                <input
                  className="input" placeholder="Search foods" value={query} autoFocus
                  onChange={(e) => setQuery(e.target.value)} aria-label="Search foods"
                />
                <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                  {results.map((k) => (
                    <button
                      key={k} className="chip"
                      onClick={() => {
                        haptic('select')
                        setItems((xs) => [...xs, makeFoodItem(k)])
                        setAdding(false); setQuery('')
                      }}
                    >
                      {FOODS[k].name}
                    </button>
                  ))}
                  {!results.length && <span className="t-caption dim2">No match. Try a simpler word.</span>}
                </div>
              </div>
            )}
          </div>

          {/* Alternatives the model considered */}
          {rec.alternatives.length > 0 && (
            <div className="stack stack-2">
              <span className="eyebrow">Did Jumbo get it wrong?</span>
              <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                {rec.alternatives.map((alt) => (
                  <span key={alt} className="tag">{alt}</span>
                ))}
              </div>
              <p className="t-caption dim2">
                These were the model’s next-best guesses. Swap an item above if one of them is right.
              </p>
            </div>
          )}

          {/* Meal slot */}
          <div className="stack stack-2">
            <span className="eyebrow">Meal</span>
            <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
              {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const).map((s) => (
                <button key={s} className="chip" aria-pressed={slot === s}
                  onClick={() => { haptic('select'); setSlot(s) }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="card card--quiet stack stack-3">
            <div className="row row--between">
              <span className="t-caption dim">Meal total</span>
              <span className="t-title3 num">{totals.kcal} kcal</span>
            </div>
            <div className="macro-bar" aria-hidden="true">
              <span style={{ width: `${pct(totals.protein * 4, totals.kcal)}%`, background: 'var(--movement)' }} />
              <span style={{ width: `${pct(totals.carbs * 4, totals.kcal)}%`, background: 'var(--nutrition)' }} />
              <span style={{ width: `${pct(totals.fat * 9, totals.kcal)}%`, background: 'var(--recovery)' }} />
            </div>
            <div className="row" style={{ gap: 'var(--s-4)' }}>
              <Macro color="var(--movement)" label="Protein" value={`${totals.protein} g`} />
              <Macro color="var(--nutrition)" label="Carbs" value={`${totals.carbs} g`} />
              <Macro color="var(--recovery)" label="Fat" value={`${totals.fat} g`} />
            </div>
            <p className="t-caption dim2">
              Estimated from your corrections. Portion sizes from a photo carry real uncertainty —
              treat these as close, not exact.
            </p>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- Saved */}
      {phase === 'saved' && (
        <div className="stack stack-4" style={{ alignItems: 'center', padding: 'var(--s-8) 0' }}>
          <span className="win-badge pop" style={{ width: 72, height: 72 }} aria-hidden="true">
            <Icon name="check" size={30} strokeWidth={2.4} />
          </span>
          <p className="t-title3">{slot} logged</p>
          <p className="t-callout dim" style={{ textAlign: 'center' }}>
            It’s part of today, and part of your long-term pattern.
          </p>
        </div>
      )}
    </Sheet>
  )
}

function Macro({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="dot" style={{ background: color }} />
      <span className="t-caption dim">{label}</span>
      <span className="t-caption num strong">{value}</span>
    </div>
  )
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0)

function guessSlot(): MealEntry['slot'] {
  const h = new Date().getHours()
  if (h < 11) return 'Breakfast'
  if (h < 15) return 'Lunch'
  if (h < 18) return 'Snack'
  return 'Dinner'
}
