'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CalendarClock, Loader2, Plus, Ruler, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, Input, Select, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { Modal } from '@/components/ui/modal'
import { VendorForm } from '@/components/vendors/vendor-form'
import { PhotoField } from '@/components/orders/photo-field'
import { MeasurementsEditor, type MeasurementRow } from '@/components/orders/measurements-editor'
import { createOrder, type NewOrderItemInput } from '@/app/(app)/actions'
import {
  CHECKPOINT_PROFILES,
  CHECKPOINT_PROFILE_KEYS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  UNITS,
  type CheckpointProfile,
  type ProductCategory,
} from '@/lib/constants'
import { formatDate, todayIST } from '@/lib/dates'
import { generateLadder, expectedDispatchDate } from '@/lib/followups'
import { cleanMeasurements, type MeasurementUnit } from '@/lib/measurements'
import { formatMoney, parseMoney } from '@/lib/money'
import type { Vendor } from '@/lib/types'

interface ItemRow extends Omit<NewOrderItemInput, 'measurements' | 'measurement_unit' | 'photo_path'> {
  key: string
  /** "This piece is made to measurements" — shows the editor. */
  needsMeasurements: boolean
  measurementRows: MeasurementRow[]
  measurementUnit: MeasurementUnit
  photoPath: string | null
}

function blankItem(): ItemRow {
  return {
    key: Math.random().toString(36).slice(2),
    product_name: '',
    design_code: '',
    colour: '',
    size: '',
    category: 'lehenga',
    quantity: 1,
    unit: 'pcs',
    rate: null,
    needsMeasurements: false,
    measurementRows: [],
    measurementUnit: 'in',
    photoPath: null,
  }
}

export function OrderForm({
  vendors,
  categories,
  isAdmin,
  defaultPlacedBy,
}: {
  vendors: Vendor[]
  categories: { slug: string; label: string }[]
  isAdmin: boolean
  defaultPlacedBy: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newVendorOpen, setNewVendorOpen] = useState(false)
  const [vendorList, setVendorList] = useState(vendors)
  const [checkOpen, setCheckOpen] = useState(false)

  const today = todayIST()

  const [vendorId, setVendorId] = useState('')
  const [orderDate, setOrderDate] = useState(today)
  const [leadTime, setLeadTime] = useState('45')
  // Kept separate so the user can nudge the date without changing lead time.
  const [expectedOverride, setExpectedOverride] = useState<string | null>(null)
  const [profile, setProfile] = useState<CheckpointProfile>('standard')
  const [priority, setPriority] = useState('normal')
  const [placedBy, setPlacedBy] = useState(defaultPlacedBy)
  const [notes, setNotes] = useState('')

  const [items, setItems] = useState<ItemRow[]>([blankItem()])

  const [totalAmount, setTotalAmount] = useState('')
  const [advance, setAdvance] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  const leadDays = Math.max(0, Number(leadTime) || 0)
  const expected = expectedOverride ?? expectedDispatchDate(orderDate, leadDays)

  // The whole point of this screen: the user sees exactly when they will be
  // reminded before they commit to the order.
  const ladder = useMemo(
    () =>
      generateLadder({
        anchorDate: orderDate,
        targetDate: expected,
        profile,
        today,
      }),
    [orderDate, expected, profile, today],
  )

  const itemsTotal = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.rate) || 0),
    0,
  )
  const totalPcs = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  /** What is missing before the order goes in — shown as a reminder, not a block. */
  const gaps = useMemo(() => {
    const missingPhoto: string[] = []
    const noMeasurements: string[] = []
    const emptyMeasurements: string[] = []
    items.forEach((i, idx) => {
      const label = `Item ${idx + 1}${i.product_name.trim() ? ` — ${i.product_name.trim()}` : ''}`
      if (!i.photoPath) missingPhoto.push(label)
      if (!i.needsMeasurements) noMeasurements.push(label)
      else if (cleanMeasurements(i.measurementRows).length === 0) emptyMeasurements.push(label)
    })
    return { missingPhoto, noMeasurements, emptyMeasurements }
  }, [items])

  function validate(): string | null {
    if (!vendorId) return 'Please choose a vendor.'
    if (items.some((i) => !i.product_name.trim())) return 'Every item needs a product name.'
    return null
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = validate()
    if (problem) return setError(problem)

    // Missing photo or measurements are not errors — but the person placing
    // the order must consciously decide to go ahead without them.
    if (gaps.missingPhoto.length > 0 || gaps.noMeasurements.length > 0 || gaps.emptyMeasurements.length > 0) {
      setCheckOpen(true)
      return
    }
    place()
  }

  function place() {
    setCheckOpen(false)
    start(async () => {
      const res = await createOrder({
        vendor_id: vendorId,
        order_date: orderDate,
        lead_time_days: leadDays,
        expected_date: expected,
        checkpoint_profile: profile,
        priority,
        placed_by: placedBy,
        notes,
        total_amount: isAdmin ? (parseMoney(totalAmount) ?? (itemsTotal || null)) : null,
        advance_paid: isAdmin ? parseMoney(advance) : null,
        payment_notes: isAdmin ? paymentNotes : '',
        items: items.map(
          ({ key: _key, needsMeasurements, measurementRows, measurementUnit, photoPath, ...i }) => ({
            ...i,
            quantity: Number(i.quantity) || 1,
            rate: isAdmin ? (Number(i.rate) || null) : null,
            amount: isAdmin ? (Number(i.quantity) || 0) * (Number(i.rate) || 0) || null : null,
            measurements: needsMeasurements ? cleanMeasurements(measurementRows) : [],
            measurement_unit: measurementUnit,
            photo_path: photoPath,
          }),
        ),
      })

      if (!res.ok) {
        setError(res.error)
        return
      }
      // Land on the order with the "raise a purchase order?" prompt showing.
      router.push(`/orders/${res.id}?placed=1`)
      router.refresh()
    })
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <FieldGroup title="Vendor">
          <Field label="Who are you ordering from?">
            <div className="flex gap-2">
              <Select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="flex-1"
                required
              >
                <option value="">Choose a vendor…</option>
                {vendorList
                  .filter((v) => v.is_active)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.city ? ` — ${v.city}` : ''}
                    </option>
                  ))}
              </Select>
              <Button type="button" variant="outline" onClick={() => setNewVendorOpen(true)}>
                <Plus className="size-4" />
                New
              </Button>
            </div>
          </Field>
        </FieldGroup>

        <FieldGroup title="Order details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Order date">
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => {
                  setOrderDate(e.target.value)
                  setExpectedOverride(null)
                }}
                required
              />
              {orderDate < today && (
                <p className="text-[12px] text-today">
                  Back-dated order — any reminders already in the past will be marked as skipped.
                </p>
              )}
            </Field>

            <Field label="Lead time" hint="days quoted by the vendor">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={leadTime}
                onChange={(e) => {
                  setLeadTime(e.target.value)
                  setExpectedOverride(null)
                }}
                required
              />
            </Field>
          </div>

          <Field label="Expected dispatch date" hint="calculated — edit if the vendor gave a firm date">
            <Input
              type="date"
              value={expected}
              min={orderDate}
              onChange={(e) => setExpectedOverride(e.target.value)}
            />
            <p className="text-[12px] text-muted">
              {formatDate(orderDate)} + {leadDays} days = <strong>{formatDate(expected)}</strong>
            </p>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Follow-up schedule">
              <Select
                value={profile}
                onChange={(e) => setProfile(e.target.value as CheckpointProfile)}
              >
                {CHECKPOINT_PROFILE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {CHECKPOINT_PROFILES[k].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
          </div>

          <LadderPreview ladder={ladder} today={today} />

          <Field label="Placed by" hint="optional">
            <Input value={placedBy} onChange={(e) => setPlacedBy(e.target.value)} />
          </Field>
        </FieldGroup>

        <FieldGroup
          title="Items"
          description="Finished garments — count in pieces or sets, never metres."
        >
          <div className="rounded-md border border-gold/25 bg-gold-wash/50 p-3 text-[13px] leading-relaxed text-ink">
            <p className="flex items-center gap-1.5 font-semibold text-gold">
              <Camera className="size-4" />
              For every piece, before you place the order
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                <strong>Add a photo</strong> of the piece being ordered — the design, the sample or
                the reference picture.
              </li>
              <li>
                <strong>Enter the measurements</strong> if the vendor is making it to size. They go
                on the purchase order, and the piece is checked against them when it arrives.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.key} className="rounded-md border border-line bg-parchment/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                    Item {idx + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((r) => r.filter((x) => x.key !== item.key))}
                      className="tap -mr-2 rounded-md text-muted hover:text-overdue"
                      aria-label={`Remove item ${idx + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Product">
                      <Input
                        value={item.product_name}
                        onChange={(e) => updateItem(item.key, { product_name: e.target.value })}
                        placeholder="e.g. Bridal Lehenga"
                        required
                      />
                    </Field>
                    <Field label="Design code" hint="optional">
                      <Input
                        value={item.design_code ?? ''}
                        onChange={(e) => updateItem(item.key, { design_code: e.target.value })}
                        placeholder="e.g. BL-101"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Type">
                      <Select
                        value={item.category}
                        onChange={(e) => updateItem(item.key, { category: e.target.value })}
                      >
                        {PRODUCT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {PRODUCT_CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Colour">
                      <Input
                        value={item.colour ?? ''}
                        onChange={(e) => updateItem(item.key, { colour: e.target.value })}
                      />
                    </Field>
                    <Field label="Quantity">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.key, { quantity: Number(e.target.value) || 1 })
                        }
                        required
                      />
                    </Field>
                    <Field label="Unit">
                      <Select
                        value={item.unit}
                        onChange={(e) => updateItem(item.key, { unit: e.target.value })}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  {isAdmin && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Rate" hint="per piece">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={item.rate ?? ''}
                          onChange={(e) =>
                            updateItem(item.key, {
                              rate: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="Line total">
                        <div className="flex h-11 items-center rounded-md border border-line bg-parchment px-3 text-charcoal">
                          {formatMoney((Number(item.quantity) || 0) * (Number(item.rate) || 0))}
                        </div>
                      </Field>
                    </div>
                  )}

                  <PhotoField
                    value={item.photoPath}
                    onChange={(path) => updateItem(item.key, { photoPath: path })}
                  />

                  <div className="space-y-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] text-charcoal">
                      <input
                        type="checkbox"
                        checked={item.needsMeasurements}
                        onChange={(e) => updateItem(item.key, { needsMeasurements: e.target.checked })}
                        className="size-5 accent-gold"
                      />
                      <span className="flex items-center gap-1.5">
                        <Ruler className="size-4 text-muted" />
                        This piece is made to measurements
                      </span>
                    </label>
                    {item.needsMeasurements ? (
                      <MeasurementsEditor
                        category={(item.category ?? 'other') as ProductCategory}
                        rows={item.measurementRows}
                        unit={item.measurementUnit}
                        onRowsChange={(rows) => updateItem(item.key, { measurementRows: rows })}
                        onUnitChange={(unit) => updateItem(item.key, { measurementUnit: unit })}
                      />
                    ) : (
                      <p className="text-[12px] text-muted">
                        Standard size — no measurements to check on arrival.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setItems((r) => [...r, blankItem()])}
            >
              <Plus className="size-4" />
              Add item
            </Button>
            <p className="text-[13px] text-muted">
              {totalPcs} {totalPcs === 1 ? 'piece' : 'pieces'} total
              {isAdmin && itemsTotal > 0 && ` · ${formatMoney(itemsTotal)}`}
            </p>
          </div>
        </FieldGroup>

        {isAdmin && (
          <FieldGroup title="Payment" description="Only you can see this. Staff cannot.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Total amount" hint={itemsTotal > 0 ? `items add up to ${formatMoney(itemsTotal)}` : undefined}>
                <Input
                  inputMode="decimal"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder={itemsTotal > 0 ? String(itemsTotal) : '0'}
                />
              </Field>
              <Field label="Advance paid">
                <Input
                  inputMode="decimal"
                  value={advance}
                  onChange={(e) => setAdvance(e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
            <Field label="Payment notes" hint="optional">
              <Input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} />
            </Field>
          </FieldGroup>
        )}

        <FieldGroup title="Notes">
          <Field label="Anything to remember about this order" hint="optional">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </FieldGroup>

        <ErrorNote>{error}</ErrorNote>

        <Button type="submit" variant="gold" size="full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? 'Placing order…' : 'Place order'}
        </Button>
        <p className="text-center text-[12px] text-muted">
          After placing it you can raise a purchase order for the vendor in one tap.
        </p>
      </form>

      <Modal
        open={checkOpen}
        onOpenChange={setCheckOpen}
        title="Before you place this order"
        description="Nothing is blocking you — just make sure this is deliberate."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCheckOpen(false)}>
              Go back and add
            </Button>
            <Button variant="gold" className="flex-1" onClick={place} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Place order anyway
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {gaps.missingPhoto.length > 0 && (
            <GapList
              icon={<Camera className="size-4" />}
              title="No photo"
              note="Without a photo there is nothing to check the goods against when they arrive."
              rows={gaps.missingPhoto}
            />
          )}
          {gaps.emptyMeasurements.length > 0 && (
            <GapList
              icon={<TriangleAlert className="size-4" />}
              title="Measurements ticked but none entered"
              note="Either enter them or untick the box."
              rows={gaps.emptyMeasurements}
              tone="overdue"
            />
          )}
          {gaps.noMeasurements.length > 0 && (
            <GapList
              icon={<Ruler className="size-4" />}
              title="No measurements"
              note="Fine for a standard size. If the vendor is making it to size, add them so the piece can be checked on arrival."
              rows={gaps.noMeasurements}
            />
          )}
        </div>
      </Modal>

      <Modal
        open={newVendorOpen}
        onOpenChange={setNewVendorOpen}
        title="Add a new vendor"
        description="They will be selected for this order automatically."
      >
        <VendorForm
          categories={categories}
          isAdmin={isAdmin}
          compact
          onSaved={(id, name) => {
            setVendorList((list) => [
              ...list,
              { id, name, is_active: true } as Vendor,
            ])
            setVendorId(id)
            setNewVendorOpen(false)
          }}
        />
      </Modal>
    </>
  )
}

function GapList({
  icon,
  title,
  note,
  rows,
  tone = 'today',
}: {
  icon: React.ReactNode
  title: string
  note: string
  rows: string[]
  tone?: 'today' | 'overdue'
}) {
  const colour = tone === 'overdue' ? 'text-overdue' : 'text-today'
  const box = tone === 'overdue' ? 'border-overdue/30 bg-overdue-wash' : 'border-today/30 bg-today-wash'
  return (
    <div className={`rounded-md border p-3 ${box}`}>
      <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${colour}`}>
        {icon}
        {title}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-[13px] text-charcoal">
        {rows.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink">{note}</p>
    </div>
  )
}

/** "You will be reminded on…" — shown live as the user types a lead time. */
export function LadderPreview({
  ladder,
  today,
}: {
  ladder: { checkpoint_pct: number | null; due_date: string; status: string }[]
  today: string
}) {
  if (ladder.length === 0) return null

  const active = ladder.filter((c) => c.status === 'pending')
  const skipped = ladder.length - active.length

  return (
    <div className="rounded-md border border-gold/25 bg-gold-wash/50 p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gold">
        <CalendarClock className="size-4" />
        You will be reminded on
      </p>
      <ul className="mt-2 space-y-1">
        {ladder.map((c) => (
          <li
            key={c.due_date}
            className={
              'flex items-center justify-between text-[13px] ' +
              (c.status === 'skipped' ? 'text-muted line-through' : 'text-ink')
            }
          >
            <span>{formatDate(c.due_date)}</span>
            <span className="text-[12px] text-muted">
              {c.checkpoint_pct === 100
                ? 'expected dispatch'
                : `${c.checkpoint_pct}% of the way`}
            </span>
          </li>
        ))}
      </ul>
      {skipped > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          {skipped} {skipped === 1 ? 'reminder is' : 'reminders are'} already in the past and will be
          marked as skipped.
        </p>
      )}
      {active.length === 0 && (
        <p className="mt-2 text-[12px] text-today">
          Every checkpoint is in the past. This order will show up as due immediately.
        </p>
      )}
      <p className="sr-only">Today is {formatDate(today)}</p>
    </div>
  )
}
