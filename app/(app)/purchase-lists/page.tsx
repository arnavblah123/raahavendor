import Link from 'next/link'
import { Camera, Plus, ShoppingBag } from 'lucide-react'
import { getPurchaseLists } from '@/lib/queries'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/dates'
import type { PurchaseListWithContext } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Purchase lists — Raaha' }

export default async function PurchaseListsPage() {
  const lists = await getPurchaseLists()
  const drafts = lists.filter((l) => l.status === 'draft')
  const done = lists.filter((l) => l.status !== 'draft')

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl leading-tight text-charcoal">Purchase lists</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Pieces picked in person at a vendor&rsquo;s shop, photo by photo.
          </p>
        </div>
        <Button asChild variant="gold" size="sm">
          <Link href="/purchase-lists/new">
            <Plus className="size-4" />
            New list
          </Link>
        </Button>
      </header>

      {lists.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag />}
          title="No purchase lists yet"
          description="At the vendor's shop, start a list and take a photo of each piece you pick. Back at the shop, turn the list into an order in one tap."
          action={
            <Button asChild variant="gold">
              <Link href="/purchase-lists/new">
                <Camera className="size-4" />
                Start a list
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <ListSection
            title={`Still to order (${drafts.length})`}
            lists={drafts}
            empty="Every list has been turned into an order."
          />
          <ListSection
            title={`Turned into orders (${done.length})`}
            lists={done}
            empty="Nothing here yet."
          />
        </>
      )}
    </div>
  )
}

function ListSection({
  title,
  lists,
  empty,
}: {
  title: string
  lists: PurchaseListWithContext[]
  empty: string
}) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      {lists.length === 0 ? (
        <EmptyState title={empty} className="py-6" />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {lists.map((l) => {
            const items = l.purchase_list_items
            const pcs = items.reduce((s, i) => s + i.quantity, 0)
            const priced = items.filter((i) => i.has_rate).length
            return (
              <li key={l.id}>
                <Link
                  href={`/purchase-lists/${l.id}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-parchment/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-charcoal">
                      {l.vendor?.name ?? 'Unknown vendor'}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {formatDate(l.visit_date)} · {items.length}{' '}
                      {items.length === 1 ? 'piece' : 'pieces'} · {pcs} pcs
                      {items.length > 0 && ` · ${priced}/${items.length} priced`}
                      {l.notes ? ` · ${l.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {l.status === 'draft' ? (
                      <Badge tone="today">Draft</Badge>
                    ) : (
                      <Badge tone="done">Ordered</Badge>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
