import { useEffect, useState } from 'react'
import '../styles/capture.css'
import { AiOrb, Icon, type IconName } from '../components/Icon'
import { AssetImage } from '../components/Asset'
import { DateRail } from '../components/DateRail'
import { Empty, SectionHead, Segmented, Sheet, Stepper, useConfirm, useToast } from '../components/UI'
import { useDictation } from '../lib/useDictation'
import { MealCapture } from './MealCapture'
import { MealDetail } from './MealDetail'
import { useStore } from '../state/store'
import type { MealEntry, Measurement, MeasurementKind, WorkoutEntry, WorkoutType } from '../data/types'
import { mealTotals } from '../data/foods'
import { dailyProgress } from '../lib/analytics'
import { celebrate, haptic } from '../lib/feedback'
import { clockTime, nowClock, prettyDate, uid } from '../lib/util'

type Modal = null | 'meal' | 'workout' | 'measurement' | 'note'

/**
 * What you came here to add.
 *
 * Capture is an action screen, not a history screen, so the four kinds sit
 * at the top and picking one reveals its action directly underneath. Nobody
 * should have to scroll past yesterday's lunch to photograph today's.
 *
 * Each takes the Jumbo colour that kind already has everywhere else, so the
 * row reads as four subjects rather than four buttons.
 */
type CaptureKind = 'meal' | 'workout' | 'measurement' | 'note'

const KINDS: Array<{
  id: CaptureKind
  label: string
  icon: IconName
  tint: string
  heading: string
  blurb: string
  cta: string
  ctaIcon: IconName
}> = [
  {
    id: 'meal', label: 'Meal', icon: 'camera', tint: 'var(--nutrition)',
    heading: 'Snap your meal',
    blurb: 'Take a photo and Jumbo’s AI estimates the foods and nutrition. You correct it before anything is saved.',
    cta: 'Take photo', ctaIcon: 'camera',
  },
  {
    id: 'workout', label: 'Workout', icon: 'training', tint: 'var(--movement)',
    heading: 'Log a workout',
    blurb: 'Type, minutes and how hard it was. How it felt counts as much as how long it lasted.',
    cta: 'Log a workout', ctaIcon: 'training',
  },
  {
    id: 'measurement', label: 'Measure', icon: 'measure', tint: 'var(--measure)',
    heading: 'Add a measurement',
    blurb: 'Waist, grip, VO₂ max, a lab result. The slow numbers, entered on the days you have them.',
    cta: 'Add a measurement', ctaIcon: 'plus',
  },
  {
    id: 'note', label: 'Note', icon: 'note', tint: 'var(--note)',
    heading: 'Write a note',
    blurb: 'How the day actually felt, in your own words. The context the numbers cannot carry.',
    cta: 'Write a note', ctaIcon: 'note',
  },
]

/**
 * The categories a record can carry. They are labels and filters. They are
 * never the sort: see `byNewest`.
 *
 * Each takes the Jumbo colour the rest of the app already uses for that kind
 * of thing, so a green Lunch pill here is the same green as movement
 * everywhere else rather than a sixth palette invented for one list.
 */
type Category = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Exercise'

const CATEGORIES: Array<{ id: Category; icon: IconName; tint: string }> = [
  { id: 'Breakfast', icon: 'cutlery',  tint: 'var(--nutrition)' },
  { id: 'Lunch',     icon: 'bowl',     tint: 'var(--movement)' },
  { id: 'Dinner',    icon: 'cloche',   tint: 'var(--sleep)' },
  { id: 'Snack',     icon: 'apple',    tint: 'var(--training)' },
  { id: 'Exercise',  icon: 'training', tint: 'var(--recovery)' },
]

interface LoggedRecord {
  id: string
  /** Null only for the day's note, which belongs to no slot. */
  category: Category | null
  /** The record's own stored clock, "18:26". Null when it has none. */
  time: string | null
  /** A saved photograph, null for the reserved placeholder, undefined for a
      record that has no photograph slot at all. */
  photo?: string | null
  value: string
  sub: string
  open?: () => void
  remove?: () => void
}

/**
 * Newest first, on the stored value rather than on anything displayed.
 * "HH:MM" is zero-padded and 24-hour, so comparing the strings compares the
 * clock. A record with no clock sorts after every record that has one.
 */
const byNewest = (a: LoggedRecord, b: LoggedRecord) => {
  if (a.time && b.time) return b.time.localeCompare(a.time)
  if (a.time) return -1
  if (b.time) return 1
  return 0
}

/** Where a capture starts from, so the sheet can open in the right mode. */
type MealMode = 'camera' | 'manual'

const WORKOUT_TYPES: WorkoutType[] =
  ['Run', 'Strength', 'Walk', 'Cycle', 'Swim', 'Yoga', 'Mobility', 'Hike', 'Row', 'Other']

const MEASURE_KINDS: Array<{ kind: MeasurementKind; label: string; unit: string; step: number; dp: number; start: number }> = [
  { kind: 'waist', label: 'Waist', unit: 'cm', step: 0.5, dp: 1, start: 84 },
  { kind: 'gripStrength', label: 'Grip strength', unit: 'kg', step: 1, dp: 0, start: 45 },
  { kind: 'vo2max', label: 'VO₂ max', unit: 'ml/kg/min', step: 0.5, dp: 1, start: 45 },
  { kind: 'bodyFat', label: 'Body fat', unit: '%', step: 0.1, dp: 1, start: 21 },
  { kind: 'leanMass', label: 'Lean mass', unit: 'kg', step: 0.1, dp: 1, start: 59 },
  { kind: 'apoB', label: 'ApoB', unit: 'mg/dL', step: 1, dp: 0, start: 75 },
  { kind: 'hba1c', label: 'HbA1c', unit: '%', step: 0.1, dp: 1, start: 5.2 },
  { kind: 'vitaminD', label: 'Vitamin D', unit: 'ng/mL', step: 1, dp: 0, start: 38 },
]

export function Capture({ reopenMeal }: { reopenMeal?: { date: string; mealId: string } | null }) {
  const { state, dispatch } = useStore()
  const [modal, setModal] = useState<Modal>(null)
  // The meal whose detail is open, by id. Null when the list is showing.
  const [openMealId, setOpenMealId] = useState<string | null>(null)
  const [mealMode, setMealMode] = useState<MealMode>('camera')
  const [dictate, setDictate] = useState(false)
  const [filter, setFilter] = useState<Category | 'all'>('all')
  // Meal first: it is the thing a wearable cannot see, which is why this
  // screen exists at all.
  const [kind, setKind] = useState<CaptureKind>('meal')
  const { confirm, node: confirmNode } = useConfirm()
  const toast = useToast()

  // Capture writes to the day Home is showing, so a forgotten meal lands on
  // the right date rather than always on today.
  const date = state.selectedDate
  const today = state.days.find((d) => d.date === date) ?? state.days[state.days.length - 1]
  const isToday = date === state.today
  const progress = dailyProgress(today, state.baseline)

  // Only offered where the browser genuinely supports it.
  const dictation = useDictation(() => {})

  // Returning from a conversation that was about a meal puts that meal back
  // on screen, so back lands where it left rather than on the list.
  useEffect(() => {
    if (reopenMeal?.mealId) setOpenMealId(reopenMeal.mealId)
  }, [reopenMeal?.mealId])

  const openMeal = (mode: MealMode) => {
    haptic('selection')
    setMealMode(mode)
    setModal('meal')
  }

  /** The action the picked kind offers. One place, so the row and the card
      can never disagree about what a tap does. */
  const startCapture = (which: CaptureKind) => {
    haptic('impactLight')
    if (which === 'meal') { setMealMode('camera'); setModal('meal'); return }
    if (which === 'note') setDictate(false)
    setModal(which)
  }

  /**
   * Everything added to this day, as one list.
   *
   * The ordering value is the record's own stored clock: MealEntry.time, and
   * WorkoutEntry.time for a session that was saved rather than synced. It is
   * the only thing that decides the order. The category is a label and a
   * filter; it never moves a row. A record with no clock of its own — a
   * workout that arrived from a wearable as a daily total, and the day's
   * note — cannot claim a position among the rest, so it sits after them
   * rather than being given an invented time.
   */
  const records: LoggedRecord[] = [
    ...today.meals.map((m) => ({
      id: m.id,
      category: m.slot as Category,
      time: m.time,
      /**
       * The photograph this meal was read from, when there is one. Meals
       * added by hand, and those saved before photographs were kept, fall
       * back to the reserved placeholder — see src/lib/assets.ts.
       */
      photo: (m.photo ?? null) as string | null,
      value: `${mealTotals(m.items).kcal} kcal`,
      sub: m.items.slice(0, 3).map((i) => i.name).join(', ') || `${m.items.length} items`,
      open: () => { haptic('selection'); setOpenMealId(m.id) },
      remove: m.method !== 'imported'
        ? () => dispatch({ type: 'removeMeal', date: today.date, mealId: m.id })
        : undefined,
    })),
    ...(today.workout ? [{
      id: today.workout.id,
      category: 'Exercise' as Category,
      time: today.workout.time ?? null,
      photo: undefined,
      value: `${today.workout.type} · ${today.workout.minutes} min`,
      sub: `${['Easy', 'Moderate', 'Hard'][today.workout.intensity - 1]}${today.workout.perceivedEffort ? ` · felt ${today.workout.perceivedEffort}/10` : ''}`,
      open: undefined,
      remove: today.workout.source === 'manual'
        ? () => dispatch({ type: 'removeWorkout', date: today.date })
        : undefined,
    }] : []),
    ...(today.notes ? [{
      id: 'note',
      category: null,
      time: null,
      photo: undefined,
      value: 'Note',
      sub: today.notes,
      open: undefined,
      remove: () => dispatch({ type: 'setNote', date: today.date, note: '' }),
    }] : []),
  ]

  // Filter first, then order. Never the other way round, and never by name.
  const shown = records
    .filter((r) => filter === 'all' || r.category === filter)
    .sort(byNewest)

  return (
    <div className="stack stack-6">
      <header className="stack stack-5">
        <div className="scr-head">
          <h1 className="scr-head__title">Capture</h1>
          <p className="scr-head__sub">
            {isToday
              ? 'Sleep, steps and heart data arrive on their own. This is only for the gaps.'
              : `Adding to ${prettyDate(date)}.`}
          </p>
        </div>
        {state.dataMode === 'demo' && (
          <span className="sample-pill"><Icon name="flag" size={12} /> Sample data</span>
        )}
        <DateRail selected={date} onSelect={(d) => dispatch({ type: 'selectDate', date: d })} />
      </header>

      {/* ────────────────── what you came to add, and the way to add it */}
      <section className="stack stack-3">
        <div className="cap-tiles" role="group" aria-label="What to add">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className={`cap-tile${kind === k.id ? ' is-on' : ''}`}
              style={{ ['--tint' as string]: k.tint }}
              aria-pressed={kind === k.id}
              onClick={() => { haptic('selection'); setKind(k.id) }}
            >
              <span className="cap-tile__icon">
                <Icon name={k.icon} size={19} />
              </span>
              <span className="cap-tile__title">{k.label}</span>
            </button>
          ))}
        </div>

        <CaptureAction kind={kind} onStart={() => startCapture(kind)} />
      </section>

      {progress.recovery < 0.4 && !today.workout && (
        <div className="card card--brand row row--top" style={{ gap: 'var(--s-3)' }}>
          <AiOrb size="sm" />
          <p className="t-callout">
            Your recovery signals are below your baseline this morning. If you train today, a moderate
            session will cost you less than a hard one.
          </p>
        </div>
      )}

      <section className="section">
        <SectionHead
          title="Recently added"
          sub={isToday ? prettyDate(today.date) : `On ${prettyDate(today.date)}`}
        />

        {records.length > 0 && (
          <div className="rec__filters rail" role="group" aria-label="Filter by category">
            <button
              className={`recfilter${filter === 'all' ? ' is-on' : ''}`}
              style={{ '--tint': 'var(--brand)' } as React.CSSProperties}
              aria-pressed={filter === 'all'}
              onClick={() => { haptic('selection'); setFilter('all') }}
            >
              <Icon name="list" size={18} strokeWidth={2} />
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`recfilter${filter === c.id ? ' is-on' : ''}`}
                style={{ '--tint': c.tint } as React.CSSProperties}
                aria-pressed={filter === c.id}
                onClick={() => { haptic('selection'); setFilter(c.id) }}
              >
                <Icon name={c.icon} size={18} strokeWidth={2} />
                {c.id}
              </button>
            ))}
          </div>
        )}

        {records.length === 0 ? (
          <Empty
            icon="plate"
            title="Nothing added yet"
            body="Food is the one thing a wearable cannot see. A photo takes about five seconds."
            action={<button className="btn btn--primary" onClick={() => openMeal('camera')}>
              <Icon name="camera" size={16} /> Photograph a meal
            </button>}
          />
        ) : shown.length === 0 ? (
          <p className="t-callout dim2 rec__none">Nothing in {filter} on this day.</p>
        ) : (
          <ul className="stack stack-3">
            {shown.map((row) => {
              const meta = CATEGORIES.find((c) => c.id === row.category)
              return (
                <li
                  className={`reccard${row.open ? ' reccard--tap' : ''}`}
                  key={row.id}
                  style={meta ? ({ '--tint': meta.tint } as React.CSSProperties) : undefined}
                  {...(row.open ? {
                    role: 'button', tabIndex: 0, onClick: row.open,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.open!() }
                    },
                  } : {})}
                >
                  {row.photo !== undefined ? (
                    <AssetImage
                      asset="mealPhoto" src={row.photo} alt="" width={72} height={72}
                      rounded="tile" className="reccard__shot"
                    />
                  ) : (
                    <span className="reccard__shot reccard__shot--icon">
                      <Icon name={meta?.icon ?? 'note'} size={26} strokeWidth={1.9} />
                    </span>
                  )}

                  <div className="reccard__body">
                    {meta ? (
                      <span className="reccard__pill">
                        <Icon name={meta.icon} size={16} strokeWidth={2} />
                        {meta.id}
                      </span>
                    ) : (
                      <span className="reccard__pill reccard__pill--plain">
                        <Icon name="note" size={16} strokeWidth={2} />
                        Note
                      </span>
                    )}
                    <span className="reccard__value">{row.value}</span>
                    <span className="reccard__sub">{row.sub}</span>
                  </div>

                  <div className="reccard__end">
                    {row.time && <span className="reccard__time">{clockTime(row.time)}</span>}
                    {row.open && <Icon name="chevron" size={18} className="reccard__chev" />}
                    {row.remove && (
                      <button
                        className="icon-btn" aria-label={`Remove ${row.category ?? 'note'}, ${row.value}`}
                        onClick={(e) => confirm((e.stopPropagation(), {
                          title: 'Remove this entry?',
                          body: 'It comes out of today and out of your long-term pattern. This cannot be undone.',
                          confirmLabel: 'Remove',
                          onConfirm: () => { row.remove!(); haptic('impactHeavy'); toast({ text: 'Entry removed', icon: 'trash' }) },
                        }))}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ────────────────────────────── the other ways in */}
      <section className="stack stack-3">
        <SectionHead title="More ways to add" />
        <div className="rail" role="group" aria-label="Other ways to add">
          <button className="chip" onClick={() => openMeal('manual')}>
            <Icon name="search" size={16} /> Search food
          </button>
          {dictation.supported && (
            <button
              className="chip"
              onClick={() => { haptic('selection'); setDictate(true); setModal('note') }}
            >
              <Icon name="mic" size={16} /> Voice log
            </button>
          )}
          <button className="chip" onClick={() => openMeal('manual')}>
            <Icon name="note" size={16} /> Type manually
          </button>
        </div>
      </section>

      <MealDetail
        open={openMealId !== null}
        onClose={() => setOpenMealId(null)}
        date={today.date}
        meal={(today.meals.find((m) => m.id === openMealId) ?? null) as MealEntry | null}
      />

      <MealCapture
        open={modal === 'meal'} onClose={() => setModal(null)}
        date={today.date} startIn={mealMode}
      />
      <WorkoutSheet open={modal === 'workout'} onClose={() => setModal(null)} date={today.date} />
      <MeasurementSheet open={modal === 'measurement'} onClose={() => setModal(null)} />
      {/* Keyed by day: the note belongs to a date, so moving along the rail
          must not carry the previous day's words across. */}
      <NoteSheet
        key={today.date}
        open={modal === 'note'} onClose={() => setModal(null)}
        date={today.date} initial={today.notes ?? ''} autoDictate={dictate}
      />
      {confirmNode}
    </div>
  )
}

/**
 * The action for whichever kind is picked.
 *
 * The dashed rim is the same cue the photograph slot has always used: a
 * space waiting to be filled, rather than a card already filled in. Only
 * the meal shows a thumbnail, because only the meal is read from a picture.
 */
function CaptureAction({ kind, onStart }: { kind: CaptureKind; onStart: () => void }) {
  const k = KINDS.find((x) => x.id === kind) ?? KINDS[0]
  return (
    <button
      className="capact"
      key={k.id}
      style={{ ['--tint' as string]: k.tint }}
      onClick={onStart}
    >
      {k.id === 'meal' ? (
        <AssetImage asset="mealPhoto" alt="" rounded="tile" className="capact__shot" />
      ) : (
        <span className="capact__shot capact__shot--icon">
          <Icon name={k.icon} size={30} strokeWidth={1.7} />
        </span>
      )}
      <span className="capact__body">
        <span className="capact__title">{k.heading}</span>
        <span className="capact__blurb">{k.blurb}</span>
        <span className="capact__cta">
          <Icon name={k.ctaIcon} size={15} /> {k.cta}
        </span>
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------- workout */
function WorkoutSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const { dispatch } = useStore()
  const toast = useToast()
  const [type, setType] = useState<WorkoutType>('Run')
  const [minutes, setMinutes] = useState(45)
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2)
  const [rpe, setRpe] = useState(6)
  const [note, setNote] = useState('')

  const save = () => {
    const workout: WorkoutEntry = {
      id: `w-${uid()}`, time: nowClock(), type, minutes, intensity, perceivedEffort: rpe,
      note: note.trim() || undefined, source: 'manual',
    }
    dispatch({ type: 'logWorkout', date, workout })
    dispatch({ type: 'awardMilestone', id: 'first-workout' })
    celebrate('complete')
    toast({ text: `${type} logged: ${minutes} min`, icon: 'check' })
    onClose()
  }

  return (
    <Sheet
      open={open} onClose={onClose} title="Log a workout"
      subtitle="Four taps. How it felt matters as much as the numbers."
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary grow" onClick={save}>Save workout</button>
        </>
      }
    >
      <div className="stack stack-6">
        <div className="stack stack-2">
          <span className="eyebrow">Type</span>
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            {WORKOUT_TYPES.map((t) => (
              <button key={t} className="chip" aria-pressed={type === t}
                onClick={() => { haptic('selection'); setType(t) }}>{t}</button>
            ))}
          </div>
        </div>

        <div className="row row--between">
          <span className="t-callout strong">Duration</span>
          <Stepper value={minutes} onChange={setMinutes} step={5} min={5} max={300} unit="min" label="duration" />
        </div>

        <div className="stack stack-2">
          <span className="t-callout strong">Intensity</span>
          <Segmented
            ariaLabel="Intensity" value={intensity}
            onChange={(v) => setIntensity(v as 1 | 2 | 3)}
            options={[{ value: 1, label: 'Easy' }, { value: 2, label: 'Moderate' }, { value: 3, label: 'Hard' }]}
          />
        </div>

        <div className="stack stack-2">
          <div className="row row--between">
            <label className="t-callout strong" htmlFor="rpe">How it felt</label>
            <span className="t-callout num">{rpe}/10</span>
          </div>
          <input id="rpe" className="slider" type="range" min={1} max={10} step={1}
            value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
          <p className="t-caption dim2">
            Your read on the session. Jumbo weighs it against duration and heart rate, and when the two
            disagree that is itself worth knowing.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="w-note">Note (optional)</label>
          <input id="w-note" className="input" value={note} maxLength={120}
            placeholder="Legs heavy for the first ten minutes"
            onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------ measurement */
function MeasurementSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [idx, setIdx] = useState(0)
  const kind = MEASURE_KINDS[idx]
  const [value, setValue] = useState(kind.start)
  const [source, setSource] = useState('Manual')

  const pick = (i: number) => { setIdx(i); setValue(MEASURE_KINDS[i].start); haptic('selection') }

  const save = () => {
    const m: Measurement = {
      id: `man-${uid()}`, kind: kind.kind, date: state.today,
      value, unit: kind.unit, source, context: 'Entered by hand',
    }
    dispatch({ type: 'addMeasurement', measurement: m })
    celebrate('confirm', false)
    toast({ text: `${kind.label} saved`, icon: 'check' })
    onClose()
  }

  return (
    <Sheet
      open={open} onClose={onClose} title="Add a measurement"
      subtitle="Lab panels, DEXA scans and anything you measured yourself."
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary grow" onClick={save}>Save measurement</button>
        </>
      }
    >
      <div className="stack stack-6">
        <div className="stack stack-2">
          <span className="eyebrow">What did you measure?</span>
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            {MEASURE_KINDS.map((m, i) => (
              <button key={m.kind} className="chip" aria-pressed={i === idx} onClick={() => pick(i)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row row--between">
          <span className="t-callout strong">{kind.label}</span>
          <Stepper value={value} onChange={setValue} step={kind.step} dp={kind.dp}
            min={0} max={999} unit={kind.unit} label={kind.label} />
        </div>

        <div className="stack stack-2">
          <span className="t-callout strong">Where it came from</span>
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            {['Manual', 'Lab panel', 'DEXA scan', 'Clinic'].map((s) => (
              <button key={s} className="chip" aria-pressed={source === s}
                onClick={() => { haptic('selection'); setSource(s) }}>{s}</button>
            ))}
          </div>
          <p className="t-caption dim2">Jumbo keeps the source with the number, so you always know how it was measured.</p>
        </div>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------- note */
function NoteSheet({
  open, onClose, date, initial, autoDictate,
}: {
  open: boolean; onClose: () => void; date: string; initial: string; autoDictate?: boolean
}) {
  const { dispatch } = useStore()
  const toast = useToast()
  const [text, setText] = useState(initial)

  // Opening shows what is actually saved for this day. Without this an
  // abandoned draft would still be sitting in the field the next time.
  useEffect(() => {
    if (open) setText(initial)
    // `initial` deliberately not a dependency: it must not overwrite what is
    // being typed while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Dictated words are appended, so speaking twice adds to the note rather
  // than replacing it.
  const dictation = useDictation((heard) => {
    setText((t) => (t ? `${t.replace(/\s+$/, '')} ${heard}` : heard).slice(0, 400))
  })

  // Opened from "Voice log", so start listening rather than making them tap
  // the microphone a second time.
  useEffect(() => {
    if (open && autoDictate && dictation.supported && !dictation.listening) dictation.start()
    if (!open && dictation.listening) dictation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoDictate])

  const close = () => { dictation.stop(); onClose() }

  return (
    <Sheet
      open={open} onClose={close} title="Note"
      subtitle="Context the numbers miss: travel, stress, a cold, a good day."
      footer={
        <>
          <button className="btn btn--secondary" onClick={close}>Cancel</button>
          <button className="btn btn--primary grow" onClick={() => {
            dictation.stop()
            dispatch({ type: 'setNote', date, note: text.trim() })
            haptic('success'); toast({ text: 'Note saved', icon: 'note' }); onClose()
          }}>Save note</button>
        </>
      }
    >
      <div className="stack stack-3">
        <div className="field">
          <label className="sr-only" htmlFor="day-note">Note for this day</label>
          <textarea
            id="day-note" className="textarea" value={text} maxLength={400}
            placeholder="Flew back last night, slept badly, taking today easy."
            onChange={(e) => setText(e.target.value)}
          />
          <span className="field__hint">{text.length}/400 · Notes stay on this device.</span>
        </div>

        {dictation.supported && (
          <button
            className={`btn btn--secondary${dictation.listening ? ' is-listening' : ''}`}
            style={{ alignSelf: 'flex-start' }}
            aria-pressed={dictation.listening}
            onClick={() => { haptic('selection'); dictation.toggle() }}
          >
            <Icon name="mic" size={16} />
            {dictation.listening ? 'Listening — tap to stop' : 'Dictate instead'}
          </button>
        )}
        {dictation.error && <p className="t-caption" style={{ color: 'var(--caution)' }}>{dictation.error}</p>}
      </div>
    </Sheet>
  )
}
