/**
 * One icon system, one grid (24), one stroke weight (1.7). Icons never carry
 * meaning alone — every icon in the app is paired with a visible label or an
 * accessible name on its control.
 */
export type IconName =
  | 'today' | 'trajectory' | 'capture' | 'insights' | 'measure' | 'explore' | 'profile'
  | 'sleep' | 'steps' | 'heart' | 'flame' | 'plate' | 'dumbbell' | 'leaf'
  | 'camera' | 'plus' | 'minus' | 'check' | 'close' | 'chevron' | 'back' | 'edit' | 'trash'
  | 'link' | 'unlink' | 'sync' | 'lock' | 'info' | 'sparkle' | 'play' | 'clock'
  | 'sun' | 'moon' | 'phone' | 'watch' | 'ring' | 'scale' | 'lab' | 'note' | 'bolt'

const P: Record<IconName, string> = {
  today: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM4 9h16M8 3v3M16 3v3M8.5 13.5h3',
  trajectory: 'M4 18.5c3.4 0 4.6-3.2 6.4-6.6C12.2 8.4 14.2 5.5 20 5.5M15.6 5.5H20V10',
  capture: 'M12 5v14M5 12h14',
  insights: 'M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5 1 1.2 1 2v.5h4.8V16c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.5ZM9.6 20.5h4.8',
  measure: 'M3.5 9.5h17v5h-17zM7 9.5v3M11 9.5v3M15 9.5v3M19 9.5v3',
  explore: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM14.9 9.1l-1.6 4.2-4.2 1.6 1.6-4.2 4.2-1.6Z',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20c.9-3.2 3.6-5 7-5s6.1 1.8 7 5',
  sleep: 'M20 14.3A8.2 8.2 0 0 1 9.7 4 8.5 8.5 0 1 0 20 14.3Z',
  steps: 'M7.5 20.5 10 12l-2.6-2.2a2.4 2.4 0 0 1-.5-3l1.3-2M13 20.5l1.8-5.4-3.2-2.6 1.4-4.4M9.6 8.4l4-1.3 2.6 3 2.8.6M15.6 5.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
  heart: 'M12 20s-7.3-4.3-7.3-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.3 2.7C19.3 15.7 12 20 12 20Z',
  flame: 'M12 21c3.3 0 5.6-2.2 5.6-5.2 0-3.6-3.4-4.9-2.6-9.3-2.3.6-3.6 2.5-3.6 4.4 0 1.2-.7 1.8-1.4 1.8s-1.3-.6-1.3-1.7c0-.6.1-1 .3-1.6C7.4 11 6.4 13.2 6.4 15.6 6.4 18.7 8.7 21 12 21Z',
  plate: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z',
  dumbbell: 'M3.5 10.5v3M6.5 8v8M17.5 8v8M20.5 10.5v3M6.5 12h11',
  leaf: 'M5 19c0-7 4.5-11 14-11 0 8-4.3 11.5-9 11.5-2.6 0-5-1-5-.5ZM8.5 15.5C10 13 12.5 11.5 15 11',
  camera: 'M4 8.5h3l1.4-2.2h7.2L17 8.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM12 16.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4.8 12.6 9.6 17.4 19.2 6.6',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9.5 5.5 16 12l-6.5 6.5',
  back: 'M14.5 5.5 8 12l6.5 6.5',
  edit: 'M4 20h4l10-10-4-4L4 16v4ZM14 6l4 4',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7',
  link: 'M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7L11.5 6.9M14 10a4 4 0 0 0-5.7 0L5.5 12.8a4 4 0 1 0 5.7 5.7l1.3-1.3',
  unlink: 'M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L4 10M15 9l1.5-1.5a3.5 3.5 0 0 0-5-5L10 4M4 4l16 16',
  sync: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5',
  lock: 'M6.5 10.5h11v9h-11v-9ZM9 10.5V7.8a3 3 0 0 1 6 0v2.7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.7v.6',
  sparkle: 'M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5ZM18.5 16l.7 2.2 2.2.7-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.7.7-2.2Z',
  play: 'M8.5 5.8 18 12l-9.5 6.2V5.8Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.3 2',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M20 14.3A8.2 8.2 0 0 1 9.7 4 8.5 8.5 0 1 0 20 14.3Z',
  phone: 'M7.5 2.8h9a1.7 1.7 0 0 1 1.7 1.7v15a1.7 1.7 0 0 1-1.7 1.7h-9a1.7 1.7 0 0 1-1.7-1.7v-15a1.7 1.7 0 0 1 1.7-1.7ZM10.5 18h3',
  watch: 'M7.5 8.5h9v7h-9v-7ZM9 8.5 9.5 4h5l.5 4.5M9 15.5 9.5 20h5l.5-4.5',
  ring: 'M12 20a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 20a6 6 0 1 0 0-12M8.5 4.5h7',
  scale: 'M4.5 5.5h15v13h-15v-13ZM12 9.5v2.5M9.5 9.8 12 12',
  lab: 'M10 3.5v6L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9.5v-6M8.5 3.5h7M8 14h8',
  note: 'M6 3.5h8.5L19 8v12.5H6V3.5ZM14 3.5V8h5M9 12.5h6M9 16h4',
  bolt: 'M13.5 3 6 13.5h5L10.5 21 18 10.5h-5L13.5 3Z',
}

const FILLED: IconName[] = []

export function Icon({
  name, size = 22, strokeWidth = 1.7, className, style,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
}) {
  const filled = FILLED.includes(name)
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={className} style={style}
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <path d={P[name]} />
    </svg>
  )
}
