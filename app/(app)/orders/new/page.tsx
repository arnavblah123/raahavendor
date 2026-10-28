import Link from 'next/link'
import { ChevronLeft, Store } from 'lucide-react'
import { getPurchaseList, getVendorCategories, getVendors } from '@/lib/queries'
import { requireProfile } from '@/lib/auth'
import { ensureSeedVendors } from '@/lib/seed-vendors'
import { OrderForm, type OrderPrefill } from '@/components/orders/order-form'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Place order — Raaha' }

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>
}) {
  await ensureSeedVendors()
  const [query, profile, vendors, categories] = await Promise.all([
    searchParams,
    requireProfile(),
    getVendors({ activeOnly: true }),
    getVendorCategories(),
  ])
  const isAdmin = profile.role === 'admin'

  // Placing the order from a purchase list made at the shop: the pieces
  // come across with their photos, so nothing is typed twice.
  let prefill: OrderPrefill | null = null
  if (query.list) {
    const detail = await getPurchaseList(query.list, { isAdmin })
    if (detail && detail.list.status === 'draft') {
      const { list, photoUrls, rates } = detail
      prefill = {
        purchaseListId: list.id,
        vendorId: list.vendor_id,
        vendorName: list.vendor?.name ?? 'the vendor',
        visitDate: list.visit_date,
        notes: list.notes ? `Picked in person on the visit: ${list.notes}` : '',
        items: list.purchase_list_items.map((i, idx) => ({
          product_name: i.product_name ?? `Piece ${idx + 1}`,
          design_code: i.design_code ?? '',
          colour: i.colour ?? '',
          category: i.category,
          quantity: i.quantity,
          unit: i.unit,
          changes: i.notes ?? '',
          photoPath: i.photo_path,
          photoPreview: i.photo_path ? (photoUrls[i.photo_path] ?? null) : null,
          rate: isAdmin ? (rates[i.id] ?? null) : null,
        })),
      }
    }
  }

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
          isAdmin={isAdmin}
          defaultPlacedBy={profile.full_name}
          prefill={prefill}
        />
      )}
    </div>
  )
}
