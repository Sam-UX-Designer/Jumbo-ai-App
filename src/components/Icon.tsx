import '../styles/icons.css'

/**
 * One icon system: a 24 grid, 1.75 stroke, and motion that is opt-in per icon.
 * `motion` is never set for decoration — see styles/icons.css for the rule.
 */
export type IconName =
  | 'today' | 'future' | 'capture' | 'explore' | 'profile'
  | 'sleep' | 'steps' | 'heart' | 'plate' | 'training' | 'measure' | 'leaf' | 'bolt'
  | 'camera' | 'image' | 'plus' | 'minus' | 'check' | 'close' | 'chevron' | 'back'
  | 'trash' | 'link' | 'unlink' | 'sync' | 'lock' | 'info' | 'ai' | 'play' | 'clock'
  | 'sun' | 'moon' | 'phone' | 'watch' | 'ring' | 'scale' | 'lab' | 'note'
  | 'bell' | 'sound' | 'external' | 'flag'
  | 'search' | 'filter' | 'bookmark' | 'more' | 'mic' | 'arrow-up' | 'chevron-down'
  | 'target' | 'sprout' | 'shield' | 'sparkles' | 'settings' | 'signout'
  | 'list' | 'cutlery' | 'bowl' | 'cloche' | 'apple'

type Motion = 'none' | 'idle' | 'active' | 'celebrate'

const PATHS: Record<IconName, string> = {
  settings: 'M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z M19.3 14.6a1.5 1.5 0 0 0 .3 1.66l.05.05a1.9 1.9 0 1 1-2.69 2.69l-.05-.05a1.5 1.5 0 0 0-1.66-.3 1.5 1.5 0 0 0-.91 1.38v.14a1.9 1.9 0 0 1-3.8 0v-.07a1.5 1.5 0 0 0-.98-1.38 1.5 1.5 0 0 0-1.66.3l-.05.05a1.9 1.9 0 1 1-2.69-2.69l.05-.05a1.5 1.5 0 0 0 .3-1.66 1.5 1.5 0 0 0-1.38-.91H4a1.9 1.9 0 0 1 0-3.8h.07a1.5 1.5 0 0 0 1.38-.98 1.5 1.5 0 0 0-.3-1.66l-.05-.05a1.9 1.9 0 1 1 2.69-2.69l.05.05a1.5 1.5 0 0 0 1.66.3h.07a1.5 1.5 0 0 0 .91-1.38V4a1.9 1.9 0 0 1 3.8 0v.07a1.5 1.5 0 0 0 .91 1.38 1.5 1.5 0 0 0 1.66-.3l.05-.05a1.9 1.9 0 1 1 2.69 2.69l-.05.05a1.5 1.5 0 0 0-.3 1.66v.07a1.5 1.5 0 0 0 1.38.91H20a1.9 1.9 0 0 1 0 3.8h-.07a1.5 1.5 0 0 0-1.38.91Z',
  signout: 'M15.4 8.1V6.4A2.4 2.4 0 0 0 13 4H6.4A2.4 2.4 0 0 0 4 6.4v11.2A2.4 2.4 0 0 0 6.4 20H13a2.4 2.4 0 0 0 2.4-2.4v-1.7M10.8 12h9.3M17.2 8.8 20.4 12l-3.2 3.2',
  today: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM4 9.2h16M8 3v3M16 3v3',
  future: 'M3.5 18.5c3.6 0 5-3.4 6.9-7C12.4 7.6 14.6 4.5 20.5 4.5M15.8 4.5h4.7v4.7',
  capture: 'M12 5v14M5 12h14',
  explore: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15 9l-1.7 4.3-4.3 1.7L10.7 10.7 15 9Z',
  profile: 'M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2ZM4.8 20.2c1-3.3 3.7-5.2 7.2-5.2s6.2 1.9 7.2 5.2',
  sleep: 'M20 14.4A8.3 8.3 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4Z',
  steps: 'M7.4 20.6 10 12 7.3 9.7a2.4 2.4 0 0 1-.5-3.1L8.2 4.4M13 20.6l1.9-5.5-3.3-2.7 1.4-4.5M9.5 8.3l4.1-1.3 2.7 3.1 2.9.6M15.7 5.1a1.65 1.65 0 1 0 0-3.3 1.65 1.65 0 0 0 0 3.3Z',
  heart: 'M12 20.3s-7.4-4.4-7.4-9.5A4.3 4.3 0 0 1 12 8.1a4.3 4.3 0 0 1 7.4 2.7c0 5.1-7.4 9.5-7.4 9.5Z',
  plate: 'M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2ZM12 16.4a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8Z',
  training: 'M3.4 10.4v3.2M6.6 7.8v8.4M17.4 7.8v8.4M20.6 10.4v3.2M6.6 12h10.8',
  measure: 'M3.4 9.4h17.2v5.2H3.4zM7 9.4v3.1M11 9.4v3.1M15 9.4v3.1M19 9.4v3.1',
  leaf: 'M4.8 19.2c0-7.2 4.6-11.2 14.4-11.2 0 8.2-4.4 11.8-9.3 11.8-2.6 0-5.1-1-5.1-.6ZM8.4 15.6C10 13 12.6 11.4 15.2 10.9',
  bolt: 'M13.6 2.8 6 13.6h5.2L10.4 21.2 18 10.4h-5.2l.8-7.6Z',
  camera: 'M3.6 8.4h3.2l1.5-2.3h7.4l1.5 2.3h3.2a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V9.4a1 1 0 0 1 1-1ZM12 16.6a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  image: 'M3.6 5.4h16.8v13.2H3.6zM3.6 15.6l4.2-4 3.4 3.2 3.6-3.9 5.6 5.3M8.4 10a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4.6 12.6 9.5 17.5 19.4 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9.4 5.4 16 12l-6.6 6.6',
  back: 'M14.6 5.4 8 12l6.6 6.6',
  trash: 'M4.4 6.9h15.2M9.4 6.9V4.4h5.2v2.5M6.4 6.9l1 12.7h9.2l1-12.7',
  link: 'M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7L11.5 6.9M14 10a4 4 0 0 0-5.7 0L5.5 12.8a4 4 0 1 0 5.7 5.7l1.3-1.3',
  unlink: 'M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L4 10M15 9l1.5-1.5a3.5 3.5 0 0 0-5-5L10 4M4 4l16 16',
  sync: 'M20.2 12a8.2 8.2 0 1 1-2.5-5.9M20.2 3.6v4.7h-4.7',
  lock: 'M6.3 10.4h11.4v9.2H6.3zM8.9 10.4V7.7a3.1 3.1 0 0 1 6.2 0v2.7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.6M12 7.6v.7',
  ai: 'M12 3.2 13.8 8.9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.7-5.7-1.8 5.7-1.8L12 3.2ZM18.9 16.4l.7 2.2 2.2.7-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.7.7-2.2Z',
  play: 'M8.4 5.6 18.2 12l-9.8 6.4V5.6Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 6.9v5.4l3.4 2',
  sun: 'M12 16.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2ZM12 2.4v2M12 19.6v2M4.1 4.1l1.4 1.4M18.5 18.5l1.4 1.4M2.4 12h2M19.6 12h2M4.1 19.9l1.4-1.4M18.5 5.5l1.4-1.4',
  moon: 'M20 14.4A8.3 8.3 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4Z',
  phone: 'M7.4 2.7h9.2a1.7 1.7 0 0 1 1.7 1.7v15.2a1.7 1.7 0 0 1-1.7 1.7H7.4a1.7 1.7 0 0 1-1.7-1.7V4.4a1.7 1.7 0 0 1 1.7-1.7ZM10.4 18.2h3.2',
  watch: 'M7.4 8.4h9.2v7.2H7.4zM9 8.4 9.5 3.8h5l.5 4.6M9 15.6l.5 4.6h5l.5-4.6',
  ring: 'M12 20.2a6.1 6.1 0 1 0 0-12.2 6.1 6.1 0 0 0 0 12.2ZM8.4 4.4h7.2',
  scale: 'M4.4 5.4h15.2v13.2H4.4zM12 9.4v2.6M9.4 9.7 12 12',
  lab: 'M9.8 3.4v6L5.3 18a2 2 0 0 0 1.8 3h9.8a2 2 0 0 0 1.8-3l-4.5-8.6v-6M8.3 3.4h7.4M7.8 14h8.4',
  note: 'M5.9 3.4h8.6L19 8v12.6H5.9V3.4ZM14.5 3.4V8h4.5M8.9 12.4h6.2M8.9 16h4.2',
  bell: 'M12 3.2a5.6 5.6 0 0 0-5.6 5.6c0 5-2 6.4-2 6.4h15.2s-2-1.4-2-6.4A5.6 5.6 0 0 0 12 3.2ZM10.3 19a2 2 0 0 0 3.4 0',
  sound: 'M11.2 5.2 6.8 9H3.4v6h3.4l4.4 3.8V5.2ZM15.4 9.4a3.6 3.6 0 0 1 0 5.2M18.2 6.8a7.4 7.4 0 0 1 0 10.4',
  external: 'M14.4 4.4h5.2v5.2M19.6 4.4 11 13M17 13.6v5a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 18.6V8.4A1.4 1.4 0 0 1 5.4 7h5',
  flag: 'M5.4 21V3.6h11.2l-1.9 4 1.9 4H5.4',
  search: 'M10.9 18.3a7.4 7.4 0 1 0 0-14.8 7.4 7.4 0 0 0 0 14.8ZM16.3 16.3 20.8 20.8',
  filter: 'M4 7.2h9M17.6 7.2h2.4M4 16.8h2.4M11 16.8h9M15.2 4.8v4.8M8.6 14.4v4.8',
  bookmark: 'M6.4 3.9h11.2v16.7L12 16.4l-5.6 4.2V3.9Z',
  more: 'M12 6.4v.02M12 12v.02M12 17.6v.02',
  mic: 'M12 3.4a2.7 2.7 0 0 0-2.7 2.7v6a2.7 2.7 0 0 0 5.4 0v-6A2.7 2.7 0 0 0 12 3.4ZM5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 18.2v3',
  'arrow-up': 'M12 20V4.4M5.4 11 12 4.4 18.6 11',
  'chevron-down': 'M5.4 9.4 12 16l6.6-6.6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2ZM12 13.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z',
  sprout: 'M12 21v-7.4M12 13.6C12 9.4 14.8 6.6 19 6.6c0 4.2-2.8 7-7 7ZM12 15.4c0-3.2-2-5.2-5.2-5.2 0 3.2 2 5.2 5.2 5.2Z',
  shield: 'M12 3.2 20 6v6.1c0 4.4-3.2 7.4-8 8.7-4.8-1.3-8-4.3-8-8.7V6l8-2.8ZM8.8 12.1l2.3 2.3 4.1-4.4',
  sparkles: 'M11 3.6l1.5 4.4 4.4 1.5-4.4 1.5L11 15.4 9.5 11 5.1 9.5 9.5 8 11 3.6ZM18.2 14.6l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3Z',

  /* The meal slots and the filter that shows all of them. Drawn on the same
     24 grid at the same stroke as everything else, so a row of six reads as
     one set rather than six borrowed marks. */
  list: 'M4.6 7.4h14.8M4.6 12h14.8M4.6 16.6h9.4',
  cutlery: 'M7.4 3.4v7.2M10.2 3.4v7.2M8.8 10.6V20.6M15.4 20.6v-6.4h-1.6V8.2c0-2.6 1.4-4.8 3.4-4.8v17.2',
  bowl: 'M3.8 11.6h16.4a8.2 8.2 0 0 1-8.2 8.2 8.2 8.2 0 0 1-8.2-8.2ZM12 8.8c0-2.8 2-4.6 4.8-4.6 0 2.8-2 4.6-4.8 4.6Z',
  cloche: 'M3.4 18.4h17.2M4.8 15.6a7.2 7.2 0 0 1 14.4 0ZM12 8.4V5.6M10.6 5.6h2.8',
  apple: 'M12 8.2c-1-1.1-2.4-1.7-3.8-1.7-2.6 0-4.6 2.3-4.6 5.6 0 4.2 3 8.4 5.4 8.4 1.1 0 1.9-.6 3-.6s1.9.6 3 .6c2.4 0 5.4-4.2 5.4-8.4 0-3.3-2-5.6-4.6-5.6-1.4 0-2.8.6-3.8 1.7ZM12 8.2V5.4M12 5.4c0-1.3 1.1-2.4 2.4-2.4',
}

/** Which icons carry their own motion class. */
const MOTION_CLASS: Partial<Record<IconName, string>> = {
  sleep: 'ico--sleep',
  heart: 'ico--heart',
  steps: 'ico--steps',
  training: 'ico--training',
  ai: 'ico--ai',
  camera: 'ico--camera',
  plate: 'ico--nutrition',
  measure: 'ico--measure',
}

export function Icon({
  name, size = 22, strokeWidth = 1.75, motion = 'none', className, style, title,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  motion?: Motion
  className?: string
  style?: React.CSSProperties
  title?: string
}) {
  const classes = [
    'ico',
    MOTION_CLASS[name] ?? '',
    motion === 'idle' ? 'is-idle' : motion === 'active' ? 'is-active' : motion === 'celebrate' ? 'is-celebrate' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={classes} style={style}
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}

/** The AI presence indicator. Only ever `working` while a request is in flight. */
export function AiOrb({
  working = false, size = 'md', label,
}: { working?: boolean; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  return (
    <span
      className={`ai-orb${size === 'sm' ? ' ai-orb--sm' : size === 'lg' ? ' ai-orb--lg' : ''}${working ? ' is-working' : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <Icon name="ai" size={size === 'sm' ? 15 : size === 'lg' ? 27 : 20} motion={working ? 'idle' : 'none'} />
    </span>
  )
}
