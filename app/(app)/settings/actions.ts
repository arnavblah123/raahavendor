'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { CHECKPOINT_PROFILE_KEYS, type Role } from '@/lib/constants'
import type { ActionResult } from '@/app/(app)/actions'
import { DEFAULT_PO_DETAILS, type PoDetails } from '@/lib/po'
import seedVendors from '@/data/vendors/vendors.json'

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

export async function saveSettings(input: {
  whatsapp_template: string
  whatsapp_template_overdue: string
  checkpoint_profiles: Record<string, number[]>
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const supabase = await createClient()

    // A malformed profile would silently break every future order's schedule,
    // so validate before it reaches the database.
    for (const key of CHECKPOINT_PROFILE_KEYS) {
      const pcts = input.checkpoint_profiles[key]
      if (!Array.isArray(pcts) || pcts.length === 0) {
        return fail(`The "${key}" schedule needs at least one percentage.`)
      }
      if (pcts.some((p) => !Number.isFinite(p) || p < 1 || p > 99)) {
        return fail(`Percentages in "${key}" must be whole numbers between 1 and 99.`)
      }
      if (new Set(pcts).size !== pcts.length) {
        return fail(`The "${key}" schedule has a repeated percentage.`)
      }
    }

    const { error } = await supabase
      .from('app_settings')
      .update({
        whatsapp_template: input.whatsapp_template,
        whatsapp_template_overdue: input.whatsapp_template_overdue,
        checkpoint_profiles: input.checkpoint_profiles,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      })
      .eq('id', true)

    if (error) return fail(error.message)

    revalidatePath('/settings')
    revalidatePath('/')
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

/** The company details printed on every purchase order. Admin only. */
export async function savePoDetails(input: Partial<PoDetails>): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const supabase = await createClient()

    const details: PoDetails = { ...DEFAULT_PO_DETAILS }
    for (const key of Object.keys(details) as (keyof PoDetails)[]) {
      const v = input[key]
      details[key] = typeof v === 'string' ? v.trim() : ''
    }
    if (!details.company_name) return fail('The company name cannot be blank — it is printed on every PO.')

    const { error } = await supabase
      .from('app_settings')
      .update({ po_details: details, updated_at: new Date().toISOString(), updated_by: admin.id })
      .eq('id', true)

    if (error) {
      if (/po_details/.test(error.message) && /column|schema cache/i.test(error.message)) {
        return fail('Run migration 0003 in Supabase first (supabase/migrations/0003_po_details.sql), then save again.')
      }
      return fail(error.message)
    }

    revalidatePath('/settings')
    revalidatePath('/orders')
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

export async function saveCategory(input: {
  slug?: string
  label: string
  sort_order?: number
  is_active?: boolean
}): Promise<ActionResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()

    if (!input.label?.trim()) return fail('Give the category a name.')

    const slug =
      input.slug ??
      input.label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')

    if (!slug) return fail('That name cannot be used as a category.')

    const { error } = await supabase.from('vendor_categories').upsert({
      slug,
      label: input.label.trim(),
      sort_order: input.sort_order ?? 99,
      is_active: input.is_active ?? true,
    })

    if (error) return fail(error.message)

    revalidatePath('/settings')
    revalidatePath('/vendors')
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

export async function setUserRole(userId: string, role: Role): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (userId === admin.id) {
      return fail('You cannot change your own role.')
    }

    const supabase = await createClient()
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) return fail(error.message)

    revalidatePath('/settings')
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (userId === admin.id) return fail('You cannot deactivate yourself.')

    const supabase = await createClient()
    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId)
    if (error) return fail(error.message)

    revalidatePath('/settings')
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

/**
 * Load the vendor list carried over from the old software (data/vendors/).
 * One tap in Settings; needs no SQL. Names already in the app are skipped,
 * so it is safe to press more than once.
 */
export async function importSeedVendors(): Promise<
  ActionResult<{ added: number; skipped: number }>
> {
  try {
    const admin = await requireAdmin()
    const supabase = await createClient()

    const { data: existing, error: readErr } = await supabase.from('vendors').select('name')
    if (readErr) return fail(readErr.message)
    const have = new Set((existing ?? []).map((v) => v.name.trim().toLowerCase()))

    const { data: cats } = await supabase.from('vendor_categories').select('slug')
    const knownCategories = new Set((cats ?? []).map((c) => c.slug))

    const rows = seedVendors
      .filter((v) => v.name && !have.has(v.name.trim().toLowerCase()))
      .map((v) => ({
        name: v.name.trim(),
        category: knownCategories.has(v.category ?? '') ? v.category : 'other',
        phone: v.phone ?? null,
        email: v.email ?? null,
        city: v.city ?? null,
        notes: v.notes ?? null,
        created_by: admin.id,
      }))

    if (rows.length > 0) {
      const { error } = await supabase.from('vendors').insert(rows)
      if (error) return fail(error.message)
    }

    revalidatePath('/settings')
    revalidatePath('/vendors')
    revalidatePath('/orders/new')
    return { ok: true, added: rows.length, skipped: seedVendors.length - rows.length }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

/** How many of the carried-over vendors are not yet in the app. */
export async function countPendingSeedVendors(): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase.from('vendors').select('name')
  const have = new Set((data ?? []).map((v) => v.name.trim().toLowerCase()))
  return seedVendors.filter((v) => v.name && !have.has(v.name.trim().toLowerCase())).length
}
