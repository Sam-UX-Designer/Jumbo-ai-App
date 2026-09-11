import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { AvatarButton } from './Asset'
import { haptic } from '../lib/feedback'
import { uid } from '../lib/util'

/* ============================================================
   Sheet — the app's single modal surface.
   Modality is used sparingly: only for a task that must be finished
   or abandoned as a unit (editing a meal, connecting a source).
   ============================================================ */
export function Sheet({
  open, onClose, title, subtitle, children, footer, labelledById,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  labelledById?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const autoId = useId()
  const titleId = labelledById ?? `sheet-${autoId}`

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    window.setTimeout(() => (focusables()[0] ?? ref.current)?.focus(), 40)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'Tab') {
        const f = focusables()
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      restoreTo.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
        ref={ref} tabIndex={-1}
      >
        <div className="sheet__grabber" />
        <div className="sheet__head">
          <div className="grow">
            <h2 className="t-title3" id={titleId}>{title}</h2>
            {subtitle && <p className="t-caption dim" style={{ marginTop: 2 }}>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}

/* ============================================================
   Toast — brief, non-blocking confirmation
   ============================================================ */
interface Toast { id: string; text: string; icon?: IconName; tone?: 'default' | 'positive' | 'warning' }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid()
    setItems((prev) => [...prev.slice(-2), { ...t, id }])
    window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3400)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <Icon
              name={t.icon ?? 'check'} size={18}
              style={{ color: t.tone === 'warning' ? 'var(--caution)' : 'var(--positive)', flex: 'none' }}
            />
            <span className="t-callout grow">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ============================================================
   Switch
   ============================================================ */
export function Switch({
  checked, onChange, label, describedBy,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; describedBy?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      aria-describedby={describedBy} className="switch"
      onClick={() => { haptic('selection'); onChange(!checked) }}
    />
  )
}

/* ============================================================
   Segmented control
   ============================================================ */
export function Segmented<T extends string | number>({
  value, options, onChange, ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)} type="button" className="segmented__btn"
          aria-pressed={o.value === value}
          onClick={() => { haptic('selection'); onChange(o.value) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ============================================================
   Confidence — the app never states an AI conclusion without one
   ============================================================ */
export function Confidence({ value, compact = false }: { value: number; compact?: boolean }) {
  const pct = Math.round(value * 100)
  const label = value >= 0.8 ? 'High confidence' : value >= 0.6 ? 'Moderate confidence' : 'Low confidence'
  const color = value >= 0.8 ? 'var(--positive)' : value >= 0.6 ? 'var(--caution)' : 'var(--critical)'
  return (
    <div className="row" style={{ gap: 'var(--s-2)' }} title={`${label}: ${pct}%`}>
      <div
        aria-hidden="true"
        style={{ display: 'flex', gap: 3, alignItems: 'center' }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: compact ? 12 : 16, height: 4, borderRadius: 2,
            background: pct >= (i + 1) * 27 ? color : 'var(--hairline-firm)',
          }} />
        ))}
      </div>
      <span className="t-caption" style={{ color }}>{label}</span>
      <span className="sr-only">Model confidence {pct} percent.</span>
    </div>
  )
}

/* ============================================================
   Provenance tag — observed vs evidence-informed vs modelled
   ============================================================ */
export type Provenance = 'observed' | 'evidence' | 'model'

const PROVENANCE_COPY: Record<Provenance, { label: string; cls: string; title: string }> = {
  observed: { label: 'Measured', cls: 'measured', title: 'Recorded by a connected device or entered by you.' },
  evidence: { label: 'Evidence-informed', cls: 'evidence', title: 'A general relationship described in research, applied to your data.' },
  model:    { label: 'Model estimate', cls: 'model', title: 'A projection from Jumbo’s model. Not a prediction, and not medical advice.' },
}

export function ProvenanceTag({ kind }: { kind: Provenance }) {
  const c = PROVENANCE_COPY[kind]
  return (
    <span className={`tag tag--${c.cls}`} title={c.title}>
      <span className="dot" style={{ background: 'currentColor', width: 6, height: 6 }} />
      {c.label}
    </span>
  )
}

/* ============================================================
   Stat tile
   ============================================================ */
export function Stat({
  label, value, unit, sub, icon, color, children,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  icon?: IconName
  color?: string
  children?: ReactNode
}) {
  return (
    <div className="card card--quiet stack stack-2" style={{ padding: 'var(--s-4)' }}>
      <div className="row" style={{ gap: 'var(--s-2)', color: color ?? 'var(--ink-3)' }}>
        {icon && <Icon name={icon} size={16} />}
        <span className="t-caption" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{label}</span>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 4 }}>
        <span className="t-title2 num">{value}</span>
        {unit && <span className="t-caption dim">{unit}</span>}
      </div>
      {sub && <div className="t-caption dim2">{sub}</div>}
      {children}
    </div>
  )
}

/* ============================================================
   Section header
   ============================================================ */
export function SectionHead({
  title, sub, action,
}: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="sec-head" style={{ alignItems: 'flex-start' }}>
      <div className="stack stack-1" style={{ minWidth: 0 }}>
        <h2 className="sec-head__title">{title}</h2>
        {sub && <p className="t-caption dim">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/* ============================================================
   Screen header
   ============================================================ */
/**
 * The profile photo sits in the top right of every top-level screen. It is
 * part of the header, not something each screen remembers to add.
 */
export function ScreenHead({
  eyebrow, title, sub, actions, sample = false,
}: {
  eyebrow?: string
  title: string
  sub?: string
  /** Round controls that sit to the left of the profile photo. */
  actions?: ReactNode
  /** Shown when the screen is displaying sample rather than recorded data. */
  sample?: boolean
}) {
  return (
    <header className="stack stack-4" style={{ marginBottom: 'var(--s-6)' }}>
      <div className="scr-head">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="scr-head__title">{title}</h1>
          {sub && <p className="scr-head__sub">{sub}</p>}
        </div>
        <div className="scr-head__actions">
          {actions}
          <AvatarButton size={42} />
        </div>
      </div>
      {sample && (
        <span className="sample-pill"><Icon name="flag" size={12} /> Sample data</span>
      )}
    </header>
  )
}

/* ============================================================
   Disclosure — used for "how this was worked out"
   ============================================================ */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button" className="btn btn--ghost btn--sm" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ paddingLeft: 0, paddingRight: 'var(--s-2)' }}
      >
        <Icon name="chevron" size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--d-fast)' }} />
        {summary}
      </button>
      {open && <div className="stack stack-3" style={{ paddingTop: 'var(--s-3)' }}>{children}</div>}
    </div>
  )
}

/* ============================================================
   Number stepper — faster than a keyboard for small corrections
   ============================================================ */
export function Stepper({
  value, onChange, step = 1, min = 0, max = 9999, unit, label, dp = 0,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  label: string
  dp?: number
}) {
  const set = (v: number) => {
    const clamped = Math.min(max, Math.max(min, v))
    haptic('impactLight')
    onChange(Number(clamped.toFixed(dp)))
  }
  return (
    <div className="row" style={{ gap: 'var(--s-2)' }}>
      <button type="button" className="icon-btn" aria-label={`Decrease ${label}`}
        onClick={() => set(value - step)} disabled={value <= min}
        style={{ border: '1px solid var(--hairline)' }}>
        <Icon name="minus" size={14} />
      </button>
      <div className="row" style={{ gap: 4, minWidth: 78, justifyContent: 'center' }}>
        <span className="t-title3 num">{value.toFixed(dp)}</span>
        {unit && <span className="t-caption dim">{unit}</span>}
      </div>
      <button type="button" className="icon-btn" aria-label={`Increase ${label}`}
        onClick={() => set(value + step)} disabled={value >= max}
        style={{ border: '1px solid var(--hairline)' }}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

/* ============================================================
   Loading & empty
   ============================================================ */
export function Loading({ label }: { label: string }) {
  return (
    <div className="row" style={{ gap: 'var(--s-3)', padding: 'var(--s-6) 0' }} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="t-callout dim">{label}</span>
    </div>
  )
}

export function Empty({
  icon = 'ai', title, body, action,
}: { icon?: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} style={{ color: 'var(--ink-3)' }} />
      <p className="t-body strong" style={{ color: 'var(--ink)' }}>{title}</p>
      <p className="t-callout dim" style={{ maxWidth: '40ch' }}>{body}</p>
      {action}
    </div>
  )
}

/* ============================================================
   Confirm — every destructive action asks first
   ============================================================ */
export function useConfirm() {
  const [req, setReq] = useState<{ title: string; body: string; confirmLabel: string; onConfirm: () => void } | null>(null)
  const confirm = useCallback(
    (o: { title: string; body: string; confirmLabel: string; onConfirm: () => void }) => setReq(o),
    [],
  )
  const node = req ? (
    <Sheet
      open onClose={() => setReq(null)} title={req.title}
      footer={
        <>
          <button className="btn btn--secondary grow" onClick={() => setReq(null)}>Cancel</button>
          <button
            className="btn btn--primary grow"
            style={{ background: 'var(--critical)' }}
            onClick={() => { req.onConfirm(); setReq(null) }}
          >
            {req.confirmLabel}
          </button>
        </>
      }
    >
      <p className="t-callout dim">{req.body}</p>
    </Sheet>
  ) : null
  return useMemo(() => ({ confirm, node }), [confirm, node])
}

/* ============================================================
   Honesty surfaces.

   These three components are the reason the app can be trusted: whenever a
   capability is not actually available, one of them appears in its place
   rather than a simulated success.
   ============================================================ */

/** Setup guidance. Never rendered in the product surface — see UnavailableNotice. */
export function SetupNotice({
  title, message, missing, docs, compact = false,
}: {
  title: string
  message: string
  missing?: string[]
  docs?: string
  compact?: boolean
}) {
  return (
    <div className="notice notice--setup" role="note">
      <Icon name="lock" size={18} style={{ color: 'var(--nutrition)', flex: 'none', marginTop: 2 }} />
      <div className="stack stack-2" style={{ minWidth: 0 }}>
        <span className="t-callout strong">{title}</span>
        <p className="t-caption dim">{message}</p>
        {missing && missing.length > 0 && (
          <p className="t-caption dim2">
            Needs: {missing.map((m, i) => (
              <span key={m}>{i > 0 && ', '}<code>{m}</code></span>
            ))}
          </p>
        )}
        {docs && !compact && (
          <a className="t-caption strong" href={docs} target="_blank" rel="noreferrer">
            Provider docs <Icon name="external" size={12} style={{ display: 'inline', verticalAlign: -1 }} />
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Jumbo's AI cannot answer right now.
 *
 * Deliberately says nothing about why in technical terms: no service names,
 * no settings, no environment. The person is told what they can and cannot
 * do, and offered the one action that might help.
 */
export function UnavailableNotice({
  title = 'Jumbo can’t answer right now',
  message = 'Your data is safe and everything else still works. Please try again in a moment.',
  onRetry,
  compact = false,
}: {
  title?: string
  message?: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div className={`notice notice--quiet${compact ? ' notice--compact' : ''}`} role="note">
      <Icon name="info" size={18} style={{ color: 'var(--ink-3)', flex: 'none', marginTop: 2 }} />
      <div className="stack stack-2 grow" style={{ minWidth: 0 }}>
        <span className="t-callout strong">{title}</span>
        <p className="t-caption dim">{message}</p>
        {onRetry && (
          <button className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-start' }} onClick={onRetry}>
            <Icon name="sync" size={14} /> Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** Something reached the server and failed. Never silent. */
export function ErrorNotice({
  title, message, onRetry,
}: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice--error" role="alert">
      <Icon name="info" size={18} style={{ color: 'var(--critical)', flex: 'none', marginTop: 2 }} />
      <div className="stack stack-2 grow" style={{ minWidth: 0 }}>
        <span className="t-callout strong">{title}</span>
        <p className="t-caption dim">{message}</p>
        {onRetry && (
          <button className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-start' }} onClick={onRetry}>
            <Icon name="sync" size={14} /> Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** The label that must appear anywhere sample data is shown as if it were real. */
export function DemoBadge({ inline = false }: { inline?: boolean }) {
  if (inline) return <span className="tag tag--demo">Sample data</span>
  return (
    <div className="demo-bar" role="note">
      <Icon name="flag" size={14} />
      Sample data, not your health record
    </div>
  )
}

/** A live-data marker, only ever rendered when a real source supplied the number. */
export function LiveBadge({ source }: { source?: string }) {
  return (
    <span className="tag tag--live">
      <span className="dot" style={{ background: 'currentColor', width: 6, height: 6 }} />
      {source ? `From ${source}` : 'Live'}
    </span>
  )
}
