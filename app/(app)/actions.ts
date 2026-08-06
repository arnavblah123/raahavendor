'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile, requireProfile } from '@/lib/auth'
import { todayIST, addDaysStr, type DateStr } from '@/lib/dates'
import {
  generateLadder,
  isValidPromisedDate,
  expectedDispatchDate,
  type Checkpoint,
} from '@/lib/followups'
import {
  BALANCE_PROFILE,
  CHECKPOINT_PROFILES,
  SNOOZE_DAYS,
  type CheckpointProfile,
  type ContactMethod,
} from '@/lib/constants'

export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/** Percentages come from settings so the ladder can change without a deploy. */
async function profilePcts(profile: CheckpointProfile): Promise<number[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('app_settings').select('checkpoint_profiles').maybeSingle()
  const configured = (data?.checkpoint_profiles as Record<string, number[]> | undefined)?.[profile]
  if (Array.isArray(configured) && configured.length > 0) return configured
  return [...CHECKPOINT_PROFILES[profile].pcts]
}

function refreshOrderViews(orderId?: string) {
  revalidatePath('/')
  revalidatePath('/orders')
  revalidatePath('/vendors')
  revalidatePath('/reports')
  if (orderId) revalidatePath(`/orders/${orderId}`)
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export interface LogFollowupInput {
  followupId: string | null
  orderId: string
  contactedVia: ContactMethod
  spokeTo?: string
  vendorResponse?: string
  newPromisedDate?: string | null
  nextAction?: string
  /** Suggest moving the order to Ready for Dispatch. */
  markReady?: boolean
}

/**
 * Log a follow-up. If the vendor gave a new date, this also creates a revision
 * and regenerates the remaining ladder — the two always happen together, so a
 * logged call can never leave the schedule stale.
 */
export async function logFollowup(input: LogFollowupInput): Promise<ActionResult> {
  try {
    await requireProfile()
    const supabase = await createClient()
    const today = todayIST()

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, stage, checkpoint_profile, current_expected_dispatch_date')
      .eq('id', input.orderId)
      .single()

    if (orderErr || !order) return fail('Could not find that order.')

    const newDate = input.newPromisedDate?.trim() || null
    if (newDate && !isValidPromisedDate(newDate, today)) {
      return fail('A promised date cannot be in the past.')
    }

    if (input.followupId) {
      const { error } = await supabase
        .from('followups')
        .update({
          status: 'done',
          done_at: new Date().toISOString(),
          done_by: (await getProfile())?.id ?? null,
          contacted_via: input.contactedVia,
          spoke_to: input.spokeTo || null,
          vendor_response: input.vendorResponse || null,
          new_promised_date: newDate,
          next_action: input.nextAction || null,
        })
        .eq('id', input.followupId)
      if (error) return fail(error.message)
    } else {
      // An unprompted call, not tied to a scheduled checkpoint.
      const { error } = await supabase.from('followups').insert({
        order_id: input.orderId,
        checkpoint_pct: null,
        due_date: today,
        status: 'done',
        done_at: new Date().toISOString(),
        done_by: (await getProfile())?.id ?? null,
        contacted_via: input.contactedVia,
        spoke_to: input.spokeTo || null,
        vendor_response: input.vendorResponse || null,
        new_promised_date: newDate,
        next_action: input.nextAction || null,
      })
      if (error) return fail(error.message)
    }

    if (newDate && newDate !== order.current_expected_dispatch_date) {
      const checkpoints = generateLadder({
        anchorDate: today,
        targetDate: newDate,
        profile: order.checkpoint_profile as CheckpointProfile,
        today,
        profilePcts: await profilePcts(order.checkpoint_profile as CheckpointProfile),
      })

      const { error } = await supabase.rpc('apply_revision', {
        p_order_id: input.orderId,
        p_new_date: newDate,
        p_checkpoints: checkpoints,
        p_reason: input.vendorResponse || null,
        p_today: today,
      })
      if (error) return fail(error.message)
    }

    if (input.markReady && order.stage !== 'ready_for_dispatch') {
      await supabase.from('orders').update({ stage: 'ready_for_dispatch' }).eq('id', input.orderId)
    }

    await supabase.from('activity_log').insert({
      order_id: input.orderId,
      action: 'followup',
      detail: `Followed up by ${input.contactedVia}${input.spokeTo ? ` with ${input.spokeTo}` : ''}${
        newDate ? ` — new date ${newDate}` : ''
      }`,
    })

    refreshOrderViews(input.orderId)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

/** Push a checkpoint out a couple of days without losing it. */
export async function snoozeFollowup(followupId: string): Promise<ActionResult> {
  try {
    await requireProfile()
    const supabase = await createClient()

    const { data: f } = await supabase
      .from('followups')
      .select('id, due_date, snooze_count, order_id')
      .eq('id', followupId)
      .single()

    if (!f) return fail('Could not find that follow-up.')

    // Snooze from today, not from a due date that may already be long past.
    const base = f.due_date > todayIST() ? f.due_date : todayIST()

    const { error } = await supabase
      .from('followups')
      .update({
        due_date: addDaysStr(base, SNOOZE_DAYS),
        snooze_count: (f.snooze_count ?? 0) + 1,
      })
      .eq('id', followupId)

    if (error) return fail(error.message)

    refreshOrderViews(f.order_id)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface NewOrderItemInput {
  product_name: string
  description?: string
  design_code?: string
  colour?: string
  size?: string
  category?: string
  quantity: number
  unit?: string
  rate?: number | null
  amount?: number | null
}

export interface NewOrderInput {
  vendor_id: string
  order_date: string
  lead_time_days: number
  expected_date: string
  checkpoint_profile: CheckpointProfile
  priority?: string
  placed_by?: string
  notes?: string
  total_amount?: number | null
  advance_paid?: number | null
  payment_notes?: string
  items: NewOrderItemInput[]
}

export async function createOrder(
  input: NewOrderInput,
): Promise<ActionResult<{ id: string; order_no: string }>> {
  try {
    await requireProfile()
    const supabase = await createClient()
    const today = todayIST()

    if (!input.vendor_id) return fail('Please choose a vendor.')
    if (!input.items.length) return fail('Add at least one item.')
    if (input.items.some((i) => !i.product_name?.trim())) {
      return fail('Every item needs a product name.')
    }
    if (input.items.some((i) => !Number.isFinite(i.quantity) || i.quantity < 1)) {
      return fail('Every item needs a quantity of at least 1.')
    }

    const expected =
      input.expected_date || expectedDispatchDate(input.order_date, input.lead_time_days)

    const checkpoints = generateLadder({
      anchorDate: input.order_date,
      targetDate: expected,
      profile: input.checkpoint_profile,
      today,
      profilePcts: await profilePcts(input.checkpoint_profile),
    })

    const { data, error } = await supabase.rpc('create_order_with_items', {
      p_order: {
        vendor_id: input.vendor_id,
        order_date: input.order_date,
        lead_time_days: input.lead_time_days,
        expected_date: expected,
        checkpoint_profile: input.checkpoint_profile,
        priority: input.priority ?? 'normal',
        placed_by: input.placed_by ?? '',
        notes: input.notes ?? '',
        total_amount: input.total_amount ?? '',
        advance_paid: input.advance_paid ?? '',
        payment_notes: input.payment_notes ?? '',
      },
      p_items: input.items,
      p_checkpoints: checkpoints,
    })

    if (error) return fail(error.message)

    refreshOrderViews()
    const result = data as { id: string; order_no: string }
    return { ok: true, id: result.id, order_no: result.order_no }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

export async function setOrderStage(orderId: string, stage: string): Promise<ActionResult> {
  try {
    await requireProfile()
    const supabase = await createClient()

    const patch: Record<string, unknown> = { stage }
    if (stage === 'received') patch.received_date = todayIST()
    if (stage === 'closed') patch.closed_at = new Date().toISOString()

    const { error } = await supabase.from('orders').update(patch).eq('id', orderId)
    if (error) return fail(error.message)

    await supabase.from('activity_log').insert({
      order_id: orderId,
      action: 'stage',
      detail: `Stage changed to ${stage.replace(/_/g, ' ')}`,
    })

    refreshOrderViews(orderId)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface DispatchLineInput {
  order_item_id: string
  quantity: number
}

export interface RecordDispatchInput {
  orderId: string
  dispatchDate: string
  transporter?: string
  docketNo?: string
  remarks?: string
  lines: DispatchLineInput[]
  /** Required when a balance remains, so the order keeps a live schedule. */
  balancePromisedDate?: string | null
}

export async function recordDispatch(
  input: RecordDispatchInput,
): Promise<ActionResult<{ balance: number; isPartial: boolean }>> {
  try {
    await requireProfile()
    const supabase = await createClient()
    const today = todayIST()

    const lines = input.lines.filter((l) => Number(l.quantity) > 0)
    if (lines.length === 0) return fail('Enter at least one piece to dispatch.')

    const { data, error } = await supabase.rpc('record_dispatch', {
      p_order_id: input.orderId,
      p_dispatch_date: input.dispatchDate,
      p_items: lines.map((l) => ({ order_item_id: l.order_item_id, quantity: Number(l.quantity) })),
      p_transporter: input.transporter || null,
      p_docket_no: input.docketNo || null,
      p_remarks: input.remarks || null,
    })

    if (error) return fail(error.message)

    const result = data as { balance: number; is_partial: boolean }

    // A balance remains: give the order a fresh short ladder so it keeps
    // appearing on the morning dashboard until it is fully closed.
    if (result.balance > 0 && input.balancePromisedDate) {
      const newDate = input.balancePromisedDate
      if (!isValidPromisedDate(newDate, today)) {
        return fail('The promised date for the balance cannot be in the past.')
      }

      const checkpoints: Checkpoint[] = generateLadder({
        anchorDate: today,
        targetDate: newDate,
        profile: BALANCE_PROFILE,
        today,
        profilePcts: await profilePcts(BALANCE_PROFILE),
      })

      const { error: revErr } = await supabase.rpc('apply_revision', {
        p_order_id: input.orderId,
        p_new_date: newDate,
        p_checkpoints: checkpoints,
        p_reason: `Balance of ${result.balance} pcs promised for ${newDate}`,
        p_today: today,
      })
      if (revErr) return fail(revErr.message)
    }

    refreshOrderViews(input.orderId)
    return { ok: true, balance: result.balance, isPartial: result.is_partial }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export interface VendorInput {
  id?: string
  name: string
  company_name?: string
  category: string
  contact_person?: string
  phone?: string
  alt_phone?: string
  email?: string
  city?: string
  gst_no?: string
  notes?: string
  payment_terms?: string
  is_active?: boolean
}

export async function saveVendor(input: VendorInput): Promise<ActionResult<{ id: string }>> {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    if (!input.name?.trim()) return fail('Vendor name is required.')

    const row = {
      name: input.name.trim(),
      company_name: input.company_name?.trim() || null,
      category: input.category || 'other',
      contact_person: input.contact_person?.trim() || null,
      phone: input.phone?.trim() || null,
      alt_phone: input.alt_phone?.trim() || null,
      email: input.email?.trim() || null,
      city: input.city?.trim() || null,
      gst_no: input.gst_no?.trim() || null,
      notes: input.notes?.trim() || null,
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    }

    let vendorId = input.id

    if (vendorId) {
      const { error } = await supabase.from('vendors').update(row).eq('id', vendorId)
      if (error) return fail(error.message)
    } else {
      const { data, error } = await supabase
        .from('vendors')
        .insert({ ...row, created_by: profile.id })
        .select('id')
        .single()
      if (error) return fail(error.message)
      vendorId = data.id
    }

    // Payment terms are admin-only; RLS would reject this for staff, so we
    // only attempt it when it can succeed.
    if (profile.role === 'admin' && input.payment_terms !== undefined) {
      await supabase
        .from('vendor_finance')
        .upsert({ vendor_id: vendorId, payment_terms: input.payment_terms?.trim() || null })
    }

    revalidatePath('/vendors')
    if (vendorId) revalidatePath(`/vendors/${vendorId}`)
    return { ok: true, id: vendorId! }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

/** Soft delete only — a vendor with history is never removed. */
export async function setVendorActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireProfile()
    const supabase = await createClient()
    const { error } = await supabase.from('vendors').update({ is_active: isActive }).eq('id', id)
    if (error) return fail(error.message)
    revalidatePath('/vendors')
    revalidatePath(`/vendors/${id}`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

/** Preview the dates the user will be reminded on, before the order is saved. */
export async function previewLadder(args: {
  orderDate: DateStr
  expectedDate: DateStr
  profile: CheckpointProfile
}): Promise<Checkpoint[]> {
  return generateLadder({
    anchorDate: args.orderDate,
    targetDate: args.expectedDate,
    profile: args.profile,
    today: todayIST(),
    profilePcts: await profilePcts(args.profile),
  })
}
