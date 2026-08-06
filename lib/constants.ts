/**
 * Single source of truth for the vocabulary of the app.
 * Changing a label here changes it on every screen.
 */

export const CHECKPOINT_PROFILES = {
  standard: { label: 'Standard (30/50/75/90)', pcts: [30, 50, 75, 90] },
  tight: { label: 'Tight (25/50/70/85/95)', pcts: [25, 50, 70, 85, 95] },
  light: { label: 'Light (50/90)', pcts: [50, 90] },
} as const

export type CheckpointProfile = keyof typeof CHECKPOINT_PROFILES

export const CHECKPOINT_PROFILE_KEYS = Object.keys(CHECKPOINT_PROFILES) as CheckpointProfile[]

/** A fresh overdue nudge every N days once the promised date has passed. */
export const OVERDUE_INTERVAL_DAYS = 3

/** Balance of a partially dispatched order gets a short ladder, not a full one. */
export const BALANCE_PROFILE: CheckpointProfile = 'light'

export const ORDER_STAGES = [
  'ordered',
  'in_production',
  'ready_for_dispatch',
  'dispatched',
  'received',
  'closed',
  'on_hold',
  'cancelled',
] as const

export type OrderStage = (typeof ORDER_STAGES)[number]

export const STAGE_LABELS: Record<OrderStage, string> = {
  ordered: 'Ordered',
  in_production: 'In Production',
  ready_for_dispatch: 'Ready for Dispatch',
  dispatched: 'Dispatched',
  received: 'Received',
  closed: 'Closed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
}

/** Stages that still need chasing — these drive the dashboard and "open orders". */
export const OPEN_STAGES: OrderStage[] = ['ordered', 'in_production', 'ready_for_dispatch', 'on_hold']

/** Stages where the goods have left the vendor. */
export const SETTLED_STAGES: OrderStage[] = ['dispatched', 'received', 'closed']

export const PRODUCT_CATEGORIES = [
  'lehenga',
  'gown',
  'anarkali',
  'kurta_set',
  'saree',
  'indo_western',
  'other',
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  lehenga: 'Lehenga',
  gown: 'Gown',
  anarkali: 'Anarkali',
  kurta_set: 'Kurta Set',
  saree: 'Saree',
  indo_western: 'Indo-Western',
  other: 'Other',
}

/** Finished garments only — no metres, no kilos. */
export const UNITS = ['pcs', 'set'] as const
export type Unit = (typeof UNITS)[number]

export const CONTACT_METHODS = ['call', 'whatsapp', 'visit', 'email'] as const
export type ContactMethod = (typeof CONTACT_METHODS)[number]

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  visit: 'Visit',
  email: 'Email',
}

export const FOLLOWUP_STATUSES = ['pending', 'done', 'skipped'] as const
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number]

export const PRIORITIES = ['normal', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

export const ROLES = ['admin', 'staff'] as const
export type Role = (typeof ROLES)[number]

/** Seeded into vendor_categories; editable from /settings afterwards. */
export const DEFAULT_VENDOR_CATEGORIES = [
  { slug: 'fabric', label: 'Fabric' },
  { slug: 'embroidery', label: 'Embroidery' },
  { slug: 'tailoring', label: 'Tailoring' },
  { slug: 'jewellery', label: 'Jewellery' },
  { slug: 'packaging', label: 'Packaging' },
  { slug: 'other', label: 'Other' },
]

export const SNOOZE_DAYS = 2

/** How far ahead the "Coming up" band looks. */
export const COMING_UP_DAYS = 3

export const DEFAULT_WHATSAPP_TEMPLATE =
  'Namaste {vendor_name}, this is Raaha by Archana Bansal.\n\n' +
  'Following up on our order {order_no} placed on {order_date}:\n{items}\n\n' +
  'It has been {days_pending} days and the promised delivery date is {promised_date}. ' +
  'Could you please confirm the current status and the dispatch date?\n\n' +
  'Thank you.\n— Raaha by Archana Bansal'

export const WHATSAPP_PLACEHOLDERS = [
  '{vendor_name}',
  '{contact_person}',
  '{order_no}',
  '{order_date}',
  '{items}',
  '{promised_date}',
  '{days_pending}',
  '{days_overdue}',
  '{balance_pcs}',
] as const

/** Vendor reliability bands, measured on average delay against the ORIGINAL promise. */
export const GRADE_THRESHOLDS = [
  { grade: 'A', maxAvgDelay: 2 },
  { grade: 'B', maxAvgDelay: 7 },
  { grade: 'C', maxAvgDelay: 15 },
  { grade: 'D', maxAvgDelay: Infinity },
] as const

export type Grade = (typeof GRADE_THRESHOLDS)[number]['grade']
