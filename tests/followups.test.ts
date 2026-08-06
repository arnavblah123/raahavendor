import { describe, expect, it } from 'vitest'
import {
  delayDays,
  describeProgress,
  expectedDispatchDate,
  followupUrgency,
  generateLadder,
  generateOverdueCheckpoints,
  isValidPromisedDate,
  orderUrgency,
  planBalanceLadder,
  planRevision,
} from '../lib/followups'
import { addDaysStr, daysBetween, formatDate, monthBounds, todayIST } from '../lib/dates'
import { formatMoney, formatMoneyCompact, parseMoney } from '../lib/money'

const dates = (cps: { due_date: string }[]) => cps.map((c) => c.due_date)
const pcts = (cps: { checkpoint_pct: number | null }[]) => cps.map((c) => c.checkpoint_pct)

describe('generateLadder', () => {
  it('reproduces the worked example: 1 Sep + 45 days, standard profile', () => {
    const ladder = generateLadder({
      anchorDate: '2025-09-01',
      targetDate: '2025-10-16',
      profile: 'standard',
      today: '2025-09-01',
    })
    expect(dates(ladder)).toEqual([
      '2025-09-15', // 30% -> round(13.5) = 14
      '2025-09-24', // 50% -> 23
      '2025-10-05', // 75% -> round(33.75) = 34
      '2025-10-12', // 90% -> round(40.5) = 41
      '2025-10-16', // 100%
    ])
    expect(pcts(ladder)).toEqual([30, 50, 75, 90, 100])
    expect(ladder.every((c) => c.status === 'pending')).toBe(true)
  })

  it('always ends exactly on the promised date', () => {
    for (const lead of [3, 7, 12, 30, 45, 60, 90, 180]) {
      const target = addDaysStr('2025-01-01', lead)
      const ladder = generateLadder({
        anchorDate: '2025-01-01',
        targetDate: target,
        profile: 'standard',
        today: '2025-01-01',
      })
      expect(ladder[ladder.length - 1].due_date).toBe(target)
      expect(ladder[ladder.length - 1].checkpoint_pct).toBe(100)
    }
  })

  it('produces strictly increasing dates for every profile and lead time', () => {
    for (const profile of ['standard', 'tight', 'light'] as const) {
      for (let lead = 1; lead <= 200; lead++) {
        const ladder = generateLadder({
          anchorDate: '2025-01-01',
          targetDate: addDaysStr('2025-01-01', lead),
          profile,
          today: '2025-01-01',
        })
        const ds = dates(ladder)
        for (let i = 1; i < ds.length; i++) {
          expect(ds[i] > ds[i - 1]).toBe(true)
        }
        // Nothing may land on or before the anchor, or after the target.
        expect(ds[0] > '2025-01-01').toBe(true)
        expect(ds[ds.length - 1] <= addDaysStr('2025-01-01', lead)).toBe(true)
      }
    }
  })

  it('collapses same-date checkpoints, keeping the later rung', () => {
    // A 4-day span with the tight profile forces collisions:
    // 25%->1, 50%->2, 70%->3, 85%->3, 95%->4, 100%->4
    const ladder = generateLadder({
      anchorDate: '2025-01-01',
      targetDate: '2025-01-05',
      profile: 'tight',
      today: '2025-01-01',
    })
    expect(dates(ladder)).toEqual(['2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05'])
    // Day 4 collided between 85% and 70%; the later rung (85) wins.
    // Day 5 collided between 95% and 100%; 100 wins.
    expect(pcts(ladder)).toEqual([25, 50, 85, 100])
  })

  it('marks elapsed rungs skipped when an order is back-dated', () => {
    const ladder = generateLadder({
      anchorDate: '2025-09-01',
      targetDate: '2025-10-16',
      profile: 'standard',
      today: '2025-10-01', // entered a month late
    })
    const statuses = ladder.map((c) => c.status)
    expect(statuses).toEqual(['skipped', 'skipped', 'pending', 'pending', 'pending'])
  })

  it('handles a same-day and a past target date', () => {
    const sameDay = generateLadder({
      anchorDate: '2025-01-01',
      targetDate: '2025-01-01',
      profile: 'standard',
      today: '2025-01-01',
    })
    expect(sameDay).toEqual([
      { checkpoint_pct: 100, due_date: '2025-01-01', status: 'pending' },
    ])

    const past = generateLadder({
      anchorDate: '2025-01-10',
      targetDate: '2025-01-05',
      profile: 'standard',
      today: '2025-01-20',
    })
    expect(past).toEqual([{ checkpoint_pct: 100, due_date: '2025-01-05', status: 'skipped' }])
  })

  it('handles a one-day lead time without duplicating the final rung', () => {
    const ladder = generateLadder({
      anchorDate: '2025-01-01',
      targetDate: '2025-01-02',
      profile: 'standard',
      today: '2025-01-01',
    })
    expect(ladder).toHaveLength(1)
    expect(ladder[0].checkpoint_pct).toBe(100)
  })

  it('accepts overridden percentages from settings', () => {
    const ladder = generateLadder({
      anchorDate: '2025-01-01',
      targetDate: '2025-01-11',
      profile: 'standard',
      today: '2025-01-01',
      profilePcts: [20, 60],
    })
    expect(dates(ladder)).toEqual(['2025-01-03', '2025-01-07', '2025-01-11'])
    expect(pcts(ladder)).toEqual([20, 60, 100])
  })

  it('sorts unsorted percentage overrides before laddering', () => {
    const ladder = generateLadder({
      anchorDate: '2025-01-01',
      targetDate: '2025-01-11',
      profile: 'standard',
      today: '2025-01-01',
      profilePcts: [60, 20],
    })
    expect(pcts(ladder)).toEqual([20, 60, 100])
  })
})

describe('generateOverdueCheckpoints', () => {
  it('is empty while the promised date has not passed', () => {
    expect(
      generateOverdueCheckpoints({ currentExpected: '2025-10-16', today: '2025-10-16' }),
    ).toEqual([])
    expect(
      generateOverdueCheckpoints({ currentExpected: '2025-10-16', today: '2025-10-01' }),
    ).toEqual([])
  })

  it('adds a nudge every 3 days, never into the future', () => {
    const out = generateOverdueCheckpoints({
      currentExpected: '2025-10-16',
      today: '2025-10-26',
    })
    expect(dates(out)).toEqual(['2025-10-19', '2025-10-22', '2025-10-25'])
    expect(out.every((c) => c.checkpoint_pct === null)).toBe(true)
    expect(out.every((c) => c.status === 'pending')).toBe(true)
  })

  it('is idempotent — re-running produces nothing new', () => {
    const first = generateOverdueCheckpoints({
      currentExpected: '2025-10-16',
      today: '2025-10-26',
    })
    const second = generateOverdueCheckpoints({
      currentExpected: '2025-10-16',
      today: '2025-10-26',
      existingDueDates: dates(first),
    })
    expect(second).toEqual([])
  })

  it('fills only the gap when the app was not opened for a week', () => {
    const existing = ['2025-10-19', '2025-10-22']
    const out = generateOverdueCheckpoints({
      currentExpected: '2025-10-16',
      today: '2025-10-31',
      existingDueDates: existing,
    })
    expect(dates(out)).toEqual(['2025-10-25', '2025-10-28', '2025-10-31'])
  })
})

describe('planRevision', () => {
  const existing = [
    { id: 'a', checkpoint_pct: 30, due_date: '2025-09-15', status: 'done' as const },
    { id: 'b', checkpoint_pct: 50, due_date: '2025-09-24', status: 'done' as const },
    { id: 'c', checkpoint_pct: 75, due_date: '2025-10-05', status: 'pending' as const },
    { id: 'd', checkpoint_pct: 90, due_date: '2025-10-12', status: 'pending' as const },
    { id: 'e', checkpoint_pct: 100, due_date: '2025-10-16', status: 'pending' as const },
  ]

  it('anchors the new ladder on today, not the original order date', () => {
    const plan = planRevision({
      currentExpected: '2025-10-16',
      newPromisedDate: '2025-10-26',
      today: '2025-10-10',
      profile: 'standard',
      existing,
    })
    // 16 days from today to the new date.
    expect(dates(plan.toInsert)).toEqual([
      '2025-10-15', // 30% -> round(4.8) = 5
      '2025-10-18', // 50% -> 8
      '2025-10-22', // 75% -> 12
      '2025-10-24', // 90% -> round(14.4) = 14
      '2025-10-26', // 100%
    ])
    expect(plan.daysAdded).toBe(10)
  })

  it('skips already-due pending rungs and deletes not-yet-due ones', () => {
    const plan = planRevision({
      currentExpected: '2025-10-16',
      newPromisedDate: '2025-10-26',
      today: '2025-10-10',
      profile: 'standard',
      existing,
    })
    expect(plan.toSkip).toEqual(['c']) // 5 Oct came due and was never logged
    expect(plan.toDelete).toEqual(['d', 'e']) // 12 and 16 Oct never came due
  })

  it('never touches done or already-skipped history', () => {
    const plan = planRevision({
      currentExpected: '2025-10-16',
      newPromisedDate: '2025-10-26',
      today: '2025-10-10',
      profile: 'standard',
      existing,
    })
    expect(plan.toSkip).not.toContain('a')
    expect(plan.toDelete).not.toContain('a')
    expect(plan.toSkip).not.toContain('b')
    expect(plan.toDelete).not.toContain('b')
  })

  it('reports a negative days_added when a vendor pulls the date in', () => {
    const plan = planRevision({
      currentExpected: '2025-10-16',
      newPromisedDate: '2025-10-11',
      today: '2025-10-05',
      profile: 'light',
      existing: [],
    })
    expect(plan.daysAdded).toBe(-5)
  })

  it('handles revising an already-overdue order', () => {
    const plan = planRevision({
      currentExpected: '2025-10-16',
      newPromisedDate: '2025-11-05',
      today: '2025-10-25', // 9 days late already
      profile: 'standard',
      existing: [
        { id: 'x', checkpoint_pct: null, due_date: '2025-10-19', status: 'pending' },
        { id: 'y', checkpoint_pct: null, due_date: '2025-10-22', status: 'done' },
        { id: 'z', checkpoint_pct: null, due_date: '2025-10-25', status: 'pending' },
      ],
    })
    expect(plan.toSkip.sort()).toEqual(['x', 'z'])
    expect(plan.toDelete).toEqual([])
    expect(plan.toInsert[plan.toInsert.length - 1].due_date).toBe('2025-11-05')
    expect(plan.daysAdded).toBe(20)
  })

  it('uses the light profile for a partial-dispatch balance', () => {
    const plan = planBalanceLadder({
      currentExpected: '2025-09-14',
      balancePromisedDate: '2025-09-30',
      today: '2025-09-14',
      existing: [],
    })
    expect(pcts(plan.toInsert)).toEqual([50, 90, 100])
    expect(dates(plan.toInsert)).toEqual(['2025-09-22', '2025-09-28', '2025-09-30'])
  })
})

describe('validation and helpers', () => {
  it('rejects a promised date in the past but allows today', () => {
    expect(isValidPromisedDate('2025-10-09', '2025-10-10')).toBe(false)
    expect(isValidPromisedDate('2025-10-10', '2025-10-10')).toBe(true)
    expect(isValidPromisedDate('2025-10-11', '2025-10-10')).toBe(true)
  })

  it('derives the expected dispatch date from the quoted lead time', () => {
    expect(expectedDispatchDate('2025-09-01', 45)).toBe('2025-10-16')
    expect(expectedDispatchDate('2025-09-01', 0)).toBe('2025-09-01')
    expect(expectedDispatchDate('2025-09-01', -5)).toBe('2025-09-01') // clamped
  })

  it('measures delay against the original promise, negative when early', () => {
    expect(delayDays('2025-10-16', '2025-10-20')).toBe(4)
    expect(delayDays('2025-10-16', '2025-10-14')).toBe(-2)
    expect(delayDays('2025-10-16', null)).toBeNull()
  })

  it('describes progress the way the dashboard card reads', () => {
    expect(
      describeProgress({
        orderDate: '2025-09-01',
        currentExpected: '2025-10-16',
        today: '2025-09-24',
        checkpointPct: 50,
      }),
    ).toBe('Day 23 of 45 (50% checkpoint)')

    expect(
      describeProgress({
        orderDate: '2025-09-01',
        currentExpected: '2025-10-16',
        today: '2025-10-19',
        checkpointPct: null,
      }),
    ).toBe('Day 48 of 45 (overdue check)')
  })

  it('assigns urgency consistently', () => {
    expect(followupUrgency('2025-10-09', 'pending', '2025-10-10')).toBe('missed')
    expect(followupUrgency('2025-10-10', 'pending', '2025-10-10')).toBe('today')
    expect(followupUrgency('2025-10-11', 'pending', '2025-10-10')).toBe('upcoming')
    expect(followupUrgency('2025-10-09', 'done', '2025-10-10')).toBe('done')
    expect(orderUrgency('2025-10-09', '2025-10-10')).toBe('overdue')
    expect(orderUrgency('2025-10-10', '2025-10-10')).toBe('today')
  })
})

describe('dates', () => {
  it('crosses month and year boundaries correctly', () => {
    expect(addDaysStr('2025-01-31', 1)).toBe('2025-02-01')
    expect(addDaysStr('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDaysStr('2024-02-28', 1)).toBe('2024-02-29') // leap year
    expect(addDaysStr('2025-02-28', 1)).toBe('2025-03-01')
    expect(daysBetween('2025-01-01', '2025-12-31')).toBe(364)
    expect(daysBetween('2025-03-01', '2025-01-01')).toBe(-59)
  })

  it('computes today in IST regardless of server timezone', () => {
    // 20:30 UTC on 9 Oct is already 02:00 IST on 10 Oct.
    expect(todayIST(new Date('2025-10-09T20:30:00Z'))).toBe('2025-10-10')
    // 18:00 UTC is 23:30 IST, still the 9th.
    expect(todayIST(new Date('2025-10-09T18:00:00Z'))).toBe('2025-10-09')
  })

  it('formats dates the house way', () => {
    expect(formatDate('2025-10-16')).toBe('16 Oct 2025')
    expect(formatDate(null)).toBe('—')
  })

  it('finds month bounds including February', () => {
    expect(monthBounds('2025-10-16')).toEqual({ start: '2025-10-01', end: '2025-10-31' })
    expect(monthBounds('2024-02-10')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
    expect(monthBounds('2025-02-10')).toEqual({ start: '2025-02-01', end: '2025-02-28' })
  })
})

describe('money', () => {
  it('groups in the Indian system', () => {
    expect(formatMoney(125000)).toBe('₹1,25,000')
    expect(formatMoney(1000)).toBe('₹1,000')
    expect(formatMoney(10000000)).toBe('₹1,00,00,000')
    expect(formatMoney(null)).toBe('—')
  })

  it('condenses to lakh and crore for the snapshot strip', () => {
    expect(formatMoneyCompact(1240000)).toBe('₹12.4 L')
    expect(formatMoneyCompact(12500000)).toBe('₹1.25 Cr')
    expect(formatMoneyCompact(45000)).toBe('₹45,000')
  })

  it('parses whatever the user types', () => {
    expect(parseMoney('₹1,25,000')).toBe(125000)
    expect(parseMoney('  45000 ')).toBe(45000)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
  })
})
