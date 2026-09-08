'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PHOTO_BUCKET } from '@/lib/constants'
import { newPhotoPath, PHOTO_ACCEPT, PHOTO_MAX_BYTES, resizeImage } from '@/lib/images'
import { cn } from '@/lib/utils'

/**
 * One photo of the piece being ordered.
 *
 * The photo is shrunk on the phone and uploaded straight to the private
 * storage bucket while the user carries on filling in the form; only the
 * storage path travels with the order. On a phone the camera opens directly.
 */
export function PhotoField({
  value,
  onChange,
  label = 'Photo of the piece',
  className,
}: {
  value: string | null
  onChange: (path: string | null) => void
  label?: string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Release the object URL when the preview changes or the field unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)

    try {
      const blob = await resizeImage(file)
      if (blob.size > PHOTO_MAX_BYTES) {
        setError('That photo is too large even after shrinking. Try another one.')
        return
      }

      const path = newPhotoPath(blob.type)
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })

      if (upErr) {
        setError(
          upErr.message.toLowerCase().includes('bucket')
            ? 'Photo storage is not set up yet — run migration 0002 in Supabase.'
            : `Could not upload the photo: ${upErr.message}`,
        )
        return
      }

      setPreview(URL.createObjectURL(blob))
      onChange(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove() {
    const path = value
    onChange(null)
    setPreview(null)
    setError(null)
    if (path) {
      // Best effort: the policy lets you delete your own upload. If it fails
      // the orphaned file is harmless.
      const supabase = createClient()
      await supabase.storage.from(PHOTO_BUCKET).remove([path])
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="block text-[13px] font-medium text-ink">{label}</span>

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        aria-label={label}
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="min-h-9 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-charcoal hover:bg-parchment"
              >
                Retake
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
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex min-h-[64px] w-full items-center gap-3 rounded-md border border-dashed px-3 py-2 text-left',
            'border-gold/50 bg-gold-wash/40 text-charcoal hover:bg-gold-wash disabled:opacity-60',
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 shrink-0 animate-spin text-gold" />
          ) : (
            <Camera className="size-5 shrink-0 text-gold" />
          )}
          <span className="min-w-0">
            <span className="block text-[14px] font-medium">
              {uploading ? 'Uploading…' : 'Add a photo of the piece'}
            </span>
            <span className="block text-[12px] text-muted">
              Take one now or pick from the gallery. It goes on the PO and is used to check the goods
              when they arrive.
            </span>
          </span>
          {!uploading && <ImagePlus className="ml-auto size-4 shrink-0 text-muted" />}
        </button>
      )}

      {error && <p className="text-[12px] text-overdue">{error}</p>}
    </div>
  )
}
