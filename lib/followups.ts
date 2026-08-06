import {
  BALANCE_PROFILE,
  CHECKPOINT_PROFILES,
  OVERDUE_INTERVAL_DAYS,
  type CheckpointProfile,
  type FollowupStatus,
} from './constants'
import { addDaysStr, daysBetween, type DateStr } from './dates'

/**
 * The follow-up ladder.
 *
 * Every function here is PURE: no database, no clock, no I/O. "Today" is
 * always passed in explicitly. That makes the whole scheduling core
 * deterministic and unit-testable, which matters because getting these dates
 * wrong is silently expensive — a missed checkpoint is an order that goes
 * quiet for three weeks.
 */

export type CheckpointPct = number | null

export interface Checkpoint {
  /** 30 | 50 | 75 | 90 | 100 for ladder rungs, null for overdue nudges. */
  checkpoint_pct: CheckpointPct
  due_date: DateStr
  status: FollowupStatus
}

export interface GenerateLadderArgs {
  /** Where the timeline starts: order date for a new order, today for a revision. */
  anchorDate: DateStr
  /** The date the vendor has promised. */
  targetDate: DateStr
  profile: CheckpointProfile
  /** Current date, so back-dated entry can pre-skip elapsed rungs. */
  today: DateStr
  /** Overridable so /settings can change percentages without a deploy. */
  profilePcts?: number[]
}

function statusFor(due: DateStr, today: DateStr): FollowupStatus {
  return due < today ? 'skipped' : 'pending'
}

/**
 * Build the checkpoint ladder between an anchor and a target date.
 *
 * Rules (as specified):
 *  - offsets are Math.round(span * pct/100)
 *  - the target date itself is always the final 100% checkpoint
 *  - two checkpoints on the same date collapse to the LATER rung (higher pct)
 *  - a rung already in the past at entry time is born 'skipped', not 'pending',
 *    so back-dating an order does not dump five overdue rows on the dashboard
 */
export function generateLadder({
  anchorDate,
  targetDate,
  profile,
  today,
  profilePcts,
}: GenerateLadderArgs): Checkpoint[] {
  const span = daysBetween(anchorDate, targetDate)

  // Same-day or already-past target: there is nothing to spread, only the
  // date itself is worth chasing.
  if (span <= 0) {
    return [{ checkpoint_pct: 100, due_date: targetDate, status: statusFor(targetDate, today) }]
  }

  const pcts = profilePcts ?? [...CHECKPOINT_PROFILES[profile].pcts]

  const raw: Checkpoint[] = []
  for (const pct of [...pcts].sort((a, b) => a - b)) {
    const offset = Math.round((span * pct) / 100)
    raw.push({
      checkpoint_pct: pct,
      due_date: addDaysStr(anchorDate, offset),
      status: 'pending',
    })
  }
  // The promised date itself always closes the ladder.
  raw.push({ checkpoint_pct: 100, due_date: targetDate, status: 'pending' })

  // Keep only rungs strictly after the anchor and no later than the target.
  const inWindow = raw.filter((c) => c.due_date > anchorDate && c.due_date <= targetDate)

  // Collision: same date keeps the later rung. Inserting in ascending pct
  // order means a later entry overwrites an earlier one on the same key.
  const byDate = new Map<DateStr, Checkpoint>()
  for (const c of inWindow) byDate.set(c.due_date, c)

  return [...byDate.values()]
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
    .map((c) => ({ ...c, status: statusFor(c.due_date, today) }))
}

/** Convenience for order creation: expected date derived from the quoted lead time. */
export function expectedDispatchDate(orderDate: DateStr, leadTimeDays: number): DateStr {
  return addDaysStr(orderDate, Math.max(0, Math.round(leadTimeDays)))
}

export interface OverdueArgs {
  /** The date currently promised (moves with revisions). */
  currentExpected: DateStr
  today: DateStr
  /** Overdue nudges already in the database, so this stays idempotent. */
  existingDueDates?: Iterable<DateStr>
}

/**
 * Overdue nudges: a fresh follow-up every 3 days past the promised date.
 *
 * Only materialises rungs up to and including today — we never write future
 * overdue rows, because the vendor may still deliver. This is what replaces a
 * cron job: the dashboard calls it on load and inserts whatever is missing.
 */
export function generateOverdueCheckpoints({
  currentExpected,
  today,
  existingDueDates,
}: OverdueArgs): Checkpoint[] {
  if (today <= currentExpected) return []

  const existing = new Set(existingDueDates ?? [])
  const out: Checkpoint[] = []

  let d = addDaysStr(currentExpected, OVERDUE_INTERVAL_DAYS)
  while (d <= today) {
    if (!existing.has(d)) {
      out.push({ checkpoint_pct: null, due_date: d, status: 'pending' })
    }
    d = addDaysStr(d, OVERDUE_INTERVAL_DAYS)
  }
  return out
}

export interface ExistingFollowup {
  id: string
  checkpoint_pct: CheckpointPct
  due_date: DateStr
  status: FollowupStatus
}

export interface RevisionPlan {
  /** Pending rungs already due — marked skipped so the audit trail survives. */
  toSkip: string[]
  /** Pending rungs not yet due — removed, they never mattered. */
  toDelete: string[]
  /** The replacement ladder across the remaining window. */
  toInsert: Checkpoint[]
  daysAdded: number
}

export interface PlanRevisionArgs {
  currentExpected: DateStr
  newPromisedDate: DateStr
  today: DateStr
  profile: CheckpointProfile
  existing: ExistingFollowup[]
  profilePcts?: number[]
}

/**
 * Work out what a revision does to the schedule, without touching the database.
 *
 * The new ladder is anchored on TODAY, not on the original order date: when a
 * vendor says "10 more days" we want pressure spread across those 10 days, not
 * percentages of a total lead time that has already mostly elapsed.
 *
 * History is never rewritten. `original_expected_dispatch_date` is untouched by
 * the caller, so all delay reporting still measures against the first promise.
 */
export function planRevision({
  currentExpected,
  newPromisedDate,
  today,
  profile,
  existing,
  profilePcts,
}: PlanRevisionArgs): RevisionPlan {
  const toSkip: string[] = []
  const toDelete: string[] = []

  for (const f of existing) {
    if (f.status !== 'pending') continue // done/skipped rungs are history
    if (f.due_date <= today) {
      // Already came due. The vendor has just given us a new date, so chasing
      // this rung is moot — but it stays visible as 'skipped' rather than
      // vanishing, so a pattern of ignored checkpoints is still readable.
      toSkip.push(f.id)
    } else {
      // Never came due and never will; drop it so the timeline stays clean.
      toDelete.push(f.id)
    }
  }

  const toInsert = generateLadder({
    anchorDate: today,
    targetDate: newPromisedDate,
    profile,
    today,
    profilePcts,
  })

  return {
    toSkip,
    toDelete,
    toInsert,
    daysAdded: daysBetween(currentExpected, newPromisedDate),
  }
}

/** The balance of a partial dispatch gets a short ladder, never a full one. */
export function planBalanceLadder(args: {
  currentExpected: DateStr
  balancePromisedDate: DateStr
  today: DateStr
  existing: ExistingFollowup[]
}): RevisionPlan {
  return planRevision({ ...args, newPromisedDate: args.balancePromisedDate, profile: BALANCE_PROFILE })
}

export function isValidPromisedDate(newDate: DateStr, today: DateStr): boolean {
  return newDate >= today
}

/**
 * "Day 23 of 45 (50% checkpoint)" — the progress line on every dashboard card.
 */
export function describeProgress(args: {
  orderDate: DateStr
  currentExpected: DateStr
  today: DateStr
  checkpointPct: CheckpointPct
}): string {
  const total = daysBetween(args.orderDate, args.currentExpected)
  const elapsed = daysBetween(args.orderDate, args.today)
  const rung =
    args.checkpointPct === null
      ? 'overdue check'
      : args.checkpointPct === 100
        ? 'due today'
        : `${args.checkpointPct}% checkpoint`
  if (total <= 0) return rung.charAt(0).toUpperCase() + rung.slice(1)
  return `Day ${elapsed} of ${total} (${rung})`
}

export type Urgency = 'overdue' | 'today' | 'missed' | 'upcoming' | 'done'

/** One place decides urgency, so the colour coding cannot drift between screens. */
export function followupUrgency(due: DateStr, status: FollowupStatus, today: DateStr): Urgency {
  if (status === 'done' || status === 'skipped') return 'done'
  if (due < today) return 'missed'
  if (due === today) return 'today'
  return 'upcoming'
}

export function orderUrgency(currentExpected: DateStr, today: DateStr): Urgency {
  if (currentExpected < today) return 'overdue'
  if (currentExpected === today) return 'today'
  return 'upcoming'
}

/**
 * Delay against the ORIGINAL promise. Negative means the vendor was early.
 * For a split order this is measured on the final dispatch — the order is not
 * complete until the last piece ships.
 */
export function delayDays(
  originalExpected: DateStr,
  actualDispatch: DateStr | null | undefined,
): number | null {
  if (!actualDispatch) return null
  return daysBetween(originalExpected, actualDispatch)
}

export function daysOverdue(currentExpected: DateStr, today: DateStr): number {
  return Math.max(0, daysBetween(currentExpected, today))
}
