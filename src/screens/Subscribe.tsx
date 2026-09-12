import { useState } from 'react'
import '../styles/subscribe.css'
import { Icon, type IconName } from '../components/Icon'
import { Mascot } from '../components/Asset'
import { SectionHead, Segmented, Sheet, useToast } from '../components/UI'
import { useStore } from '../state/store'
import type { Route } from '../components/Nav'
import {
  COMPARISON, CREDITS_EXPLAINER, CREDIT_USES, PLANS, annualSaving, bestSaving,
  perMonth, rupees, type Plan,
} from '../data/plans'
import { haptic } from '../lib/feedback'

type Period = 'year' | 'month'

/**
 * Plans.
 *
 * Four tiers on one ladder: start, build, understand, optimise. Pro is
 * marked as the one most people want, by a firmer border and a label that
 * says why, not by making the others look broken.
 *
 * There is no checkout behind this screen. Rather than a button that appears
 * to take money and does nothing, the upgrade action says plainly that
 * billing is not connected yet. A wellness product that fakes a purchase has
 * lost the only thing it was selling.
 */
export function Subscribe({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state } = useStore()
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('year')
  const [pending, setPending] = useState<Plan | null>(null)

  const current = state.plan

  return (
    <div className="sub">
      <div className="sub-head">
        <button className="icon-btn" aria-label="Back" onClick={() => onNavigate('you')}>
          <Icon name="back" size={20} />
        </button>
        <h1 className="sub-head__title">Plans</h1>
      </div>

      <header className="sub__head">
        <h2 className="sub__title">Go deeper with JUMBO.</h2>
        {/* Not the working state: the orbiting light means Jumbo is busy
            with your question, and on a pricing page it is not. */}
        <span className="sub__mark"><Mascot size={76} /></span>
        <p className="sub__blurb">
          Turn your everyday health data into clearer insights, better habits and a healthier
          tomorrow.
        </p>
      </header>

      <hr className="hairline" />

      {/* ─────────────────────────────── yearly or monthly, and what it saves */}
      <div className="sub__period">
        <Segmented
          ariaLabel="Billing period"
          value={period}
          onChange={(v) => { haptic('selection'); setPeriod(v as Period) }}
          options={[{ value: 'year', label: 'Annual' }, { value: 'month', label: 'Monthly' }]}
        />
        {period === 'year' && bestSaving > 0 && (
          <span className="sub__save">Save up to {bestSaving}% against monthly</span>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────── the ladder */}
      <ul className="rail sub__rail" aria-label="Plans">
        {PLANS.map((plan) => (
          <li key={plan.id}>
            <PlanCard
              plan={plan}
              period={period}
              isCurrent={plan.id === current}
              onChoose={() => { haptic('selection'); setPending(plan) }}
            />
          </li>
        ))}
      </ul>

      {/* ──────────────────────────────────────────── what a credit is for */}
      <section className="card stack stack-4">
        <div className="row row--top" style={{ gap: 'var(--s-3)' }}>
          <span
            className="row-item__icon"
            style={{ background: 'var(--brand-dim)', color: 'var(--accent-text)', flex: 'none' }}
          >
            <Icon name="sparkles" size={17} />
          </span>
          <div className="stack stack-1" style={{ minWidth: 0 }}>
            <span className="t-title3">What are AI credits?</span>
            <p className="t-caption dim">{CREDITS_EXPLAINER}</p>
          </div>
        </div>
        <hr className="hairline" />
        <div className="credits__uses">
          {CREDIT_USES.map((u) => (
            <span key={u.label} className="credits__use">
              <Icon name={u.icon as IconName} size={18} style={{ color: 'var(--ink-2)' }} />
              {u.label}
            </span>
          ))}
        </div>
        <p className="t-caption dim2">
          Some analyses cost more credits than others. Your balance resets at the start of each
          month, and Jumbo tells you before an answer would use the last of it.
        </p>
      </section>

      {/* ─────────────────────────────────────────────── side by side */}
      <section className="section">
        <SectionHead title="Compare plans" />
        <div className="card card--flush">
          <div className="compare__wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">&nbsp;</th>
                {PLANS.map((p) => (
                  <th key={p.id} scope="col" data-pick={p.id === 'pro' ? 'true' : undefined}>
                    {p.name.replace('JUMBO ', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label}>
                  <th scope="row">
                    {row.label}
                    {!row.built && <span className="plan__soon" style={{ marginLeft: 6 }}>Soon</span>}
                  </th>
                  {(['free', 'plus', 'pro', 'max'] as const).map((k) => (
                    <td key={k} className={row.built ? undefined : 'compare__soon'}>{row[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <p className="t-caption dim2">
          Rows marked “Soon” are on the way and are not part of what you would be paying for today.
        </p>
      </section>

      {/* ───────────────────────────────────────────────────────── footer */}
      <div className="sub__foot">
        <button className="sub__link" onClick={() => notYet(toast)}>
          <Icon name="sync" size={15} /> Restore purchase
        </button>
        <button className="sub__link" onClick={() => notYet(toast)}>Terms of Service</button>
        <button className="sub__link" onClick={() => notYet(toast)}>Privacy Policy</button>
        <button className="sub__link" onClick={() => notYet(toast)}>
          <Icon name="settings" size={15} /> Manage subscription
        </button>
      </div>

      {/* The upgrade action, told truthfully. */}
      <Sheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? `${pending.name} is not on sale yet` : ''}
        subtitle="This is a working preview of the plans, not a checkout."
        footer={<button className="btn btn--primary grow" onClick={() => setPending(null)}>Got it</button>}
      >
        {pending && (
          <div className="stack stack-4">
            <p className="t-body">
              Payments are not connected, so nothing has been charged and your plan has not
              changed. You are still on {PLANS.find((p) => p.id === current)?.name}.
            </p>
            <div className="card card--quiet stack stack-2">
              <span className="t-caption dim">What {pending.name} will include</span>
              <span className="t-title3 num">
                {pending.credits.toLocaleString('en-IN')} AI credits a month
              </span>
              <span className="t-caption dim2">
                {pending.benefits.filter((b) => b.built).length} of its{' '}
                {pending.benefits.length} benefits work in Jumbo today. The rest are marked
                “Coming soon” on the card and are not counted as reasons to pay.
              </span>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

const notYet = (toast: (t: { text: string; icon?: IconName }) => void) =>
  toast({ text: 'Not connected in this preview', icon: 'info' })

function PlanCard({
  plan, period, isCurrent, onChoose,
}: {
  plan: Plan
  period: Period
  isCurrent: boolean
  onChoose: () => void
}) {
  const free = plan.yearly === 0
  const saving = annualSaving(plan)
  const amount = free ? '₹0' : rupees(period === 'year' ? plan.yearly : plan.monthly)
  const pick = plan.id === 'pro'

  return (
    <div
      className={`plan${pick ? ' plan--pick' : ''}`}
      style={{ ['--tint' as string]: plan.colour }}
    >
      {pick && <span className="plan__pick">Most popular</span>}

      <span className="plan__icon"><Icon name={plan.icon as IconName} size={18} /></span>
      <span className="plan__name">{plan.name}</span>
      <span className="plan__pitch">{plan.pitch}</span>

      <div className="plan__price">
        <span className="plan__amount num">{amount}</span>
        <span className="plan__per">{free ? '/ forever' : period === 'year' ? '/ year' : '/ month'}</span>
      </div>
      {!free && period === 'year' && (
        <span className="plan__equiv">
          {rupees(perMonth(plan))} a month, billed yearly
          {saving !== null ? ` · saves ${saving}%` : ''}
        </span>
      )}
      {!free && period === 'month' && (
        <span className="plan__equiv">{rupees(plan.yearly)} if you pay yearly</span>
      )}

      <button
        className={`btn plan__cta ${pick ? 'btn--primary' : 'btn--secondary'}`}
        disabled={isCurrent}
        onClick={onChoose}
      >
        {isCurrent ? 'Current plan' : `Choose ${plan.name.replace('JUMBO ', '')}`}
      </button>

      <ul className="plan__list">
        {plan.benefits.map((b) => (
          <li key={b.text} className={`plan__item${b.built ? '' : ' plan__item--soon'}`}>
            <Icon
              name={b.built ? 'check' : 'clock'}
              size={14}
              strokeWidth={2.2}
              style={{ color: b.built ? plan.colour : 'var(--ink-4)' }}
            />
            <span className="grow">{b.text}</span>
            {!b.built && <span className="plan__soon">Soon</span>}
          </li>
        ))}
      </ul>

      <span className="plan__credits">
        <Icon name="sparkles" size={14} />
        {plan.credits.toLocaleString('en-IN')} AI credits / month
      </span>
    </div>
  )
}
