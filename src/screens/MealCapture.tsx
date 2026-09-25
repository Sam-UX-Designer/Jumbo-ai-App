import { useEffect, useRef, useState } from 'react'
import { AiOrb, Icon } from '../components/Icon'
import { AssetImage } from '../components/Asset'
import { Camera, type Capture } from '../components/Camera'
import { Thinking } from '../components/Thinking'
import { Confidence, ErrorNotice, Sheet, Stepper, UnavailableNotice, useToast } from '../components/UI'
import { useStore } from '../state/store'
import { api, type FoodAnalysis } from '../lib/api'
import { FOODS, FOOD_KEYS, makeCustomItem, makeFoodItem, mealTotals, rescaleItem } from '../data/foods'
import type { CustomFood, FoodItem, MealEntry } from '../data/types'
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
  /** The name being given to a food Jumbo does not have, or null. */
  const [newFood, setNewFood] = useState<string | null>(null)
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
    setNewFood(null)
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

  /*
   * What the search offers: the person's own foods first, then the built-in
   * list. Theirs come first because somebody who once typed "chapati" wants
   * it at the front of the queue, not behind thirty things they never eat.
   */
  const needle = query.trim().toLowerCase()
  const mine = (state.customFoods ?? [])
    .filter((f) => !needle || f.name.toLowerCase().includes(needle))
    .slice(0, 8)
  const results = (needle
    ? FOOD_KEYS.filter((k) => FOODS[k].name.toLowerCase().includes(needle))
    : FOOD_KEYS
  ).slice(0, 10)

  /*
   * Nothing Jumbo ships with is going to cover what everybody eats, so
   * anything typed can be added. The offer only appears once the name is
   * not already on one of the lists, so it never sits next to itself.
   */
  const known = [...mine.map((f) => f.name.toLowerCase()),
    ...FOOD_KEYS.map((k) => FOODS[k].name.toLowerCase())]
  const canAddNew = needle.length >= 2 && !known.includes(needle)

  const addMine = (f: CustomFood) => {
    haptic('selection')
    setItems((xs) => [...xs, makeCustomItem(f)])
    setAdding(false); setQuery(''); setNewFood(null)
  }

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
        <div className="stack stack-3">
          <Camera onCapture={analyse} hint="Fill the frame with the plate" />
          {/* Not everything gets photographed. This used to appear only
              after a photo Jumbo could not read, which meant taking a bad
              photo on purpose to reach it. */}
          <button
            className="btn btn--secondary btn--block"
            onClick={() => { haptic('selection'); setPhase('review'); setAdding(true) }}
          >
            <Icon name="note" size={16} /> Type it instead
          </button>
        </div>
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
                  className="input" placeholder="Search or type any food" value={query} autoFocus
                  onChange={(e) => { setQuery(e.target.value); setNewFood(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canAddNew) { e.preventDefault(); setNewFood(query.trim()) }
                  }}
                  aria-label="Search or type any food"
                />

                {newFood !== null ? (
                  <NewFoodForm
                    name={newFood}
                    onCancel={() => setNewFood(null)}
                    onSave={(food) => { dispatch({ type: 'addCustomFood', food }); addMine(food) }}
                  />
                ) : (
                  <>
                    <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                      {canAddNew && (
                        <button
                          className="chip chip--add"
                          onClick={() => { haptic('selection'); setNewFood(query.trim()) }}
                        >
                          <Icon name="plus" size={14} /> Add “{query.trim()}”
                        </button>
                      )}
                      {mine.map((f) => (
                        <button key={f.id} className="chip" onClick={() => addMine(f)}>{f.name}</button>
                      ))}
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
                    </div>
                    {!results.length && !mine.length && !canAddNew && (
                      <span className="t-caption dim2">Type at least two letters and you can add it yourself.</span>
                    )}
                  </>
                )}
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

/* ------------------------------------------------------------- new food */
/**
 * Adding a food Jumbo does not ship with.
 *
 * The numbers here are the person's own. Jumbo does not estimate them and
 * does not fill them in — a blank stays zero, and the meal total then says
 * what was actually entered rather than a guess dressed up as data. The
 * calorie field is the one thing asked for, because a meal total built from
 * items with no calories in them is worse than no total at all.
 *
 * Saved as well as added, so the second chapati is one tap.
 */
function NewFoodForm({
  name, onSave, onCancel,
}: {
  name: string
  onSave: (food: CustomFood) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(name)
  const [portion, setPortion] = useState('1 serving')
  const [grams, setGrams] = useState('100')
  const [kcal, setKcal] = useState('')
  const [more, setMore] = useState(false)
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  const num = (v: string) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const ready = label.trim().length >= 2 && kcal.trim() !== '' && num(kcal) > 0

  const save = () => {
    if (!ready) return
    haptic('success')
    onSave({
      id: uid(),
      name: label.trim(),
      portion: portion.trim() || '1 serving',
      grams: Math.max(1, Math.round(num(grams) || 100)),
      kcal: Math.round(num(kcal)),
      protein: num(protein),
      carbs: num(carbs),
      fat: num(fat),
      at: Date.now(),
    })
  }

  return (
    <div className="stack stack-3">
      <div className="field">
        <label className="field__label" htmlFor="nf-name">Food</label>
        <input
          id="nf-name" className="input" value={label} maxLength={48} autoFocus
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="row" style={{ gap: 'var(--s-3)' }}>
        <div className="field grow" style={{ minWidth: 0 }}>
          <label className="field__label" htmlFor="nf-portion">Portion</label>
          <input
            id="nf-portion" className="input" value={portion} maxLength={24}
            placeholder="1 piece" onChange={(e) => setPortion(e.target.value)}
          />
        </div>
        <div className="field" style={{ width: 96 }}>
          <label className="field__label" htmlFor="nf-grams">Grams</label>
          <input
            id="nf-grams" className="input num" value={grams} inputMode="numeric"
            onChange={(e) => setGrams(e.target.value.replace(/[^\d]/g, ''))}
          />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="nf-kcal">Calories in that portion</label>
        <input
          id="nf-kcal" className="input num" value={kcal} inputMode="numeric" placeholder="e.g. 120"
          onChange={(e) => setKcal(e.target.value.replace(/[^\d]/g, ''))}
        />
        <span className="field__hint">
          Roughly is fine. Jumbo will not guess this for you — whatever you
          put is what the day adds up.
        </span>
      </div>

      {more ? (
        <div className="row" style={{ gap: 'var(--s-3)' }}>
          {([
            ['nf-p', 'Protein', protein, setProtein],
            ['nf-c', 'Carbs', carbs, setCarbs],
            ['nf-f', 'Fat', fat, setFat],
          ] as const).map(([id, lab, val, set]) => (
            <div className="field grow" key={id} style={{ minWidth: 0 }}>
              <label className="field__label" htmlFor={id}>{lab} (g)</label>
              <input
                id={id} className="input num" value={val} inputMode="decimal" placeholder="0"
                onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </div>
          ))}
        </div>
      ) : (
        <button className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }}
          onClick={() => setMore(true)}>
          Add protein, carbs and fat
        </button>
      )}

      <div className="row" style={{ gap: 'var(--s-3)' }}>
        <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn--primary grow" disabled={!ready} onClick={save}>
          Add to meal
        </button>
      </div>
    </div>
  )
}
