import type { ProductCategory } from './constants'

/**
 * Measurements travel with an order item so that the piece can be checked
 * against them the day it arrives. Everything here is pure — no database,
 * no clock — so the comparison rules are unit-tested.
 */

export const MEASUREMENT_UNITS = ['in', 'cm'] as const
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number]

export const MEASUREMENT_UNIT_LABELS: Record<MeasurementUnit, string> = {
  in: 'inches',
  cm: 'cm',
}

export interface Measurement {
  name: string
  value: number
}

/** One row of the inward check: what was ordered against what turned up. */
export interface MeasurementCheck {
  name: string
  ordered: number
  received: number | null
  /** received − ordered. Null when nothing was measured. */
  diff: number | null
}

/**
 * The measurements a tailor usually needs for each kind of piece. Shown as
 * quick-add chips; anything else can be typed by hand.
 */
export const MEASUREMENT_PRESETS: Record<ProductCategory, string[]> = {
  lehenga: ['Waist', 'Hip', 'Skirt length', 'Bust', 'Blouse length', 'Sleeve length', 'Shoulder'],
  gown: ['Bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve length', 'Full length'],
  anarkali: ['Bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve length', 'Full length', 'Armhole'],
  kurta_set: ['Bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve length', 'Kurta length', 'Bottom length'],
  saree: ['Bust', 'Blouse length', 'Sleeve length', 'Shoulder', 'Armhole'],
  indo_western: ['Bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve length', 'Full length'],
  other: ['Bust', 'Waist', 'Hip', 'Length'],
}

/**
 * Tolerant parse of whatever came back from the `measurements` jsonb column.
 * Anything malformed is dropped rather than crashing a page.
 */
export function parseMeasurements(raw: unknown): Measurement[] {
  if (!Array.isArray(raw)) return []
  const out: Measurement[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const name = String((entry as { name?: unknown }).name ?? '').trim()
    const value = Number((entry as { value?: unknown }).value)
    if (!name || !Number.isFinite(value)) continue
    out.push({ name, value })
  }
  return out
}

/** Keep only rows that have both a name and a finite value. */
export function cleanMeasurements(
  rows: { name: string; value: number | string | null | undefined }[],
): Measurement[] {
  return rows
    .map((r) => ({
      name: r.name.trim(),
      // Number('') is 0, which would silently record a blank as a zero.
      value: r.value === '' || r.value === null || r.value === undefined ? NaN : Number(r.value),
    }))
    .filter((r) => r.name.length > 0 && Number.isFinite(r.value))
}

export function isMeasurementUnit(value: unknown): value is MeasurementUnit {
  return value === 'in' || value === 'cm'
}

/** "Bust 36 · Waist 30 · Length 42 in" */
export function formatMeasurements(
  measurements: Measurement[],
  unit: MeasurementUnit = 'in',
): string {
  if (measurements.length === 0) return '—'
  return `${measurements.map((m) => `${m.name} ${formatValue(m.value)}`).join(' · ')} ${unit}`
}

export function formatValue(n: number): string {
  // Two decimals at most, no trailing zeros: 36, 36.5, 36.25.
  return String(Math.round(n * 100) / 100)
}

/** "+0.5" / "−1" / "0" — the sign is the point. */
export function formatDiff(diff: number): string {
  if (diff === 0) return '0'
  const abs = formatValue(Math.abs(diff))
  return diff > 0 ? `+${abs}` : `−${abs}`
}

/**
 * Compare every ordered measurement with what was measured on arrival.
 * A blank received value is recorded as "not measured", never as zero.
 */
export function compareMeasurements(
  ordered: Measurement[],
  received: Record<string, number | string | null | undefined>,
): MeasurementCheck[] {
  return ordered.map((m) => {
    const raw = received[m.name]
    const value = raw === '' || raw === null || raw === undefined ? NaN : Number(raw)
    if (!Number.isFinite(value)) {
      return { name: m.name, ordered: m.value, received: null, diff: null }
    }
    const diff = Math.round((value - m.value) * 100) / 100
    return { name: m.name, ordered: m.value, received: value, diff }
  })
}

/**
 * True when any measured value differs from what was ordered by more than
 * the tolerance. The default tolerance is zero: the owner asked to be told
 * about *any* difference.
 */
export function hasDeviation(checks: MeasurementCheck[], tolerance = 0): boolean {
  return checks.some((c) => c.diff !== null && Math.abs(c.diff) > tolerance)
}

/** How many rows were actually measured. */
export function measuredCount(checks: MeasurementCheck[]): number {
  return checks.filter((c) => c.received !== null).length
}

/** Only the rows that differ — for the flag note and the owner's list. */
export function deviations(checks: MeasurementCheck[], tolerance = 0): MeasurementCheck[] {
  return checks.filter((c) => c.diff !== null && Math.abs(c.diff) > tolerance)
}

/** "Waist 30 → 31 (+1), Length 42 → 41.5 (−0.5)" */
export function describeDeviations(
  checks: MeasurementCheck[],
  unit: MeasurementUnit = 'in',
  tolerance = 0,
): string {
  const rows = deviations(checks, tolerance)
  if (rows.length === 0) return ''
  return (
    rows
      .map(
        (c) =>
          `${c.name} ${formatValue(c.ordered)} → ${formatValue(c.received as number)} (${formatDiff(
            c.diff as number,
          )})`,
      )
      .join(', ') + ` ${unit}`
  )
}

/** Tolerant parse of the `measurement_checks` jsonb stored on an inward item. */
export function parseMeasurementChecks(raw: unknown): MeasurementCheck[] {
  if (!Array.isArray(raw)) return []
  const out: MeasurementCheck[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const name = String(e.name ?? '').trim()
    const ordered = Number(e.ordered)
    if (!name || !Number.isFinite(ordered)) continue
    const received = e.received === null || e.received === undefined ? null : Number(e.received)
    const ok = received !== null && Number.isFinite(received)
    out.push({
      name,
      ordered,
      received: ok ? received : null,
      diff: ok ? Math.round(((received as number) - ordered) * 100) / 100 : null,
    })
  }
  return out
}
