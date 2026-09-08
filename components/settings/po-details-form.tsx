'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, Input, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { savePoDetails } from '@/app/(app)/settings/actions'
import { PO_DETAIL_FIELDS, type PoDetails } from '@/lib/po'

/**
 * The company block printed at the top of every purchase order, and the
 * terms that go on it by default. Filled in once.
 */
export function PoDetailsForm({ initial, migrated }: { initial: PoDetails; migrated: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [form, setForm] = useState<PoDetails>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await savePoDetails(form)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <FieldGroup
      title="Purchase order details"
      description="Printed at the top of every PO, and signed off in this name. Fill it in once."
    >
      {!migrated && (
        <p className="rounded-md border border-today/30 bg-today-wash px-3 py-2.5 text-[13px] text-charcoal">
          Run <code className="rounded bg-white px-1 text-[12px]">supabase/migrations/0003_po_details.sql</code>{' '}
          in the Supabase SQL Editor once to be able to save these. Until then the PO prints
          as <strong>NB TEXTILE</strong> with no address.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {PO_DETAIL_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            hint={f.hint}
            className={f.multiline ? 'sm:col-span-2' : undefined}
          >
            {f.multiline ? (
              <Textarea
                value={form[f.key]}
                rows={3}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            ) : (
              <Input
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                required={f.key === 'company_name'}
              />
            )}
          </Field>
        ))}
      </div>

      <div className="rounded-md border border-line bg-white p-3 text-[12px] leading-relaxed text-ink">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          How it will print
        </p>
        <p className="mt-1 font-serif text-lg leading-tight text-charcoal">
          {form.company_name || 'Company name'}
        </p>
        {form.tagline && <p className="font-serif italic text-gold">{form.tagline}</p>}
        {form.address && <p className="mt-1 whitespace-pre-line">{form.address}</p>}
        {(form.phone || form.email) && <p>{[form.phone, form.email].filter(Boolean).join(' · ')}</p>}
        {form.gstin && <p>GSTIN {form.gstin}</p>}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <Button variant="gold" onClick={save} disabled={pending || !form.company_name.trim()}>
        {pending && <Loader2 className="animate-spin" />}
        {saved && !pending && <Check className="size-4" />}
        {pending ? 'Saving…' : saved ? 'Saved' : 'Save PO details'}
      </Button>
    </FieldGroup>
  )
}
