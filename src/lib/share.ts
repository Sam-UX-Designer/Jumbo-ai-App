/**
 * Getting the card out of Jumbo and into Instagram.
 *
 * Instagram's own "share to Stories" hook is `instagram-stories://share`,
 * and it is not available here: it needs URL schemes declared in a native
 * app's Info.plist and, since October 2022, a Facebook App ID passed with
 * the request. None of that exists in a browser tab. Any code claiming to
 * open Instagram Stories directly from a web page either does nothing or
 * lands the person on instagram.com.
 *
 * So Jumbo uses the share sheet the phone already has. `navigator.share`
 * with a file opens iOS and Android's own sheet, Instagram is in it, and
 * picking it hands the image over exactly as the camera roll would. That is
 * one tap more than a native app would need, and it is the honest maximum
 * from the web. When Jumbo ships as a native app this is the one function
 * that changes.
 *
 * Where there is no share sheet — most desktop browsers — the image is
 * saved instead, which is the same two steps in the other order.
 */

export type ShareOutcome =
  /** Handed to the share sheet. What happened next is between them and it. */
  | 'shared'
  /** No share sheet here, so the image went to their downloads. */
  | 'saved'
  /** They backed out of the sheet. Not an error, and not worth a message. */
  | 'cancelled'
  | 'failed'

/**
 * Whether this browser can hand a file to the phone's share sheet.
 *
 * Checked with a real file rather than by sniffing the browser, because
 * `navigator.share` existing says nothing about whether it takes files —
 * several browsers have the method and refuse anything but a URL.
 */
export function canShareImage(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false
  try {
    const probe = new File([new Blob([''], { type: 'image/png' })], 'probe.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export async function shareImage(
  blob: Blob,
  filename: string,
  text?: string,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' })

  if (canShareImage()) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (err) {
      // Backing out of the sheet throws, and is not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      console.error('[jumbo] share', err)
      // Fall through: saving still gets them the picture.
    }
  }

  return saveImage(blob, filename) ? 'saved' : 'failed'
}

/** Put the image in their downloads, for when there is no share sheet. */
export function saveImage(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on the next tick: doing it immediately cancels the download
    // in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch (err) {
    console.error('[jumbo] save image', err)
    return false
  }
}
