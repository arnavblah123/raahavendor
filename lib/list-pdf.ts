'use client'

import { jsPDF } from 'jspdf'

/**
 * A purchase list as a PDF, built in the browser — the pieces picked at the
 * vendor's shop, one photo each, so the vendor can confirm what was chosen
 * before the order is placed.
 *
 * Deliberately carries no prices: it is the list of pieces, not the deal.
 * Photos are fetched from their links (signed links from the bucket, or the
 * phone's own object URLs for pieces photographed moments ago) and embedded.
 */

export interface ListPdfPiece {
  n: number
  product_name: string
  design_code: string | null
  colour: string | null
  category: string
  quantity: number
  unit: string
  notes: string | null
  photoUrl: string | null
}

export interface ListPdfInput {
  from: { company_name: string; tagline: string; phone: string }
  vendor: { name: string; company_name: string | null; contact_person: string | null; city: string | null }
  visitDate: string
  notes: string | null
  pieces: ListPdfPiece[]
}

const INK = '#2B2A28'
const MUTED = '#7A736A'
const GOLD = '#A8842F'
const LINE = '#D9D2C5'

async function loadPhoto(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const max = 900
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return { data: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height }
  } catch {
    return null
  }
}

export async function buildListPdf(input: ListPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const right = pageW - margin
  let y = margin + 2

  // ---- Header ----
  doc.setTextColor(INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(input.from.company_name, margin, y + 4)
  let leftY = y + 9
  if (input.from.tagline) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(GOLD)
    doc.text(input.from.tagline, margin, leftY)
    leftY += 5
  }
  if (input.from.phone) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(INK)
    doc.text(input.from.phone, margin, leftY)
    leftY += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(MUTED)
  doc.text('PIECES PICKED', right, y + 1, { align: 'right' })
  doc.setFontSize(13)
  doc.setTextColor(INK)
  doc.text(input.vendor.name, right, y + 7.5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Visited ${input.visitDate}`, right, y + 13, { align: 'right' })

  y = Math.max(leftY, y + 17) + 2
  doc.setDrawColor(INK)
  doc.setLineWidth(0.5)
  doc.line(margin, y, right, y)
  y += 6

  const totalPcs = input.pieces.reduce((s, p) => s + p.quantity, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(INK)
  const intro = [
    [input.vendor.company_name, input.vendor.contact_person ? `Attn: ${input.vendor.contact_person}` : null, input.vendor.city]
      .filter(Boolean)
      .join(' · '),
    `${input.pieces.length} ${input.pieces.length === 1 ? 'piece' : 'pieces'} · ${totalPcs} pcs in total. Please confirm these are the pieces set aside for us.`,
    input.notes ? `Note: ${input.notes}` : null,
  ].filter((v): v is string => !!v)
  for (const line of intro) {
    const wrapped = doc.splitTextToSize(line, right - margin) as string[]
    doc.text(wrapped, margin, y)
    y += wrapped.length * 4 + 1
  }
  y += 3

  // ---- One card per piece: photo on the left, words on the right ----
  const photos = await Promise.all(input.pieces.map((p) => (p.photoUrl ? loadPhoto(p.photoUrl) : null)))
  const photoW = 44
  const photoH = 52
  const textX = margin + photoW + 6
  const textW = right - textX

  for (let i = 0; i < input.pieces.length; i++) {
    const p = input.pieces[i]
    const photo = photos[i]
    const details = [
      p.category,
      p.design_code ? `Design ${p.design_code}` : null,
      p.colour,
    ]
      .filter(Boolean)
      .join(' · ')
    const noteLines = p.notes ? (doc.splitTextToSize(p.notes, textW) as string[]) : []
    const cardH = Math.max(photoH, 14 + (details ? 5 : 0) + noteLines.length * 4) + 6

    if (y + cardH > pageH - margin) {
      doc.addPage()
      y = margin
    }

    doc.setDrawColor(LINE)
    doc.setLineWidth(0.2)
    doc.rect(margin, y, photoW, photoH)
    if (photo) {
      const scale = Math.min(photoW / photo.w, photoH / photo.h)
      const w = photo.w * scale
      const h = photo.h * scale
      doc.addImage(photo.data, 'JPEG', margin + (photoW - w) / 2, y + (photoH - h) / 2, w, h)
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(MUTED)
      doc.text('No photo', margin + photoW / 2, y + photoH / 2, { align: 'center' })
    }

    let ty = y + 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(INK)
    doc.text(`${p.n}. ${p.product_name}`, textX, ty, { maxWidth: textW - 22 })
    doc.setFontSize(10)
    doc.text(`${p.quantity} ${p.unit}`, right, ty, { align: 'right' })
    ty += 5.5
    if (details) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(MUTED)
      doc.text(details, textX, ty, { maxWidth: textW })
      ty += 5
    }
    if (noteLines.length > 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(INK)
      doc.text(noteLines, textX, ty)
    }

    y += cardH
    doc.setDrawColor(LINE)
    doc.line(margin, y - 3, right, y - 3)
  }

  // Page numbers when it runs long.
  const pages = doc.getNumberOfPages()
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p)
      doc.setFontSize(7.5)
      doc.setTextColor(MUTED)
      doc.text(`${input.vendor.name} · ${input.visitDate} · page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: 'center' })
    }
  }

  return doc.output('blob')
}

/** "Shubhandam Creations", "27 Oct 2026" → Pieces-picked-Shubhandam-Creations-27-Oct-2026.pdf */
export function listPdfFilename(vendorName: string, visitDate: string): string {
  return `Pieces-picked-${`${vendorName}-${visitDate}`.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`
}

/** The WhatsApp / email text that goes with the PDF. */
export function listMessage(input: Pick<ListPdfInput, 'vendor' | 'visitDate' | 'pieces' | 'from'>): string {
  const totalPcs = input.pieces.reduce((s, p) => s + p.quantity, 0)
  const lines = input.pieces.map(
    (p) => `${p.n}. ${p.product_name}${p.design_code ? ` (${p.design_code})` : ''} — ${p.quantity} ${p.unit}`,
  )
  return (
    `Namaste ${input.vendor.contact_person || input.vendor.name}, this is ${input.from.tagline || input.from.company_name}.\n\n` +
    `These are the ${input.pieces.length} ${input.pieces.length === 1 ? 'piece' : 'pieces'} (${totalPcs} pcs) we picked at your shop on ${input.visitDate}:\n` +
    `${lines.join('\n')}\n\n` +
    `The photos are in the attached PDF. Please confirm these are set aside for us.\n\nThank you.`
  )
}
