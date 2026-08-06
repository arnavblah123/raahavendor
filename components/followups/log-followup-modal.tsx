'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { CONTACT_METHODS, CONTACT_METHOD_LABELS, type ContactMethod } from '@/lib/constants'
import { formatDate, todayIST } from '@/lib/dates'
import { logFollowup } from '@/app/(app)/actions'

export function LogFollowupModal({
  open,
  onOpenChange,
  orderId,
  followupId,
  orderNo,
  vendorName,
  currentExpected,
  onLogged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  followupId: string | null
  orderNo: string
  vendorName: string
  currentExpected: string
  onLogged?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [contactedVia, setContactedVia] = useState<ContactMethod>('whatsapp')
  const [spokeTo, setSpokeTo] = useState('')
  const [vendorResponse, setVendorResponse] = useState('')
  const [newPromisedDate, setNewPromisedDate] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [markReady, setMarkReady] = useState(false)

  const today = todayIST()
  const dateMoved = newPromisedDate && newPromisedDate !== currentExpected

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await logFollowup({
        followupId,
        orderId,
        contactedVia,
        spokeTo,
        vendorResponse,
        newPromisedDate: newPromisedDate || null,
        nextAction,
        markReady,
      })

      if (!res.ok) {
        setError(res.error)
        return
      }

      onLogged?.()
      onOpenChange(false)
      // Reset so the next order does not inherit this one's answers.
      setSpokeTo('')
      setVendorResponse('')
      setNewPromisedDate('')
      setNextAction('')
      setMarkReady(false)
      router.refresh()
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Log follow-up"
      description={`${vendorName} · ${orderNo}`}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="gold" className="flex-1" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Contacted via">
          <div className="grid grid-cols-4 gap-1.5">
            {CONTACT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setContactedVia(m)}
                className={
                  'min-h-11 rounded-md border px-1 text-[13px] font-medium transition-colors ' +
                  (contactedVia === m
                    ? 'border-gold bg-gold-wash text-gold'
                    : 'border-line bg-white text-ink hover:bg-parchment')
                }
              >
                {CONTACT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Spoke to" hint="optional">
          <Input
            value={spokeTo}
            onChange={(e) => setSpokeTo(e.target.value)}
            placeholder="Name of the person"
          />
        </Field>

        <Field label="What did they say?">
          <Textarea
            value={vendorResponse}
            onChange={(e) => setVendorResponse(e.target.value)}
            placeholder="e.g. Embroidery done, stitching will take 10 more days"
          />
        </Field>

        <Field
          label="New promised date"
          hint="only if the date moved"
          error={
            newPromisedDate && newPromisedDate < today
              ? 'A promised date cannot be in the past.'
              : null
          }
        >
          <Input
            type="date"
            min={today}
            value={newPromisedDate}
            onChange={(e) => setNewPromisedDate(e.target.value)}
          />
          <p className="text-[12px] text-muted">
            Currently promised for {formatDate(currentExpected)}.
            {dateMoved && ' Saving will record a revision and reschedule the remaining reminders.'}
          </p>
        </Field>

        <Field label="Next action" hint="optional">
          <Input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Ask for photos on Monday"
          />
        </Field>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border border-line bg-white px-3">
          <input
            type="checkbox"
            checked={markReady}
            onChange={(e) => setMarkReady(e.target.checked)}
            className="size-4 accent-[#B08D57]"
          />
          <span className="text-[13px] text-ink">Goods are ready — move to Ready for Dispatch</span>
        </label>

        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  )
}

/** Compact contact-method picker reused by the quick-log flow. */
export function ContactMethodSelect({
  value,
  onChange,
}: {
  value: ContactMethod
  onChange: (v: ContactMethod) => void
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as ContactMethod)}>
      {CONTACT_METHODS.map((m) => (
        <option key={m} value={m}>
          {CONTACT_METHOD_LABELS[m]}
        </option>
      ))}
    </Select>
  )
}
