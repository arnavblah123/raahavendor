'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PackageCheck } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { recordDispatch } from '@/app/(app)/actions'
import { formatDate, todayIST } from '@/lib/dates'
import type { OrderItem } from '@/lib/types'

/**
 * Dispatch is recorded per line item, by piece count — never as a single
 * yes/no on the order. A vendor sending 12 of 20 pieces is the normal case,
 * not an exception.
 */
export function DispatchModal({
  open,
  onOpenChange,
  orderId,
  orderNo,
  vendorName,
  items,
  defaultTransporter,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNo: string
  vendorName: string
  items: OrderItem[]
  defaultTransporter?: string | null
}) {
  const router = useRouter()
  const today = todayIST()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const pendingItems = useMemo(() => items.filter((i) => i.qty_balance > 0), [items])

  // Pre-filled with the balance: the common case is "everything left arrived",
  // so the user only edits the lines that differ.
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendingItems.map((i) => [i.id, String(i.qty_balance)])),
  )
  const [dispatchDate, setDispatchDate] = useState(today)
  const [transporter, setTransporter] = useState(defaultTransporter ?? '')
  const [docketNo, setDocketNo] = useState('')
  const [remarks, setRemarks] = useState('')
  const [balanceDate, setBalanceDate] = useState('')

  const sending = pendingItems.reduce((sum, i) => sum + (Number(qty[i.id]) || 0), 0)
  const totalBalance = pendingItems.reduce((sum, i) => sum + i.qty_balance, 0)
  const remaining = totalBalance - sending
  const willBePartial = remaining > 0

  const overCount = pendingItems.some((i) => (Number(qty[i.id]) || 0) > i.qty_balance)

  function submit() {
    setError(null)

    if (sending <= 0) return setError('Enter at least one piece to dispatch.')
    if (overCount) return setError('You cannot dispatch more than the pending balance on an item.')
    if (willBePartial && !balanceDate) {
      return setError('Please give a promised date for the balance so this order stays tracked.')
    }

    start(async () => {
      const res = await recordDispatch({
        orderId,
        dispatchDate,
        transporter,
        docketNo,
        remarks,
        lines: pendingItems.map((i) => ({
          order_item_id: i.id,
          quantity: Number(qty[i.id]) || 0,
        })),
        balancePromisedDate: willBePartial ? balanceDate : null,
      })

      if (!res.ok) {
        setError(res.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Record dispatch"
      description={`${vendorName} · ${orderNo}`}
      footer={
        <div className="space-y-2">
          <p className="text-center text-[13px] text-muted">
            {sending} of {totalBalance} pending {sending === 1 ? 'piece' : 'pieces'}
            {willBePartial && ` · ${remaining} will remain`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="gold" className="flex-1" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <PackageCheck className="size-4" />}
              {pending ? 'Saving…' : willBePartial ? 'Save partial' : 'Save dispatch'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink">What actually arrived?</p>
          {pendingItems.map((i) => {
            const value = Number(qty[i.id]) || 0
            const over = value > i.qty_balance
            return (
              <div key={i.id} className="rounded-md border border-line bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-charcoal">
                      {i.design_code && (
                        <span className="text-muted">{i.design_code} · </span>
                      )}
                      {i.product_name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      Ordered {i.quantity} · Already sent {i.qty_dispatched} ·{' '}
                      <span className="font-medium text-today">Balance {i.qty_balance}</span>
                    </p>
                  </div>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={i.qty_balance}
                      value={qty[i.id] ?? ''}
                      onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                      className={over ? 'border-overdue text-overdue' : ''}
                      aria-label={`Pieces dispatched of ${i.product_name}`}
                    />
                  </div>
                </div>
                {over && (
                  <p className="mt-1.5 text-[12px] text-overdue">
                    Only {i.qty_balance} pending on this item.
                  </p>
                )}
              </div>
            )
          })}
          <p className="text-[12px] text-muted">
            Set an item to 0 if it did not arrive in this lot.
          </p>
        </div>

        <Field label="Dispatch date">
          <Input
            type="date"
            value={dispatchDate}
            max={today}
            onChange={(e) => setDispatchDate(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Transporter" hint="optional">
            <Input value={transporter} onChange={(e) => setTransporter(e.target.value)} />
          </Field>
          <Field label="Docket no." hint="optional">
            <Input value={docketNo} onChange={(e) => setDocketNo(e.target.value)} />
          </Field>
        </div>

        <Field label="Remarks" hint="optional">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </Field>

        {willBePartial && (
          <div className="rounded-md border border-today/30 bg-today-wash p-3">
            <p className="text-[13px] font-semibold text-today">
              {remaining} {remaining === 1 ? 'piece' : 'pieces'} will still be pending
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink">
              This order stays open and keeps appearing on your morning dashboard. When has the
              vendor promised the balance?
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

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  )
}
