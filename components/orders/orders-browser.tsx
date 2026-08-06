'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Search, SlidersHorizontal } from 'lucide-react'
import { Badge, PartialBadge, RevisionBadge, StageBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { EmptyState } from '@/components/common/states'
import { ORDER_STAGES, STAGE_LABELS } from '@/lib/constants'
import { daysBetween, formatDate, type DateStr } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { totalBalancePcs, totalOrderedPcs } from '@/lib/whatsapp'
import type { OrderWithContext, Vendor } from '@/lib/types'

type SortKey = 'expected' | 'delay' | 'value' | 'ordered'

export function OrdersBrowser({
  orders,
  vendors,
  today,
  isAdmin,
  financeByOrder,
}: {
  orders: OrderWithContext[]
  vendors: Pick<Vendor, 'id' | 'name'>[]
  today: DateStr
  isAdmin: boolean
  financeByOrder: Record<string, number | null>
}) {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('open')
  const [vendorId, setVendorId] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<SortKey>('expected')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()

    const filtered = orders.filter((o) => {
      if (stage === 'open') {
        if (!['ordered', 'in_production', 'ready_for_dispatch', 'on_hold'].includes(o.stage))
          return false
      } else if (stage !== 'all' && o.stage !== stage) return false

      if (vendorId && o.vendor_id !== vendorId) return false
      if (urgentOnly && o.priority !== 'urgent') return false
      if (overdueOnly && !(o.current_expected_dispatch_date < today && !o.actual_dispatch_date))
        return false
      if (from && o.order_date < from) return false
      if (to && o.order_date > to) return false

      if (!term) return true
      return [
        o.order_no,
        o.vendor?.name,
        o.vendor?.company_name,
        o.notes,
        ...o.order_items.flatMap((i) => [i.product_name, i.design_code, i.colour]),
      ].some((v) => v?.toLowerCase().includes(term))
    })

    const delayOf = (o: OrderWithContext) =>
      o.actual_dispatch_date ? (o.delay_days ?? 0) : daysBetween(o.current_expected_dispatch_date, today)

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'delay':
          return delayOf(b) - delayOf(a)
        case 'value':
          return (financeByOrder[b.id] ?? 0) - (financeByOrder[a.id] ?? 0)
        case 'ordered':
          return b.order_date.localeCompare(a.order_date)
        default:
          return a.current_expected_dispatch_date.localeCompare(b.current_expected_dispatch_date)
      }
    })
  }, [orders, search, stage, vendorId, overdueOnly, urgentOnly, from, to, sort, today, financeByOrder])

  /** Client-side CSV — no library, no server round-trip, no cost. */
  function exportCsv() {
    const headers = [
      'Order No', 'Vendor', 'Order Date', 'Lead Time Days',
      'Original Expected', 'Current Expected', 'Actual Dispatch',
      'Delay Days', 'Stage', 'Priority', 'Revisions',
      'Items', 'Qty Ordered', 'Qty Dispatched', 'Qty Balance',
      ...(isAdmin ? ['Total Amount'] : []),
    ]

    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    const lines = rows.map((o) => {
      const ordered = totalOrderedPcs(o.order_items)
      const balance = totalBalancePcs(o.order_items)
      return [
        o.order_no,
        o.vendor?.name ?? '',
        o.order_date,
        o.lead_time_days,
        o.original_expected_dispatch_date,
        o.current_expected_dispatch_date,
        o.actual_dispatch_date ?? '',
        o.delay_days ?? '',
        STAGE_LABELS[o.stage],
        o.priority,
        o.revision_count,
        o.order_items.map((i) => `${i.quantity} ${i.unit} ${i.product_name}`).join('; '),
        ordered,
        ordered - balance,
        balance,
        ...(isAdmin ? [financeByOrder[o.id] ?? ''] : []),
      ].map(escape).join(',')
    })

    const csv = [headers.join(','), ...lines].join('\n')
    // BOM so Excel opens ₹ and Indian names correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `raaha-orders-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeFilters =
    (vendorId ? 1 : 0) + (overdueOnly ? 1 : 0) + (urgentOnly ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order no., vendor, product, design code…"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant={activeFilters > 0 ? 'gold' : 'outline'}
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="size-4" />
          {activeFilters > 0 ? activeFilters : ''}
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="flex-1" aria-label="Stage">
          <option value="open">Open orders</option>
          <option value="all">All stages</option>
          {ORDER_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="flex-1" aria-label="Sort by">
          <option value="expected">Sort: expected date</option>
          <option value="delay">Sort: most delayed</option>
          <option value="ordered">Sort: newest</option>
          {isAdmin && <option value="value">Sort: value</option>}
        </Select>
      </div>

      {filtersOpen && (
        <div className="card space-y-3 p-3.5">
          <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)} aria-label="Vendor">
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-muted">
              Ordered from
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
            </label>
            <label className="text-[12px] text-muted">
              Ordered to
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Toggle active={overdueOnly} onClick={() => setOverdueOnly((v) => !v)}>
              Overdue only
            </Toggle>
            <Toggle active={urgentOnly} onClick={() => setUrgentOnly((v) => !v)}>
              Urgent only
            </Toggle>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={() => {
                  setVendorId('')
                  setOverdueOnly(false)
                  setUrgentOnly(false)
                  setFrom('')
                  setTo('')
                }}
                className="ml-auto text-[13px] font-medium text-muted underline hover:text-charcoal"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {rows.length} {rows.length === 1 ? 'order' : 'orders'}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No orders match"
          description="Try clearing the filters or searching for something else."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((o) => {
            const ordered = totalOrderedPcs(o.order_items)
            const balance = totalBalancePcs(o.order_items)
            const late = !o.actual_dispatch_date && o.current_expected_dispatch_date < today
            const lateBy = daysBetween(o.current_expected_dispatch_date, today)

            return (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="card block p-3.5 hover:bg-parchment/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-serif text-lg leading-tight text-charcoal">
                        {o.vendor?.name ?? 'Unknown vendor'}
                      </h3>
                      <p className="mt-0.5 truncate text-[13px] text-muted">
                        {o.order_no} ·{' '}
                        {o.order_items.length > 0
                          ? `${o.order_items[0].quantity} ${o.order_items[0].unit} ${o.order_items[0].product_name}${
                              o.order_items.length > 1 ? ` +${o.order_items.length - 1}` : ''
                            }`
                          : 'No items'}
                      </p>
                    </div>
                    <StageBadge stage={o.stage} />
                  </div>

                  <p className="mt-2 text-[13px] text-ink">
                    Ordered {formatDate(o.order_date)}
                    <span className="text-muted">
                      {' · '}
                      {o.actual_dispatch_date
                        ? `dispatched ${formatDate(o.actual_dispatch_date)}`
                        : `due ${formatDate(o.current_expected_dispatch_date)}`}
                    </span>
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {late && <Badge tone="overdue">{lateBy} days late</Badge>}
                    {o.priority === 'urgent' && <Badge tone="overdue">Urgent</Badge>}
                    {o.delay_days !== null && (
                      <Badge tone={o.delay_days > 7 ? 'overdue' : o.delay_days > 2 ? 'today' : 'done'}>
                        {o.delay_days > 0 ? `${o.delay_days} days late` : o.delay_days === 0 ? 'On time' : `${Math.abs(o.delay_days)} days early`}
                      </Badge>
                    )}
                    <RevisionBadge count={o.revision_count} />
                    <PartialBadge dispatched={ordered - balance} total={ordered} />
                    {isAdmin && financeByOrder[o.id] != null && (
                      <span className="ml-auto text-[13px] font-medium text-ink">
                        {formatMoney(financeByOrder[o.id])}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'min-h-9 rounded-full border px-3 text-[13px] font-medium transition-colors ' +
        (active
          ? 'border-gold bg-gold-wash text-gold'
          : 'border-line bg-white text-ink hover:bg-parchment')
      }
    >
      {children}
    </button>
  )
}
