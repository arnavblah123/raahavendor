'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Images, Loader2, Trash2 } from 'lucide-react'
import { PHOTO_ACCEPT } from '@/lib/images'
import { removePhoto, uploadPhoto } from '@/lib/photo-upload'
import { cn } from '@/lib/utils'

/**
 * One photo of the piece being ordered.
 *
 * Two ways in, always: take a photo now, or pick one already on the phone
 * (gallery, Files, WhatsApp downloads). A single input with `capture` would
 * force the camera and hide the gallery, so there are two inputs.
 *
 * The photo is shrunk on the phone and uploaded straight to the private
 * storage bucket while the user carries on filling in the form; only the
 * storage path travels with the order.
 */
export function PhotoField({
  value,
  onChange,
  label = 'Photo of the piece',
  className,
  initialPreview = null,
}: {
  value: string | null
  onChange: (path: string | null) => void
  label?: string
  className?: string
  /** A signed link for a photo that already exists (e.g. from a purchase list). */
  initialPreview?: string | null
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(initialPreview)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Release the object URL when the preview changes or the field unmounts.
  // (A signed https link is not an object URL; revoking it is a harmless no-op.)
  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    }
  }, [preview])

  async function handleFile(input: HTMLInputElement) {
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)

    try {
      const { path, preview: url } = await uploadPhoto(file)
      setPreview(url)
      onChange(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  async function remove() {
    const path = value
    onChange(null)
    setPreview(null)
    setError(null)
    await removePhoto(path)
  }

  const pickButton =
    'flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-md border px-3 text-[14px] font-medium disabled:opacity-60'

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="block text-[13px] font-medium text-ink">{label}</span>

      {/* Camera: `capture` makes the phone open the camera straight away. */}
      <input
        ref={cameraRef}
        type="file"
        accept={PHOTO_ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.currentTarget)}
        aria-label={`${label} — take a photo`}
      />
      {/* Gallery / files: no `capture`, so the phone offers its photo picker. */}
      <input
        ref={galleryRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        onChange={(e) => handleFile(e.currentTarget)}
        aria-label={`${label} — choose from gallery or files`}
      />

      {value && preview ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The piece being ordered"
            className="size-20 shrink-0 rounded-md border border-line object-cover"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[12px] text-done">Photo attached.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-charcoal hover:bg-parchment"
              >
                <Camera className="size-4" />
                Retake
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-charcoal hover:bg-parchment"
              >
                <Images className="size-4" />
                Choose another
              </button>
              <button
                type="button"
                onClick={remove}
                className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-muted hover:text-overdue"
              >
                <Trash2 className="size-4" />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : uploading ? (
        <div className="flex min-h-[56px] items-center justify-center gap-2 rounded-md border border-dashed border-gold/50 bg-gold-wash/40 text-[14px] font-medium text-charcoal">
          <Loader2 className="size-5 animate-spin text-gold" />
          Uploading…
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className={cn(pickButton, 'border-gold/50 bg-gold-wash/40 text-charcoal hover:bg-gold-wash')}
            >
              <Camera className="size-5 text-gold" />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className={cn(pickButton, 'border-line bg-white text-charcoal hover:bg-parchment')}
            >
              <Images className="size-5 text-gold" />
              Gallery / files
            </button>
          </div>
          <p className="text-[12px] text-muted">
            The design, the sample, or a picture the vendor sent on WhatsApp. It goes on the PO and is
            used to check the goods when they arrive.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] text-overdue">{error}</p>}
    </div>
  )
}
