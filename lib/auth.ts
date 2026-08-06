import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import type { Profile } from './types'

/**
 * The current user's profile, memoised per request so that a page rendering
 * six components does not make six identical round-trips.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return (data as Profile) ?? null
})

/** For pages: guarantees a profile or redirects to login. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile || !profile.is_active) redirect('/login')
  return profile
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getProfile()
  return profile?.role === 'admin'
}

/**
 * For Server Actions that only an admin may run. The database enforces this
 * too — this is the friendly error, not the security boundary.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    throw new Error('Only an admin can do this.')
  }
  return profile
}
