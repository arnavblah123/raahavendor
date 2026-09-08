import { describe, expect, it } from 'vitest'
import {
  cleanMeasurements,
  compareMeasurements,
  describeDeviations,
  deviations,
  formatDiff,
  formatMeasurements,
  hasDeviation,
  measuredCount,
  parseMeasurementChecks,
  parseMeasurements,
} from '../lib/measurements'
import { financialYear, formatPoNo, poWhatsappMessage } from '../lib/po'

const ordered = [
  { name: 'Bust', value: 36 },
  { name: 'Waist', value: 30 },
  { name: 'Length', value: 42 },
]

describe('parseMeasurements', () => {
  it('reads a well-formed jsonb array', () => {
    expect(parseMeasurements([{ name: 'Bust', value: 36 }, { name: 'Waist', value: '30.5' }])).toEqual([
      { name: 'Bust', value: 36 },
      { name: 'Waist', value: 30.5 },
    ])
  })

  it('drops anything malformed instead of throwing', () => {
    expect(parseMeasurements(null)).toEqual([])
    expect(parseMeasurements('junk')).toEqual([])
    expect(
      parseMeasurements([{ name: '', value: 1 }, { name: 'Hip', value: 'abc' }, 42, null, { name: 'Ok', value: 2 }]),
    ).toEqual([{ name: 'Ok', value: 2 }])
  })

  it('cleanMeasurements trims names and discards blanks from the form', () => {
    expect(
      cleanMeasurements([
        { name: ' Bust ', value: '36' },
        { name: 'Waist', value: '' },
        { name: '', value: 10 },
      ]),
    ).toEqual([{ name: 'Bust', value: 36 }])
  })
})

describe('compareMeasurements', () => {
  it('records the difference for every measured row', () => {
    const checks = compareMeasurements(ordered, { Bust: 36, Waist: '31', Length: 41.5 })
    expect(checks).toEqual([
      { name: 'Bust', ordered: 36, received: 36, diff: 0 },
      { name: 'Waist', ordered: 30, received: 31, diff: 1 },
      { name: 'Length', ordered: 42, received: 41.5, diff: -0.5 },
    ])
  })

  it('treats a blank as "not measured", never as zero', () => {
    const checks = compareMeasurements(ordered, { Bust: '', Waist: null })
    expect(checks.every((c) => c.received === null && c.diff === null)).toBe(true)
    expect(measuredCount(checks)).toBe(0)
    expect(hasDeviation(checks)).toBe(false)
  })

  it('flags any difference at all by default', () => {
    expect(hasDeviation(compareMeasurements(ordered, { Bust: 36, Waist: 30, Length: 42 }))).toBe(false)
    expect(hasDeviation(compareMeasurements(ordered, { Bust: 36.25, Waist: 30, Length: 42 }))).toBe(true)
  })

  it('respects a tolerance when one is given', () => {
    const checks = compareMeasurements(ordered, { Bust: 36.25, Waist: 30, Length: 42 })
    expect(hasDeviation(checks, 0.5)).toBe(false)
    expect(deviations(checks, 0.5)).toEqual([])
    expect(deviations(checks)).toHaveLength(1)
  })

  it('avoids floating point noise in the diff', () => {
    const [c] = compareMeasurements([{ name: 'A', value: 0.1 }], { A: 0.3 })
    expect(c.diff).toBe(0.2)
  })
})

describe('formatting', () => {
  it('formats the ordered set for a PO', () => {
    expect(formatMeasurements(ordered, 'in')).toBe('Bust 36 · Waist 30 · Length 42 in')
    expect(formatMeasurements([], 'in')).toBe('—')
  })

  it('shows the sign on a difference', () => {
    expect(formatDiff(1)).toBe('+1')
    expect(formatDiff(-0.5)).toBe('−0.5')
    expect(formatDiff(0)).toBe('0')
  })

  it('describes only the rows that differ', () => {
    const checks = compareMeasurements(ordered, { Bust: 36, Waist: 31, Length: 41.5 })
    expect(describeDeviations(checks, 'in')).toBe('Waist 30 → 31 (+1), Length 42 → 41.5 (−0.5) in')
    expect(describeDeviations(compareMeasurements(ordered, { Bust: 36 }))).toBe('')
  })

  it('round-trips stored checks', () => {
    const stored = parseMeasurementChecks([
      { name: 'Bust', ordered: 36, received: 37 },
      { name: 'Waist', ordered: 30, received: null },
      { name: '', ordered: 1, received: 1 },
    ])
    expect(stored).toEqual([
      { name: 'Bust', ordered: 36, received: 37, diff: 1 },
      { name: 'Waist', ordered: 30, received: null, diff: null },
    ])
  })
})

describe('purchase order numbering', () => {
  it('uses the Indian financial year, April to March', () => {
    expect(financialYear('2026-09-08')).toBe('2026-27')
    expect(financialYear('2027-02-15')).toBe('2026-27')
    expect(financialYear('2027-03-31')).toBe('2026-27')
    expect(financialYear('2027-04-01')).toBe('2027-28')
    expect(financialYear('2099-12-31')).toBe('2099-00')
  })

  it('pads the sequence to four digits', () => {
    expect(formatPoNo('2026-27', 1)).toBe('PO/2026-27/0001')
    expect(formatPoNo('2026-27', 12345)).toBe('PO/2026-27/12345')
  })

  it('writes a WhatsApp message listing every line', () => {
    const msg = poWhatsappMessage({
      vendorName: 'Shyam Fabrics',
      poNo: 'PO/2026-27/0003',
      poDate: '2026-09-08',
      expectedDate: '2026-10-23',
      lines: [
        { product_name: 'Bridal Lehenga', design_code: 'BL-101', quantity: 2, unit: 'pcs' },
        { product_name: 'Anarkali', design_code: null, quantity: 1, unit: 'set' },
      ],
    })
    expect(msg).toContain('PO/2026-27/0003')
    expect(msg).toContain('• 2 pcs Bridal Lehenga (BL-101)')
    expect(msg).toContain('• 1 set Anarkali\n')
    expect(msg).toContain('23 Oct 2026')
  })
})
