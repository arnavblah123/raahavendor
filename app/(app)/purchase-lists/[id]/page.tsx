import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getPurchaseList, getVendorCategories, getVendors } from '@/lib/queries'
import { requireProfile } from '@/lib/auth'
import { ListBuilder } from '@/components/purchase-lists/list-builder'
import { ListSummary } from '@/components/purchase-lists/list-summary'
import { formatDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function PurchaseListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'

  const [detail, vendors, categories] = await Promise.all([
    getPurchaseList(id, { isAdmin }),
    getVendors(),
    getVendorCategories(),
  ])
  if (!detail) notFound()
  const { list, photoUrls, rates } = detail

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/purchase-lists"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          Purchase lists
        </Link>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-charcoal">
          {list.vendor?.name ?? 'Purchase list'}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {list.status === 'draft' ? 'Pieces picked on' : 'Picked on'} {formatDate(list.visit_date)}
          {list.vendor?.city ? ` · ${list.vendor.city}` : ''}
        </p>
      </div>

      {list.status === 'draft' ? (
        <ListBuilder
          list={list}
          photoUrls={photoUrls}
          rates={rates}
          vendors={vendors}
          categories={categories}
          isAdmin={isAdmin}
        />
      ) : (
        <ListSummary list={list} photoUrls={photoUrls} rates={rates} isAdmin={isAdmin} />
      )}
    </div>
  )
}
