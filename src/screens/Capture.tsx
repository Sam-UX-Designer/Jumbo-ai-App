import { useState } from 'react'
import '../styles/capture.css'
import { Icon, type IconName } from '../components/Icon'
import { Empty, ScreenHead, SectionHead, Segmented, Sheet, Stepper, useConfirm, useToast } from '../components/UI'
import { FoodCapture } from './FoodCapture'
import { useStore } from '../state/store'
import type { Measurement, MeasurementKind, WorkoutEntry, WorkoutType } from '../data/types'
import { mealTotals } from '../data/foods'
import { haptic } from '../lib/haptics'
import { uid, prettyDate } from '../lib/util'

type Modal = null | 'food' | 'workout' | 'measure' | 'note'

const WORKOUT_TYPES: Array<{ type: WorkoutType; icon: IconName }> = [
  { type: 'Run', icon: 'steps' }, { type: 'Strength', icon: 'dumbbell' },
  { type: 'Walk', icon: 'steps' }, { type: 'Cycle', icon: 'bolt' },
  { type: 'Swim', icon: 'bolt' }, { type: 'Yoga', icon: 'leaf' },
  { type: 'Mobility', icon: 'leaf' }, { type: 'Hike', icon: 'steps' },
  { type: 'Row', icon: 'bolt' }, { type: 'Other', icon: 'plus' },
]

const MEASURE_KINDS: Array<{ kind: MeasurementKind; label: string; unit: string; step: number; dp: number; start: number }> = [
  { kind: 'waist', label: 'Waist', unit: 'cm', step: 0.5, dp: 1, start: 84 },
  { kind: 'gripStrength', label: 'Grip strength', unit: 'kg', step: 1, dp: 0, start: 45 },
  { kind: 'vo2max', label: 'VO₂ max (test result)', unit: 'ml/kg/min', step: 0.5, dp: 1, start: 45 },
  { kind: 'bodyFat', label: 'Body fat (DEXA)', unit: '%', step: 0.1, dp: 1, start: 21 },
  { kind: 'leanMass', label: 'Lean mass (DEXA)', unit: 'kg', step: 0.1, dp: 1, start: 59 },
  { kind: 'apoB', label: 'ApoB', unit: 'mg/dL', step: 1, dp: 0, start: 75 },
  { kind: 'hba1c', label: 'HbA1c', unit: '%', step: 0.1, dp: 1, start: 5.2 },
  { kind: 'vitaminD', label: 'Vitamin D', unit: 'ng/mL', step: 1, dp: 0, start: 38 },
]

export function Capture() {
  const { state, dispatch } = useStore()
  const [modal, setModal] = useState<Modal>(null)
  const today = state.days[state.days.length - 1]
  const { confirm, node: confirmNode } = useConfirm()
  const toast = useToast()

  const loggedToday = [
    ...today.meals.map((m) => ({
      id: m.id, icon: 'plate' as IconName, color: 'var(--nutrition)',
      title: `${m.slot} · ${mealTotals(m.items).kcal} kcal`,
      sub: `${m.items.length} items · ${m.method === 'camera' ? 'photo' : m.method === 'manual' ? 'entered by hand' : 'imported'}`,
      remove: m.method !== 'imported' ? () => dispatch({ type: 'removeMeal', date: today.date, mealId: m.id }) : undefined,
    })),
    ...(today.workout ? [{
      id: today.workout.id, icon: 'dumbbell' as IconName, color: 'var(--recovery)',
      title: `${today.workout.type} · ${today.workout.minutes} min`,
      sub: `${['easy', 'moderate', 'hard'][today.workout.intensity - 1]}${today.workout.perceivedEffort ? ` · felt ${today.workout.perceivedEffort}/10` : ''}`,
      remove: today.workout.source === 'manual' ? () => dispatch({ type: 'removeWorkout', date: today.date }) : undefined,
    }] : []),
    ...(today.notes ? [{
      id: 'note', icon: 'note' as IconName, color: 'var(--sleep)',
      title: 'Note', sub: today.notes, remove: () => dispatch({ type: 'setNote', date: today.date, note: '' }),
    }] : []),
  ]

  return (
    <div className="stack stack-10">
      <ScreenHead
        eyebrow="Capture"
        title="Add what your devices can’t see"
        sub="Everything else is already imported. This is only for the gaps."
      />

      <section className="cap-tiles">
        <CaptureTile
          icon="camera" color="var(--nutrition)" title="Meal"
          sub="Photo, then correct" onClick={() => { haptic('select'); setModal('food') }}
        />
        <CaptureTile
          icon="dumbbell" color="var(--recovery)" title="Workout"
          sub="Type, time, effort" onClick={() => { haptic('select'); setModal('workout') }}
        />
        <CaptureTile
          icon="measure" color="var(--movement)" title="Measurement"
          sub="Lab, DEXA, tape" onClick={() => { haptic('select'); setModal('measure') }}
        />
        <CaptureTile
          icon="note" color="var(--sleep)" title="Note"
          sub="How today felt" onClick={() => { haptic('select'); setModal('note') }}
        />
      </section>

      <section className="section">
        <SectionHead title="Logged today" sub={prettyDate(today.date)} />
        {loggedToday.length === 0 ? (
          <Empty
            icon="plate" title="Nothing added yet"
            body="Your sleep, steps and heart data arrive automatically. Meals are the one thing worth a photo."
            action={<button className="btn btn--primary" onClick={() => setModal('food')}>Photograph a meal</button>}
          />
        ) : (
          <ul className="stack stack-3">
            {loggedToday.map((row) => (
              <li className="card row" key={row.id} style={{ gap: 'var(--s-3)' }}>
                <span style={{
                  width: 38, height: 38, borderRadius: 'var(--r-md)', flex: 'none',
                  display: 'grid', placeItems: 'center',
                  background: 'var(--surface-2)', color: row.color,
                }}>
                  <Icon name={row.icon} size={18} />
                </span>
                <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="t-callout strong">{row.title}</span>
                  <span className="t-caption dim2" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sub}</span>
                </div>
                {row.remove && (
                  <button
                    className="icon-btn" aria-label={`Remove ${row.title}`}
                    onClick={() => confirm({
                      title: 'Remove this entry?',
                      body: 'It will be taken out of today and out of your long-term pattern. This cannot be undone.',
                      confirmLabel: 'Remove',
                      onConfirm: () => { row.remove!(); haptic('warning'); toast({ text: 'Entry removed', icon: 'trash' }) },
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

      <FoodCapture open={modal === 'food'} onClose={() => setModal(null)} date={today.date} />
      <WorkoutSheet open={modal === 'workout'} onClose={() => setModal(null)} date={today.date} />
      <MeasurementSheet open={modal === 'measure'} onClose={() => setModal(null)} />
      <NoteSheet open={modal === 'note'} onClose={() => setModal(null)} date={today.date} initial={today.notes ?? ''} />
      {confirmNode}
    </div>
  )
}

function CaptureTile({
  icon, color, title, sub, onClick,
}: { icon: IconName; color: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="cap-tile" onClick={onClick}>
      <span className="cap-tile__icon" style={{ background: 'var(--surface-2)', color }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="stack" style={{ gap: 2 }}>
        <span className="t-callout strong">{title}</span>
        <span className="t-caption dim2">{sub}</span>
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------- Workout */
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
    haptic('milestone')
    toast({ text: `${type} logged — ${minutes} min`, icon: 'check' })
    onClose()
  }

  return (
    <Sheet
      open={open} onClose={onClose} title="Log a workout"
      subtitle="Four taps. Effort matters as much as the numbers."
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
            {WORKOUT_TYPES.map((w) => (
              <button key={w.type} className="chip" aria-pressed={type === w.type}
                onClick={() => { haptic('select'); setType(w.type) }}>
                <Icon name={w.icon} size={15} /> {w.type}
              </button>
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
            ariaLabel="Intensity"
            value={intensity}
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
            Your read on the session. Jumbo weighs this alongside duration and heart rate — sometimes
            they disagree, and that itself is useful.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="w-note">Note (optional)</label>
          <input id="w-note" className="input" value={note} maxLength={120}
            placeholder="Legs heavy in the first 10 minutes"
            onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Sheet>
  )
}

/* ----------------------------------------------------------- Measurement */
function MeasurementSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [kindIdx, setKindIdx] = useState(0)
  const kind = MEASURE_KINDS[kindIdx]
  const [value, setValue] = useState(kind.start)
  const [source, setSource] = useState('Manual')

  const pick = (i: number) => { setKindIdx(i); setValue(MEASURE_KINDS[i].start); haptic('select') }

  const save = () => {
    const m: Measurement = {
      id: `man-${uid()}`, kind: kind.kind, date: state.today,
      value, unit: kind.unit, source, context: 'Entered by hand',
    }
    dispatch({ type: 'addMeasurement', measurement: m })
    haptic('success')
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
              <button key={m.kind} className="chip" aria-pressed={i === kindIdx} onClick={() => pick(i)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row row--between">
          <span className="t-callout strong">{kind.label}</span>
          <Stepper
            value={value} onChange={setValue} step={kind.step} dp={kind.dp}
            min={0} max={999} unit={kind.unit} label={kind.label}
          />
        </div>

        <div className="stack stack-2">
          <span className="t-callout strong">Where it came from</span>
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            {['Manual', 'Lab panel', 'DEXA scan', 'Clinic'].map((s) => (
              <button key={s} className="chip" aria-pressed={source === s}
                onClick={() => { haptic('select'); setSource(s) }}>{s}</button>
            ))}
          </div>
          <p className="t-caption dim2">
            Jumbo keeps the source with the number so you always know how it was measured.
          </p>
        </div>
      </div>
    </Sheet>
  )
}

/* -------------------------------------------------------------------- Note */
function NoteSheet({
  open, onClose, date, initial,
}: { open: boolean; onClose: () => void; date: string; initial: string }) {
  const { dispatch } = useStore()
  const toast = useToast()
  const [text, setText] = useState(initial)

  return (
    <Sheet
      open={open} onClose={onClose} title="Note"
      subtitle="Context the numbers miss — travel, stress, a cold, a good day."
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary grow" onClick={() => {
            dispatch({ type: 'setNote', date, note: text.trim() })
            haptic('success'); toast({ text: 'Note saved', icon: 'note' }); onClose()
          }}>Save note</button>
        </>
      }
    >
      <div className="field">
        <label className="sr-only" htmlFor="day-note">Note for today</label>
        <textarea
          id="day-note" className="textarea" value={text} maxLength={400}
          placeholder="Flew back last night, slept badly, easy day planned."
          onChange={(e) => setText(e.target.value)}
        />
        <span className="field__hint">{text.length}/400 · Notes stay on this device.</span>
      </div>
    </Sheet>
  )
}
