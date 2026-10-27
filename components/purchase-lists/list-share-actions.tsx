'use client'

import { useState } from 'react'
import { Download, Loader2, Mail, MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorNote } from '@/components/common/states'
import type { ListPdfInput } from '@/lib/list-pdf'
import { whatsappUrl } from '@/lib/whatsapp'

/**
 * Sending the list to the vendor, the same way the PO is sent: the share
 * sheet with the PDF attached on a phone; on a computer the PDF downloads
 * and the text-only WhatsApp and email links open so it can be attached.
 */
export function ListShareActions({
  input,
  getInput,
  vendorPhone,
  vendorEmail,
  disabled,
  compact,
}: {
  /** From a server page: the finished list. */
  input?: ListPdfInput
  /** From the builder: built when tapped, so it carries what is on screen right now. */
  getInput?: () => ListPdfInput
  vendorPhone: string | null
  vendorEmail: string | null
  disabled?: boolean
  compact?: boolean
}) {
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallback, setFallback] = useState<{ wa: string | null; mail: string } | null>(null)

  function currentInput(): ListPdfInput {
    const value = getInput ? getInput() : input
    if (!value) throw new Error('Nothing to send yet.')
    if (value.pieces.length === 0) throw new Error('Add at least one piece first.')
    return value
  }

  async function makeFile(input: ListPdfInput): Promise<File> {
    const { buildListPdf, listPdfFilename } = await import('@/lib/list-pdf')
    const blob = await buildListPdf(input)
    return new File([blob], listPdfFilename(input.vendor.name, input.visitDate), { type: 'application/pdf' })
  }

  async function saveLocally(input: ListPdfInput, file: File) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    const { listMessage } = await import('@/lib/list-pdf')
    const message = listMessage(input)
    setFallback({
      wa: whatsappUrl(vendorPhone, message),
      mail:
        `mailto:${encodeURIComponent(vendorEmail ?? '')}` +
        `?subject=${encodeURIComponent(`Pieces picked at your shop on ${input.visitDate}`)}` +
        `&body=${encodeURIComponent(message)}`,
    })
  }

  async function share() {
    setError(null)
    setBusy('share')
    try {
      const input = currentInput()
      const file = await makeFile(input)
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        const { listMessage } = await import('@/lib/list-pdf')
        try {
          await nav.share({
            files: [file],
            title: `Pieces picked at ${input.vendor.name}`,
            text: listMessage(input),
          })
        } catch (e) {
          if (!(e instanceof Error && e.name === 'AbortError')) throw e
        }
      } else {
        await saveLocally(input, file)
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
      const input = currentInput()
      await saveLocally(input, await makeFile(input))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PDF.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className={compact ? 'flex gap-2' : 'flex flex-wrap gap-2'}>
        <Button
          type="button"
          variant="outline"
          className={compact ? 'flex-1' : undefined}
          onClick={share}
          disabled={disabled || busy !== null}
        >
          {busy === 'share' ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
          {busy === 'share' ? 'Preparing PDF…' : 'Send list (WhatsApp / email)'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={compact ? 'flex-1' : undefined}
          onClick={download}
          disabled={disabled || busy !== null}
        >
          {busy === 'download' ? <Loader2 className="animate-spin" /> : <Download className="size-4" />}
          PDF
        </Button>
      </div>

      {fallback && (
        <div className="rounded-md border border-gold/30 bg-gold-wash/50 p-3 text-[13px] text-charcoal">
          <p className="font-medium">PDF saved to your downloads.</p>
          <p className="mt-0.5 text-[12px] text-ink">
            Open WhatsApp or your email below, then attach the PDF from your downloads.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {fallback.wa && (
              <Button asChild variant="outline" size="sm">
                <a href={fallback.wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  Open WhatsApp
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={fallback.mail}>
                <Mail className="size-4" />
                Open email
              </a>
            </Button>
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted">
        Sends the vendor a PDF of the pieces with their photos, so they can confirm what is set
        aside. No prices are on it.
      </p>
      <ErrorNote>{error}</ErrorNote>
    </div>
  )
}
