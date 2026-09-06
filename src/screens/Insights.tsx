import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Confidence, Disclosure, Empty, ProvenanceTag, ScreenHead, Segmented } from '../components/UI'
import { useStore } from '../state/store'
import { buildInsights } from '../lib/analytics'
import type { Insight, InsightDecision } from '../data/types'
import { haptic } from '../lib/haptics'

const DOMAIN_COLOR: Record<Insight['domain'], string> = {
  sleep: 'var(--sleep)', movement: 'var(--movement)', nutrition: 'var(--nutrition)',
  recovery: 'var(--recovery)', body: 'var(--heart)',
}

type Filter = 'all' | 'active' | 'decided'

export function Insights() {
  const { state, dispatch } = useStore()
  const [filter, setFilter] = useState<Filter>('all')

  const all = useMemo(
    () => (state.settings.aiPatterns ? buildInsights(state.days, state.baseline, state.measurements) : []),
    [state.days, state.baseline, state.measurements, state.settings.aiPatterns],
  )

  const visible = all.filter((i) => !state.dismissed.includes(i.id))
  const list = filter === 'all' ? visible
    : filter === 'active' ? visible.filter((i) => !state.decisions[i.id])
    : visible.filter((i) => state.decisions[i.id])

  if (!state.settings.aiPatterns) {
    return (
      <div className="stack stack-8">
        <ScreenHead eyebrow="Insights" title="Pattern analysis is off" />
        <Empty
          icon="lock" title="Nothing is being interpreted"
          body="Your data is still recorded and you can still see all of it. Turn pattern analysis back on in Profile to let Jumbo look for relationships."
        />
      </div>
    )
  }

  return (
    <div className="stack stack-8">
      <ScreenHead
        eyebrow="Insights"
        title="What Jumbo noticed"
        sub="Each one shows what changed, the evidence behind it, and how sure the model is. What you do about it is yours."
      />

      <div className="row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
        <Segmented
          ariaLabel="Filter insights"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: 'all', label: `All ${visible.length}` },
            { value: 'active', label: 'Undecided' },
            { value: 'decided', label: 'Decided' },
          ]}
        />
        {state.dismissed.length > 0 && (
          <span className="t-caption dim2">{state.dismissed.length} dismissed</span>
        )}
      </div>

      {list.length === 0 ? (
        <Empty
          icon="sparkle"
          title={filter === 'decided' ? 'Nothing decided yet' : 'Nothing to flag right now'}
          body={filter === 'decided'
            ? 'Insights you act on or park will collect here.'
            : 'Your patterns look steady. Jumbo raises something when it changes, not on a schedule.'}
        />
      ) : (
        <ul className="stack stack-5">
          {list.map((i) => (
            <InsightCard
              key={i.id}
              insight={i}
              decision={state.decisions[i.id]}
              onDecide={(d) => { haptic('success'); dispatch({ type: 'decide', insightId: i.id, decision: d }) }}
              onDismiss={() => { haptic('tap'); dispatch({ type: 'dismissInsight', insightId: i.id }) }}
            />
          ))}
        </ul>
      )}

      <div className="card card--quiet row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
        <Icon name="info" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
        <p className="t-caption dim">
          These are patterns in your own data, interpreted by a model. They are not diagnoses and
          not medical advice. If something here concerns you, take it to a clinician — and take the
          numbers with you.
        </p>
      </div>
    </div>
  )
}

/**
 * The six-beat insight card:
 * what changed → why it matters → evidence → confidence → what you could do → your choice.
 */
function InsightCard({
  insight, decision, onDecide, onDismiss,
}: {
  insight: Insight
  decision?: InsightDecision
  onDecide: (d: InsightDecision) => void
  onDismiss: () => void
}) {
  const color = DOMAIN_COLOR[insight.domain]
  return (
    <li className="card stack stack-5" style={{ borderLeft: `3px solid ${color}` }}>
      {/* 1 — what changed */}
      <div className="stack stack-3">
        <div className="row row--between">
          <span className="eyebrow" style={{ color }}>{insight.domain}</span>
          <span className="t-caption dim2">{insight.window}</span>
        </div>
        <p className="t-body">{insight.changed}</p>
      </div>

      {/* 2 — why it matters */}
      <div className="stack stack-1">
        <span className="eyebrow">Why it matters</span>
        <p className="t-callout dim">{insight.why}</p>
      </div>

      {/* 3 + 4 — evidence and confidence */}
      <div className="card card--quiet stack stack-3">
        <div className="row row--between row--wrap" style={{ gap: 'var(--s-2)' }}>
          <span className="eyebrow">Evidence</span>
          <Confidence value={insight.confidence} />
        </div>
        <ul className="stack stack-2">
          {insight.evidence.map((e) => (
            <li key={e} className="row" style={{ gap: 'var(--s-2)', alignItems: 'flex-start' }}>
              <span className="dot" style={{ background: color, marginTop: 7 }} />
              <span className="t-caption">{e}</span>
            </li>
          ))}
        </ul>
        <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
          <ProvenanceTag kind="observed" />
          <ProvenanceTag kind="evidence" />
        </div>
        <Disclosure summary="What this can’t tell you">
          <p className="t-caption dim">{insight.limitation}</p>
        </Disclosure>
      </div>

      {/* 5 — what you could do */}
      <div className="stack stack-2">
        <span className="eyebrow">What you could do</span>
        <ul className="stack stack-2">
          {insight.options.map((o) => (
            <li key={o} className="row" style={{ gap: 'var(--s-2)', alignItems: 'flex-start' }}>
              <Icon name="chevron" size={13} style={{ color: 'var(--ink-3)', marginTop: 4, flex: 'none' }} />
              <span className="t-callout">{o}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 6 — your choice */}
      <div className="stack stack-3">
        <hr className="hairline" />
        {decision ? (
          <div className="row row--between">
            <span className="row t-callout" style={{ gap: 'var(--s-2)' }}>
              <Icon name="check" size={16} style={{ color: 'var(--positive)' }} />
              {decision === 'trying' ? 'You’re trying this' : decision === 'saved' ? 'Saved for later' : 'Parked for now'}
            </span>
            <button className="btn btn--ghost btn--sm" onClick={() => onDecide('trying')}>Change</button>
          </div>
        ) : (
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            <button className="btn btn--primary btn--sm" onClick={() => onDecide('trying')}>I’ll try this</button>
            <button className="btn btn--secondary btn--sm" onClick={() => onDecide('saved')}>Save for later</button>
            <button className="btn btn--ghost btn--sm" onClick={() => onDecide('not-now')}>Not now</button>
            <button className="btn btn--ghost btn--sm" onClick={onDismiss} style={{ marginLeft: 'auto' }}>
              Don’t show again
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
