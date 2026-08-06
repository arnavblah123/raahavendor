'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MessageCircle, PackageCheck, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { DispatchModal } from '@/components/orders/dispatch-modal'
import { LogFollowupModal } from '@/components/followups/log-followup-modal'
import { setOrderStage } from '@/app/(app)/actions'
import { ORDER_STAGES, STAGE_LABELS, SETTLED_STAGES } from '@/lib/constants'
import { renderTemplate, telUrl, whatsappUrl } from '@/lib/whatsapp'
import type { OrderWithContext } from '@/lib/types'

export function OrderActions({
  order,
  today,
  whatsappTemplate,
}: {
  order: OrderWithContext
  today: string
  whatsappTemplate: string
}) {
  const router = useRouter()
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [pending, start] = useTransition()

  const items = order.order_items ?? []
  const balance = items.reduce((s, i) => s + Math.max(0, i.qty_balance), 0)
  const canDispatch = balance > 0 && !['cancelled', 'closed'].includes(order.stage)

  const message = renderTemplate(whatsappTemplate, {
    vendor: order.vendor,
    orderNo: order.order_no,
    orderDate: order.order_date,
    promisedDate: order.current_expected_dispatch_date,
    items,
    today,
  })

  const wa = whatsappUrl(order.vendor?.phone, message)
  const tel = telUrl(order.vendor?.phone)

  return (
    <>
      <div className="space-y-2.5">
        {canDispatch && (
          <Button variant="gold" size="full" onClick={() => setDispatchOpen(true)}>
            <PackageCheck className="size-4" />
            {order.first_dispatch_date ? 'Record another dispatch' : 'Dispatched'}
          </Button>
        )}

        <div className="flex gap-2">
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
          <button
            onClick={() => setLogOpen(true)}
            className="tap flex-1 gap-1.5 rounded-md bg-charcoal px-2 text-[13px] font-medium text-cream hover:bg-charcoal/90"
          >
            <CheckCircle2 className="size-4" />
            Log
          </button>
        </div>

        <label className="block">
          <span className="text-[12px] uppercase tracking-wide text-muted">Stage</span>
          <Select
            className="mt-1"
            value={order.stage}
            disabled={pending}
            onChange={(e) => {
              const stage = e.target.value
              start(async () => {
                await setOrderStage(order.id, stage)
                router.refresh()
              })
            }}
          >
            {ORDER_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
          {SETTLED_STAGES.includes(order.stage) && (
            <span className="mt-1 block text-[12px] text-muted">
              Set to Closed to archive this order out of the active lists.
            </span>
          )}
        </label>
      </div>

      <DispatchModal
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        orderId={order.id}
        orderNo={order.order_no}
        vendorName={order.vendor?.name ?? 'Vendor'}
        items={items}
        defaultTransporter={order.transporter}
      />

      <LogFollowupModal
        open={logOpen}
        onOpenChange={setLogOpen}
        orderId={order.id}
        followupId={null}
        orderNo={order.order_no}
        vendorName={order.vendor?.name ?? 'Vendor'}
        currentExpected={order.current_expected_dispatch_date}
      />
    </>
  )
}
