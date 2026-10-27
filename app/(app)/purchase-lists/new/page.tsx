import Link from 'next/link'
import { ChevronLeft, Store } from 'lucide-react'
import { getSettings, getVendorCategories, getVendors } from '@/lib/queries'
import { resolvePoDetails } from '@/lib/po'
import { requireProfile } from '@/lib/auth'
import { ensureSeedVendors } from '@/lib/seed-vendors'
import { ListBuilder } from '@/components/purchase-lists/list-builder'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New purchase list — Raaha' }

export default async function NewPurchaseListPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>
}) {
  await ensureSeedVendors()
  const [query, profile, vendors, categories, settings] = await Promise.all([
    searchParams,
    requireProfile(),
    getVendors({ activeOnly: true }),
    getVendorCategories(),
    getSettings(),
  ])
  const po = resolvePoDetails(settings?.po_details)
  const from = { company_name: po.company_name, tagline: po.tagline, phone: po.phone }

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
        <h1 className="mt-1 font-serif text-3xl leading-tight text-charcoal">At the vendor&rsquo;s shop</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Take a photo of every piece you pick. Turn the list into an order whenever you are ready.
        </p>
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title="Add a vendor first"
          description="You need at least one vendor before you can start a purchase list."
          action={
            <Button asChild variant="gold">
              <Link href="/vendors/new">Add a vendor</Link>
            </Button>
          }
        />
      ) : (
        <ListBuilder
          list={null}
          photoUrls={{}}
          rates={{}}
          vendors={vendors}
          categories={categories}
          isAdmin={profile.role === 'admin'}
          defaultVendorId={query.vendor}
          from={from}
        />
      )}
    </div>
  )
}
