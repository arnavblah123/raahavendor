/**
 * Shrink a phone photo before it is uploaded.
 *
 * A modern phone camera produces 3–6 MB per shot. Supabase's free tier gives
 * 1 GB of storage, so at full size a few hundred order photos would exhaust
 * it. Resized to 1600px and saved as JPEG the same photo is ~200 KB, which is
 * still far more than a thumbnail on an order page needs.
 *
 * Browser-only: uses canvas. Falls back to the original file if anything in
 * the pipeline is unavailable, so an upload never fails just because of this.
 */

export const PHOTO_MAX_DIMENSION = 1600
export const PHOTO_JPEG_QUALITY = 0.82
/** Hard cap after resizing, matching the bucket's file_size_limit. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

export async function resizeImage(
  file: File,
  maxDimension = PHOTO_MAX_DIMENSION,
  quality = PHOTO_JPEG_QUALITY,
): Promise<Blob> {
  if (typeof document === 'undefined') return file

  try {
    const bitmap = await loadBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))

    // Already small enough and already a JPEG: nothing to do.
    if (scale === 1 && file.type === 'image/jpeg') return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    return blob ?? file
  } catch {
    return file
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap honours EXIF orientation, so portrait photos stay upright.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to the <img> route
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A storage path that cannot collide and needs no order id up front. */
export function newPhotoPath(mimeType = 'image/jpeg'): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  return `items/${id}.${ext}`
}
