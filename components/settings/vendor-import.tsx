'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { importSeedVendors } from '@/app/(app)/settings/actions'

/**
 * One-tap import of the vendor list carried over from the old software.
 * The list itself lives in data/vendors/ in the repository.
 */
export function VendorImport({ pending: pendingCount }: { pending: number }) {
  const router = useRouter()
  const [running, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null)

  function run() {
    setError(null)
    start(async () => {
      const res = await importSeedVendors()
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResult({ added: res.added, skipped: res.skipped })
      router.refresh()
    })
  }

  const allIn = pendingCount === 0 && !result

  return (
    <FieldGroup
      title="Import vendors"
      description="The vendor list from the old software loads itself the first time the app is opened after a deploy. This button only exists in case that has not happened yet."
    >
      {result ? (
        <p className="flex items-center gap-2 rounded-md border border-done/40 bg-done-wash px-3 py-2.5 text-[13px] text-charcoal">
          <Check className="size-4 text-done" />
          {result.added === 0
            ? 'Nothing new to add — every vendor is already in the app.'
            : `${result.added} ${result.added === 1 ? 'vendor' : 'vendors'} added${
                result.skipped > 0 ? `, ${result.skipped} already there` : ''
              }.`}{' '}
          <Link href="/vendors" className="font-medium underline">
            See vendors
          </Link>
        </p>
      ) : allIn ? (
        <p className="text-[13px] text-muted">
          All vendors from the old software are already in the app.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="gold" onClick={run} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Download className="size-4" />}
            {running
              ? 'Importing…'
              : `Import ${pendingCount} ${pendingCount === 1 ? 'vendor' : 'vendors'}`}
          </Button>
          <p className="text-[12px] text-muted">
            Phones, cities and areas come across. Set each vendor&apos;s category as you go.
          </p>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </FieldGroup>
  )
}
