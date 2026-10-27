import Link from 'next/link'
import { ArrowRight, Camera } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { PRODUCT_CATEGORY_LABELS } from '@/lib/constants'
import { ListShareActions } from '@/components/purchase-lists/list-share-actions'
import type { ListPdfInput } from '@/lib/list-pdf'
import type { PurchaseListWithContext, Vendor } from '@/lib/types'

/**
 * A list that has already become an order. Read-only: the order is now the
 * record, this is just where it came from.
 */
export function ListSummary({
  list,
  photoUrls,
  rates,
  isAdmin,
  vendor,
  from,
}: {
  list: PurchaseListWithContext
  photoUrls: Record<string, string>
  rates: Record<string, number | null>
  isAdmin: boolean
  vendor: Vendor | null
  from: ListPdfInput['from']
}) {
  const items = list.purchase_list_items
  const totalPcs = items.reduce((s, i) => s + i.quantity, 0)
  const knownTotal = isAdmin
    ? items.reduce((s, i) => s + i.quantity * (rates[i.id] ?? 0), 0)
    : 0

  const pdfInput: ListPdfInput = {
    from,
    vendor: {
      name: list.vendor?.name ?? 'Vendor',
      company_name: list.vendor?.company_name ?? null,
      contact_person: vendor?.contact_person ?? null,
      city: list.vendor?.city ?? null,
    },
    visitDate: formatDate(list.visit_date),
    notes: list.notes,
    pieces: items.map((i, idx) => ({
      n: idx + 1,
      product_name: i.product_name || `Piece ${idx + 1}`,
      design_code: i.design_code,
      colour: i.colour,
      category: PRODUCT_CATEGORY_LABELS[i.category],
      quantity: i.quantity,
      unit: i.unit,
      notes: i.notes,
      photoUrl: i.photo_path ? (photoUrls[i.photo_path] ?? null) : null,
    })),
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-done/40 bg-done-wash p-3.5 text-[13px] text-charcoal">
        <span className="font-semibold text-done">This list became an order.</span>{' '}
        {list.order_id ? (
          <Link href={`/orders/${list.order_id}`} className="inline-flex items-center gap-1 underline">
            Open the order
            <ArrowRight className="size-3.5" />
          </Link>
        ) : (
          'The order has since been deleted.'
        )}
      </div>

      <section className="card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg text-charcoal">Pieces picked</h2>
          <p className="text-[13px] text-muted">
            {items.length} {items.length === 1 ? 'piece' : 'pieces'} · {totalPcs} pcs
            {isAdmin && knownTotal > 0 && ` · ${formatMoney(knownTotal)}`}
          </p>
        </div>
        <ol className="mt-3 divide-y divide-line">
          {items.map((i, idx) => {
            const url = i.photo_path ? photoUrls[i.photo_path] : undefined
            return (
              <li key={i.id} className="flex gap-3 py-3">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={i.product_name ?? `Piece ${idx + 1}`}
                    className="size-20 shrink-0 rounded-md border border-line object-cover"
                  />
                ) : (
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-line text-muted">
                    <Camera className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-charcoal">
                    {i.product_name || `Piece ${idx + 1}`}
                  </p>
                  <p className="text-[12px] text-muted">
                    {[
                      PRODUCT_CATEGORY_LABELS[i.category],
                      i.design_code,
                      i.colour,
                      `${i.quantity} ${i.unit}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {i.notes && <p className="mt-0.5 text-[12px] text-ink">{i.notes}</p>}
                  <div className="mt-1">
                    {isAdmin && rates[i.id] != null ? (
                      <Badge tone="gold">{formatMoney(rates[i.id])} each</Badge>
                    ) : i.has_rate ? (
                      <Badge tone="done">Price noted</Badge>
                    ) : (
                      <Badge tone="neutral">No price yet</Badge>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="card p-4 sm:p-5">
        <ListShareActions
          input={pdfInput}
          vendorPhone={vendor?.phone ?? null}
          vendorEmail={vendor?.email ?? null}
        />
      </div>

      <p className="text-[12px] text-muted">
        Visited {formatDate(list.visit_date)}
        {list.notes ? ` · ${list.notes}` : ''}
      </p>

      <div className="flex justify-center">
        <Button asChild variant="outline">
          <Link href="/purchase-lists">All purchase lists</Link>
        </Button>
      </div>
    </div>
  )
}
