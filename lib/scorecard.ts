import { GRADE_THRESHOLDS, type Grade } from './constants'
import type { VendorStats } from './types'

/**
 * Vendor reliability. Pure functions so the grading rules are testable and
 * live in exactly one place — this is the report used to renegotiate with
 * chronically late vendors, so it needs to be defensible.
 */

export interface Scorecard {
  totalOrders: number
  completedOrders: number
  openOrders: number
  onTimePct: number | null
  avgDelayDays: number | null
  worstDelayDays: number | null
  avgRevisions: number | null
  /** Share of completed orders that shipped in one go rather than being split. */
  fillRatePct: number | null
  /** Average days between the first and the final dispatch on split orders. */
  avgDispatchSpreadDays: number | null
  grade: Grade | null
}

export function gradeFor(avgDelayDays: number | null): Grade | null {
  if (avgDelayDays === null || avgDelayDays === undefined) return null
  // An early or on-time vendor is an A; the bands only measure lateness.
  const delay = Math.max(0, avgDelayDays)
  return GRADE_THRESHOLDS.find((t) => delay <= t.maxAvgDelay)!.grade
}

export function buildScorecard(stats: VendorStats | null | undefined): Scorecard {
  const s = stats
  const completed = s?.completed_orders ?? 0

  return {
    totalOrders: s?.total_orders ?? 0,
    completedOrders: completed,
    openOrders: s?.open_orders ?? 0,
    onTimePct: completed > 0 ? Math.round(((s?.on_time_orders ?? 0) / completed) * 100) : null,
    avgDelayDays: s?.avg_delay_days ?? null,
    worstDelayDays: s?.worst_delay_days ?? null,
    avgRevisions: s?.avg_revisions ?? null,
    fillRatePct:
      completed > 0 ? Math.round(((s?.single_dispatch_orders ?? 0) / completed) * 100) : null,
    avgDispatchSpreadDays: s?.avg_dispatch_spread_days ?? null,
    grade: gradeFor(s?.avg_delay_days ?? null),
  }
}

export const GRADE_DESCRIPTION: Record<Grade, string> = {
  A: 'Reliable — average delay 2 days or less',
  B: 'Usually fine — average delay up to a week',
  C: 'Needs chasing — average delay up to a fortnight',
  D: 'Chronic — average delay over a fortnight',
}

/**
 * The pattern worth surfacing: a vendor who starts shipping on time but then
 * drags the balance out for weeks looks fine on delay alone.
 */
export function dragsTheBalance(s: Scorecard): boolean {
  return (
    s.completedOrders >= 3 &&
    s.fillRatePct !== null &&
    s.fillRatePct < 60 &&
    (s.avgDispatchSpreadDays ?? 0) >= 7
  )
}
