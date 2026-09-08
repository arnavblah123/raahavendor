import Link from 'next/link'
import { Store, Plus } from 'lucide-react'
import { getVendorCategories, getVendors } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'
import { ensureSeedVendors } from '@/lib/seed-vendors'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GradeBadge } from '@/components/vendors/grade-badge'
import { buildScorecard } from '@/lib/scorecard'
import { VendorSearch } from '@/components/vendors/vendor-search'
import type { VendorStats } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vendors — Raaha' }

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  // The list from the old software loads itself the first time this opens.
  await ensureSeedVendors()

  const [vendors, categories, statsRes] = await Promise.all([
    getVendors(),
    getVendorCategories(),
    supabase.from('vendor_stats').select('*'),
  ])

  const statsByVendor = new Map(
    ((statsRes.data ?? []) as VendorStats[]).map((s) => [s.vendor_id, s]),
  )

  const term = params.q?.trim().toLowerCase()
  const filtered = vendors.filter((v) => {
    if (params.category && params.category !== 'all' && v.category !== params.category) return false
    if (!term) return true
    return [v.name, v.company_name, v.city, v.contact_person, v.phone].some((f) =>
      f?.toLowerCase().includes(term),
    )
  })

  const categoryLabel = new Map(categories.map((c) => [c.slug, c.label]))

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl leading-tight text-charcoal">Vendors</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'}
            {filtered.length !== vendors.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <Button asChild variant="gold" size="sm">
          <Link href="/vendors/new">
            <Plus className="size-4" />
            Add
          </Link>
        </Button>
      </header>

      <VendorSearch categories={categories} />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title={vendors.length === 0 ? 'No vendors yet' : 'No vendors match that search'}
          description={
            vendors.length === 0
              ? 'Add your fabric suppliers, embroidery units, tailors and accessory vendors here. You will pick from this list every time you place an order.'
              : 'Try a different name, city or category.'
          }
          action={
            vendors.length === 0 ? (
              <Button asChild variant="gold">
                <Link href="/vendors/new">Add your first vendor</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((v) => {
            const card = buildScorecard(statsByVendor.get(v.id))
            return (
              <li key={v.id}>
                <Link
                  href={`/vendors/${v.id}`}
                  className="card flex items-center gap-3 p-3.5 hover:bg-parchment/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-serif text-lg leading-tight text-charcoal">
                        {v.name}
                      </h2>
                      {!v.is_active && <Badge tone="neutral">Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {[categoryLabel.get(v.category) ?? v.category, v.city, v.contact_person]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {card.totalOrders > 0 && (
                      <p className="mt-1 text-[12px] text-ink">
                        {card.totalOrders} {card.totalOrders === 1 ? 'order' : 'orders'}
                        {card.openOrders > 0 && ` · ${card.openOrders} open`}
                        {card.onTimePct !== null && ` · ${card.onTimePct}% on time`}
                      </p>
                    )}
                  </div>
                  <GradeBadge grade={card.grade} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
