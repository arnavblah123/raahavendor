import { formatDate, type DateStr } from './dates'

/**
 * Purchase order helpers. The number itself is generated inside the database
 * (see next_po_no() in migration 0002) so two people creating POs at the same
 * moment can never get the same one; these are the display-side twins.
 */

/**
 * Indian financial year label for a date: April–March.
 * 8 Sep 2026 → "2026-27"; 15 Feb 2027 → "2026-27"; 1 Apr 2027 → "2027-28".
 */
export function financialYear(d: DateStr): string {
  const [y, m] = d.split('-').map(Number)
  const startYear = m >= 4 ? y : y - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** PO/2026-27/0001 — numbering restarts every financial year. */
export function formatPoNo(fy: string, seq: number): string {
  return `PO/${fy}/${String(seq).padStart(4, '0')}`
}

/**
 * Who the PO is from. Edited under Settings → Purchase order details and
 * stored on the settings row; these defaults apply until it is filled in.
 */
export interface PoDetails {
  company_name: string
  /** The brand line under the company name, e.g. "Raaha by Archana Bansal". */
  tagline: string
  /** Multi-line postal address. */
  address: string
  phone: string
  email: string
  gstin: string
  /** Printed on every PO unless the PO carries its own terms. */
  default_terms: string
  /** The line under the signature space, e.g. "Authorised signatory". */
  signatory: string
}

export const DEFAULT_PO_DETAILS: PoDetails = {
  company_name: 'NB TEXTILE',
  tagline: 'Raaha by Archana Bansal',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  default_terms: '',
  signatory: 'Authorised signatory',
}

export const PO_DETAIL_FIELDS: { key: keyof PoDetails; label: string; hint?: string; multiline?: boolean }[] = [
  { key: 'company_name', label: 'Company name', hint: 'printed as the PO issuer' },
  { key: 'tagline', label: 'Brand line', hint: 'shown under the company name' },
  { key: 'address', label: 'Address', hint: 'as it should print', multiline: true },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'default_terms', label: 'Default terms', hint: 'e.g. payment, delivery, quality', multiline: true },
  { key: 'signatory', label: 'Signature line' },
]

/** Merge whatever is saved over the defaults, tolerating a missing column. */
export function resolvePoDetails(raw: unknown): PoDetails {
  const out = { ...DEFAULT_PO_DETAILS }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(out) as (keyof PoDetails)[]) {
      const v = (raw as Record<string, unknown>)[key]
      if (typeof v === 'string' && v.trim()) out[key] = v.trim()
    }
  }
  return out
}

export const PO_STATUSES = ['issued', 'partially_received', 'received', 'cancelled'] as const
export type PoStatus = (typeof PO_STATUSES)[number]

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  issued: 'Issued',
  partially_received: 'Partly received',
  received: 'Fully received',
  cancelled: 'Cancelled',
}

export interface PoMessageLine {
  product_name: string
  design_code: string | null
  quantity: number
  unit: string
}

/** The WhatsApp text that accompanies a PO sent to the vendor. */
export function poWhatsappMessage(args: {
  vendorName: string | null | undefined
  poNo: string
  poDate: DateStr
  expectedDate: DateStr
  lines: PoMessageLine[]
  /** Defaults to NB TEXTILE (Raaha by Archana Bansal). */
  from?: Pick<PoDetails, 'company_name' | 'tagline'>
}): string {
  const from = args.from ?? DEFAULT_PO_DETAILS
  const sender = from.tagline ? `${from.company_name} (${from.tagline})` : from.company_name
  const items = args.lines
    .map((l) => `• ${l.quantity} ${l.unit} ${l.product_name}${l.design_code ? ` (${l.design_code})` : ''}`)
    .join('\n')
  return (
    `Namaste ${args.vendorName || 'ji'}, this is ${sender}.\n\n` +
    `Please find our purchase order ${args.poNo} dated ${formatDate(args.poDate)}:\n${items}\n\n` +
    `Expected delivery: ${formatDate(args.expectedDate)}.\n` +
    `Kindly confirm receipt of this order.\n\n` +
    `Thank you.\n— ${from.company_name}`
  )
}
