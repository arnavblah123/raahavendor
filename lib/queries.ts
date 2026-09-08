import 'server-only'
import { COMING_UP_DAYS, OPEN_STAGES, PHOTO_BUCKET, PHOTO_URL_TTL_SECONDS } from './constants'
import { addDaysStr, daysBetween, monthBounds, todayIST, type DateStr } from './dates'
import { createClient } from './supabase/server'
import type {
  AppSettings,
  Followup,
  Inward,
  InwardItem,
  InwardItemFinance,
  Order,
  OrderFinance,
  OrderItem,
  OrderWithContext,
  PurchaseOrder,
  PurchaseOrderFinance,
  Vendor,
} from './types'

const ORDER_SELECT = `
  *,
  vendor:vendors ( id, name, company_name, phone, contact_person, category ),
  order_items ( * )
`

export interface DashboardCard {
  order: OrderWithContext
  /** The follow-up this card is asking you to log, if there is one. */
  followup: Followup | null
  /** Any other pending rungs already past due on the same order. */
  extraMissed: number
}

export interface DashboardData {
  today: DateStr
  overdue: DashboardCard[]
  dueToday: DashboardCard[]
  missed: DashboardCard[]
  comingUp: DashboardCard[]
  snapshot: {
    openOrders: number
    openValue: number | null
    dispatchedThisMonth: number
    avgDelayDays: number | null
    openPcsPending: number
  }
  /** How many vendors need chasing today — drives the greeting line. */
  vendorsToChase: number
}

/**
 * Everything the morning dashboard needs.
 *
 * Deliberately a small number of wide queries rather than a query per card:
 * with 30–80 open orders the whole working set is a few hundred rows, so
 * assembling the bands in JavaScript is far cheaper than round-tripping.
 */
export async function getDashboard(opts: { isAdmin: boolean }): Promise<DashboardData> {
  const supabase = await createClient()
  const today = todayIST()
  const horizon = addDaysStr(today, COMING_UP_DAYS)

  // Materialise any 3-day overdue nudges that have come due since the last
  // visit. This is what stands in for a cron job — see the migration.
  await supabase.rpc('ensure_overdue_followups', { p_today: today })

  const [ordersRes, followupsRes] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).in('stage', OPEN_STAGES),
    supabase
      .from('followups')
      .select('*')
      .eq('status', 'pending')
      .lte('due_date', horizon)
      .order('due_date', { ascending: true }),
  ])

  const orders = (ordersRes.data ?? []) as unknown as OrderWithContext[]
  const followups = (followupsRes.data ?? []) as Followup[]

  const orderById = new Map(orders.map((o) => [o.id, o]))

  // Group pending follow-ups by order, keeping only those on open orders.
  const byOrder = new Map<string, Followup[]>()
  for (const f of followups) {
    if (!orderById.has(f.order_id)) continue
    const list = byOrder.get(f.order_id)
    if (list) list.push(f)
    else byOrder.set(f.order_id, [f])
  }

  const overdue: DashboardCard[] = []
  const dueToday: DashboardCard[] = []
  const missed: DashboardCard[] = []
  const comingUp: DashboardCard[] = []

  for (const order of orders) {
    const pending = byOrder.get(order.id) ?? []
    const isOverdue = order.current_expected_dispatch_date < today

    if (isOverdue) {
      // The order itself is late. That outranks any individual checkpoint, so
      // it appears once here and nowhere else.
      const due = pending.filter((f) => f.due_date <= today)
      overdue.push({
        order,
        followup: due[due.length - 1] ?? null,
        extraMissed: Math.max(0, due.length - 1),
      })
      continue
    }

    const dueTodayRungs = pending.filter((f) => f.due_date === today)
    const missedRungs = pending.filter((f) => f.due_date < today)
    const upcomingRungs = pending.filter((f) => f.due_date > today)

    // An expected dispatch date of today counts as due today even if the 100%
    // checkpoint was somehow never created.
    if (dueTodayRungs.length > 0 || order.current_expected_dispatch_date === today) {
      dueToday.push({
        order,
        followup: dueTodayRungs[0] ?? null,
        extraMissed: missedRungs.length,
      })
      continue
    }

    // Checkpoints that came and went without being logged. These must never
    // silently disappear — that is exactly how an order goes quiet.
    if (missedRungs.length > 0) {
      missed.push({
        order,
        followup: missedRungs[missedRungs.length - 1],
        extraMissed: missedRungs.length - 1,
      })
      continue
    }

    if (upcomingRungs.length > 0) {
      comingUp.push({ order, followup: upcomingRungs[0], extraMissed: 0 })
    }
  }

  // Oldest pain first.
  overdue.sort((a, b) =>
    a.order.current_expected_dispatch_date.localeCompare(b.order.current_expected_dispatch_date),
  )
  missed.sort((a, b) => (a.followup?.due_date ?? '').localeCompare(b.followup?.due_date ?? ''))
  comingUp.sort((a, b) => (a.followup?.due_date ?? '').localeCompare(b.followup?.due_date ?? ''))
  dueToday.sort((a, b) => a.order.vendor?.name?.localeCompare(b.order.vendor?.name ?? '') ?? 0)

  const snapshot = await getSnapshot({ supabase, orders, today, isAdmin: opts.isAdmin })

  const vendorIds = new Set(
    [...overdue, ...dueToday, ...missed].map((c) => c.order.vendor_id),
  )

  return {
    today,
    overdue,
    dueToday,
    missed,
    comingUp,
    snapshot,
    vendorsToChase: vendorIds.size,
  }
}

async function getSnapshot({
  supabase,
  orders,
  today,
  isAdmin,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  orders: OrderWithContext[]
  today: DateStr
  isAdmin: boolean
}): Promise<DashboardData['snapshot']> {
  const { start, end } = monthBounds(today)

  const [dispatchedRes, financeRes] = await Promise.all([
    supabase
      .from('orders')
      .select('delay_days')
      .not('actual_dispatch_date', 'is', null)
      .gte('actual_dispatch_date', start)
      .lte('actual_dispatch_date', end),
    // Staff get no rows back from order_finance, so the value tile is simply
    // not shown for them rather than showing a misleading zero.
    isAdmin && orders.length > 0
      ? supabase
          .from('order_finance')
          .select('total_amount')
          .in('order_id', orders.map((o) => o.id))
      : Promise.resolve({ data: [] as { total_amount: number | null }[] }),
  ])

  const dispatched = (dispatchedRes.data ?? []) as { delay_days: number | null }[]
  const delays = dispatched.map((d) => d.delay_days).filter((d): d is number => d !== null)

  const openValue = isAdmin
    ? ((financeRes.data ?? []) as { total_amount: number | null }[]).reduce(
        (sum, r) => sum + (Number(r.total_amount) || 0),
        0,
      )
    : null

  const openPcsPending = orders.reduce(
    (sum, o) => sum + o.order_items.reduce((s, i) => s + Math.max(0, i.qty_balance), 0),
    0,
  )

  return {
    openOrders: orders.length,
    openValue,
    dispatchedThisMonth: dispatched.length,
    avgDelayDays:
      delays.length > 0
        ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
        : null,
    openPcsPending,
  }
}

/** A single order with everything the detail page renders. */
export async function getOrderDetail(id: string) {
  const supabase = await createClient()

  const [
    orderRes,
    followupsRes,
    revisionsRes,
    dispatchesRes,
    activityRes,
    financeRes,
    itemFinanceRes,
    poRes,
    inwardsRes,
  ] = await Promise.all([
      supabase.from('orders').select(ORDER_SELECT).eq('id', id).single(),
      supabase.from('followups').select('*').eq('order_id', id).order('due_date'),
      supabase.from('order_revisions').select('*').eq('order_id', id).order('created_at'),
      supabase
        .from('dispatches')
        .select('*, dispatch_items ( * )')
        .eq('order_id', id)
        .order('dispatch_no'),
      supabase
        .from('activity_log')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('order_finance').select('*').eq('order_id', id).maybeSingle(),
      supabase.from('order_item_finance').select('*'),
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('order_id', id)
        .neq('status', 'cancelled')
        .maybeSingle(),
      supabase
        .from('inwards')
        .select('*, inward_items ( * )')
        .eq('order_id', id)
        .order('inward_no'),
    ])

  if (orderRes.error || !orderRes.data) return null

  const order = orderRes.data as unknown as OrderWithContext
  const photoUrls = await signPhotoUrls(order.order_items.map((i) => i.photo_path))

  return {
    order: orderRes.data as unknown as OrderWithContext,
    followups: (followupsRes.data ?? []) as Followup[],
    revisions: revisionsRes.data ?? [],
    dispatches: (dispatchesRes.data ?? []) as (Record<string, unknown> & {
      dispatch_items: { order_item_id: string; quantity_dispatched: number }[]
    })[],
    activity: activityRes.data ?? [],
    // null for staff — RLS returns no rows rather than blanking a value.
    finance: (financeRes.data as OrderFinance | null) ?? null,
    itemFinance: (itemFinanceRes.data ?? []) as { order_item_id: string; rate: number | null; amount: number | null }[],
    purchaseOrder: (poRes.data as PurchaseOrder | null) ?? null,
    inwards: (inwardsRes.data ?? []) as InwardWithItems[],
    /** photo_path -> short-lived signed URL, for the items that have one. */
    photoUrls,
  }
}

export type InwardWithItems = Inward & { inward_items: InwardItem[] }

/**
 * Signed links for photos in the private bucket. One call for the whole
 * page rather than one per photo. Missing or failed paths are left out so a
 * broken photo never breaks the page.
 */
export async function signPhotoUrls(
  paths: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)))
  if (unique.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(unique, PHOTO_URL_TTL_SECONDS)
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl
  }
  return out
}

/** Everything the printable PO and the inward screen need. */
export async function getPurchaseOrderForOrder(orderId: string) {
  const supabase = await createClient()

  const [poRes, orderRes] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('*, vendor:vendors ( * )')
      .eq('order_id', orderId)
      .neq('status', 'cancelled')
      .maybeSingle(),
    supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).maybeSingle(),
  ])

  if (!poRes.data || !orderRes.data) return null

  const po = poRes.data as unknown as PurchaseOrder & { vendor: Vendor | null }
  const order = orderRes.data as unknown as OrderWithContext

  const [financeRes, orderFinanceRes, inwardsRes, photoUrls] = await Promise.all([
    // Empty for staff — RLS returns no row.
    supabase.from('purchase_order_finance').select('*').eq('po_id', po.id).maybeSingle(),
    supabase.from('order_finance').select('*').eq('order_id', orderId).maybeSingle(),
    supabase
      .from('inwards')
      .select('*, inward_items ( * )')
      .eq('po_id', po.id)
      .order('inward_no'),
    signPhotoUrls(po.lines.map((l) => l.photo_path)),
  ])

  return {
    po,
    order,
    finance: (financeRes.data as PurchaseOrderFinance | null) ?? null,
    orderFinance: (orderFinanceRes.data as OrderFinance | null) ?? null,
    inwards: (inwardsRes.data ?? []) as InwardWithItems[],
    photoUrls,
  }
}

/** Invoice prices for a set of inward items. Empty for staff — RLS returns no rows. */
export async function getInwardFinance(
  inwardItemIds: string[],
): Promise<Record<string, InwardItemFinance>> {
  if (inwardItemIds.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase
    .from('inward_item_finance')
    .select('*')
    .in('inward_item_id', inwardItemIds)
  const out: Record<string, InwardItemFinance> = {}
  for (const f of (data ?? []) as InwardItemFinance[]) out[f.inward_item_id] = f
  return out
}

/** One inward item as the owner's list shows it: with its order, PO and item. */
export interface FlaggedInwardItem extends InwardItem {
  inward: Inward & {
    purchase_order: Pick<PurchaseOrder, 'id' | 'po_no'> | null
    order: (Pick<Order, 'id' | 'order_no'> & { vendor: Pick<Vendor, 'id' | 'name'> | null }) | null
  }
  order_item: Pick<
    OrderItem,
    'id' | 'product_name' | 'design_code' | 'colour' | 'size' | 'measurement_unit' | 'photo_path'
  > | null
}

const INWARD_ITEM_SELECT = `
  *,
  inward:inwards (
    *,
    purchase_order:purchase_orders ( id, po_no ),
    order:orders ( id, order_no, vendor:vendors ( id, name ) )
  ),
  order_item:order_items ( id, product_name, design_code, colour, size, measurement_unit, photo_path )
`

/** Every flagged inward item, open ones first, newest first within each. */
export async function getFlaggedInwardItems(opts: { isAdmin: boolean }) {
  const supabase = await createClient()

  const [itemsRes, financeRes] = await Promise.all([
    supabase
      .from('inward_items')
      .select(INWARD_ITEM_SELECT)
      .eq('is_flagged', true)
      .order('created_at', { ascending: false })
      .limit(300),
    opts.isAdmin
      ? supabase.from('inward_item_finance').select('*')
      : Promise.resolve({ data: [] as InwardItemFinance[] }),
  ])

  const rows = (itemsRes.data ?? []) as unknown as FlaggedInwardItem[]
  rows.sort((a, b) => {
    if (a.flag_status !== b.flag_status) return a.flag_status === 'open' ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })

  const financeByItem: Record<string, InwardItemFinance> = {}
  for (const f of (financeRes.data ?? []) as InwardItemFinance[]) financeByItem[f.inward_item_id] = f

  return { rows, financeByItem }
}

/** Recent inwards across every order — the receiving log. */
export async function getRecentInwards(limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inwards')
    .select(
      `*, purchase_order:purchase_orders ( id, po_no ),
          order:orders ( id, order_no, vendor:vendors ( id, name ) )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as (Inward & {
    purchase_order: Pick<PurchaseOrder, 'id' | 'po_no'> | null
    order: (Pick<Order, 'id' | 'order_no'> & { vendor: Pick<Vendor, 'id' | 'name'> | null }) | null
  })[]
}

/** How many flagged inward items are still waiting on the owner. */
export async function countOpenFlags(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('inward_items')
    .select('id', { count: 'exact', head: true })
    .eq('is_flagged', true)
    .eq('flag_status', 'open')
  return count ?? 0
}

export async function getVendors(opts: { activeOnly?: boolean } = {}) {
  const supabase = await createClient()
  let q = supabase.from('vendors').select('*').order('name')
  if (opts.activeOnly) q = q.eq('is_active', true)
  const { data } = await q
  return (data ?? []) as Vendor[]
}

export async function getVendorCategories() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendor_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  return (data ?? []) as { slug: string; label: string; sort_order: number; is_active: boolean }[]
}

export async function getSettings(): Promise<AppSettings | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('app_settings').select('*').limit(1).maybeSingle()
  return (data as AppSettings) ?? null
}

/** Orders list with server-side filtering. */
export async function getOrders(filters: {
  stage?: string
  vendorId?: string
  overdueOnly?: boolean
  urgentOnly?: boolean
  from?: string
  to?: string
  search?: string
}) {
  const supabase = await createClient()
  const today = todayIST()

  let q = supabase.from('orders').select(ORDER_SELECT)

  if (filters.stage && filters.stage !== 'all') {
    if (filters.stage === 'open') q = q.in('stage', OPEN_STAGES)
    else q = q.eq('stage', filters.stage)
  }
  if (filters.vendorId) q = q.eq('vendor_id', filters.vendorId)
  if (filters.urgentOnly) q = q.eq('priority', 'urgent')
  if (filters.overdueOnly) {
    q = q.in('stage', OPEN_STAGES).lt('current_expected_dispatch_date', today)
  }
  if (filters.from) q = q.gte('order_date', filters.from)
  if (filters.to) q = q.lte('order_date', filters.to)

  const { data } = await q.order('current_expected_dispatch_date', { ascending: true }).limit(500)
  let rows = (data ?? []) as unknown as OrderWithContext[]

  // Search spans vendor and item fields, which is easier to express here than
  // as a Postgres join filter and costs nothing at this data size.
  const term = filters.search?.trim().toLowerCase()
  if (term) {
    rows = rows.filter((o) => {
      const haystack = [
        o.order_no,
        o.vendor?.name,
        o.vendor?.company_name,
        o.notes,
        ...o.order_items.flatMap((i) => [i.product_name, i.design_code, i.colour]),
      ]
      return haystack.some((v) => v?.toLowerCase().includes(term))
    })
  }

  return { rows, today }
}

export function orderDelayForSort(o: Order, today: DateStr): number {
  if (o.actual_dispatch_date) return o.delay_days ?? 0
  return daysBetween(o.current_expected_dispatch_date, today)
}

export function itemsSummary(items: Pick<OrderItem, 'product_name' | 'quantity' | 'unit'>[]): string {
  if (items.length === 0) return 'No items'
  const first = `${items[0].quantity} ${items[0].unit} ${items[0].product_name}`
  return items.length === 1 ? first : `${first} +${items.length - 1} more`
}
