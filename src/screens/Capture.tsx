import { useEffect, useState } from 'react'
import '../styles/capture.css'
import { AiOrb, Icon, type IconName } from '../components/Icon'
import { AssetImage, AvatarButton } from '../components/Asset'
import { DateRail } from '../components/DateRail'
import { Empty, SectionHead, Segmented, Sheet, Stepper, useConfirm, useToast } from '../components/UI'
import { useDictation } from '../lib/useDictation'
import { MealCapture } from './MealCapture'
import { useStore } from '../state/store'
import type { Measurement, MeasurementKind, WorkoutEntry, WorkoutType } from '../data/types'
import { mealTotals } from '../data/foods'
import { dailyProgress } from '../lib/analytics'
import { celebrate, haptic } from '../lib/feedback'
import { prettyDate, uid } from '../lib/util'

type Modal = null | 'meal' | 'workout' | 'measurement' | 'note'

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

export function Capture() {
  const { state, dispatch } = useStore()
  const [modal, setModal] = useState<Modal>(null)
  const [mealMode, setMealMode] = useState<MealMode>('camera')
  const [dictate, setDictate] = useState(false)
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

  const openMeal = (mode: MealMode) => {
    haptic('selection')
    setMealMode(mode)
    setModal('meal')
  }

  const logged = [
    ...today.meals.map((m) => ({
      id: m.id, icon: 'plate' as IconName, colour: 'var(--nutrition)',
      /**
       * The photograph slot for this meal. Meals are not storing their
       * picture yet, so the reserved placeholder stands in — see
       * src/lib/assets.ts.
       */
      photo: null as string | null,
      title: `${m.slot} · ${mealTotals(m.items).kcal} kcal`,
      time: m.time,
      sub: m.items.slice(0, 3).map((i) => i.name).join(', ') || `${m.items.length} items`,
      remove: m.method !== 'imported' ? () => dispatch({ type: 'removeMeal', date: today.date, mealId: m.id }) : undefined,
    })),
    ...(today.workout ? [{
      id: today.workout.id, icon: 'training' as IconName, colour: 'var(--training)', photo: undefined,
      time: '',
      title: `${today.workout.type} · ${today.workout.minutes} min`,
      sub: `${['easy', 'moderate', 'hard'][today.workout.intensity - 1]}${today.workout.perceivedEffort ? ` · felt ${today.workout.perceivedEffort}/10` : ''}`,
      remove: today.workout.source === 'manual' ? () => dispatch({ type: 'removeWorkout', date: today.date }) : undefined,
    }] : []),
    ...(today.notes ? [{
      id: 'note', icon: 'note' as IconName, colour: 'var(--sleep)', photo: undefined,
      time: '',
      title: 'Note', sub: today.notes,
      remove: () => dispatch({ type: 'setNote', date: today.date, note: '' }),
    }] : []),
  ]

  return (
    <div className="stack stack-10">
      <header className="stack stack-5">
        <div className="row row--between row--top" style={{ gap: 'var(--s-4)' }}>
          <div className="stack stack-1" style={{ minWidth: 0 }}>
            <p className="eyebrow">Capture</p>
            <h1 className="t-title1">
              {isToday ? 'Add today’s data' : `Add to ${prettyDate(date)}`}
            </h1>
          </div>
          <AvatarButton />
        </div>
        <p className="t-callout dim" style={{ maxWidth: '44ch' }}>
          Sleep, steps and heart data arrive on their own. This is only for the gaps.
        </p>
        <DateRail selected={date} onSelect={(d) => dispatch({ type: 'selectDate', date: d })} />
      </header>

      <section className="cap-tiles stagger">
        <CaptureTile
          icon="camera" colour="var(--nutrition)" title="Meal" sub="Photo, then AI"
          primary onClick={() => openMeal('camera')}
        />
        <CaptureTile
          icon="training" colour="var(--training)" title="Workout" sub="Type, time, effort"
          onClick={() => { haptic('selection'); setModal('workout') }}
        />
        <CaptureTile
          icon="measure" colour="var(--measure)" title="Measurement" sub="Lab, DEXA, tape"
          onClick={() => { haptic('selection'); setModal('measurement') }}
        />
        <CaptureTile
          icon="note" colour="var(--sleep)" title="Note" sub="How today felt"
          onClick={() => { haptic('selection'); setDictate(false); setModal('note') }}
        />
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

      {/* ────────────────────────────── the camera-first route, up front */}
      <button className="snap" onClick={() => openMeal('camera')}>
        <AssetImage asset="mealPhoto" alt="" rounded="tile" className="snap__shot" />
        <span className="stack stack-2 grow" style={{ minWidth: 0, textAlign: 'left' }}>
          <span className="t-title3">Snap your meal</span>
          <span className="t-caption dim">
            Take a photo and Jumbo’s AI estimates the foods, portions and nutrition. You correct
            it before anything is saved.
          </span>
          <span className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-start', pointerEvents: 'none' }}>
            <Icon name="camera" size={15} /> Take photo
          </span>
        </span>
      </button>

      {/* ────────────────────────────── the other ways in */}
      <section className="stack stack-3">
        <SectionHead title="More ways to add" />
        <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
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

      <section className="section">
        <SectionHead
          title="Recently added"
          sub={isToday ? prettyDate(today.date) : `On ${prettyDate(today.date)}`}
        />
        {logged.length === 0 ? (
          <Empty
            icon="plate"
            title="Nothing added yet"
            body="Food is the one thing a wearable cannot see. A photo takes about five seconds."
            action={<button className="btn btn--primary" onClick={() => openMeal('camera')}>
              <Icon name="camera" size={16} /> Photograph a meal
            </button>}
          />
        ) : (
          <ul className="stack stack-3">
            {logged.map((row) => (
              <li className="card row" key={row.id} style={{ gap: 'var(--s-3)' }}>
                {row.photo !== undefined ? (
                  <AssetImage
                    asset="mealPhoto" src={row.photo} alt="" width={40} height={40}
                    rounded="tile" style={{ width: 40, height: 40 }}
                  />
                ) : (
                  <span style={{
                    width: 40, height: 40, borderRadius: 'var(--r-tile)', flex: 'none',
                    display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: row.colour,
                  }}>
                    <Icon name={row.icon} size={19} />
                  </span>
                )}
                <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="t-callout strong">{row.title}</span>
                  <span className="t-caption dim2" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sub}</span>
                </div>
                {row.time && <span className="t-caption dim2 num none">{row.time}</span>}
                {row.remove && (
                  <button
                    className="icon-btn" aria-label={`Remove ${row.title}`}
                    onClick={() => confirm({
                      title: 'Remove this entry?',
                      body: 'It comes out of today and out of your long-term pattern. This cannot be undone.',
                      confirmLabel: 'Remove',
                      onConfirm: () => { row.remove!(); haptic('impactHeavy'); toast({ text: 'Entry removed', icon: 'trash' }) },
                    })}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <MealCapture
        open={modal === 'meal'} onClose={() => setModal(null)}
        date={today.date} startIn={mealMode}
      />
      <WorkoutSheet open={modal === 'workout'} onClose={() => setModal(null)} date={today.date} />
      <MeasurementSheet open={modal === 'measurement'} onClose={() => setModal(null)} />
      <NoteSheet
        open={modal === 'note'} onClose={() => setModal(null)}
        date={today.date} initial={today.notes ?? ''} autoDictate={dictate}
      />
      {confirmNode}
    </div>
  )
}

function CaptureTile({
  icon, colour, title, sub, onClick, primary,
}: { icon: IconName; colour: string; title: string; sub: string; onClick: () => void; primary?: boolean }) {
  return (
    <button className={`cap-tile${primary ? ' cap-tile--primary' : ''}`} onClick={onClick}>
      <span className="cap-tile__icon" style={{ background: 'var(--surface-2)', color: colour }}>
        <Icon name={icon} size={21} />
      </span>
      <span className="stack" style={{ gap: 2 }}>
        <span className="t-callout strong">{title}</span>
        <span className="t-caption dim2">{sub}</span>
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
      id: `w-${uid()}`, type, minutes, intensity, perceivedEffort: rpe,
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
