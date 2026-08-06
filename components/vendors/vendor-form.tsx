'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, Input, Select, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { saveVendor, setVendorActive } from '@/app/(app)/actions'
import type { Vendor } from '@/lib/types'

export function VendorForm({
  vendor,
  categories,
  isAdmin,
  paymentTerms,
  onSaved,
  compact,
}: {
  vendor?: Vendor | null
  categories: { slug: string; label: string }[]
  isAdmin: boolean
  paymentTerms?: string | null
  /** When embedded in the order form, hand the new vendor back instead of navigating. */
  onSaved?: (id: string, name: string) => void
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: vendor?.name ?? '',
    company_name: vendor?.company_name ?? '',
    category: vendor?.category ?? categories[0]?.slug ?? 'other',
    contact_person: vendor?.contact_person ?? '',
    phone: vendor?.phone ?? '',
    alt_phone: vendor?.alt_phone ?? '',
    email: vendor?.email ?? '',
    city: vendor?.city ?? '',
    gst_no: vendor?.gst_no ?? '',
    notes: vendor?.notes ?? '',
    payment_terms: paymentTerms ?? '',
  })

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await saveVendor({
        id: vendor?.id,
        ...form,
        // Only send payment terms when the caller can actually write them.
        payment_terms: isAdmin ? form.payment_terms : undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (onSaved) onSaved(res.id, form.name)
      else router.push(`/vendors/${res.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FieldGroup title={compact ? 'New vendor' : 'Vendor details'}>
        <Field label="Vendor name" htmlFor="name">
          <Input
            id="name"
            required
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. Shyam Fabrics"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" hint="optional">
            <Input value={form.company_name} onChange={set('company_name')} />
          </Field>
          <Field label="Type">
            <Select value={form.category} onChange={set('category')}>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person">
            <Input value={form.contact_person} onChange={set('contact_person')} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set('city')} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" hint="used for Call and WhatsApp">
            <Input
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="98123 45678"
            />
          </Field>
          <Field label="Alternate phone" hint="optional">
            <Input type="tel" inputMode="tel" value={form.alt_phone} onChange={set('alt_phone')} />
          </Field>
        </div>
      </FieldGroup>

      {!compact && (
        <FieldGroup title="Other details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" hint="optional">
              <Input type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="GST number" hint="optional">
              <Input value={form.gst_no} onChange={set('gst_no')} />
            </Field>
          </div>

          {isAdmin && (
            <Field label="Payment terms" hint="only you can see this">
              <Input
                value={form.payment_terms}
                onChange={set('payment_terms')}
                placeholder="e.g. 50% advance, balance on dispatch"
              />
            </Field>
          )}

          <Field label="Notes" hint="optional">
            <Textarea value={form.notes} onChange={set('notes')} />
          </Field>
        </FieldGroup>
      )}

      <ErrorNote>{error}</ErrorNote>

      <div className="flex gap-2">
        <Button type="submit" variant="gold" size={compact ? 'default' : 'full'} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {vendor ? 'Save changes' : 'Add vendor'}
        </Button>
        {vendor && !compact && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              start(async () => {
                await setVendorActive(vendor.id, !vendor.is_active)
                router.refresh()
              })
            }
            disabled={pending}
          >
            {vendor.is_active ? 'Deactivate' : 'Reactivate'}
          </Button>
        )}
      </div>
      {vendor && !compact && (
        <p className="text-[12px] text-muted">
          Vendors are never deleted — deactivating just hides them from the list when placing a new
          order. All past orders stay intact.
        </p>
      )}
    </form>
  )
}
