import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getPurchaseOrderForOrder } from '@/lib/queries'
import { isAdmin } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { PoPrintActions } from '@/components/orders/po-print-actions'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { formatMeasurements, parseMeasurements } from '@/lib/measurements'
import { PO_STATUS_LABELS, poWhatsappMessage } from '@/lib/po'
import { PRODUCT_CATEGORY_LABELS } from '@/lib/constants'
import { whatsappUrl } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Purchase order — Raaha' }

/**
 * The purchase order as a document: what the vendor is sent, and what the
 * goods are checked against when they arrive. Prints cleanly on A4 from the
 * browser; "Save as PDF" in the print dialog gives a file to WhatsApp.
 */
export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [data, admin] = await Promise.all([getPurchaseOrderForOrder(id), isAdmin()])

  // No PO yet: back to the order, where it can be raised.
  if (!data) redirect(`/orders/${id}`)

  const { po, order, finance, orderFinance, inwards, photoUrls } = data
  const vendor = po.vendor
  const lines = po.lines

  const rateByItem = new Map((finance?.lines ?? []).map((l) => [l.order_item_id, l]))
  const showMoney = admin && !!finance
  const totalPcs = lines.reduce((s, l) => s + l.quantity, 0)
  const linesTotal = lines.reduce((s, l) => {
    const r = rateByItem.get(l.order_item_id)
    return s + (Number(r?.amount) || (Number(r?.rate) || 0) * l.quantity)
  }, 0)
  const total = finance?.total_amount != null ? Number(finance.total_amount) : linesTotal
  const advance = finance?.advance_paid != null ? Number(finance.advance_paid) : Number(orderFinance?.advance_paid) || 0

  const receivedPcs = order.order_items.reduce((s, i) => s + (i.qty_received ?? 0), 0)
  const canInward = receivedPcs < totalPcs && !['closed', 'cancelled'].includes(order.stage)

  const wa = whatsappUrl(
    vendor?.phone,
    poWhatsappMessage({
      vendorName: vendor?.name,
      poNo: po.po_no,
      poDate: po.po_date,
      expectedDate: po.expected_delivery_date,
      lines,
    }),
  )

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/orders/${id}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          {order.order_no}
        </Link>
        <Badge tone={po.status === 'received' ? 'done' : po.status === 'partially_received' ? 'today' : 'gold'}>
          {PO_STATUS_LABELS[po.status]}
        </Badge>
      </div>

      <PoPrintActions orderId={id} whatsappHref={wa} canInward={canInward} />

      {/* ---- The document ---- */}
      <article className="po-document rounded-lg border border-line bg-white p-5 text-charcoal sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-charcoal pb-4">
          <div>
            <p className="font-serif text-2xl leading-none">Raaha</p>
            <p className="font-serif text-sm italic text-gold">by Archana Bansal</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Purchase order
            </p>
            <p className="font-serif text-2xl leading-tight">{po.po_no}</p>
            <p className="text-[13px] text-ink">Dated {formatDate(po.po_date)}</p>
          </div>
        </header>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">To</p>
            <p className="mt-1 text-[15px] font-medium">{vendor?.name ?? '—'}</p>
            {vendor?.company_name && <p className="text-[13px] text-ink">{vendor.company_name}</p>}
            {vendor?.contact_person && (
              <p className="text-[13px] text-ink">Attn: {vendor.contact_person}</p>
            )}
            {vendor?.city && <p className="text-[13px] text-ink">{vendor.city}</p>}
            {vendor?.phone && <p className="text-[13px] text-ink">{vendor.phone}</p>}
            {vendor?.gst_no && <p className="text-[13px] text-ink">GSTIN {vendor.gst_no}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Delivery
            </p>
            <p className="mt-1 text-[15px] font-medium">
              Expected by {formatDate(po.expected_delivery_date)}
            </p>
            <p className="text-[13px] text-ink">
              Against order {order.order_no} of {formatDate(order.order_date)}
            </p>
            <p className="text-[13px] text-ink">
              {totalPcs} {totalPcs === 1 ? 'piece' : 'pieces'} in {lines.length}{' '}
              {lines.length === 1 ? 'line' : 'lines'}
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-charcoal text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">Piece</th>
                <th className="py-2 pr-2 font-semibold">Details</th>
                <th className="py-2 pr-2 text-right font-semibold">Qty</th>
                {showMoney && <th className="py-2 pr-2 text-right font-semibold">Rate</th>}
                {showMoney && <th className="py-2 text-right font-semibold">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const r = rateByItem.get(l.order_item_id)
                const measurements = parseMeasurements(l.measurements)
                const photo = l.photo_path ? photoUrls[l.photo_path] : undefined
                const amount = Number(r?.amount) || (Number(r?.rate) || 0) * l.quantity
                return (
                  <tr key={l.order_item_id} className="border-b border-line align-top">
                    <td className="py-3 pr-2 text-muted">{idx + 1}</td>
                    <td className="py-3 pr-2">
                      <div className="flex gap-3">
                        {photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo}
                            alt={l.product_name}
                            className="size-20 shrink-0 rounded border border-line object-cover"
                          />
                        )}
                        <div>
                          <p className="font-medium">{l.product_name}</p>
                          {l.design_code && <p className="text-ink">Design {l.design_code}</p>}
                          <p className="text-muted">{PRODUCT_CATEGORY_LABELS[l.category]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-ink">
                      {[l.colour, l.size, l.description].filter(Boolean).join(' · ') || '—'}
                      {measurements.length > 0 && (
                        <p className="mt-1">
                          <span className="font-medium">Measurements:</span>{' '}
                          {formatMeasurements(measurements, l.measurement_unit)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-2 text-right font-medium">
                      {l.quantity} {l.unit}
                    </td>
                    {showMoney && (
                      <td className="py-3 pr-2 text-right">
                        {r?.rate != null ? formatMoney(Number(r.rate)) : '—'}
                      </td>
                    )}
                    {showMoney && (
                      <td className="py-3 text-right">{amount ? formatMoney(amount) : '—'}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="text-[14px] font-semibold">
                <td colSpan={3} className="py-3 pr-2">
                  Total
                </td>
                <td className="py-3 pr-2 text-right">{totalPcs} pcs</td>
                {showMoney && <td className="py-3 pr-2" />}
                {showMoney && <td className="py-3 text-right">{formatMoney(total)}</td>}
              </tr>
              {showMoney && advance > 0 && (
                <tr className="text-[13px] text-ink">
                  <td colSpan={showMoney ? 5 : 4} className="py-1 pr-2 text-right">
                    Advance paid
                  </td>
                  <td className="py-1 text-right">{formatMoney(advance)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {(po.terms || po.notes) && (
          <div className="mt-6 grid gap-4 text-[13px] sm:grid-cols-2">
            {po.terms && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Terms</p>
                <p className="mt-1 whitespace-pre-line text-ink">{po.terms}</p>
              </div>
            )}
            {po.notes && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Notes</p>
                <p className="mt-1 whitespace-pre-line text-ink">{po.notes}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex items-end justify-between gap-6 text-[12px] text-muted">
          <p className="max-w-sm leading-relaxed">
            Please quote {po.po_no} on the delivery challan and invoice. Pieces will be checked
            against the photo and measurements above on arrival.
          </p>
          <div className="text-right">
            <div className="mb-1 h-10 w-40 border-b border-charcoal" />
            <p>For Raaha by Archana Bansal</p>
          </div>
        </div>
      </article>

      {inwards.length > 0 && (
        <p className="no-print text-[13px] text-muted">
          {inwards.length} {inwards.length === 1 ? 'inward' : 'inwards'} recorded against this PO —{' '}
          <Link href={`/orders/${id}`} className="underline hover:text-charcoal">
            see them on the order
          </Link>
          .
        </p>
      )}
      {!showMoney && admin && (
        <p className="no-print text-[12px] text-muted">
          This PO was raised by a staff member, so it carries no rates. The agreed rates are on the
          order page.
        </p>
      )}
    </div>
  )
}
