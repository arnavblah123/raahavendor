'use client'

import Link from 'next/link'
import { MessageCircle, PackageOpen, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Print / WhatsApp / inward buttons on the PO page. Hidden when printing. */
export function PoPrintActions({
  orderId,
  whatsappHref,
  canInward,
}: {
  orderId: string
  whatsappHref: string | null
  canInward: boolean
}) {
  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="gold" onClick={() => window.print()}>
        <Printer className="size-4" />
        Print / save as PDF
      </Button>
      {whatsappHref && (
        <Button asChild variant="outline">
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" />
            Send on WhatsApp
          </a>
        </Button>
      )}
      {canInward && (
        <Button asChild variant="outline">
          <Link href={`/orders/${orderId}/inward`}>
            <PackageOpen className="size-4" />
            Inward goods
          </Link>
        </Button>
      )}
    </div>
  )
}
