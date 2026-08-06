import { describe, expect, it } from 'vitest'
import {
  normalisePhone,
  renderTemplate,
  summariseItems,
  telUrl,
  totalBalancePcs,
  whatsappUrl,
} from '../lib/whatsapp'
import { buildScorecard, dragsTheBalance, gradeFor } from '../lib/scorecard'
import { DEFAULT_WHATSAPP_TEMPLATE } from '../lib/constants'

const items = [
  { product_name: 'Bridal Lehenga', design_code: 'BL-101', quantity: 12, unit: 'pcs' as const, qty_balance: 5 },
  { product_name: 'Anarkali', design_code: 'AN-22', quantity: 8, unit: 'pcs' as const, qty_balance: 0 },
]

describe('phone normalisation', () => {
  it('assumes India for a bare 10-digit mobile', () => {
    expect(normalisePhone('9812345678')).toBe('919812345678')
    expect(normalisePhone('98123 45678')).toBe('919812345678')
    expect(normalisePhone('098123-45678')).toBe('919812345678')
  })

  it('keeps an existing country code', () => {
    expect(normalisePhone('+91 98123 45678')).toBe('919812345678')
    expect(normalisePhone('0091 9812345678')).toBe('919812345678')
    expect(normalisePhone('+971 50 1234567')).toBe('971501234567')
  })

  it('returns null for nothing usable', () => {
    expect(normalisePhone(null)).toBeNull()
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone('n/a')).toBeNull()
    expect(whatsappUrl(null, 'hi')).toBeNull()
    expect(telUrl(undefined)).toBeNull()
  })

  it('builds working deep links', () => {
    expect(telUrl('9812345678')).toBe('tel:+919812345678')
    const url = whatsappUrl('9812345678', 'Namaste ji')
    expect(url).toBe('https://wa.me/919812345678?text=Namaste%20ji')
  })
})

describe('message templating', () => {
  it('summarises items, and only the balance once something has shipped', () => {
    expect(summariseItems(items)).toBe('12 pcs Bridal Lehenga (BL-101), 8 pcs Anarkali (AN-22)')
    expect(summariseItems(items, { balanceOnly: true })).toBe('5 pcs Bridal Lehenga (BL-101)')
    expect(totalBalancePcs(items)).toBe(5)
  })

  it('fills every placeholder — none may survive into a sent message', () => {
    const msg = renderTemplate(DEFAULT_WHATSAPP_TEMPLATE, {
      vendor: { name: 'Shyam Fabrics', contact_person: 'Ramesh' },
      orderNo: 'RAAHA-PO-0007',
      orderDate: '2025-09-01',
      promisedDate: '2025-10-16',
      items,
      today: '2025-10-20',
    })
    expect(msg).not.toMatch(/\{[a-z_]+\}/)
    expect(msg).toContain('Shyam Fabrics')
    expect(msg).toContain('RAAHA-PO-0007')
    expect(msg).toContain('01 Sep 2025')
    expect(msg).toContain('16 Oct 2025')
    expect(msg).toContain('49') // days pending since the order date
    expect(msg).toContain('Raaha by Archana Bansal')
  })

  it('substitutes a custom template from settings', () => {
    const msg = renderTemplate('{vendor_name}: {order_no} is {days_overdue} days late. {balance_pcs} pcs left.', {
      vendor: { name: 'Shyam Fabrics', contact_person: null },
      orderNo: 'RAAHA-PO-0007',
      orderDate: '2025-09-01',
      promisedDate: '2025-10-16',
      items,
      today: '2025-10-20',
    })
    expect(msg).toBe('Shyam Fabrics: RAAHA-PO-0007 is 4 days late. 5 pcs left.')
  })

  it('degrades gracefully when the vendor record is thin', () => {
    const msg = renderTemplate('Hello {contact_person} of {vendor_name}', {
      vendor: null,
      orderNo: 'X',
      orderDate: '2025-09-01',
      promisedDate: '2025-10-16',
      items: [],
      today: '2025-09-02',
    })
    expect(msg).toBe('Hello ji of ji')
  })

  it('never reports negative days when a vendor is early', () => {
    const msg = renderTemplate('{days_overdue}', {
      vendor: null,
      orderNo: 'X',
      orderDate: '2025-09-01',
      promisedDate: '2025-10-16',
      items: [],
      today: '2025-10-01',
    })
    expect(msg).toBe('0')
  })
})

describe('vendor scorecard', () => {
  it('grades on average delay, treating early as an A', () => {
    expect(gradeFor(-3)).toBe('A')
    expect(gradeFor(0)).toBe('A')
    expect(gradeFor(2)).toBe('A')
    expect(gradeFor(2.1)).toBe('B')
    expect(gradeFor(7)).toBe('B')
    expect(gradeFor(7.5)).toBe('C')
    expect(gradeFor(15)).toBe('C')
    expect(gradeFor(16)).toBe('D')
    expect(gradeFor(null)).toBeNull()
  })

  it('computes percentages against completed orders only', () => {
    const s = buildScorecard({
      vendor_id: 'v',
      total_orders: 10,
      completed_orders: 8,
      open_orders: 2,
      on_time_orders: 6,
      avg_delay_days: 4.2,
      worst_delay_days: 31,
      avg_revisions: 1.4,
      single_dispatch_orders: 5,
      avg_dispatch_spread_days: 9,
    })
    expect(s.onTimePct).toBe(75)
    expect(s.fillRatePct).toBe(63)
    expect(s.grade).toBe('B')
  })

  it('shows blanks rather than a misleading zero for a brand-new vendor', () => {
    const s = buildScorecard(null)
    expect(s.totalOrders).toBe(0)
    expect(s.onTimePct).toBeNull()
    expect(s.fillRatePct).toBeNull()
    expect(s.grade).toBeNull()
  })

  it('flags the vendor who ships on time then drags the balance', () => {
    const dragger = buildScorecard({
      vendor_id: 'v',
      total_orders: 6,
      completed_orders: 6,
      open_orders: 0,
      on_time_orders: 5,
      avg_delay_days: 1,
      worst_delay_days: 4,
      avg_revisions: 0.2,
      single_dispatch_orders: 1, // 17% fill rate
      avg_dispatch_spread_days: 21,
    })
    expect(dragger.grade).toBe('A') // looks perfect on delay alone
    expect(dragsTheBalance(dragger)).toBe(true) // but is not

    const clean = buildScorecard({
      vendor_id: 'v',
      total_orders: 6,
      completed_orders: 6,
      open_orders: 0,
      on_time_orders: 5,
      avg_delay_days: 1,
      worst_delay_days: 4,
      avg_revisions: 0.2,
      single_dispatch_orders: 6,
      avg_dispatch_spread_days: 0,
    })
    expect(dragsTheBalance(clean)).toBe(false)
  })
})
