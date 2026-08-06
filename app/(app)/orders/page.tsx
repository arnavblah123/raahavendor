import Link from 'next/link'
import { Plus, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth'
import { todayIST } from '@/lib/dates'
import { OrdersBrowser } from '@/components/orders/orders-browser'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import type { OrderWithContext, Vendor } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders — Raaha' }

export default async function OrdersPage() {
  const supabase = await createClient()
  const admin = await isAdmin()
  const today = todayIST()

  const [ordersRes, vendorsRes, financeRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        `*, vendor:vendors ( id, name, company_name, phone, contact_person, category ), order_items ( * )`,
      )
      .order('current_expected_dispatch_date', { ascending: true })
      .limit(1000),
    supabase.from('vendors').select('id, name').order('name'),
    // Returns nothing for staff, so no value column is rendered for them.
    admin
      ? supabase.from('order_finance').select('order_id, total_amount')
      : Promise.resolve({ data: [] as { order_id: string; total_amount: number | null }[] }),
  ])

  const orders = (ordersRes.data ?? []) as unknown as OrderWithContext[]
  const vendors = (vendorsRes.data ?? []) as Pick<Vendor, 'id' | 'name'>[]

  const financeByOrder: Record<string, number | null> = {}
  for (const f of (financeRes.data ?? []) as { order_id: string; total_amount: number | null }[]) {
    financeByOrder[f.order_id] = f.total_amount === null ? null : Number(f.total_amount)
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl leading-tight text-charcoal">Orders</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} in total
          </p>
        </div>
        <Button asChild variant="gold" size="sm">
          <Link href="/orders/new">
            <Plus className="size-4" />
            New
          </Link>
        </Button>
      </header>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No orders yet"
          description="Place your first order and the follow-up schedule builds itself from the lead time the vendor quotes."
          action={
            <Button asChild variant="gold">
              <Link href="/orders/new">Place an order</Link>
            </Button>
          }
        />
      ) : (
        <OrdersBrowser
          orders={orders}
          vendors={vendors}
          today={today}
          isAdmin={admin}
          financeByOrder={financeByOrder}
        />
      )}
    </div>
  )
}
