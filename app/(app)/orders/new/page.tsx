import Link from 'next/link'
import { ChevronLeft, Store } from 'lucide-react'
import { getVendorCategories, getVendors } from '@/lib/queries'
import { requireProfile } from '@/lib/auth'
import { OrderForm } from '@/components/orders/order-form'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Place order — Raaha' }

export default async function NewOrderPage() {
  const [profile, vendors, categories] = await Promise.all([
    requireProfile(),
    getVendors({ activeOnly: true }),
    getVendorCategories(),
  ])

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-charcoal"
        >
          <ChevronLeft className="size-4" />
          Orders
        </Link>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-charcoal">Place an order</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Follow-up reminders are scheduled automatically from the lead time.
        </p>
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title="Add a vendor first"
          description="You need at least one vendor before you can place an order."
          action={
            <Button asChild variant="gold">
              <Link href="/vendors/new">Add a vendor</Link>
            </Button>
          }
        />
      ) : (
        <OrderForm
          vendors={vendors}
          categories={categories}
          isAdmin={profile.role === 'admin'}
          defaultPlacedBy={profile.full_name}
        />
      )}
    </div>
  )
}
