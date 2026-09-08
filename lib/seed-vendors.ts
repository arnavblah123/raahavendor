import 'server-only'
import { cache } from 'react'
import { createClient } from './supabase/server'
import { getProfile } from './auth'
import seedVendors from '@/data/vendors/vendors.json'

/**
 * The vendor list carried over from the old software (data/vendors/).
 *
 * It loads itself: the first time anyone opens the Vendors, Today or Place
 * order screen after a deploy, every name not already in the app is added.
 * Matching is by name, case-insensitively, so it can run on every visit and
 * never duplicates. This is the same pattern the dashboard uses for overdue
 * reminders — a page load stands in for the scheduled job the app does not
 * have.
 */
export const ensureSeedVendors = cache(async (): Promise<{ added: number; skipped: number }> => {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { added: 0, skipped: seedVendors.length }

  const supabase = await createClient()

  const { data: existing, error: readErr } = await supabase.from('vendors').select('name')
  if (readErr) return { added: 0, skipped: seedVendors.length }
  const have = new Set((existing ?? []).map((v) => v.name.trim().toLowerCase()))

  const missing = seedVendors.filter((v) => v.name && !have.has(v.name.trim().toLowerCase()))
  if (missing.length === 0) return { added: 0, skipped: seedVendors.length }

  const { data: cats } = await supabase.from('vendor_categories').select('slug')
  const knownCategories = new Set((cats ?? []).map((c) => c.slug))

  const rows = missing.map((v) => ({
    name: v.name.trim(),
    category: knownCategories.has(v.category ?? '') ? v.category : 'other',
    phone: v.phone ?? null,
    email: v.email ?? null,
    city: v.city ?? null,
    notes: v.notes ?? null,
    created_by: profile.id,
  }))

  const { error } = await supabase.from('vendors').insert(rows)
  if (error) return { added: 0, skipped: seedVendors.length }

  return { added: rows.length, skipped: seedVendors.length - rows.length }
})

/** How many carried-over vendors are still missing (for the Settings note). */
export async function countPendingSeedVendors(): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase.from('vendors').select('name')
  const have = new Set((data ?? []).map((v) => v.name.trim().toLowerCase()))
  return seedVendors.filter((v) => v.name && !have.has(v.name.trim().toLowerCase())).length
}
