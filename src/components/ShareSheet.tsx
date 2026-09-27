import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Sheet, useToast } from './UI'
import { canShareImage, saveImage, shareImage } from '../lib/share'
import { cardFilename, drawShareCard, type ShareCard } from '../lib/shareCard'
import { haptic } from '../lib/feedback'

/**
 * Showing the card before it goes anywhere.
 *
 * The preview is not decoration. What gets shared is a picture of your
 * health, and the last chance to decide against that has to come before the
 * share sheet opens, not after Instagram already has the file.
 *
 * On what the buttons can promise: the web cannot hand a picture straight
 * to Instagram Stories — see lib/share.ts for why — so the button opens the
 * phone's own share sheet and Instagram is one of the things in it. The
 * label says "Share" rather than "Share to Instagram", because a button
 * that names an app it cannot actually open is a small lie told every time
 * somebody taps it.
 */
export function ShareSheet({
  card, open, onClose,
}: {
  card: ShareCard | null
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // Draw it when the sheet opens, and let the preview go when it closes so
  // a 1080×1920 bitmap is not held for a sheet nobody is looking at.
  useEffect(() => {
    if (!open || !card) return
    let live = true
    let made: string | null = null
    setFailed(false)
    setBlob(null)
    setUrl(null)

    void drawShareCard(card)
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
  }, [open, card])

  if (!card) return null

  const name = cardFilename(card)
  const sheetAvailable = canShareImage()

  const send = async () => {
    if (!blob || busy) return
    setBusy(true)
    const how = await shareImage(blob, name)
    setBusy(false)
    if (how === 'shared') haptic('success')
    if (how === 'saved') toast({ text: 'Card saved. Open Instagram and add it to a story.', icon: 'check' })
    if (how === 'failed') toast({ text: 'The card could not be shared. Try saving it instead.', icon: 'info' })
  }

  const keep = () => {
    if (!blob) return
    haptic('selection')
    if (saveImage(blob, name)) toast({ text: 'Card saved to your downloads', icon: 'check' })
    else toast({ text: 'The card could not be saved.', icon: 'info' })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share this"
      subtitle={sheetAvailable
        ? 'Opens your phone’s share sheet — pick Instagram from there.'
        : 'This browser has no share sheet, so the card saves to your downloads.'}
      footer={
        <>
          <button className="btn btn--secondary" onClick={keep} disabled={!blob}>
            <Icon name="image" size={16} /> Save
          </button>
          <button className="btn btn--primary grow" onClick={() => void send()} disabled={!blob || busy}>
            {busy ? 'One moment…' : <><Icon name="external" size={16} /> Share</>}
          </button>
        </>
      }
    >
      <div className="share-preview">
        {failed ? (
          <p className="t-callout dim" role="status">
            The card could not be drawn on this device. Nothing was shared.
          </p>
        ) : url ? (
          <img src={url} alt="The card that will be shared" className="share-preview__img" />
        ) : (
          <div className="share-preview__wait" role="status" aria-label="Drawing your card" />
        )}
      </div>
    </Sheet>
  )
}
