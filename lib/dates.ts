import { format } from 'date-fns'

/**
 * Dates in this app are calendar dates, not instants. A vendor promises
 * "16 October", not "16 October 00:00 UTC". So every date is carried as a
 * plain 'yyyy-MM-dd' string — the same shape Postgres `date` columns use —
 * and all arithmetic happens on those strings.
 *
 * This matters because Vercel runs in UTC while the shop runs in IST. If we
 * used `new Date()` the dashboard would roll over to "tomorrow" at 5:30 AM
 * IST and every morning's follow-up list would be wrong.
 */
export type DateStr = string

export const IST_TIMEZONE = 'Asia/Kolkata'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDateStr(value: unknown): value is DateStr {
  return typeof value === 'string' && DATE_RE.test(value)
}

/** Today's calendar date in Indian Standard Time, regardless of server timezone. */
export function todayIST(now: Date = new Date()): DateStr {
  // en-CA formats as yyyy-mm-dd, which is exactly the shape we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Convert to a UTC-noon Date. Noon keeps us clear of any DST or offset edge
 * that could otherwise tip a date into the neighbouring day.
 */
export function toDate(d: DateStr): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
}

export function fromDate(date: Date): DateStr {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysStr(d: DateStr, days: number): DateStr {
  const date = toDate(d)
  date.setUTCDate(date.getUTCDate() + days)
  return fromDate(date)
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: DateStr, to: DateStr): number {
  const ms = toDate(to).getTime() - toDate(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function isBefore(a: DateStr, b: DateStr): boolean {
  return a < b
}

export function isAfter(a: DateStr, b: DateStr): boolean {
  return a > b
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a <= b ? a : b
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a >= b ? a : b
}

/** House display format: 16 Oct 2025. */
export function formatDate(d: DateStr | null | undefined): string {
  if (!d || !isDateStr(d)) return '—'
  return format(toDate(d), 'dd MMM yyyy')
}

/** Compact variant for dense cards: 16 Oct. */
export function formatDateShort(d: DateStr | null | undefined): string {
  if (!d || !isDateStr(d)) return '—'
  return format(toDate(d), 'dd MMM')
}

export function formatMonth(d: DateStr): string {
  return format(toDate(d), 'MMM yyyy')
}

/** Timestamps (created_at etc.) rendered in IST. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** "in 4 days" / "today" / "6 days ago" — relative to an explicit today. */
export function relativeDays(target: DateStr, today: DateStr): string {
  const diff = daysBetween(today, target)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 0) return `in ${diff} days`
  return `${Math.abs(diff)} days ago`
}

/** First and last calendar day of the month containing `d`. */
export function monthBounds(d: DateStr): { start: DateStr; end: DateStr } {
  const [y, m] = d.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Greeting that matches the shop's clock, not the server's. */
export function greetingIST(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      hour12: false,
    }).format(now),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
