/**
 * Shrinks a captured photograph to something a meal entry can carry.
 *
 * The camera hands back a 1600px JPEG, which is around a third of a megabyte
 * once base64 encoded — a dozen meals would exhaust localStorage. What the
 * meal card needs is a small square, so the image is centre-cropped and
 * re-encoded, typically landing under 20 kB.
 */
const SIZE = 256
const QUALITY = 0.72

export function makeThumbnail(dataUrl: string, size = SIZE): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const g = canvas.getContext('2d')
        if (!g) { resolve(undefined); return }

        // Centre crop to a square, so the plate stays in frame.
        const side = Math.min(img.width, img.height)
        g.drawImage(
          img,
          (img.width - side) / 2, (img.height - side) / 2, side, side,
          0, 0, size, size,
        )
        resolve(canvas.toDataURL('image/jpeg', QUALITY))
      } catch {
        // A tainted canvas or a browser without toDataURL: the meal simply
        // saves without a picture rather than failing.
        resolve(undefined)
      }
    }
    img.onerror = () => resolve(undefined)
    img.src = dataUrl
  })
}
