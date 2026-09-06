import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { haptic, playSound } from '../lib/feedback'

export type CameraStatus =
  | 'idle'          // not started yet
  | 'starting'      // permission prompt is up / stream negotiating
  | 'live'          // preview is running
  | 'denied'        // the person said no
  | 'unavailable'   // no camera, or the browser will not allow one here
  | 'error'

export interface Capture {
  base64: string
  mediaType: string
  dataUrl: string
  width: number
  height: number
}

interface Props {
  onCapture: (c: Capture) => void
  /** Shown under the frame. Keep it short. */
  hint?: string
}

/**
 * A real device camera.
 *
 * The video element is always mounted, never conditionally rendered — that is
 * what makes the preview appear. Attaching a MediaStream requires the element
 * to exist at the moment the stream resolves, and `playsinline` + `muted` are
 * both required before iOS Safari will show a preview at all.
 */
export function Camera({ onCapture, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<CameraStatus>('idle')
  const [detail, setDetail] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async (mode: 'environment' | 'user' = facing) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      setDetail(
        window.isSecureContext === false
          ? 'Browsers only allow camera access over HTTPS or on localhost.'
          : 'This browser does not expose a camera to web pages.',
      )
      return
    }

    setStatus('starting')
    setDetail(null)
    stop()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) {                       // the element must already be mounted
        stream.getTracks().forEach((t) => t.stop())
        setStatus('error')
        setDetail('The preview surface was not ready. Try again.')
        return
      }

      video.srcObject = stream
      video.setAttribute('playsinline', 'true')   // belt and braces for iOS
      video.muted = true
      try {
        await video.play()
      } catch {
        // Some browsers reject play() outside a gesture. The stream is live,
        // so surface a tap-to-start rather than a dead frame.
        setStatus('error')
        setDetail('Tap to start the preview.')
        return
      }
      setStatus('live')
    } catch (err) {
      const e = err as DOMException
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        setStatus('denied')
        setDetail('Camera access was declined. You can allow it in your browser’s site settings, or pick a photo instead.')
      } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
        setStatus('unavailable')
        setDetail('No camera was found on this device.')
      } else if (e.name === 'NotReadableError') {
        setStatus('error')
        setDetail('Another app is using the camera. Close it and try again.')
      } else {
        setStatus('error')
        setDetail(e.message || 'The camera could not be started.')
      }
    }
  }, [facing, stop])

  // Start once on mount, and always release the stream on the way out.
  useEffect(() => {
    void start()
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shoot = () => {
    const video = videoRef.current
    if (!video || status !== 'live') return

    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return

    // Cap the long edge: a 4K frame is a slow upload and adds nothing here.
    const scale = Math.min(1, 1600 / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const g = canvas.getContext('2d')
    if (!g) return
    if (facing === 'user') { g.translate(canvas.width, 0); g.scale(-1, 1) }
    g.drawImage(video, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    haptic('impactMedium')
    playSound('capture')
    setFlash(true)
    window.setTimeout(() => setFlash(false), 320)
    stop()
    setStatus('idle')

    onCapture({
      dataUrl,
      base64: dataUrl.split(',')[1] ?? '',
      mediaType: 'image/jpeg',
      width: canvas.width,
      height: canvas.height,
    })
  }

  const pickFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const img = new Image()
      img.onload = () => {
        haptic('impactLight')
        stop()
        setStatus('idle')
        onCapture({
          dataUrl,
          base64: dataUrl.split(',')[1] ?? '',
          mediaType: file.type || 'image/jpeg',
          width: img.width,
          height: img.height,
        })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const blocked = status === 'denied' || status === 'unavailable' || status === 'error'

  return (
    <div className="stack stack-4">
      <div className="camera">
        {/* Always mounted. This is what makes the preview work. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
            opacity: status === 'live' ? 1 : 0,
            transition: 'opacity var(--d-base) var(--ease)',
          }}
        />

        {status !== 'live' && (
          <div className="camera__state">
            {status === 'starting' ? (
              <div className="stack stack-3" style={{ alignItems: 'center' }}>
                <span className="spinner" style={{ width: 24, height: 24 }} aria-hidden="true" />
                <span className="t-caption">Opening the camera…</span>
              </div>
            ) : blocked ? (
              <div className="stack stack-3" style={{ alignItems: 'center', maxWidth: '30ch', textAlign: 'center' }}>
                <Icon name="camera" size={26} />
                <span className="t-callout strong">
                  {status === 'denied' ? 'Camera access declined'
                    : status === 'unavailable' ? 'No camera available here'
                    : 'The camera did not start'}
                </span>
                <span className="t-caption" style={{ opacity: 0.8 }}>{detail}</span>
                <div className="row" style={{ gap: 'var(--s-2)' }}>
                  <button className="btn btn--secondary btn--sm" onClick={() => void start()}>Try again</button>
                  <button className="btn btn--primary btn--sm" onClick={() => fileRef.current?.click()}>
                    <Icon name="image" size={14} /> Choose a photo
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn--secondary" onClick={() => void start()}>
                <Icon name="camera" size={16} /> Start camera
              </button>
            )}
          </div>
        )}

        {status === 'live' && (
          <>
            <span className="camera__frame" aria-hidden="true" />
            {hint && <span className="camera__hint">{hint}</span>}
          </>
        )}
        <span className={`camera__flash${flash ? ' is-on' : ''}`} aria-hidden="true" />
      </div>

      <div className="camera__controls">
        <button
          className="icon-btn icon-btn--edge"
          aria-label="Choose an existing photo"
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="image" size={20} />
        </button>

        <button
          className="shutter"
          onClick={shoot}
          disabled={status !== 'live'}
          aria-label="Take photo"
        >
          <span className="shutter__core" aria-hidden="true" />
        </button>

        <button
          className="icon-btn icon-btn--edge"
          aria-label="Switch camera"
          disabled={status !== 'live'}
          onClick={() => {
            const next = facing === 'environment' ? 'user' : 'environment'
            setFacing(next)
            haptic('selection')
            void start(next)
          }}
        >
          <Icon name="sync" size={20} />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pickFile(f)
          e.target.value = ''
        }}
      />

      <p className="t-caption dim2" style={{ textAlign: 'center' }} role="status">
        {status === 'live'
          ? 'The photo is sent to Jumbo’s AI for analysis and is not stored afterwards.'
          : status === 'denied'
            ? 'Nothing is captured without your permission.'
            : ' '}
      </p>
    </div>
  )
}
