import { useEffect, useRef, useState } from 'react'
import '../styles/training.css'
import { Icon } from '../components/Icon'
import { Segmented, Sheet, Stepper, useConfirm, useToast } from '../components/UI'
import { useStore } from '../state/store'
import { haptic, celebrate } from '../lib/feedback'
import { nowClock, uid } from '../lib/util'
import { blockAmount, exerciseById, type TrainingPlan } from '../data/training'

/**
 * Doing a session.
 *
 * One screen, one job: work down the list and tick things off. The clock
 * runs from the moment it opens and the minutes it reports at the end are
 * the minutes that actually elapsed — not the plan's estimate. A session
 * that took an hour should not be logged as the forty minutes somebody
 * planned for.
 *
 * Finishing writes a real workout into the day, so it reaches the figures
 * on Today like anything else logged by hand. A session that showed here
 * and nowhere else would be the same bug as a ride that saved to Capture
 * and counted for nothing.
 */
export function SessionRunner({
  plan, onClose, onFinished,
}: { plan: TrainingPlan; onClose: () => void; onFinished: () => void }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const { confirm, node: confirmNode } = useConfirm()

  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [rest, setRest] = useState<{ left: number; of: number } | null>(null)
  const [finishing, setFinishing] = useState(false)

  // One clock for the session. It counts real time, including the time
  // spent staring at the phone between sets, because that is time training
  // took.
  useEffect(() => {
    const t = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    )
    return () => window.clearInterval(t)
  }, [])

  // A second clock, only while resting.
  useEffect(() => {
    if (!rest) return
    if (rest.left <= 0) {
      haptic('impactLight')
      setRest(null)
      return
    }
    const t = window.setTimeout(() => setRest((r) => (r ? { ...r, left: r.left - 1 } : null)), 1000)
    return () => window.clearTimeout(t)
  }, [rest])

  const minutes = Math.max(1, Math.round(elapsed / 60))
  const complete = done.size
  const total = plan.blocks.length

  const tick = (i: number) => {
    haptic('selection')
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
        return next
      }
      next.add(i)
      // Ticking a movement off starts its rest, because that is the moment
      // the rest begins. Nothing starts a timer the person did not earn.
      const secs = plan.blocks[i]?.restSeconds ?? 0
      if (secs > 0 && next.size < total) setRest({ left: secs, of: secs })
      return next
    })
  }

  const leave = () => {
    if (done.size === 0) { onClose(); return }
    confirm({
      title: 'Leave this session?',
      body: `You have done ${done.size} of ${total}. Nothing is logged until you finish, so leaving now records nothing.`,
      confirmLabel: 'Leave',
      onConfirm: onClose,
    })
  }

  return (
    <div className="session">
      <header className="session__head">
        <button className="icon-btn" aria-label="Close session" onClick={leave}>
          <Icon name="close" size={20} />
        </button>
        <div className="stack stack-1 grow" style={{ minWidth: 0 }}>
          <span className="t-body strong">{plan.name}</span>
          <span className="t-caption dim2">{complete} of {total} done</span>
        </div>
        <span className="session__clock num" aria-label="Time elapsed">{clock(elapsed)}</span>
      </header>

      <div className="session__bar" aria-hidden="true">
        <span style={{ width: `${total ? (complete / total) * 100 : 0}%` }} />
      </div>

      <ol className="session__list">
        {plan.blocks.map((b, i) => {
          const ex = exerciseById(b.exerciseId)
          const isDone = done.has(i)
          return (
            <li key={`${b.name}-${i}`}>
              <button
                className="session__item" aria-pressed={isDone}
                onClick={() => tick(i)}
              >
                <span className="session__tick" aria-hidden="true">
                  {isDone && <Icon name="check" size={15} />}
                </span>
                <span className="stack stack-1 grow" style={{ minWidth: 0 }}>
                  <span className="t-callout strong">{b.name}</span>
                  <span className="t-caption dim2">
                    {blockAmount(b)}
                    {b.restSeconds > 0 && ` · ${b.restSeconds}s rest`}
                  </span>
                  {(b.note || ex?.cue) && (
                    <span className="t-caption dim2">{b.note ?? ex?.cue}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {rest && (
        <div className="session__rest" role="status">
          <span className="t-caption dim2">Rest</span>
          <span className="session__rest-num num">{rest.left}s</span>
          <button className="btn btn--ghost btn--sm" onClick={() => setRest(null)}>Skip</button>
        </div>
      )}

      <div className="session__foot">
        <button
          className="btn btn--primary grow"
          onClick={() => { haptic('impactLight'); setFinishing(true) }}
        >
          <Icon name="check" size={16} /> Finish session
        </button>
      </div>

      <FinishSheet
        open={finishing}
        plan={plan}
        minutes={minutes}
        doneCount={complete}
        total={total}
        onClose={() => setFinishing(false)}
        onSave={(loggedMinutes, intensity, effort, note) => {
          dispatch({
            type: 'finishSession',
            date: state.today,
            plan,
            minutes: loggedMinutes,
            intensity,
            effort,
            note,
            workoutId: `w-${uid()}`,
            time: nowClock(),
            done: complete,
          })
          dispatch({ type: 'awardMilestone', id: 'first-workout' })
          celebrate('complete')
          toast({ text: `${plan.name} logged: ${loggedMinutes} min`, icon: 'check' })
          onFinished()
        }}
      />

      {confirmNode}
    </div>
  )
}

/**
 * The end of a session.
 *
 * The duration starts at what the clock actually measured, because that is
 * the honest number and almost always the right one. It is still editable,
 * and that is deliberate: a phone that locked mid-session, or someone
 * ticking the list off after the fact, would otherwise be forced to save a
 * duration they know is wrong. A measured default they can correct beats
 * both a blank field and a number they are stuck with.
 *
 * How hard it was, only the person knows, and it is the thing Jumbo weighs
 * against the numbers.
 */
function FinishSheet({
  open, plan, minutes, doneCount, total, onClose, onSave,
}: {
  open: boolean
  plan: TrainingPlan
  minutes: number
  doneCount: number
  total: number
  onClose: () => void
  onSave: (minutes: number, intensity: 1 | 2 | 3, effort: number, note: string) => void
}) {
  const [logged, setLogged] = useState(minutes)
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2)
  const [effort, setEffort] = useState(6)
  const [note, setNote] = useState('')

  // Seeded each time the sheet opens, so the figure is the one the clock
  // had at that moment — and not touched again while it is open, or an
  // edited duration would be overwritten a second later by the ticking
  // clock behind the sheet.
  useEffect(() => {
    if (open) setLogged(minutes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const partial = doneCount < total
  const edited = logged !== minutes

  return (
    <Sheet
      open={open} onClose={onClose}
      title="Finish session"
      subtitle={`${plan.name} · ${minutes} min`}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>Not yet</button>
          <button
            className="btn btn--primary grow"
            onClick={() => onSave(logged, intensity, effort, note.trim())}
          >
            Save to today
          </button>
        </>
      }
    >
      <div className="stack stack-6">
        <p className="t-callout dim">
          {partial
            ? `You worked through ${doneCount} of ${total} movements. That is what gets logged, and it counts towards your movement today.`
            : `All ${total} movements. This is saved to today and counts towards your movement.`}
        </p>

        <div className="stack stack-2">
          <div className="row row--between">
            <span className="t-callout strong">Duration</span>
            <Stepper
              value={logged} onChange={setLogged}
              step={5} min={1} max={300} unit="min" label="duration"
            />
          </div>
          <p className="t-caption dim2">
            {edited
              ? `Jumbo timed ${minutes} minutes. Yours is what gets saved.`
              : 'Timed from the moment you opened the session. Change it if that is not right.'}
          </p>
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
            <label className="t-callout strong" htmlFor="session-rpe">How it felt</label>
            <span className="t-callout num">{effort}/10</span>
          </div>
          <input
            id="session-rpe" className="slider" type="range" min={1} max={10} step={1}
            value={effort} onChange={(e) => setEffort(Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="session-note">Note (optional)</label>
          <input
            id="session-note" className="input" value={note} maxLength={120}
            placeholder="Second set of squats was the hard one"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </Sheet>
  )
}

/** mm:ss, or h:mm:ss once a session has run past the hour. */
function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

