import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, PackageCheck } from 'lucide-react'
import { getPurchaseOrderForOrder } from '@/lib/queries'
import { requireProfile } from '@/lib/auth'
import { InwardForm } from '@/components/orders/inward-form'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inward goods — Raaha' }

export default async function InwardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profile, data] = await Promise.all([requireProfile(), getPurchaseOrderForOrder(id)])

  // Inwarding is always against a PO. Without one, go and raise it first.
  if (!data) redirect(`/orders/${id}`)

  const { po, order, photoUrls, inwards } = data
  const items = order.order_items ?? []
  const ordered = items.reduce((s, i) => s + i.quantity, 0)
  const received = items.reduce((s, i) => s + (i.qty_received ?? 0), 0)
  const finished = ['closed', 'cancelled'].includes(order.stage)

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/orders/${id}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          {order.order_no}
        </Link>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-charcoal">Inward goods</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {order.vendor?.name} · {po.po_no} · expected by {formatDate(po.expected_delivery_date)}
          {inwards.length > 0 && ` · ${received} of ${ordered} pcs already received`}
        </p>
      </div>

      {received >= ordered || finished ? (
        <EmptyState
          icon={<PackageCheck />}
          title={finished ? `This order is ${order.stage}` : 'Everything has been received'}
          description={
            finished
              ? 'Nothing more can be inwarded against it.'
              : `All ${ordered} pieces on ${po.po_no} are in. Nothing left to inward.`
          }
          action={
            <Button asChild variant="outline">
              <Link href={`/orders/${id}`}>Back to the order</Link>
            </Button>
          }
        />
      ) : (
        <InwardForm
          po={po}
          items={items}
          photoUrls={photoUrls}
          isAdmin={profile.role === 'admin'}
          defaultReceivedBy={profile.full_name}
        />
      )}
    </div>
  )
}
