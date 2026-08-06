'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, Input, Select, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { LadderPreview } from '@/components/orders/order-form'
import { saveCategory, saveSettings, setUserActive, setUserRole } from '@/app/(app)/settings/actions'
import {
  CHECKPOINT_PROFILES,
  CHECKPOINT_PROFILE_KEYS,
  WHATSAPP_PLACEHOLDERS,
  type Role,
} from '@/lib/constants'
import { generateLadder } from '@/lib/followups'
import { addDaysStr, todayIST } from '@/lib/dates'
import { renderTemplate } from '@/lib/whatsapp'
import type { Profile } from '@/lib/types'

export function SettingsForm({
  currentUserId,
  whatsappTemplate,
  whatsappTemplateOverdue,
  checkpointProfiles,
  categories,
  users,
}: {
  currentUserId: string
  whatsappTemplate: string
  whatsappTemplateOverdue: string
  checkpointProfiles: Record<string, number[]>
  categories: { slug: string; label: string; sort_order: number; is_active: boolean }[]
  users: Profile[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [template, setTemplate] = useState(whatsappTemplate)
  const [overdueTemplate, setOverdueTemplate] = useState(whatsappTemplateOverdue)
  const [profiles, setProfiles] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CHECKPOINT_PROFILE_KEYS.map((k) => [
        k,
        (checkpointProfiles[k] ?? [...CHECKPOINT_PROFILES[k].pcts]).join(', '),
      ]),
    ),
  )
  const [newCategory, setNewCategory] = useState('')

  const today = todayIST()

  function parsePcts(raw: string): number[] {
    return raw
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  }

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await saveSettings({
        whatsapp_template: template,
        whatsapp_template_overdue: overdueTemplate,
        checkpoint_profiles: Object.fromEntries(
          CHECKPOINT_PROFILE_KEYS.map((k) => [k, parsePcts(profiles[k] ?? '')]),
        ),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  // Live preview against a made-up 45-day order, so the effect of changing
  // percentages is visible before saving.
  const sampleTarget = addDaysStr(today, 45)

  const samplePreview = renderTemplate(template, {
    vendor: { name: 'Shyam Fabrics', contact_person: 'Ramesh' },
    orderNo: 'RAAHA-PO-0007',
    orderDate: addDaysStr(today, -20),
    promisedDate: addDaysStr(today, 12),
    items: [
      { product_name: 'Bridal Lehenga', design_code: 'BL-101', quantity: 12, unit: 'pcs', qty_balance: 12 },
    ],
    today,
  })

  return (
    <div className="space-y-4">
      <FieldGroup
        title="Follow-up schedules"
        description="Percentages of the lead time at which you want to be reminded. The expected dispatch date is always added automatically as the final reminder."
      >
        {CHECKPOINT_PROFILE_KEYS.map((key) => {
          const pcts = parsePcts(profiles[key] ?? '')
          const ladder =
            pcts.length > 0
              ? generateLadder({
                  anchorDate: today,
                  targetDate: sampleTarget,
                  profile: key,
                  today,
                  profilePcts: pcts,
                })
              : []
          return (
            <div key={key} className="rounded-md border border-line bg-parchment/40 p-3">
              <Field
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                hint="comma separated, 1–99"
              >
                <Input
                  value={profiles[key] ?? ''}
                  onChange={(e) => setProfiles((p) => ({ ...p, [key]: e.target.value }))}
                  inputMode="numeric"
                />
              </Field>
              {ladder.length > 0 && (
                <div className="mt-2.5">
                  <p className="mb-1 text-[12px] text-muted">On a 45-day order placed today:</p>
                  <LadderPreview ladder={ladder} today={today} />
                </div>
              )}
            </div>
          )
        })}
      </FieldGroup>

      <FieldGroup
        title="WhatsApp messages"
        description="These are used to pre-fill the message when you tap WhatsApp. Nothing is sent automatically."
      >
        <div className="rounded-md border border-line bg-parchment/40 p-2.5">
          <p className="text-[12px] font-medium text-ink">You can use:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {WHATSAPP_PLACEHOLDERS.map((p) => (
              <code key={p} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gold">
                {p}
              </code>
            ))}
          </div>
        </div>

        <Field label="Normal follow-up">
          <Textarea rows={8} value={template} onChange={(e) => setTemplate(e.target.value)} />
        </Field>

        <div className="rounded-md border border-gold/25 bg-gold-wash/40 p-3">
          <p className="text-[12px] font-semibold text-gold">Preview</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
            {samplePreview}
          </p>
        </div>

        <Field label="Overdue follow-up" hint="used once the promised date has passed">
          <Textarea
            rows={7}
            value={overdueTemplate}
            onChange={(e) => setOverdueTemplate(e.target.value)}
          />
        </Field>
      </FieldGroup>

      <ErrorNote>{error}</ErrorNote>

      <Button variant="gold" size="full" onClick={save} disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {saved && !pending && <Check className="size-4" />}
        {pending ? 'Saving…' : saved ? 'Saved' : 'Save settings'}
      </Button>

      <FieldGroup title="Vendor categories">
        <ul className="divide-y divide-line rounded-md border border-line bg-white">
          {categories.map((c) => (
            <li key={c.slug} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[14px] text-charcoal">{c.label}</span>
              <div className="flex items-center gap-2">
                {!c.is_active && <Badge tone="neutral">Hidden</Badge>}
                <button
                  className="text-[13px] font-medium text-muted underline hover:text-charcoal"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await saveCategory({ ...c, is_active: !c.is_active })
                      router.refresh()
                    })
                  }
                >
                  {c.is_active ? 'Hide' : 'Show'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="e.g. Dyeing unit"
            className="flex-1"
          />
          <Button
            variant="outline"
            disabled={pending || !newCategory.trim()}
            onClick={() =>
              start(async () => {
                const res = await saveCategory({
                  label: newCategory,
                  sort_order: categories.length + 1,
                })
                if (!res.ok) setError(res.error)
                else setNewCategory('')
                router.refresh()
              })
            }
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <p className="text-[12px] text-muted">
          Categories are never deleted — hiding one keeps every existing vendor intact but removes
          it from the dropdown.
        </p>
      </FieldGroup>

      <FieldGroup
        title="Users"
        description="Create logins in your Supabase dashboard under Authentication → Users. Everyone after the first account is added as staff, and appears here straight away."
      >
        <ul className="divide-y divide-line rounded-md border border-line bg-white">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[14px] text-charcoal">
                  {u.full_name || 'Unnamed'}
                  {u.id === currentUserId && <span className="text-muted"> (you)</span>}
                </p>
                {!u.is_active && <Badge tone="neutral">Deactivated</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={u.role}
                  disabled={pending || u.id === currentUserId}
                  className="h-9 w-[6.5rem] text-[13px]"
                  onChange={(e) =>
                    start(async () => {
                      const res = await setUserRole(u.id, e.target.value as Role)
                      if (!res.ok) setError(res.error)
                      router.refresh()
                    })
                  }
                  aria-label={`Role for ${u.full_name}`}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </Select>
                {u.id !== currentUserId && (
                  <button
                    className="text-[13px] font-medium text-muted underline hover:text-charcoal"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await setUserActive(u.id, !u.is_active)
                        router.refresh()
                      })
                    }
                  >
                    {u.is_active ? 'Disable' : 'Enable'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[12px] leading-relaxed text-muted">
          Staff can place orders, log follow-ups and record dispatches. They cannot see any amounts,
          change the original promised date, or delete anything.
        </p>
      </FieldGroup>
    </div>
  )
}
