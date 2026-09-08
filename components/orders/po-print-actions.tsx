'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, Loader2, Mail, MessageCircle, PackageOpen, Printer, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorNote } from '@/components/common/states'
import type { PoPdfInput } from '@/lib/po-pdf'

/**
 * Sending the PO.
 *
 * A wa.me link can only carry text — that is why "only the message went".
 * To send the document itself the phone's share sheet is used with the PO
 * as a PDF attached; from there the user picks WhatsApp, Gmail, or anything
 * else. On a computer without a share sheet the PDF is downloaded and the
 * text-only WhatsApp and email links open so the file can be attached.
 */
export function PoPrintActions({
  orderId,
  poNo,
  pdfInput,
  whatsappHref,
  emailHref,
  canInward,
}: {
  orderId: string
  poNo: string
  pdfInput: PoPdfInput
  whatsappHref: string | null
  emailHref: string
  canInward: boolean
}) {
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  async function makeFile(): Promise<File> {
    const { buildPoPdf, poPdfFilename } = await import('@/lib/po-pdf')
    const blob = await buildPoPdf(pdfInput)
    return new File([blob], poPdfFilename(poNo), { type: 'application/pdf' })
  }

  function saveLocally(file: File) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setDownloaded(true)
  }

  async function share() {
    setError(null)
    setBusy('share')
    try {
      const file = await makeFile()
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: `Purchase order ${poNo}`,
            text: `Purchase order ${poNo} from ${pdfInput.from.company_name}`,
          })
        } catch (e) {
          // The user closing the share sheet is not an error.
          if (!(e instanceof Error && e.name === 'AbortError')) throw e
        }
      } else {
        saveLocally(file)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PDF.')
    } finally {
      setBusy(null)
    }
  }

  async function download() {
    setError(null)
    setBusy('download')
    try {
      saveLocally(await makeFile())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PDF.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="gold" onClick={share} disabled={busy !== null}>
          {busy === 'share' ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
          {busy === 'share' ? 'Preparing PDF…' : 'Send PO (WhatsApp / email)'}
        </Button>
        <Button variant="outline" onClick={download} disabled={busy !== null}>
          {busy === 'download' ? <Loader2 className="animate-spin" /> : <Download className="size-4" />}
          Download PDF
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print
        </Button>
        {canInward && (
          <Button asChild variant="outline">
            <Link href={`/orders/${orderId}/inward`}>
              <PackageOpen className="size-4" />
              Inward goods
            </Link>
          </Button>
        )}
      </div>

      {downloaded && (
        <div className="rounded-md border border-gold/30 bg-gold-wash/50 p-3 text-[13px] text-charcoal">
          <p className="font-medium">PDF saved to your downloads.</p>
          <p className="mt-0.5 text-[12px] text-ink">
            Open WhatsApp or your email below, then attach the PDF from your downloads.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {whatsappHref && (
              <Button asChild variant="outline" size="sm">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  Open WhatsApp
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={emailHref}>
                <Mail className="size-4" />
                Open email
              </a>
            </Button>
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted">
        On a phone, <strong>Send PO</strong> opens the share sheet with the PDF attached — pick
        WhatsApp or Gmail there. The photos and measurements are inside the PDF.
      </p>
      <ErrorNote>{error}</ErrorNote>
    </div>
  )
}
