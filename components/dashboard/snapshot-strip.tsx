import { formatMoneyCompact, formatNumber } from '@/lib/money'
import type { DashboardData } from '@/lib/queries'

/**
 * The four numbers worth glancing at. The value tile is admin-only — staff
 * get the piece count in its place, so the strip never looks broken or
 * shows a misleading zero.
 */
export function SnapshotStrip({
  snapshot,
  isAdmin,
}: {
  snapshot: DashboardData['snapshot']
  isAdmin: boolean
}) {
  const tiles: { label: string; value: string; tone?: string }[] = [
    { label: 'Open orders', value: formatNumber(snapshot.openOrders) },
    isAdmin
      ? { label: 'Value open', value: formatMoneyCompact(snapshot.openValue) }
      : { label: 'Pieces pending', value: formatNumber(snapshot.openPcsPending) },
    { label: 'Dispatched this month', value: formatNumber(snapshot.dispatchedThisMonth) },
    {
      label: 'Avg delay',
      value:
        snapshot.avgDelayDays === null
          ? '—'
          : `${snapshot.avgDelayDays > 0 ? '+' : ''}${snapshot.avgDelayDays}d`,
      tone:
        snapshot.avgDelayDays === null
          ? undefined
          : snapshot.avgDelayDays > 7
            ? 'text-overdue'
            : snapshot.avgDelayDays > 2
              ? 'text-today'
              : 'text-done',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="card px-3 py-2.5">
          <p className={`font-serif text-2xl leading-tight ${t.tone ?? 'text-charcoal'}`}>
            {t.value}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{t.label}</p>
        </div>
      ))}
    </div>
  )
}
