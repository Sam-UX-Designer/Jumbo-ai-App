import { useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import {
  Empty, ScreenHead, SectionHead, Segmented, Switch, useConfirm, useToast,
} from '../components/UI'
import { useStore } from '../state/store'
import type { Route } from '../components/Nav'
import { SOURCES, METRIC_LABEL, METRIC_DETAIL, ALL_METRICS } from '../data/sources'
import type { GoalKey, MetricKey } from '../data/types'
import { haptic, hapticsSupported } from '../lib/haptics'
import { relativeTime } from '../lib/util'
import { consistencyStreak } from '../lib/analytics'

const SOURCE_ICON: Record<string, IconName> = {
  health: 'phone', ring: 'ring', watch: 'watch', scale: 'scale', lab: 'lab',
}

const GOALS: Array<{ key: GoalKey; label: string }> = [
  { key: 'energy', label: 'More energy' },
  { key: 'fitness', label: 'Get fitter' },
  { key: 'sleep', label: 'Sleep better' },
  { key: 'nutrition', label: 'Eat better' },
  { key: 'aging', label: 'Healthy ageing' },
  { key: 'consistency', label: 'Be consistent' },
]

export function You({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const { confirm, node: confirmNode } = useConfirm()
  const [detail, setDetail] = useState<string | null>(null)

  const connectedIds = Object.keys(state.connections)
  const covered = new Set<MetricKey>()
  connectedIds.forEach((id) => SOURCES.find((s) => s.id === id)?.provides.forEach((m) => covered.add(m)))
  const gaps = ALL_METRICS.filter((m) => !covered.has(m))
  const streak = consistencyStreak(state.days, state.baseline)

  const set = (key: keyof typeof state.settings, value: boolean) => {
    dispatch({ type: 'setSetting', key, value })
  }

  return (
    <div className="stack stack-10">
      <ScreenHead eyebrow="Profile" title="You & your data" />

      {state.sampleMode && (
        <div className="card card--quiet row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
          <Icon name="info" size={18} style={{ color: 'var(--ink-2)', flex: 'none', marginTop: 2 }} />
          <p className="t-caption dim">
            You’re exploring Jumbo with a realistic sample history. Everything works — it just isn’t
            your data.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------- Snapshot */}
      <section className="card row" style={{ gap: 'var(--s-4)' }}>
        <span className="mark" style={{ width: 48, height: 48, borderRadius: 16, fontSize: 19 }} aria-hidden="true">J</span>
        <div className="grow stack" style={{ gap: 2 }}>
          <span className="t-title3">Your Jumbo</span>
          <span className="t-caption dim">
            {state.baseline.daysOfHistory} days of history · {connectedIds.length} {connectedIds.length === 1 ? 'source' : 'sources'} · {streak}-day streak
          </span>
        </div>
      </section>

      {/* ----------------------------------------------------------- Goal */}
      <section className="section">
        <SectionHead title="Your goal" sub="Shapes what Jumbo shows first. Nothing is hidden because of it." />
        <div className="card stack stack-4">
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            {GOALS.map((g) => (
              <button
                key={g.key} className="chip" aria-pressed={state.goal === g.key}
                onClick={() => { haptic('select'); dispatch({ type: 'setGoal', goal: g.key, custom: state.customGoal }) }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="you-custom">In your own words</label>
            <input
              id="you-custom" className="input" value={state.customGoal} maxLength={80}
              placeholder="e.g. keep up with my kids on a hike"
              onChange={(e) => dispatch({ type: 'setGoal', goal: state.goal ?? 'custom', custom: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Sources */}
      <section className="section">
        <SectionHead
          title="Connected sources"
          sub="Connect, disconnect and check freshness. Jumbo only ever reads."
        />

        <ul className="stack stack-3">
          {SOURCES.map((s) => {
            const conn = state.connections[s.id]
            return (
              <li key={s.id} className="card stack stack-3">
                <div className="row" style={{ gap: 'var(--s-3)' }}>
                  <span
                    style={{
                      width: 42, height: 42, borderRadius: 'var(--r-md)', flex: 'none',
                      display: 'grid', placeItems: 'center',
                      background: conn ? 'var(--accent-soft)' : 'var(--surface-2)',
                      color: conn ? 'var(--accent)' : 'var(--ink-3)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon name={SOURCE_ICON[s.id]} size={20} />
                  </span>
                  <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="t-callout strong">{s.name}</span>
                    <span className="t-caption dim2">
                      {conn
                        ? <><span className="dot" style={{ background: 'var(--positive)', display: 'inline-block', marginRight: 6 }} />
                            Synced {relativeTime(conn.lastSyncMinutesAgo)}</>
                        : s.vendor}
                    </span>
                  </div>
                </div>

                <div className="row row--between" style={{ gap: 'var(--s-2)' }}>
                  <button
                    className="btn btn--ghost btn--sm" style={{ paddingLeft: 0 }}
                    aria-expanded={detail === s.id}
                    onClick={() => setDetail(detail === s.id ? null : s.id)}
                  >
                    <Icon name="chevron" size={13} style={{ transform: detail === s.id ? 'rotate(90deg)' : 'none', transition: 'transform var(--d-fast)' }} />
                    What it shares
                  </button>

                  {conn ? (
                    <div className="row" style={{ gap: 'var(--s-1)', flex: 'none' }}>
                      <button
                        className="icon-btn" aria-label={`Sync ${s.name} now`}
                        onClick={() => { haptic('success'); dispatch({ type: 'sync', sourceId: s.id }); toast({ text: `${s.name} synced`, icon: 'sync' }) }}
                      >
                        <Icon name="sync" size={17} />
                      </button>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => confirm({
                          title: `Disconnect ${s.name}?`,
                          body: 'Jumbo stops reading from it. History already imported stays until you clear all data.',
                          confirmLabel: 'Disconnect',
                          onConfirm: () => {
                            dispatch({ type: 'disconnect', sourceId: s.id })
                            haptic('warning')
                            toast({ text: `${s.name} disconnected`, icon: 'unlink', tone: 'warning' })
                          },
                        })}
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn--primary btn--sm" style={{ flex: 'none' }}
                      onClick={() => { haptic('success'); dispatch({ type: 'connect', sourceId: s.id }); toast({ text: `${s.name} connected`, icon: 'link' }) }}
                    >
                      Connect
                    </button>
                  )}
                </div>

                {detail === s.id && (
                  <ul className="stack stack-2">
                    {s.provides.map((m) => (
                      <li key={m} className="row" style={{ gap: 'var(--s-2)', alignItems: 'flex-start' }}>
                        <Icon name="check" size={14} style={{ color: 'var(--accent)', marginTop: 3, flex: 'none' }} />
                        <span className="t-caption">
                          <span className="strong">{METRIC_LABEL[m]}</span>
                          <span className="dim2"> — {METRIC_DETAIL[m]}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>

        {gaps.length > 0 && (
          <div className="card card--quiet stack stack-3">
            <span className="eyebrow">Not covered by your sources</span>
            <ul className="stack stack-2">
              {gaps.map((g) => (
                <li key={g} className="row row--between">
                  <span className="t-callout">{METRIC_LABEL[g]}</span>
                  <button className="btn btn--secondary btn--sm" onClick={() => onNavigate('capture')}>
                    Add by hand
                  </button>
                </li>
              ))}
            </ul>
            <p className="t-caption dim2">
              Jumbo still works without these — it widens the uncertainty on anything that depends
              on them rather than blocking you.
            </p>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- Privacy */}
      <section className="section">
        <SectionHead title="Privacy & control" sub="Each switch changes what the app actually does." />
        <div className="card stack stack-5">
          <SettingRow
            label="Pattern analysis"
            hint="Lets Jumbo look for relationships across your data and write insights. Turning it off leaves your data visible but uninterpreted."
            checked={state.settings.aiPatterns}
            onChange={(v) => { set('aiPatterns', v); toast({ text: v ? 'Pattern analysis on' : 'Pattern analysis off', icon: v ? 'sparkle' : 'lock' }) }}
          />
          <SettingRow
            label="Cloud processing"
            hint="Off means everything is computed on this device. This build never sends data anywhere either way."
            checked={state.settings.cloudProcessing}
            onChange={(v) => set('cloudProcessing', v)}
          />
          <SettingRow
            label="Personalised creator suggestions"
            hint="Uses your goal to order Explore. Your health data is never shared with creators."
            checked={state.settings.creatorPersonalisation}
            onChange={(v) => set('creatorPersonalisation', v)}
          />
          {hapticsSupported() && (
            <SettingRow
              label="Haptics"
              hint="Short vibrations on capture, completion and milestones only."
              checked={state.settings.haptics}
              onChange={(v) => { set('haptics', v); if (v) haptic('success') }}
            />
          )}
        </div>
      </section>

      {/* ----------------------------------------------------- Appearance */}
      <section className="section">
        <SectionHead title="Appearance" />
        <div className="card row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
          <span className="t-callout">Theme</span>
          <Segmented
            ariaLabel="Theme"
            value={state.theme}
            onChange={(v) => dispatch({ type: 'setTheme', theme: v as typeof state.theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </section>

      {/* ---------------------------------------------------- Other areas */}
      <section className="section">
        <SectionHead title="More" />
        <div className="stack stack-3">
          <LinkRow icon="measure" label="Measurements" sub={`${state.measurements.length} records`} onClick={() => onNavigate('measurements')} />
          <LinkRow icon="explore" label="Explore" sub={`${state.following.length} creators followed`} onClick={() => onNavigate('explore')} />
        </div>
      </section>

      {/* ----------------------------------------------------- Your data */}
      <section className="section">
        <SectionHead title="Your data" />
        <div className="card stack stack-4">
          <div className="row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
            <div className="stack stack-1" style={{ minWidth: 0 }}>
              <span className="t-callout strong">Export everything</span>
              <span className="t-caption dim2">A JSON file with every record Jumbo holds for you.</span>
            </div>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify({ days: state.days, measurements: state.measurements, baseline: state.baseline }, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'jumbo-export.json'
                a.click()
                URL.revokeObjectURL(url)
                toast({ text: 'Export downloaded', icon: 'check' })
              }}
            >
              Export
            </button>
          </div>

          <hr className="hairline" />

          <div className="row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
            <div className="stack stack-1" style={{ minWidth: 0 }}>
              <span className="t-callout strong">Clear everything</span>
              <span className="t-caption dim2">Disconnects all sources and deletes imported and entered data.</span>
            </div>
            <button
              className="btn btn--danger btn--sm"
              onClick={() => confirm({
                title: 'Clear all Jumbo data?',
                body: 'Every connection, imported day, meal, workout and measurement is deleted from this device. This cannot be undone.',
                confirmLabel: 'Delete everything',
                onConfirm: () => { dispatch({ type: 'resetAll' }); haptic('warning') },
              })}
            >
              Clear
            </button>
          </div>
        </div>

        <p className="t-caption dim2">
          Jumbo is a wellness and longevity companion. It does not diagnose, treat or monitor
          medical conditions, and its projections are not clinical predictions. If something in your
          data worries you, speak to a clinician.
        </p>
      </section>

      {confirmNode}
    </div>
  )
}

function SettingRow({
  label, hint, checked, onChange,
}: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `set-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="row row--between" style={{ alignItems: 'flex-start', gap: 'var(--s-4)' }}>
      <div className="stack stack-1" style={{ minWidth: 0 }}>
        <span className="t-callout strong">{label}</span>
        <span className="t-caption dim" id={id}>{hint}</span>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} describedBy={id} />
    </div>
  )
}

function LinkRow({
  icon, label, sub, onClick,
}: { icon: IconName; label: string; sub: string; onClick: () => void }) {
  return (
    <button className="card row" style={{ gap: 'var(--s-3)', width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={onClick}>
      <span style={{
        width: 38, height: 38, borderRadius: 'var(--r-md)', flex: 'none',
        display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--accent)',
      }}>
        <Icon name={icon} size={18} />
      </span>
      <div className="grow stack" style={{ gap: 1 }}>
        <span className="t-callout strong">{label}</span>
        <span className="t-caption dim2">{sub}</span>
      </div>
      <Icon name="chevron" size={16} style={{ color: 'var(--ink-3)' }} />
    </button>
  )
}

export { Empty }
