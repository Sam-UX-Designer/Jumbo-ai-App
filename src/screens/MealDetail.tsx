import { Icon } from '../components/Icon'
import { AssetImage } from '../components/Asset'
import { Sheet } from '../components/UI'
import { useNavigate, type ChatFocus } from '../components/Nav'
import { mealTotals } from '../data/foods'
import type { MealEntry } from '../data/types'
import { haptic } from '../lib/feedback'

/**
 * One saved meal, in full.
 *
 * Everything shown here was actually stored on the entry. A meal added by
 * hand has no photograph and no confidence, so those simply do not appear —
 * nothing is filled in to make the sheet look complete.
 *
 * Ask Jumbo from here carries the meal as the subject of the conversation,
 * so "is this balanced" is about this plate. It is the same conversation as
 * everywhere else, given something to talk about.
 */
const SLOT_COLOUR: Record<MealEntry['slot'], string> = {
  Breakfast: 'var(--nutrition)',
  Lunch: 'var(--movement)',
  Dinner: 'var(--sleep)',
  Snack: 'var(--recovery)',
}

const METHOD_LABEL: Record<MealEntry['method'], string> = {
  camera: 'Photographed',
  manual: 'Entered by hand',
  imported: 'Imported from a connected source',
}

/** "September 11, 2026" from the stored ISO date. */
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })

/** The stored "20:05" as "8:05 PM". */
function twelveHour(time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '')
  if (!m) return null
  const h = Number(m[1])
  const suffix = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${m[2]} ${suffix}`
}

/** Questions worth asking about this particular plate. */
function chipsFor(meal: MealEntry): string[] {
  const has = meal.items.length > 0
  return [
    has ? 'What did I eat?' : 'What should I log here?',
    'Is this a balanced meal?',
    'How much protein did I get?',
    'How does this fit my goals?',
  ]
}

export function MealDetail({
  meal, date, open, onClose,
}: { meal: MealEntry | null; date: string; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  if (!meal) return null

  const totals = mealTotals(meal.items)
  const time = twelveHour(meal.time)

  /** The meal as the AI should see it. Stored values only. */
  const focus: ChatFocus = {
    kind: 'meal',
    date,
    mealId: meal.id,
    summary: {
      slot: meal.slot,
      date: longDate(date),
      ...(time ? { time } : {}),
      loggedBy: METHOD_LABEL[meal.method],
      totals: {
        kcal: totals.kcal, proteinG: totals.protein,
        carbsG: totals.carbs, fatG: totals.fat,
      },
      items: meal.items.map((i) => ({
        name: i.name, portion: i.portion, grams: i.grams,
        kcal: i.kcal, proteinG: i.protein, carbsG: i.carbs, fatG: i.fat,
        ...(i.confidence < 0.99 ? { aiConfidence: Math.round(i.confidence * 100) / 100 } : {}),
      })),
    },
  }

  const ask = (question?: string) => { haptic('selection'); navigate('chat', question, focus) }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={meal.slot}
      subtitle={[longDate(date), time].filter(Boolean).join(' · ')}
    >
      <div className="stack stack-5">
        {/* ------------------------------------------------ the plate */}
        <div className="row" style={{ gap: 'var(--s-4)' }}>
          {meal.photo ? (
            <AssetImage
              asset="mealPhoto" src={meal.photo} alt="This meal"
              width={92} height={92} rounded="tile"
              style={{ width: 92, height: 92, flex: 'none' }}
            />
          ) : (
            <span
              className="asset asset--tile"
              style={{
                width: 92, height: 92, flex: 'none', display: 'grid', placeItems: 'center',
                background: 'var(--surface-2)', color: SLOT_COLOUR[meal.slot],
              }}
            >
              <Icon name="plate" size={30} />
            </span>
          )}
          <div className="stack stack-1 grow" style={{ minWidth: 0 }}>
            <span className="t-display num" style={{ fontSize: 30, lineHeight: 1 }}>
              {totals.kcal}
            </span>
            <span className="t-caption dim2">kcal</span>
            <span className="t-caption dim" style={{ marginTop: 4 }}>
              {METHOD_LABEL[meal.method]}
            </span>
          </div>
        </div>

        {/* ------------------------------------------------- the macros */}
        <div className="row row--wrap" style={{ gap: 'var(--s-5)' }}>
          <Macro label="Protein" value={`${totals.protein} g`} colour="var(--movement)" />
          <Macro label="Carbs" value={`${totals.carbs} g`} colour="var(--nutrition)" />
          <Macro label="Fat" value={`${totals.fat} g`} colour="var(--recovery)" />
        </div>

        {/* -------------------------------------------------- the foods */}
        <div className="stack stack-2">
          <span className="eyebrow">{meal.items.length === 1 ? 'Item' : 'Items'}</span>
          {meal.items.length === 0 ? (
            <p className="t-caption dim2">Nothing was recorded on this meal.</p>
          ) : (
            <div>
              {meal.items.map((it) => (
                <div className="item-row" key={it.id}>
                  <div className="row row--between" style={{ gap: 'var(--s-2)' }}>
                    <span className="t-callout strong">{it.name}</span>
                    {it.confidence < 0.99 && (
                      <span className={`conf conf--${it.confidence >= 0.85 ? 'high' : it.confidence >= 0.65 ? 'medium' : 'low'}`}>
                        {Math.round(it.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="row row--between row--wrap" style={{ gap: 'var(--s-2)' }}>
                    <span className="t-caption dim2">{it.portion}</span>
                    <span className="t-caption dim2 num">
                      {it.kcal} kcal · {it.protein} g protein · {it.carbs} g carbs · {it.fat} g fat
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {meal.method === 'camera' && meal.items.some((i) => i.confidence < 0.99) && (
          <p className="t-caption dim2">
            Percentages are how sure Jumbo was when it read the photograph. You reviewed and
            confirmed these before they were saved.
          </p>
        )}

        {/* --------------------------------- ask about this plate */}
        <div className="stack stack-3 mealask">
          <ul className="askdock__chips" aria-label="Ask Jumbo about this meal">
            {chipsFor(meal).map((q) => (
              <li key={q}>
                <button className="qchip" onClick={() => ask(q)}>
                  <Icon name="sparkles" size={15} style={{ color: 'var(--brand)' }} />
                  {q}
                </button>
              </li>
            ))}
          </ul>
          <button className="askdock__field" onClick={() => ask()}>
            <Icon name="sparkles" size={18} style={{ color: 'var(--brand)', flex: 'none' }} />
            <span className="askdock__placeholder">Ask JUMBO about this meal…</span>
            <span className="askdock__go" aria-hidden="true">
              <Icon name="arrow-up" size={17} strokeWidth={2.3} />
            </span>
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function Macro({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div className="stack stack-1">
      <span className="row t-caption dim" style={{ gap: 6 }}>
        <span className="dot" style={{ background: colour }} /> {label}
      </span>
      <span className="t-title3 num">{value}</span>
    </div>
  )
}
