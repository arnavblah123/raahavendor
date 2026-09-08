import Link from 'next/link'
import { Flag, PackageOpen, Ruler } from 'lucide-react'
import { getFlaggedInwardItems, getRecentInwards, signPhotoUrls } from '@/lib/queries'
import { getProfile } from '@/lib/auth'
import { FlagActions } from '@/components/inwards/flag-actions'
import { Badge } from '@/components/ui/badge'
import { EmptyState, SectionHeading } from '@/components/common/states'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import {
  describeDeviations,
  parseMeasurementChecks,
  type MeasurementUnit,
} from '@/lib/measurements'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inwards — Raaha' }

/**
 * The owner's desk: every piece that was flagged when it arrived, open ones
 * first, plus the receiving log. Staff see the same list but cannot resolve.
 */
export default async function InwardsPage() {
  const profile = await getProfile()
  const admin = profile?.role === 'admin'

  const [{ rows, financeByItem }, recent] = await Promise.all([
    getFlaggedInwardItems({ isAdmin: admin }),
    getRecentInwards(40),
  ])
  const photoUrls = await signPhotoUrls(rows.map((r) => r.order_item?.photo_path))

  const open = rows.filter((r) => r.flag_status === 'open')
  const resolved = rows.filter((r) => r.flag_status !== 'open')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl leading-tight text-charcoal">Inwards</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {open.length === 0
            ? 'Nothing flagged is waiting on you.'
            : `${open.length} flagged ${open.length === 1 ? 'piece needs' : 'pieces need'} ${
                admin ? 'your decision' : "the owner's decision"
              }.`}
        </p>
      </header>

      <section className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-overdue" />
          <SectionHeading count={open.length} className="text-overdue">
            Flagged — open
          </SectionHeading>
        </div>
        {open.length === 0 ? (
          <EmptyState
            icon={<Flag />}
            title="No open flags"
            description="When something arrives with wrong measurements or another problem, staff flag it at inward and it appears here."
            className="py-8"
          />
        ) : (
          <div className="space-y-2.5">
            {open.map((r) => (
              <FlagCard key={r.id} row={r} photoUrls={photoUrls} admin={admin} finance={financeByItem[r.id]} />
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1">
            <span className="size-2 rounded-full bg-done" />
            <SectionHeading count={resolved.length} className="text-done">
              Resolved
            </SectionHeading>
          </summary>
          <div className="mt-2 space-y-2.5">
            {resolved.map((r) => (
              <FlagCard key={r.id} row={r} photoUrls={photoUrls} admin={admin} finance={financeByItem[r.id]} />
            ))}
          </div>
        </details>
      )}

      <section className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-gold" />
          <SectionHeading count={recent.length} className="text-gold">
            Receiving log
          </SectionHeading>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<PackageOpen />}
            title="Nothing inwarded yet"
            description="Open an order that has a purchase order and tap Inward goods when the parcel arrives."
            className="py-8"
          />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {recent.map((inw) => (
              <Link
                key={inw.id}
                href={`/orders/${inw.order?.id ?? inw.order_id}`}
                className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-parchment/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-charcoal">
                    {inw.order?.vendor?.name ?? 'Vendor'} · {inw.pcs_received} pcs
                  </p>
                  <p className="truncate text-[12px] text-muted">
                    {inw.purchase_order?.po_no} · inward {inw.inward_no} · {formatDate(inw.inward_date)}
                    {inw.invoice_no && ` · inv ${inw.invoice_no}`}
                  </p>
                </div>
                {inw.flagged_count > 0 && (
                  <Badge tone="overdue">{inw.flagged_count} flagged</Badge>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function FlagCard({
  row,
  photoUrls,
  admin,
  finance,
}: {
  row: Awaited<ReturnType<typeof getFlaggedInwardItems>>['rows'][number]
  photoUrls: Record<string, string>
  admin: boolean
  finance?: { rate: number | null; amount: number | null }
}) {
  const item = row.order_item
  const unit = (item?.measurement_unit ?? 'in') as MeasurementUnit
  const checks = parseMeasurementChecks(row.measurement_checks)
  const deviation = describeDeviations(checks, unit)
  const photo = item?.photo_path ? photoUrls[item.photo_path] : undefined
  const isOpen = row.flag_status === 'open'
  const orderId = row.inward?.order?.id ?? row.inward?.order_id

  return (
    <article className={`card p-3.5 ${isOpen ? 'border-l-4 border-l-overdue' : 'border-l-4 border-l-done'}`}>
      <div className="flex gap-3">
        {photo ? (
          <a href={photo} target="_blank" rel="noopener noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={item?.product_name ?? 'Piece'} className="size-16 rounded-md border border-line object-cover" />
          </a>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-line bg-parchment/60 text-[10px] uppercase tracking-wide text-muted">
            No photo
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-charcoal">
                {item?.design_code && <span className="text-muted">{item.design_code} · </span>}
                {item?.product_name ?? 'Item'}
                <span className="text-muted"> · {row.qty_received} pcs</span>
              </p>
              <p className="mt-0.5 truncate text-[12px] text-muted">
                {orderId ? (
                  <Link href={`/orders/${orderId}`} className="hover:text-charcoal hover:underline">
                    {row.inward?.order?.vendor?.name ?? 'Vendor'} · {row.inward?.order?.order_no}
                  </Link>
                ) : (
                  row.inward?.order?.vendor?.name
                )}
                {row.inward?.purchase_order?.po_no && ` · ${row.inward.purchase_order.po_no}`}
                {row.inward && ` · received ${formatDate(row.inward.inward_date)}`}
              </p>
            </div>
            <Badge tone={isOpen ? 'overdue' : 'done'}>{isOpen ? 'Open' : 'Resolved'}</Badge>
          </div>

          {row.has_deviation && deviation && (
            <p className="mt-1.5 flex items-start gap-1 text-[12px] font-medium text-overdue">
              <Ruler className="mt-0.5 size-3.5 shrink-0" />
              {deviation}
            </p>
          )}

          <p className="mt-1.5 rounded-md bg-parchment/70 px-2.5 py-2 text-[13px] leading-relaxed text-charcoal">
            {row.flag_reason}
          </p>

          <p className="mt-1 text-[11px] text-muted">
            Flagged {formatDateTime(row.created_at)}
            {row.inward?.received_by && ` by ${row.inward.received_by}`}
            {admin && finance?.rate != null && ` · invoiced at ${formatMoney(Number(finance.rate))} each`}
          </p>

          {!isOpen && (
            <p className="mt-1 text-[12px] text-ink">
              <span className="font-medium text-done">Resolved</span>
              {row.resolved_at && ` ${formatDateTime(row.resolved_at)}`}
              {row.resolution_note && ` — ${row.resolution_note}`}
            </p>
          )}

          {admin && (
            <div className="mt-2">
              <FlagActions inwardItemId={row.id} status={row.flag_status} />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
