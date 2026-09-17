import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getVendorCategories } from '@/lib/queries'
import { isAdmin } from '@/lib/auth'
import { VendorForm } from '@/components/vendors/vendor-form'
import type { Vendor, VendorFinance } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit vendor — Raaha' }

/** Every detail of a vendor, editable on one screen. Staff and admin alike. */
export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [vendorRes, financeRes, categories, admin] = await Promise.all([
    supabase.from('vendors').select('*').eq('id', id).maybeSingle(),
    supabase.from('vendor_finance').select('*').eq('vendor_id', id).maybeSingle(),
    getVendorCategories(),
    isAdmin(),
  ])

  const vendor = vendorRes.data as Vendor | null
  if (!vendor) notFound()
  const finance = financeRes.data as VendorFinance | null

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/vendors/${id}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          {vendor.name}
        </Link>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-charcoal">Edit vendor</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Name, contact, address and everything else. Changes apply to future POs; past orders keep
          what was printed at the time.
        </p>
      </div>

      <VendorForm
        vendor={vendor}
        categories={categories}
        isAdmin={admin}
        paymentTerms={finance?.payment_terms ?? ''}
      />
    </div>
  )
}
