'use client'

import { createClient } from '@/lib/supabase/client'
import { PHOTO_BUCKET } from '@/lib/constants'
import { newPhotoPath, PHOTO_MAX_BYTES, resizeImage } from '@/lib/images'

/**
 * Shrink a photo on the phone and put it straight into the private bucket.
 * Shared by the order form and the purchase list builder, so both behave
 * identically. Returns the storage path and a local preview URL.
 */
export async function uploadPhoto(file: File): Promise<{ path: string; preview: string }> {
  const blob = await resizeImage(file)
  if (blob.size > PHOTO_MAX_BYTES) {
    throw new Error('That photo is too large even after shrinking. Try another one.')
  }

  const path = newPhotoPath(blob.type)
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })

  if (error) {
    throw new Error(
      error.message.toLowerCase().includes('bucket')
        ? 'Photo storage is not set up yet — run migration 0002 in Supabase.'
        : `Could not upload the photo: ${error.message}`,
    )
  }

  return { path, preview: URL.createObjectURL(blob) }
}

/** Best effort: the policy lets you delete your own upload; an orphan is harmless. */
export async function removePhoto(path: string | null | undefined): Promise<void> {
  if (!path) return
  const supabase = createClient()
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}
