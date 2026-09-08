import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Ruler, Truck } from 'lucide-react'
import { getInwardFinance, getOrderDetail, getSettings } from '@/lib/queries'
import { isAdmin } from '@/lib/auth'
import { Badge, PartialBadge, RevisionBadge, StageBadge } from '@/components/ui/badge'
import { OrderActions } from '@/components/orders/order-actions'
import { OrderTimeline } from '@/components/orders/order-timeline'
import { PoSection } from '@/components/orders/po-section'
import { InwardList } from '@/components/orders/inward-list'
import { formatDate, formatDateTime, daysBetween, todayIST } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { formatMeasurements, parseMeasurements } from '@/lib/measurements'
import { DEFAULT_WHATSAPP_TEMPLATE, PRODUCT_CATEGORY_LABELS } from '@/lib/constants'
import { totalBalancePcs, totalOrderedPcs } from '@/lib/whatsapp'
import type { Dispatch } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ placed?: string; inwarded?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const [detail, settings, admin] = await Promise.all([getOrderDetail(id), getSettings(), isAdmin()])

  if (!detail) notFound()

  const {
    order,
    followups,
    revisions,
    dispatches,
    activity,
    finance,
    itemFinance,
    purchaseOrder,
    inwards,
    photoUrls,
  } = detail
  const today = todayIST()
  const items = order.order_items ?? []

  const inwardFinance = admin
    ? await getInwardFinance(inwards.flatMap((i) => i.inward_items.map((x) => x.id)))
    : {}

  const ordered = totalOrderedPcs(items)
  const balance = totalBalancePcs(items)
  const dispatchedPcs = ordered - balance
  const receivedPcs = items.reduce((s, i) => s + (i.qty_received ?? 0), 0)

  const rateByItem = new Map(itemFinance.map((f) => [f.order_item_id, f]))

  const isOpen = !['dispatched', 'received', 'closed', 'cancelled'].includes(order.stage)
  const isFinished = ['closed', 'cancelled'].includes(order.stage)
  const daysLeft = daysBetween(today, order.current_expected_dispatch_date)

  const dispatchRows = dispatches as unknown as (Dispatch & {
    dispatch_items: { order_item_id: string; quantity_dispatched: number }[]
  })[]

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          Orders
        </Link>
      </div>

      {query.inwarded && (
        <div className="rounded-lg border border-done/40 bg-done-wash p-3.5 text-[13px] text-charcoal">
          <span className="font-semibold text-done">Inward {query.inwarded} saved.</span>{' '}
          {receivedPcs >= ordered
            ? 'Every piece is in — the order is marked as received.'
            : `${ordered - receivedPcs} of ${ordered} pcs still to come.`}
        </div>
      )}

      <header className="card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/vendors/${order.vendor_id}`}>
              <h1 className="truncate font-serif text-3xl leading-tight text-charcoal hover:text-gold">
                {order.vendor?.name ?? 'Unknown vendor'}
              </h1>
            </Link>
            <p className="mt-0.5 text-[13px] text-muted">
              {order.order_no} · ordered {formatDate(order.order_date)} · {order.lead_time_days} day
              lead time
            </p>
          </div>
          <StageBadge stage={order.stage} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {order.priority === 'urgent' && <Badge tone="overdue">Urgent</Badge>}
          <RevisionBadge count={order.revision_count} />
          <PartialBadge dispatched={dispatchedPcs} total={ordered} />
          {purchaseOrder && <Badge tone="gold">{purchaseOrder.po_no}</Badge>}
        </div>

        {/* The headline number: how late, or how long left. */}
        <div className="mt-4 rounded-md border border-line bg-parchment/50 p-3">
          {order.actual_dispatch_date ? (
            <p className="text-[15px] text-charcoal">
              Dispatched {formatDate(order.actual_dispatch_date)}
              {order.delay_days !== null && (
                <span
                  className={
                    order.delay_days > 7
                      ? 'font-semibold text-overdue'
                      : order.delay_days > 2
                        ? 'font-semibold text-today'
                        : 'font-semibold text-done'
                  }
                >
                  {' — '}
                  {order.delay_days > 0
                    ? `${order.delay_days} days late`
                    : order.delay_days === 0
                      ? 'on time'
                      : `${Math.abs(order.delay_days)} days early`}
                </span>
              )}
            </p>
          ) : isOpen && daysLeft < 0 ? (
            <p className="text-[15px] font-semibold text-overdue">
              {Math.abs(daysLeft)} days overdue — was due {formatDate(order.current_expected_dispatch_date)}
            </p>
          ) : isOpen && daysLeft === 0 ? (
            <p className="text-[15px] font-semibold text-today">Due today</p>
          ) : (
            <p className="text-[15px] text-charcoal">
              {daysLeft} days left — due {formatDate(order.current_expected_dispatch_date)}
            </p>
          )}

          {order.revision_count > 0 && (
            <p className="mt-1 text-[12px] text-muted">
              Originally promised for {formatDate(order.original_expected_dispatch_date)}. All delay
              figures are measured against that date.
            </p>
          )}

          {balance > 0 && dispatchedPcs > 0 && (
            <p className="mt-1 text-[13px] font-medium text-today">
              {balance} of {ordered} pcs still pending
            </p>
          )}
        </div>

        <div className="mt-4">
          <OrderActions
            order={order}
            today={today}
            whatsappTemplate={
              daysLeft < 0
                ? settings?.whatsapp_template_overdue || DEFAULT_WHATSAPP_TEMPLATE
                : settings?.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE
            }
          />
        </div>
      </header>

      <PoSection
        orderId={order.id}
        orderNo={order.order_no}
        po={purchaseOrder}
        canInward={!!purchaseOrder && receivedPcs < ordered && !isFinished}
        isAdmin={admin}
        justPlaced={query.placed === '1'}
        isFinished={isFinished}
      />

      {/* Items */}
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Items
        </h2>
        <div className="card divide-y divide-line overflow-hidden">
          {items.map((i) => {
            const fin = rateByItem.get(i.id)
            const measurements = parseMeasurements(i.measurements)
            const photo = i.photo_path ? photoUrls[i.photo_path] : undefined
            return (
              <div key={i.id} className="flex gap-3 p-3.5">
                {photo ? (
                  <a href={photo} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={i.product_name}
                      className="size-16 rounded-md border border-line object-cover"
                    />
                  </a>
                ) : (
                  <div
                    className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-line bg-parchment/60 text-[10px] uppercase tracking-wide text-muted"
                    title="No photo was added when the order was placed"
                  >
                    No photo
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-charcoal">
                        {i.design_code && <span className="text-muted">{i.design_code} · </span>}
                        {i.product_name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {[
                          PRODUCT_CATEGORY_LABELS[i.category],
                          i.colour,
                          i.size,
                          i.description,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[14px] font-medium text-charcoal">
                        {i.quantity} {i.unit}
                      </p>
                      {admin && fin?.rate != null && (
                        <p className="text-[12px] text-muted">
                          {formatMoney(Number(fin.rate))} each
                        </p>
                      )}
                    </div>
                  </div>

                  {measurements.length > 0 && (
                    <p className="mt-1.5 flex items-start gap-1 text-[12px] text-ink">
                      <Ruler className="mt-0.5 size-3.5 shrink-0 text-gold" />
                      <span>{formatMeasurements(measurements, i.measurement_unit)}</span>
                    </p>
                  )}

                  {(i.qty_dispatched > 0 || (i.qty_received ?? 0) > 0) && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-parchment">
                        <div
                          className={`h-full rounded-full ${i.qty_balance === 0 ? 'bg-done' : 'bg-today'}`}
                          style={{ width: `${Math.round((i.qty_dispatched / i.quantity) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {i.qty_dispatched} sent
                        {i.qty_balance > 0 ? ` · ${i.qty_balance} pending` : ' · complete'}
                        {(i.qty_received ?? 0) > 0 && ` · ${i.qty_received} received in shop`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between bg-parchment/40 px-3.5 py-2.5">
            <span className="text-[13px] font-medium text-ink">
              {ordered} pcs ordered · {dispatchedPcs} sent · {balance} pending
              {receivedPcs > 0 && ` · ${receivedPcs} received`}
            </span>
            {admin && finance?.total_amount != null && (
              <span className="text-[14px] font-semibold text-charcoal">
                {formatMoney(Number(finance.total_amount))}
              </span>
            )}
          </div>
        </div>
      </section>

      <InwardList inwards={inwards} items={items} financeByItem={inwardFinance} isAdmin={admin} />

      {/* Dispatches */}
      {dispatchRows.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            Dispatches
          </h2>
          <div className="space-y-2">
            {dispatchRows.map((d) => {
              const pcs = d.dispatch_items.reduce((s, x) => s + x.quantity_dispatched, 0)
              return (
                <div key={d.id} className="card flex items-start gap-3 p-3.5">
                  <Truck className="mt-0.5 size-4 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-charcoal">
                      Dispatch {d.dispatch_no} — {formatDate(d.dispatch_date)} — {pcs} pcs
                      {d.docket_no && ` — Docket ${d.docket_no}`}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {[d.transporter, d.is_partial ? 'Partial' : 'Completed the order', d.remarks]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Follow-up ladder */}
      <OrderTimeline followups={followups} today={today} />

      {/* Revisions */}
      {revisions.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            Revision history
          </h2>
          <div className="card divide-y divide-line overflow-hidden">
            {(revisions as { id: string; old_expected_date: string; new_expected_date: string; days_added: number; reason: string | null; created_at: string }[]).map(
              (r, idx) => (
                <div key={r.id} className="px-3.5 py-3">
                  <p className="text-[13px] text-charcoal">
                    <span className="font-medium">Revision {idx + 1}:</span>{' '}
                    {formatDate(r.old_expected_date)} → {formatDate(r.new_expected_date)}{' '}
                    <span className={r.days_added > 0 ? 'text-overdue' : 'text-done'}>
                      ({r.days_added > 0 ? '+' : ''}
                      {r.days_added} days)
                    </span>
                  </p>
                  {r.reason && <p className="mt-0.5 text-[12px] text-muted">{r.reason}</p>}
                  <p className="mt-0.5 text-[11px] text-muted">{formatDateTime(r.created_at)}</p>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {/* Payment — admin only */}
      {admin && finance && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            Payment
          </h2>
          <div className="card space-y-1.5 p-3.5">
            <Row label="Total amount" value={formatMoney(finance.total_amount ? Number(finance.total_amount) : null)} />
            <Row label="Advance paid" value={formatMoney(finance.advance_paid ? Number(finance.advance_paid) : 0)} />
            <Row
              label="Balance"
              value={formatMoney(
                (Number(finance.total_amount) || 0) - (Number(finance.advance_paid) || 0),
              )}
            />
            {finance.payment_notes && (
              <p className="pt-1 text-[13px] text-muted">{finance.payment_notes}</p>
            )}
          </div>
        </section>
      )}

      {order.notes && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
            Notes
          </h2>
          <p className="card p-3.5 text-[13px] leading-relaxed text-ink">{order.notes}</p>
        </section>
      )}

      {/* Activity log */}
      {activity.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-charcoal">
            Activity log ({activity.length})
          </summary>
          <ul className="card mt-2 divide-y divide-line overflow-hidden">
            {(activity as { id: string; detail: string | null; action: string; created_at: string }[]).map((a) => (
              <li key={a.id} className="px-3.5 py-2.5">
                <p className="text-[13px] text-ink">{a.detail ?? a.action}</p>
                <p className="text-[11px] text-muted">{formatDateTime(a.created_at)}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[14px] font-medium text-charcoal">{value}</span>
    </div>
  )
}
