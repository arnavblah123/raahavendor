'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, PackageOpen, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ErrorNote } from '@/components/common/states'
import { cancelPurchaseOrder, createPurchaseOrder } from '@/app/(app)/actions'
import { formatDate } from '@/lib/dates'
import { PO_STATUS_LABELS } from '@/lib/po'
import type { PurchaseOrder } from '@/lib/types'

const PO_TONE: Record<PurchaseOrder['status'], 'gold' | 'today' | 'done' | 'neutral'> = {
  issued: 'gold',
  partially_received: 'today',
  received: 'done',
  cancelled: 'neutral',
}

/**
 * The purchase order block on an order page. Three states: no PO yet (offer
 * to raise one), PO exists (view, print, inward), or the order is finished.
 */
export function PoSection({
  orderId,
  po,
  canInward,
  isAdmin,
  justPlaced,
  orderNo,
  isFinished,
}: {
  orderId: string
  po: PurchaseOrder | null
  canInward: boolean
  isAdmin: boolean
  justPlaced: boolean
  orderNo: string
  isFinished: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  function raise() {
    setError(null)
    start(async () => {
      const res = await createPurchaseOrder({ orderId })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/orders/${orderId}/po`)
      router.refresh()
    })
  }

  function cancel() {
    if (!po) return
    if (!window.confirm(`Cancel ${po.po_no}? You can raise a fresh one afterwards.`)) return
    setError(null)
    start(async () => {
      const res = await cancelPurchaseOrder(po.id, orderId)
      if (!res.ok) setError(res.error)
      router.refresh()
    })
  }

  if (!po) {
    if (isFinished) return null
    const prompt = justPlaced && !dismissed
    return (
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Purchase order
        </h2>
        <div
          className={
            prompt
              ? 'rounded-lg border border-gold/40 bg-gold-wash p-4'
              : 'card p-4'
          }
        >
          {prompt ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-serif text-lg leading-tight text-charcoal">
                  Order {orderNo} placed.
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">
                  Raise a purchase order for the vendor now? The PO number is generated
                  automatically, it lists every piece with its photo and measurements, and goods
                  are inwarded against it when they arrive.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="tap -mr-2 -mt-2 shrink-0 rounded-md text-muted hover:text-charcoal"
                aria-label="Not now"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              No purchase order yet. Raise one to get an automatic PO number and a printable
              document for the vendor. Goods are inwarded against it when they arrive.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="gold" onClick={raise} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <FileText className="size-4" />}
              {pending ? 'Raising…' : 'Create purchase order'}
            </Button>
            {prompt && (
              <Button variant="ghost" onClick={() => setDismissed(true)} disabled={pending}>
                Not now
              </Button>
            )}
          </div>
          <div className="mt-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        Purchase order
      </h2>
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-xl leading-tight text-charcoal">{po.po_no}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              Raised {formatDate(po.po_date)} · delivery expected {formatDate(po.expected_delivery_date)}
            </p>
          </div>
          <Badge tone={PO_TONE[po.status]}>{PO_STATUS_LABELS[po.status]}</Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/orders/${orderId}/po`}>
              <Printer className="size-4" />
              View / print PO
            </Link>
          </Button>
          {canInward && (
            <Button asChild variant="gold">
              <Link href={`/orders/${orderId}/inward`}>
                <PackageOpen className="size-4" />
                Inward goods
              </Link>
            </Button>
          )}
          {isAdmin && po.status === 'issued' && (
            <Button variant="quiet" onClick={cancel} disabled={pending}>
              Cancel PO
            </Button>
          )}
        </div>
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    </section>
  )
}
