'use client'

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * The purchase order as a PDF, built in the browser.
 *
 * WhatsApp links can only carry text, so to *send the PO itself* the phone's
 * share sheet needs a file. This builds one from the same data the printed
 * page uses; no server, no cost. Photos are fetched from their signed links
 * and embedded.
 */

export interface PoPdfLine {
  n: number
  product_name: string
  design_code: string | null
  category: string
  details: string
  measurements: string
  quantity: number
  unit: string
  rate: number | null
  amount: number | null
  photoUrl: string | null
}

export interface PoPdfInput {
  poNo: string
  poDate: string
  expectedDate: string
  orderNo: string
  orderDate: string
  from: {
    company_name: string
    tagline: string
    address: string
    phone: string
    email: string
    gstin: string
    signatory: string
  }
  vendor: {
    name: string
    company_name: string | null
    contact_person: string | null
    city: string | null
    phone: string | null
    gst_no: string | null
  }
  lines: PoPdfLine[]
  showMoney: boolean
  total: number | null
  advance: number
  terms: string | null
  notes: string | null
}

const INK = '#2B2A28'
const MUTED = '#7A736A'
const GOLD = '#A8842F'
const LINE = '#D9D2C5'

/** jsPDF's built-in fonts have no ₹ glyph, so amounts print as Rs. */
function rs(n: number): string {
  return 'Rs. ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

/** Fetch a photo and re-encode it as JPEG via canvas: any format in, one format out. */
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

export async function buildPoPdf(input: PoPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const right = pageW - margin
  let y = margin + 2

  // ---- Header: company on the left, PO number on the right ----
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
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(INK)
  const addr: string[] = []
  if (input.from.address) addr.push(...input.from.address.split(/\r?\n/).filter(Boolean))
  const contact = [input.from.phone, input.from.email].filter(Boolean).join('  ·  ')
  if (contact) addr.push(contact)
  if (input.from.gstin) addr.push(`GSTIN ${input.from.gstin}`)
  for (const line of addr) {
    doc.text(line, margin, leftY)
    leftY += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(MUTED)
  doc.text('PURCHASE ORDER', right, y + 1, { align: 'right' })
  doc.setFontSize(16)
  doc.setTextColor(INK)
  doc.text(input.poNo, right, y + 8, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Dated ${input.poDate}`, right, y + 13.5, { align: 'right' })

  y = Math.max(leftY, y + 17) + 2
  doc.setDrawColor(INK)
  doc.setLineWidth(0.5)
  doc.line(margin, y, right, y)
  y += 6

  // ---- To / Delivery ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(MUTED)
  doc.text('TO', margin, y)
  doc.text('DELIVERY', right, y, { align: 'right' })
  y += 4.5
  doc.setFontSize(10.5)
  doc.setTextColor(INK)
  doc.text(input.vendor.name, margin, y)
  const totalPcs = input.lines.reduce((s, l) => s + l.quantity, 0)
  doc.text(`Expected by ${input.expectedDate}`, right, y, { align: 'right' })
  let toY = y + 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const toLines = [
    input.vendor.company_name,
    input.vendor.contact_person ? `Attn: ${input.vendor.contact_person}` : null,
    input.vendor.city,
    input.vendor.phone,
    input.vendor.gst_no ? `GSTIN ${input.vendor.gst_no}` : null,
  ].filter((v): v is string => !!v)
  for (const line of toLines) {
    doc.text(line, margin, toY)
    toY += 4
  }
  let dY = y + 4.5
  doc.text(`Against order ${input.orderNo} of ${input.orderDate}`, right, dY, { align: 'right' })
  dY += 4
  doc.text(
    `${totalPcs} ${totalPcs === 1 ? 'piece' : 'pieces'} in ${input.lines.length} ${input.lines.length === 1 ? 'line' : 'lines'}`,
    right,
    dY,
    { align: 'right' },
  )
  y = Math.max(toY, dY) + 4

  // ---- Lines ----
  const head = [['#', 'Piece', 'Details', 'Qty', ...(input.showMoney ? ['Rate', 'Amount'] : [])]]
  const body = input.lines.map((l) => {
    const piece = [
      l.product_name,
      l.design_code ? `Design ${l.design_code}` : null,
      l.category,
    ]
      .filter(Boolean)
      .join('\n')
    const details = [l.details || null, l.measurements ? `Measurements: ${l.measurements}` : null]
      .filter(Boolean)
      .join('\n')
    const row: (string | number)[] = [l.n, piece, details || '—', `${l.quantity} ${l.unit}`]
    if (input.showMoney) {
      row.push(l.rate != null ? rs(l.rate) : '—')
      row.push(l.amount != null ? rs(l.amount) : '—')
    }
    return row
  })
  const foot: (string | number)[][] = [
    ['', 'Total', '', `${totalPcs} pcs`, ...(input.showMoney ? ['', input.total != null ? rs(input.total) : '—'] : [])],
  ]
  if (input.showMoney && input.advance > 0) {
    foot.push(['', 'Advance paid', '', '', '', rs(input.advance)])
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head,
    body,
    foot,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, textColor: INK, cellPadding: 2.2, valign: 'top', lineColor: LINE, lineWidth: 0 },
    headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: MUTED, lineWidth: { bottom: 0.4 }, lineColor: INK },
    footStyles: { fontStyle: 'bold', fontSize: 9, textColor: INK, lineWidth: { top: 0.3 }, lineColor: INK },
    bodyStyles: { lineWidth: { bottom: 0.2 }, lineColor: LINE },
    columnStyles: input.showMoney
      ? { 0: { cellWidth: 7, textColor: MUTED }, 1: { cellWidth: 48 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 26, halign: 'right' } }
      : { 0: { cellWidth: 7, textColor: MUTED }, 1: { cellWidth: 60 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 20, halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) data.cell.styles.fontStyle = 'bold'
    },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  // ---- Photos ----
  const withPhoto = input.lines.filter((l) => l.photoUrl)
  if (withPhoto.length > 0) {
    const photos = await Promise.all(withPhoto.map((l) => loadPhoto(l.photoUrl as string)))
    const cellW = (right - margin - 2 * 5) / 3
    const cellH = cellW * 1.15
    let col = 0
    let rowTop = y
    let drewHeading = false
    for (let i = 0; i < withPhoto.length; i++) {
      const p = photos[i]
      if (!p) continue
      if (!drewHeading) {
        if (y + 8 + cellH > pageH - margin) {
          doc.addPage()
          y = margin
        }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(MUTED)
        doc.text('PHOTOS OF THE PIECES ORDERED', margin, y)
        y += 4
        rowTop = y
        drewHeading = true
      }
      if (col === 3) {
        col = 0
        rowTop += cellH + 8
      }
      if (rowTop + cellH + 6 > pageH - margin) {
        doc.addPage()
        rowTop = margin
        col = 0
      }
      const x = margin + col * (cellW + 5)
      const scale = Math.min(cellW / p.w, cellH / p.h)
      const w = p.w * scale
      const h = p.h * scale
      doc.setDrawColor(LINE)
      doc.setLineWidth(0.2)
      doc.rect(x, rowTop, cellW, cellH)
      doc.addImage(p.data, 'JPEG', x + (cellW - w) / 2, rowTop + (cellH - h) / 2, w, h)
      const l = withPhoto[i]
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(INK)
      doc.text(
        `${l.n}. ${l.product_name}${l.design_code ? ` · ${l.design_code}` : ''}`,
        x,
        rowTop + cellH + 4,
        { maxWidth: cellW },
      )
      col++
    }
    if (drewHeading) y = rowTop + cellH + 12
  }

  // ---- Terms, notes, signature ----
  const blocks: { title: string; text: string }[] = []
  if (input.terms) blocks.push({ title: 'TERMS', text: input.terms })
  if (input.notes) blocks.push({ title: 'NOTES', text: input.notes })
  for (const b of blocks) {
    const lines = doc.splitTextToSize(b.text, right - margin) as string[]
    const needed = 5 + lines.length * 4
    if (y + needed > pageH - margin - 24) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(MUTED)
    doc.text(b.title, margin, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(INK)
    doc.text(lines, margin, y)
    y += lines.length * 4 + 4
  }

  if (y + 26 > pageH - margin) {
    doc.addPage()
    y = margin
  }
  y = Math.max(y, pageH - margin - 26)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(MUTED)
  doc.text(
    doc.splitTextToSize(
      `Please quote ${input.poNo} on the delivery challan and invoice. Pieces will be checked against the photos and measurements above on arrival.`,
      95,
    ) as string[],
    margin,
    y + 4,
  )
  doc.setDrawColor(INK)
  doc.setLineWidth(0.3)
  doc.line(right - 55, y + 10, right, y + 10)
  doc.setTextColor(INK)
  doc.text(`For ${input.from.company_name}`, right, y + 14.5, { align: 'right' })
  if (input.from.signatory) {
    doc.setTextColor(MUTED)
    doc.text(input.from.signatory, right, y + 18.5, { align: 'right' })
  }

  // Page numbers when it runs long.
  const pages = doc.getNumberOfPages()
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p)
      doc.setFontSize(7.5)
      doc.setTextColor(MUTED)
      doc.text(`${input.poNo} · page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: 'center' })
    }
  }

  return doc.output('blob')
}

/** PO/2026-27/0001 → PO-2026-27-0001.pdf */
export function poPdfFilename(poNo: string): string {
  return `${poNo.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`
}
