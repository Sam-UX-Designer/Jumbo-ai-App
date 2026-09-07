import { useRef, useState } from 'react'
import '../styles/assets.css'
import { ASSETS, assetUrl, providerAsset, type AssetKey } from '../lib/assets'
import { useStore } from '../state/store'
import { useNavigate } from './Nav'
import { Icon, type IconName } from './Icon'
import { haptic } from '../lib/feedback'

/* ============================================================
   Every image in Jumbo comes through here.

   Artwork is still being produced, so each slot ships a marked
   placeholder from `public/assets` (see src/lib/assets.ts). If a file
   is missing or fails to load, the slot collapses to a calm empty
   surface rather than a broken-image glyph — a half-drawn screen is
   worse than a plain one.
   ============================================================ */

export function AssetImage({
  asset, src, alt, width, height, className, style, rounded = 'card', loading = 'lazy',
}: {
  /** The declared slot. Its file is used unless `src` overrides it. */
  asset: AssetKey
  /** A real image for this slot — a user's photo, a YouTube thumbnail. */
  src?: string | null
  /** Overrides the asset's default alt. Pass "" for decoration. */
  alt?: string
  width?: number
  height?: number
  className?: string
  style?: React.CSSProperties
  rounded?: 'none' | 'card' | 'tile' | 'circle'
  loading?: 'lazy' | 'eager'
}) {
  const [failed, setFailed] = useState(false)
  const def = ASSETS[asset]
  const url = src || assetUrl(asset)
  const label = alt ?? def.alt
  const classes = ['asset', `asset--${rounded}`, className ?? ''].filter(Boolean).join(' ')

  // Reset the failure flag when the source changes, so a retry is possible.
  const [seen, setSeen] = useState(url)
  if (seen !== url) { setSeen(url); setFailed(false) }

  if (failed) {
    return <span className={`${classes} asset--missing`} style={{ width, height, ...style }} aria-hidden="true" />
  }

  return (
    <img
      className={classes}
      src={url}
      alt={label}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      style={style}
      onError={() => setFailed(true)}
    />
  )
}

/* ------------------------------------------------------------------ brand */

/** The app mark, at whatever size the surface needs. */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <AssetImage
      asset="brandMark" alt="Jumbo" width={size} height={size} rounded="tile" loading="eager"
      className={className} style={{ width: size, height: size }}
    />
  )
}

export function BrandWordmark({ height = 34 }: { height?: number }) {
  return (
    <AssetImage
      asset="brandWordmark" alt="Jumbo" height={height} rounded="none" loading="eager"
      className="brand-wordmark" style={{ height }}
    />
  )
}

/* ----------------------------------------------------------------- mascot */

/**
 * The AI mascot, in the circular area the design reserves for it.
 * `thinking` is only ever true while a request is genuinely in flight.
 */
export function Mascot({
  size = 92, thinking = false, onClick, label,
}: { size?: number; thinking?: boolean; onClick?: () => void; label?: string }) {
  const art = (
    <AssetImage
      asset="mascot" alt={onClick ? '' : label ?? ''} width={size} height={size}
      rounded="circle" loading="eager" style={{ width: '86%', height: '86%' }}
    />
  )
  const classes = `mascot${thinking ? ' is-thinking' : ''}`

  if (!onClick) {
    return (
      <span className={classes} style={{ width: size, height: size }} role={label ? 'img' : undefined}
        aria-label={label} aria-hidden={label ? undefined : 'true'}>
        {art}
      </span>
    )
  }

  return (
    <button
      type="button" className={classes} style={{ width: size, height: size }}
      aria-label={label ?? 'Jumbo, your health companion'}
      onClick={() => { haptic('selection'); onClick() }}
    >
      {art}
    </button>
  )
}

/* ----------------------------------------------------------------- people */

/** A profile photo. Falls back to the placeholder until one is chosen. */
export function Avatar({
  size = 40, photo, name, className,
}: { size?: number; photo?: string | null; name?: string; className?: string }) {
  return (
    <AssetImage
      asset="avatar"
      src={photo || undefined}
      alt={photo ? `${name?.trim() || 'Your'} profile photo` : ''}
      width={size} height={size} rounded="circle" loading="eager"
      className={`avatar ${className ?? ''}`.trim()}
      style={{ width: size, height: size }}
    />
  )
}

/**
 * The avatar in its permanent home: the top right of every top-level screen.
 * Tapping it opens the profile.
 */
export function AvatarButton({ size = 40 }: { size?: number }) {
  const { state } = useStore()
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="avatar-btn"
      aria-label="Open your profile"
      onClick={() => { haptic('selection'); navigate('you') }}
    >
      <Avatar size={size} photo={state.profile.photo} name={state.profile.name} />
    </button>
  )
}

/* --------------------------------------------------------- source logos */

/**
 * A health source's logo. Falls back to Jumbo's own icon for a provider with
 * no artwork of its own — the app never guesses at a company's mark.
 */
export function SourceLogo({
  providerId, connected = false, fallbackIcon = 'link', size = 42,
}: { providerId: string; connected?: boolean; fallbackIcon?: IconName; size?: number }) {
  const key = providerAsset(providerId)

  if (key) {
    return (
      <AssetImage
        asset={key} alt="" width={size} height={size} rounded="tile"
        className="source-logo" style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      className="source-logo"
      style={{
        width: size, height: size, display: 'grid', placeItems: 'center',
        background: connected ? 'var(--brand-dim)' : 'var(--surface-2)',
        color: connected ? 'var(--brand)' : 'var(--ink-3)',
      }}
      aria-hidden="true"
    >
      <Icon name={fallbackIcon} size={Math.round(size * 0.48)} />
    </span>
  )
}

/* --------------------------------------------------- profile photo picker */

/** The largest edge a stored profile photo is kept at. */
const PHOTO_EDGE = 256

/**
 * Reads a chosen file, scales it to a square thumbnail and returns it as a
 * data URL. Everything happens in the page — the original file is never
 * uploaded, and only the thumbnail is kept.
 */
function toSquareThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const edge = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = PHOTO_EDGE
      canvas.height = PHOTO_EDGE
      const g = canvas.getContext('2d')
      if (!g) { reject(new Error('This browser cannot resize the image.')); return }
      g.drawImage(
        img,
        (img.width - edge) / 2, (img.height - edge) / 2, edge, edge,
        0, 0, PHOTO_EDGE, PHOTO_EDGE,
      )
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')) }
    img.src = url
  })
}

/**
 * The profile photo on the You screen, and the way to change it.
 * The spec asks for a real photo treatment rather than a letter avatar.
 */
export function ProfilePhotoPicker({
  size = 64, onError,
}: { size?: number; onError?: (message: string) => void }) {
  const { state, dispatch } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const photo = state.profile.photo

  const choose = async (file: File | undefined) => {
    if (!file) return
    try {
      const photoUrl = await toSquareThumbnail(file)
      dispatch({ type: 'setProfile', profile: { photo: photoUrl } })
      haptic('success')
    } catch (err) {
      onError?.((err as Error).message)
    }
  }

  // A narrow column, so the photo never crowds the name beside it.
  return (
    <span className="stack stack-1" style={{ alignItems: 'center', flex: 'none' }}>
      <button
        type="button"
        className="photo-edit"
        aria-label={photo ? 'Change your profile photo' : 'Add a profile photo'}
        onClick={() => { haptic('selection'); input.current?.click() }}
      >
        <Avatar size={size} photo={photo} name={state.profile.name} />
        <span className="photo-edit__badge" aria-hidden="true">
          <Icon name="camera" size={13} strokeWidth={2} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }}
      />
      {photo && (
        <button
          className="btn btn--ghost btn--sm"
          style={{ paddingInline: 'var(--s-2)' }}
          aria-label="Remove your profile photo"
          onClick={() => dispatch({ type: 'setProfile', profile: { photo: null } })}
        >
          Remove
        </button>
      )}
    </span>
  )
}
