import { useEffect, useState } from 'react'
import '../styles/profile.css'
import { Icon, type IconName } from '../components/Icon'
import { ProfilePhotoPicker, SourceLogo } from '../components/Asset'
import {
  DemoBadge, Empty, ErrorNotice, SectionHead, Segmented, UnavailableNotice,
  Switch, useConfirm, useToast,
} from '../components/UI'
import { useStore } from '../state/store'
import type { Route } from '../components/Nav'
import type { GoalKey } from '../data/types'
import { api, type ProviderInfo } from '../lib/api'
import { guessPlatform, nativeBridge } from '../lib/native'
import { celebrate, haptic, hapticsSupported, playSound } from '../lib/feedback'
import {
  REMINDER_LABELS, nextReminderLabel, notificationPermission, notificationsSupported,
  requestNotificationPermission, type ReminderKind,
} from '../lib/reminders'
import { relativeTime } from '../lib/util'

const GOALS: Array<{ key: GoalKey; label: string }> = [
  { key: 'energy', label: 'More energy' },
  { key: 'fitness', label: 'Get fitter' },
  { key: 'sleep', label: 'Sleep better' },
  { key: 'nutrition', label: 'Eat better' },
  { key: 'aging', label: 'Healthy ageing' },
  { key: 'consistency', label: 'Be consistent' },
]

const SOURCE_ICON: Record<string, IconName> = {
  apple_health: 'phone', health_connect: 'phone',
  whoop: 'watch', oura: 'ring', fitbit: 'watch', withings: 'scale', garmin: 'watch',
}

/**
 * App settings.
 *
 * Everything that changes how Jumbo behaves, grouped the way the platform
 * groups settings: account, then what it may read, then what it does with
 * it, then how it looks, then the data itself. You is the summary; this is
 * where the switches live.
 *
 * Nothing here is a placeholder. A setting appears only when it changes
 * something the app actually does.
 */
export function Settings({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state, dispatch, sync, refreshProviders } = useStore()
  const toast = useToast()
  const { confirm, node: confirmNode } = useConfirm()
  const [permission, setPermission] = useState(notificationPermission())

  const set = (key: keyof typeof state.settings, value: boolean) =>
    dispatch({ type: 'setSetting', key, value })

  return (
    <div className="stack stack-6">
      <div className="sub-head">
        <button className="icon-btn" aria-label="Back to your profile" onClick={() => onNavigate('you')}>
          <Icon name="back" size={20} />
        </button>
        <h1 className="sub-head__title">Settings</h1>
      </div>

      {state.dataMode === 'demo' && <DemoBadge />}

      {/* ------------------------------------------------------- account */}
      <section className="section" id="account">
        <SectionHead title="Account" />
        <div className="card stack stack-5">
        <div className="row" style={{ gap: 'var(--s-4)' }}>
          <ProfilePhotoPicker
            size={56}
            onError={(message) => toast({ text: message, icon: 'info', tone: 'warning' })}
          />
          <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="t-title3">{state.profile.name || 'Add your name'}</span>
            <span className="t-caption dim">Tap the photo to change it.</span>
          </div>
        </div>

        <div className="grid grid--2">
          <div className="field">
            <label className="field__label" htmlFor="p-name">Name</label>
            <input
              id="p-name" className="input" value={state.profile.name} maxLength={48}
              placeholder="What should Jumbo call you?"
              onChange={(e) => dispatch({ type: 'setProfile', profile: { name: e.target.value } })}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="p-phone">Phone</label>
            <input
              id="p-phone" className="input" type="tel" inputMode="tel" value={state.profile.phone}
              placeholder="+44 7700 900123"
              onChange={(e) => dispatch({ type: 'setProfile', profile: { phone: e.target.value } })}
            />
            <span className="field__hint">Your account is keyed to this number.</span>
          </div>
        </div>
        </div>
      </section>

      {/* --------------------------------------------------------- goals */}
      <section className="section" id="goals">
        <SectionHead title="Your goals" sub="Pick as many as fit. They shape what Jumbo shows first, and nothing is hidden because of them." />
        <div className="card">
          <div className="row row--wrap" style={{ gap: 'var(--s-2)' }}>
            {GOALS.map((g) => (
              <button
                key={g.key} className="chip" aria-pressed={state.goals.includes(g.key)}
                onClick={() => { haptic('selection'); dispatch({ type: 'toggleGoal', goal: g.key }) }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- sources */}
      <div id="sources">
        <Sources onNavigate={onNavigate} onSync={sync} onRefresh={refreshProviders} />
      </div>

      {/* ----------------------------------------------------- reminders */}
      <section className="section" id="reminders">
        <SectionHead title="Reminders" sub="Jumbo nudges at the times you actually eat and train." />
        <div className="card stack stack-5">
          <div className="row row--between row--top" style={{ gap: 'var(--s-4)' }}>
            <div className="stack stack-1" style={{ minWidth: 0 }}>
              <span className="t-callout strong">Meal and workout reminders</span>
              <span className="t-caption dim" id="rem-hint">
                {notificationsSupported()
                  ? 'A browser can only raise a notification while Jumbo is open. For alerts when it is closed, use the Jumbo app.'
                  : 'This browser does not support notifications, so reminders cannot fire here.'}
              </span>
            </div>
            <Switch
              checked={state.reminders.enabled}
              label="Reminders"
              describedBy="rem-hint"
              onChange={async (v) => {
                if (v) {
                  const p = await requestNotificationPermission()
                  setPermission(p)
                  if (p !== 'granted') {
                    toast({ text: 'Notifications were not allowed', icon: 'info', tone: 'warning' })
                    return
                  }
                }
                dispatch({ type: 'setReminders', patch: { enabled: v } })
                haptic('selection')
              }}
            />
          </div>

          {state.reminders.enabled && permission === 'granted' && (
            <>
              <div className="grid grid--2">
                {(Object.keys(REMINDER_LABELS) as ReminderKind[]).map((k) => (
                  <div className="field" key={k}>
                    <label className="field__label" htmlFor={`rem-${k}`}>{REMINDER_LABELS[k]}</label>
                    <input
                      id={`rem-${k}`} className="input" type="time" value={state.reminders[k]}
                      onChange={(e) => dispatch({ type: 'setReminders', patch: { [k]: e.target.value } })}
                    />
                  </div>
                ))}
              </div>
              <p className="t-caption dim2">{nextReminderLabel(state.reminders) ?? 'No reminder scheduled.'}</p>
            </>
          )}

          {state.reminders.enabled && permission !== 'granted' && (
            <ErrorNotice
              title="Notifications are blocked"
              message="Jumbo cannot raise a reminder until notifications are allowed for this site in your browser settings."
            />
          )}
        </div>
      </section>

      {/* ------------------------------------------------ feel & privacy */}
      <section className="section">
        <SectionHead title="Feel" sub="Reserved for real moments: a capture, a completion, a milestone." />
        <div className="card stack stack-5">
          {hapticsSupported() ? (
            <SettingRow
              label="Haptics"
              hint="Short, patterned vibrations on capture, confirmation and milestones. Never on ordinary taps."
              checked={state.settings.haptics}
              onChange={(v) => { set('haptics', v); if (v) haptic('success') }}
            />
          ) : (
            <p className="t-caption dim2">This device does not expose haptics to the browser.</p>
          )}
          <SettingRow
            label="Sound"
            hint="A short tone on a completed meal, workout or milestone. Browsers cannot read your phone’s silent switch, so this is the switch."
            checked={state.settings.sound}
            onChange={(v) => { set('sound', v); if (v) playSound('confirm') }}
          />
        </div>
      </section>

      <section className="section" id="privacy">
        <SectionHead title="Privacy and control" sub="Each switch changes what the app actually does." />
        <div className="card stack stack-5">
          <SettingRow
            label="Pattern analysis"
            hint="Lets Jumbo look for relationships across your data and write insights. Off leaves the data visible and uninterpreted."
            checked={state.settings.aiPatterns}
            onChange={(v) => { set('aiPatterns', v); toast({ text: v ? 'Pattern analysis on' : 'Pattern analysis off', icon: v ? 'ai' : 'lock' }) }}
          />
          <SettingRow
            label="Personalised video suggestions"
            hint="Uses your goals to search YouTube. Your health data is never sent to YouTube or to any creator."
            checked={state.settings.creatorPersonalisation}
            onChange={(v) => set('creatorPersonalisation', v)}
          />
          <hr className="hairline" />
          <div className="stack stack-2">
            <span className="t-callout strong">Where your data goes</span>
            <p className="t-caption dim">
              Records, meals and notes are stored on this device. When Jumbo’s AI is turned on, a
              statistical summary of your data, never your name, phone number, notes or photos,
              is sent to Jumbo’s AI provider to write insights. Meal photos are sent for analysis at the
              moment you take them and are not stored afterwards.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- appearance */}
      <section className="section" id="appearance">
        <SectionHead title="Appearance" />
        <div className="card row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
          <span className="t-callout">Theme</span>
          <Segmented
            ariaLabel="Theme" value={state.theme}
            onChange={(v) => dispatch({ type: 'setTheme', theme: v as typeof state.theme })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
      </section>

      {/* ----------------------------------------------------- your data */}
      <section className="section" id="data">
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
                const blob = new Blob([JSON.stringify({
                  profile: state.profile, goals: state.goals, dataMode: state.dataMode,
                  days: state.days, measurements: state.measurements, baseline: state.baseline,
                }, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'jumbo-export.json'; a.click()
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
              <span className="t-caption dim2">Deletes your profile, goals and entered data from this device.</span>
            </div>
            <button
              className="btn btn--danger btn--sm"
              onClick={() => confirm({
                title: 'Clear all Jumbo data?',
                body: 'Your profile, goals, meals, workouts, measurements and notes are deleted from this device. Connected sources stay connected to your Jumbo account until you disconnect them. This cannot be undone.',
                confirmLabel: 'Delete everything',
                onConfirm: () => { dispatch({ type: 'resetAll' }); haptic('impactHeavy') },
              })}
            >
              Clear
            </button>
          </div>

          <hr className="hairline" />

          <div className="row row--between row--wrap" style={{ gap: 'var(--s-3)' }}>
            <div className="stack stack-1" style={{ minWidth: 0 }}>
              <span className="t-callout strong">Sign out</span>
              <span className="t-caption dim2">
                Ends this session. Nothing on this device is deleted, and signing back in brings it
                all back.
              </span>
            </div>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => confirm({
                title: 'Sign out of Jumbo?',
                body: 'Your records stay on this device. You will start again from the welcome screen.',
                confirmLabel: 'Sign out',
                onConfirm: () => { dispatch({ type: 'signOut' }); haptic('impactLight') },
              })}
            >
              Sign out
            </button>
          </div>
        </div>

        <p className="t-caption dim2">
          Jumbo is a wellness and longevity companion. It does not diagnose, treat or monitor medical
          conditions, and its projections are not clinical predictions. If something in your data
          worries you, speak to a clinician.
        </p>
      </section>

      {confirmNode}
    </div>
  )
}

/* ---------------------------------------------------------------- sources */
/**
 * What the person is told when a connection did not complete.
 *
 * The provider redirects back with a short code — `bad_state`, `no_session`,
 * `token_exchange_400` and so on. Those name the mechanism, not the problem,
 * and they are the kind of thing that must never reach the product. Each maps
 * to a sentence saying what actually happened and what to do next; anything
 * unrecognised falls back to the plain "try again", never to the raw code.
 */
function connectFailure(name: string, reason: string): string {
  if (reason === 'access_denied' || reason === 'user_denied') {
    return `${name} wasn’t connected — permission was declined.`
  }
  if (/^token_exchange/.test(reason) || reason === 'no_access_token') {
    return `${name} didn’t finish connecting. Try again in a moment.`
  }
  if (reason === 'network_error') {
    return `Jumbo couldn’t reach ${name}. Check your connection and try again.`
  }
  if (reason === 'bad_state' || reason === 'state_mismatch' || reason === 'no_session') {
    return `That ${name} sign-in expired before it finished. Start it again.`
  }
  return `${name} couldn’t be connected. Try again.`
}

function Sources({
  onNavigate, onSync, onRefresh,
}: { onNavigate: (r: Route) => void; onSync: () => Promise<void>; onRefresh: () => Promise<void> }) {
  const { state } = useStore()
  const toast = useToast()
  const { confirm, node } = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ id: string; kind: 'setup' | 'error'; message: string; missing?: string[]; docs?: string } | null>(null)
  const bridge = nativeBridge()
  const platform = guessPlatform()

  // Surface the result of an OAuth round trip when the provider redirects back.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('connect')
    if (!id) return
    const status = params.get('status')
    const name = state.providers.find((p) => p.id === id)?.name ?? id
    if (status === 'connected') {
      celebrate('confirm', false)
      toast({ text: `${name} connected`, icon: 'link' })
      void onSync()
    } else {
      const reason = params.get('reason') ?? ''
      // The code stays in the console, where it is useful. What reaches the
      // person is what they can do about it.
      console.warn(`[connect:${id}] failed`, reason)
      toast({ text: connectFailure(name, reason), icon: 'info', tone: 'warning' })
    }
    window.history.replaceState({}, '', window.location.pathname)
    // Runs once, on the redirect back. `state.providers` is only read for a
    // display name and must not re-fire this when the list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSync, toast])

  const connect = async (p: ProviderInfo) => {
    setFailure(null)
    if (p.transport === 'native') {
      if (!bridge) return
      setBusy(p.id)
      try {
        const granted = await bridge.requestPermissions(['sleep', 'steps', 'workouts', 'restingHeartRate', 'hrv', 'weight'])
        if (granted.granted.length === 0) {
          setFailure({ id: p.id, kind: 'error', message: 'No permissions were granted, so there is nothing to read.' })
        } else {
          celebrate('confirm', false)
          toast({ text: `${p.name} connected`, icon: 'link' })
          await onSync()
        }
      } catch (err) {
        setFailure({ id: p.id, kind: 'error', message: (err as Error).message })
      }
      setBusy(null)
      return
    }

    setBusy(p.id)
    const r = await api.connect(p.id)
    setBusy(null)
    if (r.ok) {
      window.location.href = r.data.authorizeUrl   // the real provider consent screen
    } else if (r.kind === 'setup') {
      setFailure({ id: p.id, kind: 'setup', message: r.message, missing: r.missing, docs: r.docs })
    } else {
      setFailure({ id: p.id, kind: 'error', message: r.message })
    }
  }

  if (state.serverReachable === false) {
    return (
      <section className="section">
        <SectionHead title="Connected sources" />
        <UnavailableNotice
          title="Your sources can’t be reached"
          message="Jumbo can’t check your connected sources at the moment, so none are shown rather than showing you a stale list. Everything already recorded is still here."
        />
      </section>
    )
  }

  return (
    <section className="section">
      <SectionHead
        title="Connected sources"
        sub="Jumbo only ever reads. Disconnect any source and it stops immediately."
        action={
          <button className="btn btn--ghost btn--sm" onClick={() => { haptic('selection'); void onSync() }} disabled={state.syncing}>
            <Icon name="sync" size={14} /> {state.syncing ? 'Syncing' : 'Sync'}
          </button>
        }
      />

      {state.syncErrors.length > 0 && (
        <ErrorNotice
          title="Some sources did not sync"
          message={state.syncErrors.map((e) => `${e.provider}: ${e.message}`).join(' · ')}
          onRetry={() => void onSync()}
        />
      )}

      {state.providers.length === 0 ? (
        <Empty icon="link" title="Loading sources" body="Checking which sources you can connect." />
      ) : (
        <ul className="stack stack-3">
          {state.providers.map((p) => {
            const connected = Boolean(p.connection)
            const nativeReady = p.transport === 'native' && Boolean(bridge)
            const canConnect = p.transport === 'oauth' ? p.ready : nativeReady

            return (
              <li key={p.id} className="card stack stack-3">
                <div className="row" style={{ gap: 'var(--s-3)' }}>
                  <SourceLogo
                    providerId={p.id} connected={connected}
                    fallbackIcon={SOURCE_ICON[p.id] ?? 'link'} size={44}
                  />
                  <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="t-callout strong">{p.name}</span>
                    <span className="t-caption dim2">
                      {connected
                        ? <><span className="dot" style={{ background: 'var(--brand)', display: 'inline-block', marginRight: 6 }} />
                            {p.connection!.lastSyncAt
                              ? `Synced ${relativeTime((Date.now() - p.connection!.lastSyncAt) / 60_000)}`
                              : 'Connected, not yet synced'}</>
                        : p.vendor}
                    </span>
                  </div>
                </div>

                <div className="row row--between" style={{ gap: 'var(--s-2)' }}>
                  <button
                    className="btn btn--ghost btn--sm" style={{ paddingLeft: 0 }}
                    aria-expanded={detail === p.id}
                    onClick={() => setDetail(detail === p.id ? null : p.id)}
                  >
                    <Icon name="chevron" size={13} style={{ transform: detail === p.id ? 'rotate(90deg)' : 'none', transition: 'transform var(--d-fast)' }} />
                    What it shares
                  </button>

                  {connected ? (
                    <button
                      className="btn btn--secondary btn--sm none"
                      onClick={() => confirm({
                        title: `Disconnect ${p.name}?`,
                        body: 'Jumbo stops reading from it straight away. History already imported stays until you clear your data.',
                        confirmLabel: 'Disconnect',
                        onConfirm: async () => {
                          await api.disconnect(p.id)
                          await onRefresh()
                          await onSync()
                          haptic('warning')
                          toast({ text: `${p.name} disconnected`, icon: 'unlink', tone: 'warning' })
                        },
                      })}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className={`btn btn--sm none ${canConnect ? 'btn--primary' : 'btn--secondary'}`}
                      disabled={busy === p.id}
                      aria-expanded={canConnect ? undefined : why === p.id}
                      onClick={() => (canConnect ? void connect(p) : setWhy(why === p.id ? null : p.id))}
                    >
                      {busy === p.id ? <span className="spinner" /> : canConnect ? 'Connect' : why === p.id ? 'Hide' : 'Why not?'}
                    </button>
                  )}
                </div>

                {detail === p.id && (
                  <ul className="stack stack-2">
                    {p.provides.map((m) => (
                      <li key={m} className="row row--top" style={{ gap: 'var(--s-2)' }}>
                        <Icon name="check" size={14} style={{ color: 'var(--brand)', marginTop: 3, flex: 'none' }} />
                        <span className="t-caption">{METRIC_COPY[m] ?? m}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Why a source cannot connect — always specific, never a dead end. */}
                {why === p.id && !connected && p.transport === 'native' && !bridge && (
                  <UnavailableNotice
                    title={`${p.name} needs the Jumbo app`}
                    message={`${p.reason ?? ''} ${platform === (p.platform ?? '') ? 'You are on the right platform. Install the Jumbo app to connect it.' : ''}`.trim()}
                    compact
                  />
                )}
                {why === p.id && !connected && p.transport === 'oauth' && !p.ready && (
                  <UnavailableNotice
                    title={`${p.name} isn’t available yet`}
                    message="This source isn’t ready to connect in Jumbo yet. It will appear here as soon as it is."
                    compact
                  />
                )}
                {failure?.id === p.id && failure.kind === 'error' && (
                  <ErrorNotice title="That did not work" message={failure.message} />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="card card--quiet stack stack-3">
        <span className="eyebrow">Not covered by any source</span>
        <div className="row row--between">
          <span className="t-callout">Meals</span>
          <button className="btn btn--secondary btn--sm" onClick={() => onNavigate('capture')}>
            <Icon name="camera" size={14} /> Photograph one
          </button>
        </div>
        <p className="t-caption dim2">
          No wearable can see a plate of food. Jumbo works without it. It simply widens the
          uncertainty on anything that depends on nutrition.
        </p>
      </div>

      {node}
    </section>
  )
}

const METRIC_COPY: Record<string, string> = {
  sleep: 'Sleep: duration, efficiency and bedtime consistency',
  steps: 'Steps and walking: daily count and active minutes',
  workouts: 'Workouts: type, duration and intensity',
  heart: 'Heart and fitness: resting heart rate, HRV, VO₂ max',
  body: 'Body composition: weight, body fat, lean mass',
  nutrition: 'Nutrition: meals, energy and protein',
}

function SettingRow({
  label, hint, checked, onChange,
}: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `set-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="row row--between row--top" style={{ gap: 'var(--s-4)' }}>
      <div className="stack stack-1" style={{ minWidth: 0 }}>
        <span className="t-callout strong">{label}</span>
        <span className="t-caption dim" id={id}>{hint}</span>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} describedBy={id} />
    </div>
  )
}
