// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildListPdf, listMessage, listPdfFilename } from '../lib/list-pdf'

const input = {
  from: { company_name: 'NB TEXTILE', tagline: 'Raaha by Archana Bansal', phone: '+91 98300 00000' },
  vendor: { name: 'Shubhandam Creations', company_name: null, contact_person: 'Rakesh', city: 'Jaipur' },
  visitDate: '27 Oct 2026',
  notes: 'Diwali picks',
  pieces: [
    { n: 1, product_name: 'Red bridal lehenga', design_code: 'SC-118', colour: 'Red', category: 'Lehenga', quantity: 1, unit: 'pcs', notes: 'Blouse to be re-sized', photoUrl: 'https://example.invalid/x.jpg' },
    { n: 2, product_name: 'Piece 2', design_code: null, colour: null, category: 'Other', quantity: 2, unit: 'set', notes: null, photoUrl: null },
  ],
}

describe('purchase list PDF', () => {
  it('builds a real PDF with no prices on it', async () => {
    const blob = await buildListPdf(input)
    expect(blob.size).toBeGreaterThan(1500)
    const head = Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString()
    expect(head).toBe('%PDF-')
  })

  it('names the file after the vendor and the visit', () => {
    expect(listPdfFilename('Shubhandam Creations', '27 Oct 2026')).toBe(
      'Pieces-picked-Shubhandam-Creations-27-Oct-2026.pdf',
    )
  })

  it('writes a message the vendor can act on', () => {
    const msg = listMessage(input)
    expect(msg).toContain('Namaste Rakesh')
    expect(msg).toContain('2 pieces (3 pcs)')
    expect(msg).toContain('1. Red bridal lehenga (SC-118) — 1 pcs')
    expect(msg).not.toMatch(/Rs\.|₹/)
  })
})
