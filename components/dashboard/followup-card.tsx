'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, MessageCircle, Phone } from 'lucide-react'
import { Badge, PartialBadge, RevisionBadge } from '@/components/ui/badge'
import { LogFollowupModal } from '@/components/followups/log-followup-modal'
import { cn } from '@/lib/utils'
import { formatDate, formatDateShort, daysBetween, type DateStr } from '@/lib/dates'
import { describeProgress, daysOverdue, type Urgency } from '@/lib/followups'
import { renderTemplate, telUrl, totalBalancePcs, totalOrderedPcs, whatsappUrl } from '@/lib/whatsapp'
import { snoozeFollowup } from '@/app/(app)/actions'
import type { Followup, OrderWithContext } from '@/lib/types'

const URGENCY_BORDER: Record<Urgency, string> = {
  overdue: 'border-l-4 border-l-overdue',
  today: 'border-l-4 border-l-today',
  missed: 'border-l-4 border-l-missed',
  upcoming: 'border-l-4 border-l-upcoming',
  done: 'border-l-4 border-l-done',
}

export interface FollowupCardProps {
  order: OrderWithContext
  followup: Followup | null
  extraMissed: number
  urgency: Urgency
  today: DateStr
  whatsappTemplate: string
}

export function FollowupCard({
  order,
  followup,
  extraMissed,
  urgency,
  today,
  whatsappTemplate,
}: FollowupCardProps) {
  const router = useRouter()
  const [logOpen, setLogOpen] = useState(false)
  const [snoozing, startSnooze] = useTransition()
  // Optimistic: the card greys out and drops away the instant you act on it,
  // rather than waiting for the server round-trip.
  const [settled, setSettled] = useState(false)

  const vendor = order.vendor
  const items = order.order_items ?? []
  const balance = totalBalancePcs(items)
  const ordered = totalOrderedPcs(items)
  const dispatched = ordered - balance
  const late = daysOverdue(order.current_expected_dispatch_date, today)

  const message = renderTemplate(whatsappTemplate, {
    vendor,
    orderNo: order.order_no,
    orderDate: order.order_date,
    promisedDate: order.current_expected_dispatch_date,
    items,
    today,
  })

  const wa = whatsappUrl(vendor?.phone, message)
  const tel = telUrl(vendor?.phone)

  const progress = describeProgress({
    orderDate: order.order_date,
    currentExpected: order.current_expected_dispatch_date,
    today,
    checkpointPct: followup?.checkpoint_pct ?? null,
  })

  function onSnooze() {
    if (!followup) return
    setSettled(true)
    startSnooze(async () => {
      const res = await snoozeFollowup(followup.id)
      if (!res.ok) setSettled(false)
      router.refresh()
    })
  }

  return (
    <>
      <article
        className={cn(
          'card p-3.5 transition-opacity sm:p-4',
          URGENCY_BORDER[urgency],
          settled && 'pointer-events-none opacity-40',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link href={`/orders/${order.id}`} className="block">
              <h3 className="truncate font-serif text-lg leading-tight text-charcoal">
                {vendor?.name ?? 'Unknown vendor'}
              </h3>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {order.order_no}
                {items.length > 0 && (
                  <>
                    {' · '}
                    {items[0].quantity} {items[0].unit} {items[0].product_name}
                    {items.length > 1 && ` +${items.length - 1}`}
                  </>
                )}
              </p>
            </Link>
          </div>

          {urgency === 'overdue' ? (
            <div className="shrink-0 text-right leading-none">
              <div className="font-serif text-3xl font-semibold text-overdue">{late}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-overdue">
                {late === 1 ? 'day late' : 'days late'}
              </div>
            </div>
          ) : (
            <Badge tone={urgency === 'done' ? 'done' : urgency}>
              {urgency === 'today'
                ? 'Due today'
                : urgency === 'missed'
                  ? `Missed ${formatDateShort(followup?.due_date)}`
                  : formatDateShort(followup?.due_date)}
            </Badge>
          )}
        </div>

        <p className="mt-2 text-[13px] text-ink">
          {progress}
          <span className="text-muted">
            {' · '}
            {urgency === 'overdue' ? 'was due ' : 'due '}
            {formatDate(order.current_expected_dispatch_date)}
          </span>
        </p>

        {(order.revision_count > 0 || dispatched > 0 || extraMissed > 0 || order.priority === 'urgent') && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {order.priority === 'urgent' && <Badge tone="overdue">Urgent</Badge>}
            <RevisionBadge count={order.revision_count} />
            <PartialBadge dispatched={dispatched} total={ordered} />
            {dispatched > 0 && balance > 0 && (
              <span className="text-[12px] font-medium text-today">
                {balance} of {ordered} pcs still pending
              </span>
            )}
            {extraMissed > 0 && (
              <Badge tone="missed">
                +{extraMissed} missed {extraMissed === 1 ? 'check' : 'checks'}
              </Badge>
            )}
            {(followup?.snooze_count ?? 0) > 0 && (
              <Badge tone="neutral">Snoozed {followup!.snooze_count}×</Badge>
            )}
          </div>
        )}

        <div className="mt-3 flex items-stretch gap-2">
          <ActionLink
            href={tel}
            icon={<Phone className="size-4" />}
            label="Call"
            disabledHint="No phone number"
          />
          <ActionLink
            href={wa}
            icon={<MessageCircle className="size-4" />}
            label="WhatsApp"
            disabledHint="No phone number"
            external
          />
          <button
            onClick={() => setLogOpen(true)}
            className="tap flex-1 gap-1.5 rounded-md bg-charcoal px-2 text-[13px] font-medium text-cream hover:bg-charcoal/90"
          >
            <CheckCircle2 className="size-4" />
            Log
          </button>
        </div>

        {followup && (
          <button
            onClick={onSnooze}
            disabled={snoozing}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-charcoal disabled:opacity-50"
          >
            <Clock className="size-3.5" />
            Snooze 2 days
          </button>
        )}
      </article>

      <LogFollowupModal
        open={logOpen}
        onOpenChange={setLogOpen}
        orderId={order.id}
        followupId={followup?.id ?? null}
        orderNo={order.order_no}
        vendorName={vendor?.name ?? 'Vendor'}
        currentExpected={order.current_expected_dispatch_date}
        onLogged={() => setSettled(true)}
      />
    </>
  )
}

function ActionLink({
  href,
  icon,
  label,
  disabledHint,
  external,
}: {
  href: string | null
  icon: React.ReactNode
  label: string
  disabledHint: string
  external?: boolean
}) {
  if (!href) {
    return (
      <span
        title={disabledHint}
        className="tap flex-1 gap-1.5 rounded-md border border-line bg-parchment px-2 text-[13px] font-medium text-muted/60"
      >
        {icon}
        {label}
      </span>
    )
  }
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="tap flex-1 gap-1.5 rounded-md border border-line bg-white px-2 text-[13px] font-medium text-charcoal hover:bg-parchment"
    >
      {icon}
      {label}
    </a>
  )
}

/** Slimmer row used by the collapsed "Coming up" band. */
export function ComingUpRow({ order, followup, today }: { order: OrderWithContext; followup: Followup | null; today: DateStr }) {
  const inDays = followup ? daysBetween(today, followup.due_date) : null
  return (
    <Link
      href={`/orders/${order.id}`}
      className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-3 last:border-0 hover:bg-parchment/60"
    >
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-charcoal">
          {order.vendor?.name ?? 'Unknown vendor'}
        </p>
        <p className="truncate text-[12px] text-muted">
          {order.order_no} · {formatDate(order.current_expected_dispatch_date)}
        </p>
      </div>
      <Badge tone="upcoming">
        {inDays === 1 ? 'Tomorrow' : inDays !== null ? `In ${inDays} days` : '—'}
      </Badge>
    </Link>
  )
}
