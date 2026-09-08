import { Flag, PackageOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { describeDeviations, parseMeasurementChecks, type MeasurementUnit } from '@/lib/measurements'
import type { InwardWithItems } from '@/lib/queries'
import type { InwardItemFinance, OrderItem } from '@/lib/types'

/**
 * The inward history on an order page: each receipt, what came, what was
 * flagged. Prices appear only for the admin.
 */
export function InwardList({
  inwards,
  items,
  financeByItem,
  isAdmin,
}: {
  inwards: InwardWithItems[]
  items: OrderItem[]
  financeByItem: Record<string, InwardItemFinance>
  isAdmin: boolean
}) {
  if (inwards.length === 0) return null
  const itemById = new Map(items.map((i) => [i.id, i]))

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        Goods received
      </h2>
      <div className="space-y-2">
        {inwards.map((inw) => (
          <div key={inw.id} className="card p-3.5">
            <div className="flex items-start gap-3">
              <PackageOpen className="mt-0.5 size-4 shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-charcoal">
                  Inward {inw.inward_no} — {formatDate(inw.inward_date)} — {inw.pcs_received} pcs
                  {inw.invoice_no && ` — Invoice ${inw.invoice_no}`}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {[inw.received_by ? `received by ${inw.received_by}` : null, inw.remarks]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {inw.flagged_count > 0 && (
                <Badge tone="overdue">
                  <Flag className="size-3" />
                  {inw.flagged_count} flagged
                </Badge>
              )}
            </div>

            <ul className="mt-2.5 divide-y divide-line border-t border-line">
              {inw.inward_items.map((ii) => {
                const item = itemById.get(ii.order_item_id)
                const unit = (item?.measurement_unit ?? 'in') as MeasurementUnit
                const checks = parseMeasurementChecks(ii.measurement_checks)
                const deviation = describeDeviations(checks, unit)
                const fin = financeByItem[ii.id]
                return (
                  <li key={ii.id} className="py-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-[13px] text-charcoal">
                        <span className="font-medium">{ii.qty_received}</span>{' '}
                        {item?.unit ?? 'pcs'} {item?.product_name ?? 'Item'}
                        {item?.design_code && <span className="text-muted"> · {item.design_code}</span>}
                      </p>
                      {isAdmin && fin?.rate != null && (
                        <span className="shrink-0 text-[12px] text-muted">
                          {formatMoney(Number(fin.rate))} each
                        </span>
                      )}
                    </div>
                    {ii.measurements_checked && (
                      <p className={`mt-0.5 text-[12px] ${ii.has_deviation ? 'text-overdue' : 'text-done'}`}>
                        {ii.has_deviation
                          ? `Measurements differ: ${deviation}`
                          : 'Measurements checked — all match'}
                      </p>
                    )}
                    {ii.is_flagged && (
                      <div className="mt-1 rounded-md border border-overdue/30 bg-overdue-wash px-2.5 py-2">
                        <p className="text-[12px] font-semibold text-overdue">
                          {ii.flag_status === 'resolved' ? 'Flag resolved' : 'Flagged for the owner'}
                        </p>
                        <p className="text-[13px] text-charcoal">{ii.flag_reason}</p>
                        {ii.flag_status === 'resolved' && ii.resolution_note && (
                          <p className="mt-0.5 text-[12px] text-ink">Owner: {ii.resolution_note}</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
