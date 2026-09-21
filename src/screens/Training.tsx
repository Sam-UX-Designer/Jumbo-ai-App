import { useMemo, useState } from 'react'
import '../styles/training.css'
import { Icon } from '../components/Icon'
import { Mascot } from '../components/Asset'
import { Thinking } from '../components/Thinking'
import {
  Empty, ErrorNotice, ScreenHead, SectionHead, Sheet, UnavailableNotice,
  useConfirm, useToast,
} from '../components/UI'
import { useStore } from '../state/store'
import { haptic } from '../lib/feedback'
import { uid } from '../lib/util'
import { api } from '../lib/api'
import { suggestSession, planFor } from '../lib/training'
import {
  EQUIPMENT, EXERCISES, EXPERIENCE, MUSCLES, blockAmount, exerciseById,
  planMinutes, planMuscles,
  type Equipment, type Level, type Muscle, type PlanBlock, type TrainingPlan,
} from '../data/training'
import { SessionRunner } from './TrainingSession'

/**
 * Training.
 *
 * Three things, in the order a person needs them: what to do today, the
 * plans they have, and two ways to get another one.
 *
 * The suggestion is arithmetic on their own recorded days — see
 * lib/training.ts. It is deliberately not a model call: a recommendation
 * about someone's body should not change between two openings of the same
 * screen, and an account with nothing in it is told there is nothing to go
 * on rather than handed a confident guess.
 *
 * A plan is either written by the person or generated for them, and which
 * it was is shown on the card. Both kinds are edited the same way and both
 * are theirs to delete.
 */
export function Training({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const { confirm, node: confirmNode } = useConfirm()

  const [editing, setEditing] = useState<TrainingPlan | 'new' | null>(null)
  const [asking, setAsking] = useState(false)
  const [running, setRunning] = useState<TrainingPlan | null>(null)

  const suggestion = useMemo(
    () => suggestSession(state.days, state.baseline, state.plans, state.today),
    [state.days, state.baseline, state.plans, state.today],
  )
  const suggested = useMemo(
    () => planFor(suggestion, state.plans),
    [suggestion, state.plans],
  )

  const remove = (plan: TrainingPlan) => confirm({
    title: `Delete “${plan.name}”?`,
    body: plan.timesDone > 0
      ? `You have done this ${plan.timesDone} time${plan.timesDone > 1 ? 's' : ''}. The sessions you already logged stay on those days; only the plan goes.`
      : 'The plan goes for good. Nothing else changes.',
    confirmLabel: 'Delete plan',
    onConfirm: () => {
      dispatch({ type: 'removePlan', planId: plan.id })
      toast({ text: 'Plan deleted', icon: 'trash' })
    },
  })

  if (running) {
    return (
      <SessionRunner
        plan={running}
        onClose={() => setRunning(null)}
        onFinished={() => { setRunning(null); onBack() }}
      />
    )
  }

  return (
    <div className="stack stack-8">
      <ScreenHead
        title="Training"
        sub="What to do today, and the sessions you keep."
        onBack={onBack}
      />

      <SuggestionCard
        suggestion={suggestion}
        plan={suggested}
        onStart={() => suggested && setRunning(suggested)}
        onBuild={() => setEditing('new')}
        onAsk={() => setAsking(true)}
      />

      <section className="stack stack-4">
        <SectionHead
          title="Your plans"
          action={state.plans.length > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={() => { haptic('selection'); setEditing('new') }}>
              <Icon name="plus" size={14} /> New
            </button>
          )}
        />

        {state.plans.length === 0 ? (
          <Empty
            icon="training"
            title="No plans yet"
            body="A plan is a session you can repeat: the movements, how many sets, how long to rest. Write one yourself, or tell Jumbo what you want and let it draft one for you."
            action={
              <div className="row row--wrap" style={{ gap: 'var(--s-3)', justifyContent: 'center' }}>
                <button className="btn btn--primary" onClick={() => setEditing('new')}>
                  <Icon name="plus" size={16} /> Build a plan
                </button>
                <button className="btn btn--secondary" onClick={() => setAsking(true)}>
                  <Icon name="sparkles" size={16} /> Ask Jumbo
                </button>
              </div>
            }
          />
        ) : (
          <ul className="plans">
            {state.plans.map((p) => (
              <li key={p.id}>
                <PlanCard
                  plan={p}
                  onStart={() => { haptic('impactLight'); setRunning(p) }}
                  onEdit={() => setEditing(p)}
                  onDelete={() => remove(p)}
                />
              </li>
            ))}
          </ul>
        )}

        {state.plans.length > 0 && (
          <button className="btn btn--secondary" onClick={() => setAsking(true)}>
            <Icon name="sparkles" size={16} /> Ask Jumbo for another
          </button>
        )}
      </section>

      <PlanEditor
        plan={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={(plan) => {
          dispatch({ type: 'savePlan', plan })
          toast({ text: editing === 'new' ? 'Plan saved' : 'Plan updated', icon: 'check' })
          setEditing(null)
        }}
      />

      <AskJumbo
        open={asking}
        onClose={() => setAsking(false)}
        onSave={(plan) => {
          dispatch({ type: 'savePlan', plan })
          toast({ text: 'Plan saved', icon: 'check' })
          setAsking(false)
        }}
      />

      {confirmNode}
    </div>
  )
}

/* ----------------------------------------------------------- suggestion */

const KIND_TINT: Record<string, string> = {
  train: 'var(--movement)',
  easy: 'var(--sleep)',
  rest: 'var(--recovery)',
  unknown: 'var(--ink-3)',
}

function SuggestionCard({
  suggestion, plan, onStart, onBuild, onAsk,
}: {
  suggestion: ReturnType<typeof suggestSession>
  plan: TrainingPlan | null
  onStart: () => void
  onBuild: () => void
  onAsk: () => void
}) {
  const tint = KIND_TINT[suggestion.kind]
  return (
    <section className="suggest" style={{ '--tint': tint } as React.CSSProperties}>
      <div className="row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
        <span className="suggest__mark"><Mascot size={38} /></span>
        <div className="stack stack-2 grow" style={{ minWidth: 0 }}>
          <span className="eyebrow">Today</span>
          <h2 className="t-title3">{suggestion.headline}</h2>
          <p className="t-callout dim">{suggestion.detail}</p>
        </div>
      </div>

      {suggestion.because.length > 0 && (
        <ul className="suggest__why">
          {suggestion.because.map((why) => (
            <li key={why} className="t-caption dim2">
              <Icon name="check" size={12} style={{ color: tint, flex: 'none' }} />
              {why}
            </li>
          ))}
        </ul>
      )}

      {suggestion.minutes !== null && (
        <p className="t-caption dim2">
          <Icon name="clock" size={12} /> About {suggestion.minutes} minutes
        </p>
      )}

      <div className="row row--wrap" style={{ gap: 'var(--s-3)' }}>
        {plan ? (
          <button className="btn btn--primary grow" onClick={onStart}>
            <Icon name="play" size={16} /> Start {plan.name}
          </button>
        ) : suggestion.kind === 'rest' ? null : (
          <>
            <button className="btn btn--primary grow" onClick={onBuild}>
              <Icon name="plus" size={16} /> Build a plan
            </button>
            <button className="btn btn--secondary" onClick={onAsk}>
              <Icon name="sparkles" size={16} /> Ask Jumbo
            </button>
          </>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ plan card */

function PlanCard({
  plan, onStart, onEdit, onDelete,
}: { plan: TrainingPlan; onStart: () => void; onEdit: () => void; onDelete: () => void }) {
  const muscles = planMuscles(plan.blocks)
  return (
    <article className="plan-card">
      <div className="row row--between" style={{ alignItems: 'flex-start', gap: 'var(--s-3)' }}>
        <div className="stack stack-1 grow" style={{ minWidth: 0 }}>
          <h3 className="t-body strong">{plan.name}</h3>
          <p className="t-caption dim2">
            {plan.blocks.length} movement{plan.blocks.length === 1 ? '' : 's'} · about {plan.minutes} min
          </p>
        </div>
        {/* Who wrote it, always on the card. A plan a model drafted and a
            plan the person wrote are not the same thing, and which is which
            should never need working out. */}
        <span className={`plan-card__by plan-card__by--${plan.source}`}>
          {plan.source === 'jumbo' ? 'By Jumbo' : 'Yours'}
        </span>
      </div>

      {muscles.length > 0 && (
        <p className="t-caption dim2">{muscles.join(' · ')}</p>
      )}

      {plan.rationale && <p className="t-caption dim">{plan.rationale}</p>}

      <p className="t-caption dim2">
        {plan.timesDone === 0
          ? 'Not done yet'
          : `Done ${plan.timesDone} time${plan.timesDone > 1 ? 's' : ''}${
            plan.lastDoneAt ? ` · last ${new Date(plan.lastDoneAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`}
      </p>

      <div className="row" style={{ gap: 'var(--s-2)' }}>
        <button className="btn btn--primary btn--sm grow" onClick={onStart}>
          <Icon name="play" size={14} /> Start
        </button>
        <button className="btn btn--secondary btn--sm" onClick={onEdit} aria-label={`Edit ${plan.name}`}>
          <Icon name="edit" size={14} /> Edit
        </button>
        <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${plan.name}`}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    </article>
  )
}

/* --------------------------------------------------------- plan editor */

const emptyBlock = (exerciseId: string): PlanBlock => {
  const ex = exerciseById(exerciseId)
  return {
    exerciseId,
    name: ex?.name ?? 'Movement',
    sets: 3,
    reps: ex?.measure === 'time' ? undefined : 10,
    seconds: ex?.measure === 'time' ? 40 : undefined,
    restSeconds: 60,
  }
}

/**
 * Writing a plan by hand.
 *
 * Pick movements, then say how much of each. The filters exist because a
 * library of fifty is unusable on a phone without them, and "Just me" is
 * first because most people opening this are at home.
 */
function PlanEditor({
  plan, open, onClose, onSave,
}: {
  plan: TrainingPlan | null
  open: boolean
  onClose: () => void
  onSave: (plan: TrainingPlan) => void
}) {
  const [name, setName] = useState('')
  const [blocks, setBlocks] = useState<PlanBlock[]>([])
  const [kit, setKit] = useState<Equipment | 'all'>('all')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const [seeded, setSeeded] = useState<string | null>(null)

  // Seed from the plan being edited, once per opening rather than on every
  // render — otherwise typing in the name field would be undone instantly.
  const key = open ? (plan?.id ?? 'new') : null
  if (key !== seeded) {
    setSeeded(key)
    setName(plan?.name ?? '')
    setBlocks(plan?.blocks ?? [])
  }

  const chosen = new Set(blocks.map((b) => b.exerciseId))
  const library = EXERCISES.filter((e) => {
    if (kit !== 'all' && !e.equipment.includes(kit)) return false
    if (muscle !== 'all' && !e.muscles.includes(muscle)) return false
    return true
  })

  const toggle = (id: string) => {
    haptic('selection')
    setBlocks((prev) => (prev.some((b) => b.exerciseId === id)
      ? prev.filter((b) => b.exerciseId !== id)
      : [...prev, emptyBlock(id)]))
  }

  const patch = (i: number, change: Partial<PlanBlock>) =>
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...change } : b)))

  const move = (i: number, by: number) => setBlocks((prev) => {
    const to = i + by
    if (to < 0 || to >= prev.length) return prev
    const next = [...prev]
    const [item] = next.splice(i, 1)
    next.splice(to, 0, item)
    return next
  })

  const ready = name.trim().length > 0 && blocks.length > 0
  const minutes = planMinutes(blocks)

  const save = () => {
    if (!ready) return
    const kitUsed = [...new Set(blocks.flatMap((b) => exerciseById(b.exerciseId)?.equipment ?? []))]
    onSave({
      id: plan?.id ?? `plan-${uid()}`,
      name: name.trim(),
      focus: planMuscles(blocks).slice(0, 2).join(' and ') || 'Full body',
      level: plan?.level ?? 'returning',
      equipment: kitUsed,
      blocks,
      minutes,
      source: plan?.source ?? 'you',
      createdAt: plan?.createdAt ?? Date.now(),
      lastDoneAt: plan?.lastDoneAt,
      timesDone: plan?.timesDone ?? 0,
      rationale: plan?.rationale,
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={plan ? 'Edit plan' : 'Build a plan'}
      subtitle={blocks.length
        ? `${blocks.length} movement${blocks.length === 1 ? '' : 's'} · about ${minutes} min`
        : 'Pick your movements, then set how much of each.'}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary grow" disabled={!ready} onClick={save}>
            {plan ? 'Save changes' : 'Save plan'}
          </button>
        </>
      }
    >
      <div className="stack stack-6">
        <div className="field">
          <label className="field__label" htmlFor="plan-name">Name</label>
          <input
            id="plan-name" className="input" value={name} maxLength={50}
            placeholder="Full body, no kit"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {blocks.length > 0 && (
          <div className="stack stack-3">
            <span className="eyebrow">The session</span>
            <ul className="blocks">
              {blocks.map((b, i) => (
                <li key={`${b.exerciseId}-${i}`} className="block">
                  <div className="row row--between" style={{ gap: 'var(--s-2)' }}>
                    <span className="t-callout strong grow" style={{ minWidth: 0 }}>{b.name}</span>
                    <button className="icon-btn icon-btn--sm" aria-label={`Move ${b.name} up`}
                      disabled={i === 0} onClick={() => move(i, -1)}>
                      <Icon name="arrow-up" size={14} />
                    </button>
                    <button className="icon-btn icon-btn--sm" aria-label={`Move ${b.name} down`}
                      disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                      <Icon name="chevron-down" size={14} />
                    </button>
                    <button className="icon-btn icon-btn--sm" aria-label={`Remove ${b.name}`}
                      onClick={() => toggle(b.exerciseId)}>
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className="block__nums">
                    <Num label="Sets" value={b.sets} min={1} max={6}
                      onChange={(v) => patch(i, { sets: v })} />
                    {b.seconds !== undefined ? (
                      <Num label="Seconds" value={b.seconds} min={5} max={300} step={5}
                        onChange={(v) => patch(i, { seconds: v })} />
                    ) : (
                      <Num label="Reps" value={b.reps ?? 10} min={1} max={50}
                        onChange={(v) => patch(i, { reps: v })} />
                    )}
                    <Num label="Rest" value={b.restSeconds} min={0} max={240} step={15} unit="s"
                      onChange={(v) => patch(i, { restSeconds: v })} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="stack stack-3">
          <span className="eyebrow">Movements</span>

          <div className="stack stack-2">
            <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
              <button className="chip chip--sm" aria-pressed={kit === 'all'} onClick={() => setKit('all')}>
                Any kit
              </button>
              {EQUIPMENT.map((e) => (
                <button key={e.id} className="chip chip--sm" aria-pressed={kit === e.id}
                  onClick={() => setKit(e.id)}>{e.label}</button>
              ))}
            </div>
            <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
              <button className="chip chip--sm" aria-pressed={muscle === 'all'} onClick={() => setMuscle('all')}>
                Everything
              </button>
              {MUSCLES.map((m) => (
                <button key={m} className="chip chip--sm" aria-pressed={muscle === m}
                  onClick={() => setMuscle(m)}>{m}</button>
              ))}
            </div>
          </div>

          {library.length === 0 ? (
            <p className="t-caption dim">
              Nothing in the library matches both of those. Widen one of them.
            </p>
          ) : (
            <ul className="library">
              {library.map((e) => (
                <li key={e.id}>
                  <button
                    className="lib-item" aria-pressed={chosen.has(e.id)}
                    onClick={() => toggle(e.id)}
                  >
                    <span className="lib-item__tick" aria-hidden="true">
                      {chosen.has(e.id) && <Icon name="check" size={13} />}
                    </span>
                    <span className="stack stack-1 grow" style={{ minWidth: 0 }}>
                      <span className="t-callout strong">{e.name}</span>
                      <span className="t-caption dim2">{e.cue}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  )
}

/** A small number field. Typed or stepped, whichever is quicker. */
function Num({
  label, value, min, max, step = 1, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number
  unit?: string; onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <label className="num">
      <span className="num__label">{label}</span>
      <span className="num__row">
        <button type="button" className="num__step" aria-label={`Less ${label.toLowerCase()}`}
          onClick={() => { haptic('selection'); onChange(clamp(value - step)) }}>
          <Icon name="minus" size={13} />
        </button>
        <span className="num__value num">{value}{unit}</span>
        <button type="button" className="num__step" aria-label={`More ${label.toLowerCase()}`}
          onClick={() => { haptic('selection'); onChange(clamp(value + step)) }}>
          <Icon name="plus" size={13} />
        </button>
      </span>
    </label>
  )
}

/* ------------------------------------------------------------ ask Jumbo */

const GOALS = [
  'Get stronger',
  'Build muscle',
  'Lose fat',
  'Move more often',
  'Improve stamina',
  'Feel less stiff',
]

/**
 * Having Jumbo draft a session.
 *
 * The form asks only what a coach would need and what the person can
 * answer about themselves. Nothing about their recorded health data is
 * sent: a plan is built from what they say they want and what they have,
 * so there is no reason for their sleep or their heart rate to travel.
 */
function AskJumbo({
  open, onClose, onSave,
}: { open: boolean; onClose: () => void; onSave: (plan: TrainingPlan) => void }) {
  const { state } = useStore()
  const [goal, setGoal] = useState(GOALS[0])
  const [level, setLevel] = useState<Level>('returning')
  const [kit, setKit] = useState<Equipment[]>(['none'])
  const [minutes, setMinutes] = useState(40)
  const [avoid, setAvoid] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<TrainingPlan | null>(null)

  const ready = Boolean(state.server?.ai.configured) && state.serverReachable !== false

  const toggleKit = (id: Equipment) => {
    haptic('selection')
    setKit((prev) => (prev.includes(id)
      ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev)
      : [...prev, id]))
  }

  const generate = async () => {
    setBusy(true)
    setError(null)
    setDraft(null)
    const res = await api.plan({
      brief: {
        goal,
        level: EXPERIENCE.find((e) => e.id === level)?.label ?? level,
        equipment: kit.map((k) => EQUIPMENT.find((e) => e.id === k)?.label ?? k),
        minutes,
        avoid: avoid.trim() || undefined,
      },
      library: EXERCISES.map((e) => ({
        id: e.id, name: e.name, kind: e.kind,
        muscles: e.muscles, equipment: e.equipment, measure: e.measure,
      })),
    })
    setBusy(false)

    if (!res.ok) {
      setError(res.message)
      return
    }
    const blocks: PlanBlock[] = res.data.plan.blocks.map((b) => ({
      exerciseId: b.exerciseId,
      name: b.name,
      sets: b.sets,
      reps: b.reps,
      seconds: b.seconds,
      restSeconds: b.restSeconds,
      note: b.note,
    }))
    setDraft({
      id: `plan-${uid()}`,
      name: res.data.plan.name,
      focus: res.data.plan.focus,
      level,
      equipment: kit,
      blocks,
      minutes: planMinutes(blocks),
      source: 'jumbo',
      createdAt: Date.now(),
      timesDone: 0,
      rationale: res.data.plan.rationale,
    })
    haptic('impactLight')
  }

  const close = () => { setDraft(null); setError(null); onClose() }

  return (
    <Sheet
      open={open} onClose={close}
      title="Ask Jumbo for a plan"
      subtitle="Tell it what you want and what you have. You see the session before anything is saved."
      footer={draft ? (
        <>
          <button className="btn btn--secondary" onClick={generate} disabled={busy}>
            <Icon name="sync" size={15} /> Again
          </button>
          <button className="btn btn--primary grow" onClick={() => onSave(draft)}>
            Save this plan
          </button>
        </>
      ) : (
        <>
          <button className="btn btn--secondary" onClick={close}>Cancel</button>
          <button className="btn btn--primary grow" onClick={generate} disabled={busy || !ready}>
            {busy ? 'Writing…' : 'Write me a session'}
          </button>
        </>
      )}
    >
      <div className="stack stack-6">
        {!ready && (
          <UnavailableNotice
            title="Jumbo can’t write a plan right now"
            message="You can still build one yourself — everything else in Training works. Try this again in a moment."
          />
        )}

        {busy && (
          <div className="row" style={{ justifyContent: 'center', padding: 'var(--s-6) 0' }}>
            <Thinking size={38} />
          </div>
        )}

        {error && !busy && (
          <ErrorNotice
            title="That plan did not come back"
            message={error}
            onRetry={generate}
          />
        )}

        {draft && !busy ? (
          <DraftPreview plan={draft} />
        ) : !busy && (
          <>
            <div className="stack stack-2">
              <span className="eyebrow">What are you after</span>
              <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                {GOALS.map((g) => (
                  <button key={g} className="chip" aria-pressed={goal === g}
                    onClick={() => { haptic('selection'); setGoal(g) }}>{g}</button>
                ))}
              </div>
            </div>

            <div className="stack stack-2">
              <span className="eyebrow">Where you are</span>
              <div className="stack stack-2">
                {EXPERIENCE.map((e) => (
                  <button key={e.id} className="choice" aria-pressed={level === e.id}
                    onClick={() => { haptic('selection'); setLevel(e.id) }}>
                    <span className="stack stack-1 grow" style={{ minWidth: 0 }}>
                      <span className="t-callout strong">{e.label}</span>
                      <span className="t-caption dim2">{e.blurb}</span>
                    </span>
                    {level === e.id && <Icon name="check" size={16} style={{ color: 'var(--brand)' }} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="stack stack-2">
              <span className="eyebrow">What you have</span>
              <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                {EQUIPMENT.map((e) => (
                  <button key={e.id} className="chip" aria-pressed={kit.includes(e.id)}
                    onClick={() => toggleKit(e.id)}>{e.label}</button>
                ))}
              </div>
              <p className="t-caption dim2">
                Jumbo will only use movements that work with what you pick.
              </p>
            </div>

            <div className="stack stack-2">
              <span className="eyebrow">How long</span>
              <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
                {[20, 30, 40, 60].map((m) => (
                  <button key={m} className="chip" aria-pressed={minutes === m}
                    onClick={() => { haptic('selection'); setMinutes(m) }}>{m} min</button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="avoid">Anything to work around (optional)</label>
              <input
                id="avoid" className="input" value={avoid} maxLength={120}
                placeholder="Sore left shoulder — nothing overhead"
                onChange={(e) => setAvoid(e.target.value)}
              />
              <p className="t-caption dim2" style={{ marginTop: 'var(--s-2)' }}>
                Jumbo will plan around it. It is not a clinician and cannot advise on an injury —
                if something hurts, that is a conversation for one.
              </p>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** The draft, shown in full before anybody saves it. */
function DraftPreview({ plan }: { plan: TrainingPlan }) {
  return (
    <div className="stack stack-4">
      <div className="stack stack-2">
        <span className="plan-card__by plan-card__by--jumbo" style={{ alignSelf: 'flex-start' }}>
          Drafted by Jumbo
        </span>
        <h3 className="t-title3">{plan.name}</h3>
        {plan.rationale && <p className="t-callout dim">{plan.rationale}</p>}
        <p className="t-caption dim2">
          {plan.blocks.length} movements · about {plan.minutes} min
        </p>
      </div>

      <ol className="draft">
        {plan.blocks.map((b, i) => (
          <li key={`${b.name}-${i}`} className="draft__row">
            <span className="draft__n num">{i + 1}</span>
            <span className="stack stack-1 grow" style={{ minWidth: 0 }}>
              <span className="t-callout strong">{b.name}</span>
              {b.note && <span className="t-caption dim2">{b.note}</span>}
            </span>
            <span className="t-caption num dim">{blockAmount(b)}</span>
          </li>
        ))}
      </ol>

      <p className="t-caption dim2">
        Nothing is saved until you say so, and you can change any of it afterwards.
      </p>
    </div>
  )
}
