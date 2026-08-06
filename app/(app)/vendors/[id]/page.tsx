import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getVendorCategories } from '@/lib/queries'
import { isAdmin } from '@/lib/auth'
import { buildScorecard, dragsTheBalance, GRADE_DESCRIPTION } from '@/lib/scorecard'
import { GradeBadge } from '@/components/vendors/grade-badge'
import { VendorForm } from '@/components/vendors/vendor-form'
import { StageBadge, RevisionBadge, Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/common/states'
import { formatDate, todayIST } from '@/lib/dates'
import { telUrl, whatsappUrl } from '@/lib/whatsapp'
import { OPEN_STAGES } from '@/lib/constants'
import type { Order, Vendor, VendorFinance, VendorStats } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const today = todayIST()

  const [vendorRes, statsRes, ordersRes, financeRes, categories, admin] = await Promise.all([
    supabase.from('vendors').select('*').eq('id', id).maybeSingle(),
    supabase.from('vendor_stats').select('*').eq('vendor_id', id).maybeSingle(),
    supabase
      .from('orders')
      .select('*')
      .eq('vendor_id', id)
      .order('order_date', { ascending: false })
      .limit(200),
    supabase.from('vendor_finance').select('*').eq('vendor_id', id).maybeSingle(),
    getVendorCategories(),
    isAdmin(),
  ])

  const vendor = vendorRes.data as Vendor | null
  if (!vendor) notFound()

  const card = buildScorecard(statsRes.data as VendorStats | null)
  const orders = (ordersRes.data ?? []) as Order[]
  const finance = financeRes.data as VendorFinance | null

  const open = orders.filter((o) => OPEN_STAGES.includes(o.stage))
  const past = orders.filter((o) => !OPEN_STAGES.includes(o.stage))

  const tel = telUrl(vendor.phone)
  const wa = whatsappUrl(vendor.phone, `Namaste ${vendor.name}, this is Raaha by Archana Bansal.`)

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: 'Total orders', value: String(card.totalOrders) },
    { label: 'On time', value: card.onTimePct === null ? '—' : `${card.onTimePct}%` },
    {
      label: 'Average delay',
      value: card.avgDelayDays === null ? '—' : `${card.avgDelayDays > 0 ? '+' : ''}${card.avgDelayDays} days`,
    },
    { label: 'Longest delay', value: card.worstDelayDays === null ? '—' : `${card.worstDelayDays} days` },
    {
      label: 'Revisions per order',
      value: card.avgRevisions === null ? '—' : String(card.avgRevisions),
      hint: 'How often they push the date',
    },
    {
      label: 'Sent in one go',
      value: card.fillRatePct === null ? '—' : `${card.fillRatePct}%`,
      hint: 'Rest were split into two or more dispatches',
    },
    {
      label: 'First to last dispatch',
      value:
        card.avgDispatchSpreadDays === null ? '—' : `${card.avgDispatchSpreadDays} days`,
      hint: 'How long they drag out the balance',
    },
    { label: 'Open now', value: String(card.openOrders) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/vendors"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          Vendors
        </Link>
      </div>

      <header className="card p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-3xl leading-tight text-charcoal">{vendor.name}</h1>
            <p className="mt-1 text-[13px] text-muted">
              {[
                categories.find((c) => c.slug === vendor.category)?.label ?? vendor.category,
                vendor.company_name,
                vendor.city,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {vendor.contact_person && (
              <p className="mt-0.5 text-[13px] text-ink">Contact: {vendor.contact_person}</p>
            )}
            {admin && finance?.payment_terms && (
              <p className="mt-1.5 text-[13px] text-ink">
                <span className="text-muted">Payment terms:</span> {finance.payment_terms}
              </p>
            )}
            {!vendor.is_active && (
              <Badge tone="neutral" className="mt-2">
                Inactive
              </Badge>
            )}
          </div>
          <div className="text-center">
            <GradeBadge grade={card.grade} size="lg" />
            <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">Grade</p>
          </div>
        </div>

        {card.grade && (
          <p className="mt-3 text-[13px] text-ink">{GRADE_DESCRIPTION[card.grade]}</p>
        )}

        {(tel || wa) && (
          <div className="mt-4 flex gap-2">
            {tel && (
              <a
                href={tel}
                className="tap flex-1 gap-1.5 rounded-md border border-line bg-white text-[13px] font-medium text-charcoal hover:bg-parchment"
              >
                <Phone className="size-4" />
                Call
              </a>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="tap flex-1 gap-1.5 rounded-md border border-line bg-white text-[13px] font-medium text-charcoal hover:bg-parchment"
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            )}
          </div>
        )}
      </header>

      {dragsTheBalance(card) && (
        <div className="flex gap-3 rounded-lg border border-today/30 bg-today-wash p-4">
          <TriangleAlert className="size-5 shrink-0 text-today" />
          <div>
            <p className="text-[14px] font-semibold text-today">Starts on time, drags the balance</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink">
              Only {card.fillRatePct}% of this vendor&rsquo;s orders arrive in a single dispatch, and
              the balance takes an average of {card.avgDispatchSpreadDays} days after the first lot.
              The delay figure alone makes them look better than they are.
            </p>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Reliability scorecard
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="card px-3 py-2.5">
              <p className="font-serif text-2xl leading-tight text-charcoal">{s.value}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{s.label}</p>
              {s.hint && <p className="mt-0.5 text-[11px] leading-snug text-muted/80">{s.hint}</p>}
            </div>
          ))}
        </div>
        {card.completedOrders === 0 && (
          <p className="mt-2 text-[12px] text-muted">
            Figures appear once this vendor has completed at least one order.
          </p>
        )}
      </section>

      <OrderList title={`Open orders (${open.length})`} orders={open} today={today} empty="No open orders with this vendor." />
      <OrderList title={`Past orders (${past.length})`} orders={past} today={today} empty="No completed orders yet." />

      <details className="group">
        <summary className="cursor-pointer list-none text-[13px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-charcoal">
          Edit vendor details
        </summary>
        <div className="mt-3">
          <VendorForm
            vendor={vendor}
            categories={categories}
            isAdmin={admin}
            paymentTerms={finance?.payment_terms ?? ''}
          />
        </div>
      </details>
    </div>
  )
}

function OrderList({
  title,
  orders,
  today,
  empty,
}: {
  title: string
  orders: Order[]
  today: string
  empty: string
}) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      {orders.length === 0 ? (
        <EmptyState title={empty} className="py-6" />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {orders.map((o) => {
            const late = !o.actual_dispatch_date && o.current_expected_dispatch_date < today
            return (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-parchment/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-charcoal">{o.order_no}</p>
                    <p className="truncate text-[12px] text-muted">
                      Ordered {formatDate(o.order_date)} ·{' '}
                      {o.actual_dispatch_date
                        ? `dispatched ${formatDate(o.actual_dispatch_date)}`
                        : `due ${formatDate(o.current_expected_dispatch_date)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <RevisionBadge count={o.revision_count} />
                    {o.delay_days !== null && (
                      <Badge tone={o.delay_days > 7 ? 'overdue' : o.delay_days > 2 ? 'today' : 'done'}>
                        {o.delay_days > 0 ? `+${o.delay_days}d` : o.delay_days === 0 ? 'On time' : `${o.delay_days}d`}
                      </Badge>
                    )}
                    {late && <Badge tone="overdue">Overdue</Badge>}
                    <StageBadge stage={o.stage} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
