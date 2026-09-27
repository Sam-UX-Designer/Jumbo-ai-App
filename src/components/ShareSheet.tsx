import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Sheet, useToast } from './UI'
import { canShareImage, shareImage } from '../lib/share'
import { cardFilename, drawShareCard, type ShareCard } from '../lib/shareCard'
import { haptic } from '../lib/feedback'

/**
 * Making the story before it goes anywhere.
 *
 * The card is a widget, not a poster: the thing worth posting is their own
 * photograph, with Jumbo's card sitting on it. So the first control here
 * is "add a photo", and the preview shows the two together.
 *
 * Two ways out, because the web gives no way to place a sticker inside
 * Instagram automatically:
 *
 *   Share    the whole 1080x1920 story to the phone's share sheet, where
 *            Instagram takes it as a story background. One flow, done.
 *   Sticker  the card alone on transparency, saved to the camera roll, to
 *            place over a story by hand the way Apple's widgets are.
 *
 * The preview is not decoration. What gets shared is a picture of somebody's
 * health, and the last chance to decide against that has to come before the
 * share sheet opens, not after Instagram already has the file.
 */
export function ShareSheet({
  card, open, onClose,
}: {
  card: ShareCard | null
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const pick = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  /**
   * Whether a card about food carries its calorie total.
   *
   * Off until asked for. The research on diet trackers points at
   * calorie-forward design as the part that harms people already
   * vulnerable to disordered eating, and a card is the worst place to lead
   * with a number: it leaves the app and is seen by people who never chose
   * to look at it. So the plate leads, and the figure is something a
   * person adds to their own post on purpose.
   */
  const [calories, setCalories] = useState(false)

  // Forget the photograph when the sheet closes. Carrying it to the next
  // thing they share would put last week's run behind tonight's dinner.
  useEffect(() => { if (!open) { setPhoto(null); setCalories(false) } }, [open])

  // Redraw whenever the card or its backdrop changes, and let the preview
  // go afterwards so a 1080x1920 bitmap is not held for a closed sheet.
  useEffect(() => {
    if (!open || !card) return
    let live = true
    let made: string | null = null
    setFailed(false)
    setBlob(null)
    setUrl(null)

    void drawShareCard(card, { background: photo ?? undefined, calories })
      .then((b) => {
        if (!live) return
        made = URL.createObjectURL(b)
        setBlob(b)
        setUrl(made)
      })
      .catch((err) => {
        console.error('[jumbo] share card', err)
        if (live) setFailed(true)
      })

    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [open, card, photo, calories])

  if (!card) return null

  const sheetAvailable = canShareImage()

  const choose = async (file: File | undefined) => {
    if (!file) return
    const small = await downscale(file)
    if (small) { haptic('selection'); setPhoto(small) }
    else toast({ text: 'That picture could not be read.', icon: 'info' })
  }

  const send = async () => {
    if (!blob || busy) return
    setBusy(true)
    const how = await shareImage(blob, cardFilename(card))
    setBusy(false)
    if (how === 'shared') haptic('success')
    if (how === 'saved') toast({ text: 'Saved. Open Instagram and add it to a story.', icon: 'check' })
    if (how === 'failed') toast({ text: 'That could not be shared. Try saving it instead.', icon: 'info' })
  }

  /** The card alone, transparent, to place over a story by hand. */
  const sticker = async () => {
    if (busy) return
    setBusy(true)
    try {
      const b = await drawShareCard(card, { stickerOnly: true, calories })
      const how = await shareImage(b, cardFilename(card, true))
      if (how === 'saved') {
        toast({ text: 'Sticker saved. Add it over your story photo in Instagram.', icon: 'check' })
      } else if (how === 'shared') {
        haptic('success')
      } else if (how === 'failed') {
        toast({ text: 'The sticker could not be saved.', icon: 'info' })
      }
    } catch (err) {
      console.error('[jumbo] sticker', err)
      toast({ text: 'The sticker could not be drawn.', icon: 'info' })
    }
    setBusy(false)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share this"
      subtitle={sheetAvailable
        ? 'Add your own photo, then pick Instagram from your phone’s share sheet.'
        : 'This browser has no share sheet, so it saves to your downloads.'}
      footer={
        <>
          <button className="btn btn--secondary" onClick={() => void sticker()} disabled={busy}>
            <Icon name="image" size={16} /> Sticker
          </button>
          <button className="btn btn--primary grow" onClick={() => void send()} disabled={!blob || busy}>
            {busy ? 'One moment…' : <><Icon name="external" size={16} /> Share</>}
          </button>
        </>
      }
    >
      <div className="stack stack-4">
        <div className="share-preview">
          {failed ? (
            <p className="t-callout dim" role="status">
              The card could not be drawn on this device. Nothing was shared.
            </p>
          ) : url ? (
            <img src={url} alt="The story that will be shared" className="share-preview__img" />
          ) : (
            <div className="share-preview__wait" role="status" aria-label="Drawing your card" />
          )}
        </div>

        <div className="row" style={{ gap: 'var(--s-3)', justifyContent: 'center' }}>
          <button className="btn btn--secondary btn--sm" onClick={() => pick.current?.click()}>
            <Icon name="camera" size={15} /> {photo ? 'Change photo' : 'Add your photo'}
          </button>
          {photo && (
            <button className="btn btn--ghost btn--sm" onClick={() => { haptic('selection'); setPhoto(null) }}>
              Remove
            </button>
          )}
        </div>

        {/* Only a card about food has a number worth withholding. */}
        {card.kind === 'meals' && (
          <label className="share-opt">
            <input
              type="checkbox" checked={calories}
              onChange={(e) => { haptic('selection'); setCalories(e.target.checked) }}
            />
            <span className="stack stack-1">
              <span className="t-callout">Show the calorie total</span>
              <span className="t-caption dim2">
                Off by default. The food is the post; the number is yours to
                add if you want it.
              </span>
            </span>
          </label>
        )}

        <p className="t-caption dim2" style={{ textAlign: 'center' }}>
          {photo
            ? 'Your photo, with the card on top.'
            : 'Add a photo and the card sits on top of it, like a widget.'}
        </p>

        <input
          ref={pick} type="file" accept="image/*" hidden
          onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>
    </Sheet>
  )
}

/**
 * A phone photograph is four thousand pixels wide and several megabytes.
 * It is about to be drawn into a 1080-wide frame, so it is shrunk first —
 * holding the original as a data URL is how a share sheet runs a phone out
 * of memory.
 */
async function downscale(file: File, max = 1600): Promise<string | null> {
  const src = await new Promise<string | null>((ok) => {
    const fr = new FileReader()
    fr.onload = () => ok(typeof fr.result === 'string' ? fr.result : null)
    fr.onerror = () => ok(null)
    fr.readAsDataURL(file)
  })
  if (!src) return null

  const img = await new Promise<HTMLImageElement | null>((ok) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => ok(null)
    i.src = src
  })
  if (!img) return null
  if (img.width <= max && img.height <= max) return src

  const scale = max / Math.max(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  const g = c.getContext('2d')
  if (!g) return src
  g.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.86)
}
