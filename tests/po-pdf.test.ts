// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildPoPdf, poPdfFilename } from '../lib/po-pdf'

describe('PO PDF', () => {
  it('builds a real PDF from PO data', async () => {
    const blob = await buildPoPdf({
      poNo: 'PO/2026-27/0001', poDate: '08 Sep 2026', expectedDate: '23 Oct 2026',
      orderNo: 'RAAHA-ORD-0005', orderDate: '08 Sep 2026',
      from: { company_name: 'NB TEXTILE', tagline: 'Raaha by Archana Bansal', address: '12 Park Street\nKolkata 700016', phone: '+91 98300 00000', email: 'orders@nbtextile.in', gstin: '19ABCDE1234F1Z5', signatory: 'Authorised signatory' },
      vendor: { name: 'Shyam Fabrics', company_name: null, contact_person: 'Ramesh', city: 'Kolkata', phone: '+919812345678', gst_no: null },
      lines: [
        { n: 1, product_name: 'Bridal Lehenga', design_code: 'BL-101', category: 'Lehenga', details: 'Red · M', measurements: 'Waist 30 · Skirt length 42 in', quantity: 2, unit: 'pcs', rate: 20000, amount: 40000, photoUrl: 'https://example.invalid/x.jpg' },
        { n: 2, product_name: 'Anarkali', design_code: null, category: 'Anarkali', details: '', measurements: '', quantity: 3, unit: 'pcs', rate: null, amount: null, photoUrl: null },
      ],
      showMoney: true, total: 40000, advance: 10000,
      terms: 'Payment 30 days after delivery.', notes: null,
    })
    expect(blob.size).toBeGreaterThan(2000)
    const head = Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString()
    expect(head).toBe('%PDF-')
    expect(poPdfFilename('PO/2026-27/0001')).toBe('PO-2026-27-0001.pdf')
  })
})
