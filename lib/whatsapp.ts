import { DEFAULT_WHATSAPP_TEMPLATE } from './constants'
import { daysBetween, formatDate, type DateStr } from './dates'
import type { OrderItem, Vendor } from './types'

/**
 * WhatsApp is the free reminder channel — no Business API, no SMS gateway,
 * no per-message cost. We build a wa.me deep link and let the user's own
 * WhatsApp send it.
 */

export interface TemplateContext {
  vendor: Pick<Vendor, 'name' | 'contact_person'> | null
  orderNo: string
  orderDate: DateStr
  promisedDate: DateStr
  items: Pick<OrderItem, 'product_name' | 'design_code' | 'quantity' | 'unit' | 'qty_balance'>[]
  today: DateStr
}

/** "12 pcs Bridal Lehenga (BL-101), 8 pcs Anarkali (AN-22)" */
export function summariseItems(
  items: TemplateContext['items'],
  opts: { balanceOnly?: boolean } = {},
): string {
  const rows = opts.balanceOnly ? items.filter((i) => i.qty_balance > 0) : items
  if (rows.length === 0) return '—'
  return rows
    .map((i) => {
      const qty = opts.balanceOnly ? i.qty_balance : i.quantity
      const code = i.design_code ? ` (${i.design_code})` : ''
      return `${qty} ${i.unit} ${i.product_name}${code}`
    })
    .join(', ')
}

export function totalBalancePcs(items: Pick<OrderItem, 'qty_balance'>[]): number {
  return items.reduce((sum, i) => sum + Math.max(0, i.qty_balance), 0)
}

export function totalOrderedPcs(items: Pick<OrderItem, 'quantity'>[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0)
}

/** Replace every {placeholder} in a template with real order data. */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  const daysPending = Math.max(0, daysBetween(ctx.orderDate, ctx.today))
  const daysOverdue = Math.max(0, daysBetween(ctx.promisedDate, ctx.today))
  const balance = totalBalancePcs(ctx.items)

  const values: Record<string, string> = {
    '{vendor_name}': ctx.vendor?.name ?? 'ji',
    '{contact_person}': ctx.vendor?.contact_person || ctx.vendor?.name || 'ji',
    '{order_no}': ctx.orderNo,
    '{order_date}': formatDate(ctx.orderDate),
    '{items}': summariseItems(ctx.items, { balanceOnly: balance > 0 }),
    '{promised_date}': formatDate(ctx.promisedDate),
    '{days_pending}': String(daysPending),
    '{days_overdue}': String(daysOverdue),
    '{balance_pcs}': String(balance),
  }

  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(key).join(value),
    template || DEFAULT_WHATSAPP_TEMPLATE,
  )
}

/**
 * Strip a phone number down to the digits wa.me expects, and assume an
 * Indian number when no country code was entered — which is how the numbers
 * in a shop's phonebook are usually stored.
 */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  // Bare 10-digit Indian mobile.
  if (digits.length === 10) return `91${digits}`
  // 11 digits with a leading trunk 0.
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits
}

export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const number = normalisePhone(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export function telUrl(phone: string | null | undefined): string | null {
  const number = normalisePhone(phone)
  if (!number) return null
  return `tel:+${number}`
}
