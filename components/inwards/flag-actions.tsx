'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { reopenInwardFlag, resolveInwardFlag } from '@/app/(app)/actions'
import type { FlagStatus } from '@/lib/types'

/**
 * The owner's decision on a flagged piece. Only an admin sees these buttons;
 * the database refuses the update for anyone else regardless.
 */
export function FlagActions({
  inwardItemId,
  status,
}: {
  inwardItemId: string
  status: FlagStatus | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resolve() {
    setError(null)
    start(async () => {
      const res = await resolveInwardFlag(inwardItemId, note)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  function reopen() {
    setError(null)
    start(async () => {
      const res = await reopenInwardFlag(inwardItemId)
      if (!res.ok) setError(res.error)
      router.refresh()
    })
  }

  if (status === 'resolved') {
    return (
      <div>
        <button
          type="button"
          onClick={reopen}
          disabled={pending}
          className="inline-flex min-h-9 items-center gap-1 text-[12px] font-medium text-muted hover:text-charcoal disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          Reopen
        </button>
        <ErrorNote>{error}</ErrorNote>
      </div>
    )
  }

  if (!open) {
    return (
      <Button variant="default" size="sm" onClick={() => setOpen(true)}>
        <Check className="size-4" />
        Mark as seen
      </Button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-line bg-white p-3">
      <Field label="What did you decide?" hint="optional — staff see this on the order">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Accepted at ₹500 off · Send back for alteration · Replace"
          autoFocus
        />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button variant="default" size="sm" onClick={resolve} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check className="size-4" />}
          Resolve
        </Button>
      </div>
    </div>
  )
}
