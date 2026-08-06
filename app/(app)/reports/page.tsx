import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth'
import { todayIST, formatMonth, addDaysStr } from '@/lib/dates'
import { OPEN_STAGES } from '@/lib/constants'
import { DelayChart, MonthlyChart, CategoryChart } from '@/components/reports/charts'
import { EmptyState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import type { Order, Vendor } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reports — Raaha' }

interface OrderRow extends Order {
  vendor: Pick<Vendor, 'id' | 'name' | 'category'> | null
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const admin = await isAdmin()
  const today = todayIST()

  const [ordersRes, followupsRes, profilesRes, categoriesRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*, vendor:vendors ( id, name, category )')
      .neq('stage', 'cancelled')
      .limit(2000),
    supabase.from('followups').select('id, status, due_date, done_by').lte('due_date', today),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('vendor_categories').select('slug, label').order('sort_order'),
  ])

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[]
  const followups = (followupsRes.data ?? []) as {
    id: string
    status: string
    due_date: string
    done_by: string | null
  }[]
  const profiles = (profilesRes.data ?? []) as { id: string; full_name: string }[]
  const categories = (categoriesRes.data ?? []) as { slug: string; label: string }[]

  if (orders.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="font-serif text-3xl leading-tight text-charcoal">Reports</h1>
        <EmptyState
          title="Nothing to report yet"
          description="Once you have placed and dispatched a few orders, variance, delay and compliance figures will appear here."
        />
      </div>
    )
  }

  // --- Estimated vs actual -------------------------------------------------
  const completed = orders.filter((o) => o.actual_dispatch_date && o.delay_days !== null)

  const varianceByVendor = new Map<
    string,
    { name: string; orders: number; totalDelay: number; worst: number; onTime: number }
  >()
  for (const o of completed) {
    const key = o.vendor?.id ?? 'unknown'
    const entry = varianceByVendor.get(key) ?? {
      name: o.vendor?.name ?? 'Unknown',
      orders: 0,
      totalDelay: 0,
      worst: -999,
      onTime: 0,
    }
    entry.orders += 1
    entry.totalDelay += o.delay_days!
    entry.worst = Math.max(entry.worst, o.delay_days!)
    if (o.delay_days! <= 0) entry.onTime += 1
    varianceByVendor.set(key, entry)
  }

  const variance = [...varianceByVendor.values()]
    .map((v) => ({
      name: v.name,
      orders: v.orders,
      avgDelay: Math.round((v.totalDelay / v.orders) * 10) / 10,
      worst: v.worst,
      onTimePct: Math.round((v.onTime / v.orders) * 100),
    }))
    .sort((a, b) => b.avgDelay - a.avgDelay)

  // --- Delay distribution by vendor category -------------------------------
  const byCategory = new Map<string, { total: number; count: number }>()
  for (const o of completed) {
    const cat = o.vendor?.category ?? 'other'
    const entry = byCategory.get(cat) ?? { total: 0, count: 0 }
    entry.total += o.delay_days!
    entry.count += 1
    byCategory.set(cat, entry)
  }
  const categoryData = [...byCategory.entries()].map(([slug, v]) => ({
    name: categories.find((c) => c.slug === slug)?.label ?? slug,
    avgDelay: Math.round((v.total / v.count) * 10) / 10,
    orders: v.count,
  }))

  // --- Monthly: placed, dispatched, still open -----------------------------
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = addDaysStr(today, -i * 30)
    const key = d.slice(0, 7)
    if (!months.includes(key)) months.push(key)
  }

  const monthly = months.map((m) => ({
    name: formatMonth(`${m}-01`),
    placed: orders.filter((o) => o.order_date.startsWith(m)).length,
    dispatched: orders.filter((o) => o.actual_dispatch_date?.startsWith(m)).length,
    open: orders.filter((o) => o.order_date.startsWith(m) && OPEN_STAGES.includes(o.stage)).length,
  }))

  // --- Follow-up compliance ------------------------------------------------
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]))
  const compliance = new Map<string, { due: number; logged: number }>()
  for (const f of followups) {
    const who = f.done_by ? (nameById.get(f.done_by) ?? 'Unknown') : 'Not logged'
    const entry = compliance.get(who) ?? { due: 0, logged: 0 }
    entry.due += 1
    if (f.status === 'done') entry.logged += 1
    compliance.set(who, entry)
  }

  const totalDue = followups.length
  const totalLogged = followups.filter((f) => f.status === 'done').length
  const totalMissed = followups.filter((f) => f.status === 'pending').length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl leading-tight text-charcoal">Reports</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Based on {orders.length} orders, {completed.length} of them completed.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Average delay by vendor
        </h2>
        {variance.length === 0 ? (
          <EmptyState title="No completed orders yet" className="py-6" />
        ) : (
          <>
            <DelayChart data={variance.slice(0, 12)} />
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-semibold">Vendor</th>
                    <th className="px-3 py-2 text-right font-semibold">Orders</th>
                    <th className="px-3 py-2 text-right font-semibold">Avg delay</th>
                    <th className="px-3 py-2 text-right font-semibold">Worst</th>
                    <th className="px-3 py-2 text-right font-semibold">On time</th>
                  </tr>
                </thead>
                <tbody>
                  {variance.map((v) => (
                    <tr key={v.name} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-charcoal">{v.name}</td>
                      <td className="px-3 py-2 text-right text-ink">{v.orders}</td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          v.avgDelay > 15
                            ? 'text-overdue'
                            : v.avgDelay > 7
                              ? 'text-today'
                              : v.avgDelay > 2
                                ? 'text-missed'
                                : 'text-done'
                        }`}
                      >
                        {v.avgDelay > 0 ? '+' : ''}
                        {v.avgDelay}d
                      </td>
                      <td className="px-3 py-2 text-right text-ink">{v.worst}d</td>
                      <td className="px-3 py-2 text-right text-ink">{v.onTimePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {categoryData.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            Delay by vendor type
          </h2>
          <CategoryChart data={categoryData} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Monthly activity
        </h2>
        <MonthlyChart data={monthly} />
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Follow-up compliance
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Checkpoints due" value={String(totalDue)} />
          <Tile
            label="Logged"
            value={totalDue > 0 ? `${Math.round((totalLogged / totalDue) * 100)}%` : '—'}
            tone="text-done"
          />
          <Tile label="Still not logged" value={String(totalMissed)} tone={totalMissed > 0 ? 'text-missed' : undefined} />
        </div>

        <div className="card mt-3 divide-y divide-line overflow-hidden">
          {[...compliance.entries()]
            .sort((a, b) => b[1].due - a[1].due)
            .map(([who, v]) => (
              <div key={who} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[13px] text-charcoal">{who}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted">
                    {v.logged} of {v.due}
                  </span>
                  {who !== 'Not logged' && (
                    <Badge tone={v.logged / v.due >= 0.8 ? 'done' : v.logged / v.due >= 0.5 ? 'today' : 'overdue'}>
                      {Math.round((v.logged / v.due) * 100)}%
                    </Badge>
                  )}
                </div>
              </div>
            ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          &ldquo;Not logged&rdquo; counts checkpoints that came due and were never actioned by
          anyone. Those are the orders most likely to go quiet.
        </p>
      </section>

      {admin && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            Open order value
          </h2>
          <OpenValue />
        </section>
      )}
    </div>
  )
}

async function OpenValue() {
  const supabase = await createClient()
  const [openRes, financeRes] = await Promise.all([
    supabase.from('orders').select('id').in('stage', OPEN_STAGES),
    supabase.from('order_finance').select('order_id, total_amount'),
  ])

  const openIds = new Set(((openRes.data ?? []) as { id: string }[]).map((o) => o.id))
  const total = ((financeRes.data ?? []) as { order_id: string; total_amount: number | null }[])
    .filter((f) => openIds.has(f.order_id))
    .reduce((sum, f) => sum + (Number(f.total_amount) || 0), 0)

  return (
    <div className="card p-4">
      <p className="font-serif text-3xl text-charcoal">{formatMoney(total)}</p>
      <p className="mt-0.5 text-[12px] uppercase tracking-wide text-muted">
        Across {openIds.size} open orders
      </p>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card px-3 py-2.5">
      <p className={`font-serif text-2xl leading-tight ${tone ?? 'text-charcoal'}`}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  )
}
