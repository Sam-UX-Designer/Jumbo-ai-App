import { useEffect, useRef, useState } from 'react'
import { AiOrb, Icon } from '../components/Icon'
import { AssetImage } from '../components/Asset'
import { Camera, type Capture } from '../components/Camera'
import { Thinking } from '../components/Thinking'
import { Confidence, ErrorNotice, Sheet, Stepper, UnavailableNotice, useToast } from '../components/UI'
import { useStore } from '../state/store'
import { api, type FoodAnalysis } from '../lib/api'
import { FOODS, FOOD_KEYS, makeFoodItem, mealTotals, rescaleItem } from '../data/foods'
import type { FoodItem, MealEntry } from '../data/types'
import { celebrate, haptic } from '../lib/feedback'
import { makeThumbnail } from '../lib/thumbnail'
import { uid } from '../lib/util'

type Phase = 'camera' | 'analysing' | 'review' | 'retake' | 'saved'

interface Failure { kind: 'setup' | 'error'; message: string; missing?: string[]; docs?: string }

export function MealCapture({
  open, onClose, date, startIn = 'camera',
}: {
  open: boolean
  onClose: () => void
  date: string
  /** 'manual' skips the camera and opens straight into building the meal by hand. */
  startIn?: 'camera' | 'manual'
}) {
  const { state, dispatch } = useStore()
  const toast = useToast()

  const [phase, setPhase] = useState<Phase>('camera')
  const [shot, setShot] = useState<Capture | null>(null)
  const [result, setResult] = useState<FoodAnalysis | null>(null)
  const [items, setItems] = useState<FoodItem[]>([])
  const [slot, setSlot] = useState<MealEntry['slot']>(guessSlot())
  const [failure, setFailure] = useState<Failure | null>(null)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  /**
   * Which visit to the sheet an analysis belongs to.
   *
   * Closing the sheet mid-analysis does not cancel the request, and a reply
   * landing afterwards would put the sheet back into review — so the next
   * time it opened it would show the last photograph's meal instead of the
   * camera. Bumping this on close makes that reply arrive for a visit that is
   * over, and it is dropped.
   */
  const visit = useRef(0)

  useEffect(() => {
    if (open) {
      // Opened from "Search food" or "Type manually": no camera, straight to
      // building the meal, with the search already open.
      if (startIn === 'manual') { setPhase('review'); setAdding(true) }
      return
    }
    visit.current += 1
    setPhase('camera'); setShot(null); setResult(null); setItems([])
    setFailure(null); setAdding(false); setQuery('')
  }, [open, startIn])

  const analyse = async (capture: Capture) => {
    const mine = visit.current
    setShot(capture)
    setPhase('analysing')
    setFailure(null)

    const r = await api.analyseFood(capture.base64, capture.mediaType)
    // The sheet was closed while this was in the air. Nothing to show.
    if (mine !== visit.current) return

    if (r.ok) {
      setResult(r.data)
      setItems(r.data.items)
      // 'not_food' and 'unclear' are answers, not errors: the photograph
      // arrived and was read. The person is shown what Jumbo saw and offered
      // another go, with no error surface anywhere.
      setPhase(r.data.verdict === 'food' ? 'review' : 'retake')
      haptic(r.data.verdict === 'food' ? 'impactLight' : 'selection')
      return
    }

    if (r.kind === 'setup') {
      setFailure({ kind: 'setup', message: r.message, missing: r.missing, docs: r.docs })
    } else if (r.kind === 'offline') {
      setFailure({
        kind: 'setup',
        message: 'Jumbo’s API is not running, so the photo cannot be analysed. You can still build the meal by hand.',
      })
    } else {
      setFailure({ kind: 'error', message: r.message })
    }
    setResult(null)
    setItems([])
    setPhase('review')
    haptic('warning')
  }

  const totals = mealTotals(items)

  const save = async () => {
    if (!items.length) return
    // Only a downscaled copy is kept; the full capture never reaches storage.
    const photo = shot ? await makeThumbnail(shot.dataUrl) : undefined
    const meal: MealEntry = {
      id: `meal-${uid()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      slot,
      items,
      method: result ? 'camera' : 'manual',
      confirmed: true,
      ...(photo ? { photo } : {}),
    }
    dispatch({ type: 'addMeal', date, meal })
    dispatch({ type: 'awardMilestone', id: 'first-meal' })
    setPhase('saved')
    celebrate('complete')
    toast({ text: `${slot} saved: ${totals.kcal} kcal, ${totals.protein} g protein`, icon: 'check' })
    window.setTimeout(onClose, 1400)
  }

  const results = query
    ? FOOD_KEYS.filter((k) => FOODS[k].name.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : FOOD_KEYS.slice(0, 10)

  const proteinVsUsual = state.baseline.proteinG
    ? Math.round(((totals.protein * 3) / state.baseline.proteinG - 1) * 100)
    : 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        phase === 'camera' ? 'Photograph your meal'
          : phase === 'review' && !shot ? 'Build your meal'
          : phase === 'analysing' ? 'Your photo'
          : phase === 'retake' ? 'Have another go'
          : phase === 'saved' ? 'Saved'
          : failure ? 'Build the meal' : 'Check before saving'
      }
      subtitle={
        phase === 'camera' ? 'One photo. Jumbo proposes, you correct.'
          : phase === 'review' && result ? 'Nothing is recorded until you confirm.'
          : undefined
      }
      footer={
        phase === 'review' ? (
          <>
            <button className="btn btn--secondary" onClick={() => { setPhase('camera'); setResult(null); setItems([]); setFailure(null) }}>
              Retake
            </button>
            <button className="btn btn--primary grow" onClick={() => void save()} disabled={!items.length}>
              Save meal
            </button>
          </>
        ) : undefined
      }
    >
      {/* ------------------------------------------------------ camera */}
      {phase === 'camera' && (
        <Camera onCapture={analyse} hint="Fill the frame with the plate" />
      )}

      {/* ---------------------------------------------------- analysing */}
      {phase === 'analysing' && (
        <div className="stack stack-5">
          {shot && (
            <div className="shot-preview">
              <img src={shot.dataUrl} alt="The meal you just photographed" />
            </div>
          )}
          {/* The photograph is already on screen, so the wait needs nothing
              standing in for the answer: the mark and one word, the same as
              Ask Jumbo. No skeleton rows pretending to be the food. */}
          <div className="working">
            <Thinking size={40} />
          </div>
        </div>
      )}

      {/* ------------------------------------------ read, but not a meal */}
      {phase === 'retake' && result && (
        <div className="stack stack-5">
          {shot && (
            <div className="shot-preview">
              <img src={shot.dataUrl} alt="The photo you just took" />
            </div>
          )}
          <div className="stack stack-3" style={{ textAlign: 'center', alignItems: 'center' }}>
            <Icon
              name={result.verdict === 'not_food' ? 'image' : 'camera'}
              size={26}
              style={{ color: 'var(--nutrition)' }}
            />
            <p className="t-body" style={{ maxWidth: '34ch' }}>
              {result.message
                ?? (result.verdict === 'not_food'
                  ? 'This doesn’t look like a food photo. Try taking a photo of your meal.'
                  : 'I can see something that may be food, but I can’t identify it clearly. Try a closer, brighter photo.')}
            </p>
          </div>
          <div className="row" style={{ gap: 'var(--s-3)' }}>
            <button
              className="btn btn--primary grow"
              onClick={() => { haptic('selection'); setPhase('camera'); setResult(null); setShot(null) }}
            >
              <Icon name="camera" size={16} /> Retake photo
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => { setPhase('review'); setResult(null); setAdding(true) }}
            >
              Add by hand
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- review */}
      {phase === 'review' && (
        <div className="stack stack-5">
          {shot && (
            <div className="row" style={{ gap: 'var(--s-3)' }}>
              <img
                src={shot.dataUrl} alt="Your meal"
                style={{ width: 78, height: 66, objectFit: 'cover', borderRadius: 'var(--r-input)', flex: 'none' }}
              />
              <div className="grow stack stack-1" style={{ minWidth: 0 }}>
                <span className="t-callout strong">{result?.dish ?? 'Your meal'}</span>
                {result
                  ? <Confidence value={result.confidence} compact />
                  : <span className="t-caption dim2">Entered by hand</span>}
              </div>
            </div>
          )}

          {failure?.kind === 'setup' && (
            <UnavailableNotice
              title="Jumbo can’t read this photo right now"
              message="Photo analysis is unavailable at the moment. You can still add the meal by searching for the foods yourself."
            />
          )}
          {failure?.kind === 'error' && (
            <ErrorNotice
              title="The analysis failed"
              message={failure.message}
              onRetry={shot ? () => void analyse(shot) : undefined}
            />
          )}

          {result?.caveat && (
            <div className="notice notice--setup" role="note">
              <Icon name="info" size={18} style={{ color: 'var(--nutrition)', flex: 'none', marginTop: 2 }} />
              <div className="stack stack-1">
                <span className="t-caption strong">Where this estimate is weakest</span>
                <p className="t-caption dim">{result.caveat}</p>
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
                        <span className={`conf conf--${it.confidence >= 0.85 ? 'high' : it.confidence >= 0.65 ? 'medium' : 'low'}`}>
                          {Math.round(it.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <button
                      className="icon-btn none" style={{ width: 36, height: 36 }}
                      aria-label={`Remove ${it.name}`}
                      onClick={() => { haptic('impactLight'); setItems((xs) => xs.filter((x) => x.id !== it.id)) }}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="row row--between" style={{ gap: 'var(--s-3)' }}>
                    <span className="t-caption dim2 num">{it.kcal} kcal · {it.protein} g protein</span>
                    <Stepper
                      value={it.grams} label={`${it.name} portion`} unit="g" step={10} min={5} max={1200}
                      onChange={(g) => setItems((xs) => xs.map((x) => (x.id === it.id ? rescaleItem(x, g) : x)))}
                    />
                  </div>
                </div>
              ))}
            </div>

            {!items.length && (
              <p className="t-caption dim2">
                Nothing on the list yet. Add what you ate and Jumbo will do the rest.
              </p>
            )}

            <button
              className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => setAdding((a) => !a)} aria-expanded={adding}
            >
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
                        haptic('selection')
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

          {result && result.alternatives.length > 0 && (
            <div className="stack stack-2">
              <span className="eyebrow">Jumbo’s next-best guesses</span>
              <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                {result.alternatives.map((alt) => <span key={alt} className="tag">{alt}</span>)}
              </div>
              <p className="t-caption dim2">Swap an item above if one of these is right.</p>
            </div>
          )}

          <div className="stack stack-2">
            <span className="eyebrow">Meal</span>
            <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
              {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const).map((s) => (
                <button key={s} className="chip" aria-pressed={slot === s}
                  onClick={() => { haptic('selection'); setSlot(s) }}>{s}</button>
              ))}
            </div>
          </div>

          {items.length > 0 && (
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
              <div className="row row--wrap" style={{ gap: 'var(--s-4)' }}>
                <Macro colour="var(--movement)" label="Protein" value={`${totals.protein} g`} />
                <Macro colour="var(--nutrition)" label="Carbs" value={`${totals.carbs} g`} />
                <Macro colour="var(--recovery)" label="Fat" value={`${totals.fat} g`} />
              </div>
              {Math.abs(proteinVsUsual) > 12 && (
                <div className="row" style={{ gap: 'var(--s-2)' }}>
                  <AiOrb size="sm" />
                  <span className="t-caption dim">
                    This meal is {Math.abs(proteinVsUsual)}% {proteinVsUsual > 0 ? 'higher' : 'lower'} in protein
                    than a typical third of your day.
                  </span>
                </div>
              )}
              <p className="t-caption dim2">
                Portion size from a photograph carries real uncertainty. Treat these as close, not exact.
              </p>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------- saved */}
      {phase === 'saved' && (
        <div className="stack stack-4" style={{ alignItems: 'center', padding: 'var(--s-10) 0' }}>
          <AssetImage
            asset="celebration" alt="" rounded="none" loading="eager"
            className="pop" style={{ width: 132, height: 132, background: 'none' }}
          />
          <p className="t-title3">{slot} saved</p>
          <p className="t-callout dim" style={{ textAlign: 'center', maxWidth: '30ch' }}>
            It is part of today, and part of what Jumbo watches over time.
          </p>
        </div>
      )}
    </Sheet>
  )
}

function Macro({ colour, label, value }: { colour: string; label: string; value: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="dot" style={{ background: colour }} />
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
