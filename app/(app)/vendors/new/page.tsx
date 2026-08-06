import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getVendorCategories } from '@/lib/queries'
import { isAdmin } from '@/lib/auth'
import { VendorForm } from '@/components/vendors/vendor-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add vendor — Raaha' }

export default async function NewVendorPage() {
  const [categories, admin] = await Promise.all([getVendorCategories(), isAdmin()])

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/vendors"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          Vendors
        </Link>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-charcoal">Add vendor</h1>
      </div>

      <VendorForm categories={categories} isAdmin={admin} />
    </div>
  )
}
