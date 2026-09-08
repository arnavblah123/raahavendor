'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, Loader2, PackageOpen, Ruler, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, Input, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { recordInward, type InwardLineInput } from '@/app/(app)/actions'
import { formatDate, todayIST } from '@/lib/dates'
import {
  compareMeasurements,
  describeDeviations,
  formatDiff,
  formatValue,
  hasDeviation,
  measuredCount,
  parseMeasurements,
  MEASUREMENT_UNIT_LABELS,
  type Measurement,
} from '@/lib/measurements'
import { formatMoney } from '@/lib/money'
import type { OrderItem, PurchaseOrder, PurchaseOrderLine } from '@/lib/types'

interface LineState {
  qty: string
  rate: string
  /** received measurement per name, as typed */
  measured: Record<string, string>
  flagged: boolean
  reason: string
}

/**
 * Goods receipt against a PO.
 *
 * For every line: how many arrived, the price on the invoice, and — when the
 * order carried measurements — the piece measured again. Any difference
 * turns the flag on and asks for the problem to be written down for the
 * owner. The flag can also be raised by hand for anything else (damage,
 * wrong colour, wrong fabric).
 */
export function InwardForm({
  po,
  items,
  photoUrls,
  isAdmin,
  defaultReceivedBy,
}: {
  po: PurchaseOrder
  items: OrderItem[]
  photoUrls: Record<string, string>
  isAdmin: boolean
  defaultReceivedBy: string
}) {
  const router = useRouter()
  const today = todayIST()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  // Lines still expecting pieces. Fully received lines are shown but locked.
  const lines = useMemo(
    () =>
      po.lines.map((l) => {
        const item = itemById.get(l.order_item_id)
        const received = item?.qty_received ?? 0
        return {
          line: l,
          item,
          received,
          expected: l.quantity - received,
          measurements: parseMeasurements(l.measurements),
        }
      }),
    [po.lines, itemById],
  )

  const [state, setState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.line.order_item_id,
        {
          // Pre-filled with everything still expected: the common case.
          qty: l.expected > 0 ? String(l.expected) : '0',
          rate: '',
          measured: {},
          flagged: false,
          reason: '',
        },
      ]),
    ),
  )

  const [inwardDate, setInwardDate] = useState(today)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [receivedBy, setReceivedBy] = useState(defaultReceivedBy)
  const [remarks, setRemarks] = useState('')
  const [balanceDate, setBalanceDate] = useState('')

  function update(id: string, patch: Partial<LineState>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }))
  }

  /** Derived per-line facts: checks, deviation, whether a flag is required. */
  const derived = useMemo(() => {
    const out: Record<
      string,
      {
        qty: number
        over: boolean
        checks: ReturnType<typeof compareMeasurements>
        measured: number
        deviates: boolean
      }
    > = {}
    for (const l of lines) {
      const st = state[l.line.order_item_id]
      const qty = Math.max(0, Math.floor(Number(st?.qty) || 0))
      const checks = compareMeasurements(l.measurements, st?.measured ?? {})
      out[l.line.order_item_id] = {
        qty,
        over: qty > l.expected,
        checks,
        measured: measuredCount(checks),
        deviates: hasDeviation(checks),
      }
    }
    return out
  }, [lines, state])

  const totalReceiving = lines.reduce((s, l) => s + derived[l.line.order_item_id].qty, 0)
  const totalExpected = lines.reduce((s, l) => s + Math.max(0, l.expected), 0)
  const remaining = totalExpected - totalReceiving
  const willBePartial = remaining > 0
  const flaggedCount = lines.filter((l) => state[l.line.order_item_id]?.flagged).length
  const needsBalanceDate = willBePartial && lines.some((l) => (l.item?.qty_balance ?? 0) > 0)

  function submit() {
    setError(null)

    if (totalReceiving <= 0 && flaggedCount === 0) return setError('Enter at least one piece received.')
    if (inwardDate > today) return setError('The inward date cannot be in the future.')

    for (const l of lines) {
      const id = l.line.order_item_id
      const st = state[id]
      const d = derived[id]
      if (d.over) return setError(`Only ${l.expected} of "${l.line.product_name}" still expected.`)
      if (d.deviates && !st.flagged) {
        return setError(
          `The measurements of "${l.line.product_name}" differ from what was ordered. Flag it and write down the problem.`,
        )
      }
      if (st.flagged && !st.reason.trim()) {
        return setError(`Write down the problem with "${l.line.product_name}" so the owner knows what to look at.`)
      }
      if (st.rate !== '' && !(Number(st.rate) >= 0)) {
        return setError(`The price for "${l.line.product_name}" is not a valid number.`)
      }
    }

    if (needsBalanceDate && !balanceDate) {
      return setError('Pieces are still to come — enter the date the vendor has promised them for.')
    }

    const payload: InwardLineInput[] = lines.map((l) => {
      const id = l.line.order_item_id
      const st = state[id]
      const d = derived[id]
      return {
        order_item_id: id,
        qty_received: d.qty,
        rate: st.rate === '' ? null : Number(st.rate),
        measurements_checked: d.measured > 0,
        measurement_checks: d.checks,
        has_deviation: d.deviates,
        is_flagged: st.flagged,
        flag_reason: st.flagged ? st.reason.trim() : undefined,
      }
    })

    start(async () => {
      const res = await recordInward({
        poId: po.id,
        orderId: po.order_id,
        inwardDate,
        invoiceNo,
        receivedBy,
        remarks,
        lines: payload,
        balancePromisedDate: needsBalanceDate ? balanceDate : null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/orders/${po.order_id}?inwarded=${res.inwardNo}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <FieldGroup title="What arrived?" description={`Against ${po.po_no}. Count every line honestly — set it to 0 if it did not come.`}>
        <div className="space-y-3">
          {lines.map((l) => {
            const id = l.line.order_item_id
            const st = state[id]
            const d = derived[id]
            const photo = l.line.photo_path ? photoUrls[l.line.photo_path] : undefined
            const unit = l.line.measurement_unit
            const locked = l.expected <= 0

            return (
              <div
                key={id}
                className={`rounded-md border bg-white p-3 ${
                  st.flagged ? 'border-overdue/50' : 'border-line'
                } ${locked ? 'opacity-60' : ''}`}
              >
                <div className="flex gap-3">
                  {photo ? (
                    <a href={photo} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt={l.line.product_name}
                        className="size-16 rounded-md border border-line object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-line bg-parchment/60 text-[10px] uppercase tracking-wide text-muted">
                      No photo
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-charcoal">
                      {l.line.design_code && <span className="text-muted">{l.line.design_code} · </span>}
                      {l.line.product_name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {[l.line.colour, l.line.size].filter(Boolean).join(' · ')}
                      {[l.line.colour, l.line.size].some(Boolean) && ' · '}
                      Ordered {l.line.quantity} · Already received {l.received} ·{' '}
                      <span className={`font-medium ${locked ? 'text-done' : 'text-today'}`}>
                        {locked ? 'Complete' : `Expected ${l.expected}`}
                      </span>
                    </p>
                  </div>
                </div>

                {!locked && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Received now" hint={l.line.unit}>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={l.expected}
                          value={st.qty}
                          onChange={(e) => update(id, { qty: e.target.value })}
                          className={d.over ? 'border-overdue text-overdue' : ''}
                          aria-label={`Pieces received of ${l.line.product_name}`}
                        />
                        {d.over && (
                          <p className="text-[12px] text-overdue">Only {l.expected} still expected.</p>
                        )}
                      </Field>
                      <Field label="Price per piece" hint="from the invoice">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={st.rate}
                          onChange={(e) => update(id, { rate: e.target.value })}
                          placeholder="₹"
                          aria-label={`Invoice price of ${l.line.product_name}`}
                        />
                        {st.rate !== '' && d.qty > 0 && (
                          <p className="text-[12px] text-muted">
                            {d.qty} × {formatMoney(Number(st.rate))} = {formatMoney(d.qty * Number(st.rate))}
                          </p>
                        )}
                      </Field>
                    </div>
                    {!isAdmin && (
                      <p className="-mt-1 text-[12px] text-muted">
                        Type the price exactly as it is on the vendor&apos;s invoice. Only the owner
                        can see it afterwards.
                      </p>
                    )}

                    {l.measurements.length > 0 && (
                      <MeasurementCheck
                        ordered={l.measurements}
                        unit={unit}
                        measured={st.measured}
                        checks={d.checks}
                        deviates={d.deviates}
                        onChange={(name, value) =>
                          update(id, { measured: { ...st.measured, [name]: value } })
                        }
                      />
                    )}

                    <div
                      className={`rounded-md border p-3 ${
                        st.flagged ? 'border-overdue/40 bg-overdue-wash' : 'border-line bg-parchment/40'
                      }`}
                    >
                      <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[14px] text-charcoal">
                        <input
                          type="checkbox"
                          checked={st.flagged}
                          onChange={(e) => update(id, { flagged: e.target.checked })}
                          className="size-5 accent-overdue"
                        />
                        <span className="flex items-center gap-1.5 font-medium">
                          <Flag className={`size-4 ${st.flagged ? 'text-overdue' : 'text-muted'}`} />
                          Flag a problem for the owner
                        </span>
                      </label>
                      {d.deviates && !st.flagged && (
                        <p className="mt-1 flex items-start gap-1.5 text-[13px] font-medium text-overdue">
                          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                          The measurements differ from what was ordered. Tick the flag and write down
                          the problem — the owner needs to see this.
                        </p>
                      )}
                      {st.flagged && (
                        <Field
                          label="What is wrong?"
                          hint="the owner reads exactly this"
                          className="mt-2"
                        >
                          <Textarea
                            value={st.reason}
                            onChange={(e) => update(id, { reason: e.target.value })}
                            rows={2}
                            placeholder={
                              d.deviates
                                ? `e.g. ${describeDeviations(d.checks, unit)} — piece is tighter than ordered`
                                : 'e.g. Embroidery damaged on the left sleeve; colour is lighter than the sample'
                            }
                          />
                        </Field>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </FieldGroup>

      <FieldGroup title="Receipt details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date received">
            <Input
              type="date"
              value={inwardDate}
              max={today}
              onChange={(e) => setInwardDate(e.target.value)}
            />
          </Field>
          <Field label="Vendor invoice / challan no." hint="optional">
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </Field>
        </div>
        <Field label="Received by">
          <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
        </Field>
        <Field label="Remarks" hint="optional">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </Field>

        {needsBalanceDate && (
          <div className="rounded-md border border-today/30 bg-today-wash p-3">
            <p className="text-[13px] font-semibold text-today">
              {remaining} {remaining === 1 ? 'piece is' : 'pieces are'} still to come
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink">
              The order stays open and keeps appearing on the morning list. When has the vendor
              promised the balance?
            </p>
            <Field className="mt-2.5">
              <Input
                type="date"
                min={today}
                value={balanceDate}
                onChange={(e) => setBalanceDate(e.target.value)}
                aria-label="Promised date for the balance"
              />
            </Field>
            {balanceDate && (
              <p className="mt-1.5 text-[12px] text-ink">
                New reminders will be scheduled up to {formatDate(balanceDate)}.
              </p>
            )}
          </div>
        )}
        {willBePartial && !needsBalanceDate && (
          <p className="text-[12px] text-muted">
            {remaining} {remaining === 1 ? 'piece' : 'pieces'} already dispatched by the vendor but
            not in this lot — inward them when they arrive.
          </p>
        )}
      </FieldGroup>

      <ErrorNote>{error}</ErrorNote>

      <div className="space-y-2">
        <p className="text-center text-[13px] text-muted">
          Receiving {totalReceiving} of {totalExpected} expected {totalExpected === 1 ? 'piece' : 'pieces'}
          {flaggedCount > 0 && ` · ${flaggedCount} flagged for the owner`}
        </p>
        <Button variant="gold" size="full" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <PackageOpen className="size-4" />}
          {pending ? 'Saving…' : willBePartial ? 'Save partial inward' : 'Save inward'}
        </Button>
      </div>
    </div>
  )
}

/** Ordered vs measured, side by side, with the difference in colour. */
function MeasurementCheck({
  ordered,
  unit,
  measured,
  checks,
  deviates,
  onChange,
}: {
  ordered: Measurement[]
  unit: 'in' | 'cm'
  measured: Record<string, string>
  checks: ReturnType<typeof compareMeasurements>
  deviates: boolean
  onChange: (name: string, value: string) => void
}) {
  const checkByName = new Map(checks.map((c) => [c.name, c]))
  const done = measuredCount(checks)

  return (
    <div className="rounded-md border border-gold/30 bg-gold-wash/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gold">
          <Ruler className="size-4" />
          Check the measurements
        </p>
        <span className="text-[12px] text-muted">
          {done}/{ordered.length} measured · {MEASUREMENT_UNIT_LABELS[unit]}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-ink">
        Measure the piece and type what you get next to each. Leave blank anything you could not
        measure.
      </p>
      <div className="mt-2.5 space-y-2">
        <div className="grid grid-cols-[1fr_4rem_5rem_4rem] items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
          <span />
          <span className="text-right">Ordered</span>
          <span className="text-right">Measured</span>
          <span className="text-right">Diff</span>
        </div>
        {ordered.map((m) => {
          const c = checkByName.get(m.name)
          const diff = c?.diff ?? null
          const tone =
            diff === null ? 'text-muted' : diff === 0 ? 'text-done' : 'font-semibold text-overdue'
          return (
            <div key={m.name} className="grid grid-cols-[1fr_4rem_5rem_4rem] items-center gap-2">
              <span className="truncate text-[13px] text-charcoal">{m.name}</span>
              <span className="text-right text-[13px] text-ink">{formatValue(m.value)}</span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.25"
                min={0}
                value={measured[m.name] ?? ''}
                onChange={(e) => onChange(m.name, e.target.value)}
                className={`h-10 px-2 text-right ${diff !== null && diff !== 0 ? 'border-overdue' : ''}`}
                aria-label={`Measured ${m.name}`}
              />
              <span className={`text-right text-[13px] ${tone}`}>
                {diff === null ? '—' : formatDiff(diff)}
              </span>
            </div>
          )
        })}
      </div>
      {done > 0 && (
        <p className={`mt-2 text-[12px] font-medium ${deviates ? 'text-overdue' : 'text-done'}`}>
          {deviates ? `Differs: ${describeDeviations(checks, unit)}` : 'Everything measured matches the order.'}
        </p>
      )}
    </div>
  )
}
