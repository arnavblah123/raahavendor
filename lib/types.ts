import type {
  CheckpointProfile,
  ContactMethod,
  FollowupStatus,
  OrderStage,
  Priority,
  ProductCategory,
  Role,
  Unit,
} from './constants'
import type { DateStr } from './dates'
import type { Measurement, MeasurementCheck, MeasurementUnit } from './measurements'
import type { PoDetails, PoStatus } from './po'

export interface Profile {
  id: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface VendorCategory {
  slug: string
  label: string
  sort_order: number
  is_active: boolean
}

export interface Vendor {
  id: string
  name: string
  company_name: string | null
  category: string
  contact_person: string | null
  phone: string | null
  alt_phone: string | null
  email: string | null
  city: string | null
  gst_no: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

/** Admin-only. Absent for staff because RLS returns no rows. */
export interface VendorFinance {
  vendor_id: string
  payment_terms: string | null
}

export interface Order {
  id: string
  order_no: string
  vendor_id: string
  order_date: DateStr
  lead_time_days: number
  original_expected_dispatch_date: DateStr
  current_expected_dispatch_date: DateStr
  actual_dispatch_date: DateStr | null
  first_dispatch_date: DateStr | null
  stage: OrderStage
  priority: Priority
  transporter: string | null
  docket_no: string | null
  checkpoint_profile: CheckpointProfile
  placed_by: string | null
  notes: string | null
  revision_count: number
  received_date: DateStr | null
  closed_at: string | null
  created_at: string
  updated_at: string
  delay_days: number | null
}

export interface OrderFinance {
  order_id: string
  total_amount: number | null
  advance_paid: number | null
  payment_notes: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  product_name: string
  description: string | null
  design_code: string | null
  colour: string | null
  size: string | null
  category: ProductCategory
  quantity: number
  unit: Unit
  qty_dispatched: number
  qty_balance: number
  /** Pieces that have physically arrived and been inwarded against the PO. */
  qty_received: number
  /** Made-to-measure sizes, checked again when the piece arrives. */
  measurements: Measurement[]
  measurement_unit: MeasurementUnit
  /** Path inside the private `order-photos` storage bucket. */
  photo_path: string | null
  sort_order: number
}

export interface OrderItemFinance {
  order_item_id: string
  rate: number | null
  amount: number | null
}

export interface Followup {
  id: string
  order_id: string
  checkpoint_pct: number | null
  due_date: DateStr
  status: FollowupStatus
  done_at: string | null
  done_by: string | null
  contacted_via: ContactMethod | null
  spoke_to: string | null
  vendor_response: string | null
  new_promised_date: DateStr | null
  next_action: string | null
  snooze_count: number
  created_at: string
}

export interface OrderRevision {
  id: string
  order_id: string
  old_expected_date: DateStr
  new_expected_date: DateStr
  days_added: number
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface Dispatch {
  id: string
  order_id: string
  dispatch_no: number
  dispatch_date: DateStr
  is_partial: boolean
  transporter: string | null
  docket_no: string | null
  received_date: DateStr | null
  received_by: string | null
  remarks: string | null
  created_at: string
}

export interface DispatchItem {
  id: string
  dispatch_id: string
  order_item_id: string
  quantity_dispatched: number
  remarks: string | null
}

export interface ActivityEntry {
  id: string
  order_id: string | null
  vendor_id: string | null
  action: string
  detail: string | null
  actor_id: string | null
  created_at: string
}

/** A line of the PO, frozen at the moment the PO was created. No money here. */
export interface PurchaseOrderLine {
  order_item_id: string
  product_name: string
  description: string | null
  design_code: string | null
  colour: string | null
  size: string | null
  category: ProductCategory
  quantity: number
  unit: Unit
  measurements: Measurement[]
  measurement_unit: MeasurementUnit
  photo_path: string | null
}

export interface PurchaseOrder {
  id: string
  po_no: string
  order_id: string
  vendor_id: string
  po_date: DateStr
  expected_delivery_date: DateStr
  status: PoStatus
  terms: string | null
  notes: string | null
  lines: PurchaseOrderLine[]
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Admin-only. The rates as agreed on the day the PO was issued. */
export interface PurchaseOrderFinance {
  po_id: string
  lines: { order_item_id: string; rate: number | null; amount: number | null }[]
  total_amount: number | null
  advance_paid: number | null
}

export interface Inward {
  id: string
  po_id: string
  order_id: string
  inward_no: number
  inward_date: DateStr
  invoice_no: string | null
  received_by: string | null
  remarks: string | null
  pcs_received: number
  flagged_count: number
  created_by: string | null
  created_at: string
}

export type FlagStatus = 'open' | 'resolved'

export interface InwardItem {
  id: string
  inward_id: string
  order_item_id: string
  qty_received: number
  measurements_checked: boolean
  measurement_checks: MeasurementCheck[]
  has_deviation: boolean
  is_flagged: boolean
  flag_reason: string | null
  flag_status: FlagStatus | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
}

/** Admin-only: the price entered from the vendor's invoice at inward. */
export interface InwardItemFinance {
  inward_item_id: string
  rate: number | null
  amount: number | null
}

export interface AppSettings {
  id: boolean
  whatsapp_template: string
  whatsapp_template_overdue: string
  checkpoint_profiles: Record<string, number[]>
  /** Absent until migration 0003 has been run. */
  po_details?: Partial<PoDetails> | null
  updated_at: string
}

export interface VendorStats {
  vendor_id: string
  total_orders: number
  completed_orders: number
  open_orders: number
  on_time_orders: number
  avg_delay_days: number | null
  worst_delay_days: number | null
  avg_revisions: number | null
  single_dispatch_orders: number
  avg_dispatch_spread_days: number | null
}

/** An order joined with everything a dashboard card or list row needs. */
export interface OrderWithContext extends Order {
  vendor: Pick<Vendor, 'id' | 'name' | 'company_name' | 'phone' | 'contact_person' | 'category'> | null
  order_items: OrderItem[]
  finance?: OrderFinance | null
}

/** A due follow-up plus its order — the unit the dashboard renders. */
export interface DashboardRow {
  followup: Followup | null
  order: OrderWithContext
}
