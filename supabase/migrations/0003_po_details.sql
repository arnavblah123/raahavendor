-- =====================================================================
--  Raaha by Archana Bansal — Vendor Follow-Up & Delivery Tracker
--  Migration 0003: your company details on the purchase order
--
--  Paste this whole file into the Supabase SQL Editor and press Run,
--  AFTER 0001 and 0002. Safe to run more than once.
--
--  Adds one column to the settings row: the name, address, GSTIN and
--  default terms printed at the top of every PO. They are edited in the
--  app under Settings → Purchase order details.
-- =====================================================================

alter table app_settings
  add column if not exists po_details jsonb not null default '{}'::jsonb;

comment on column app_settings.po_details is
  'Company details printed on purchase orders: {company_name, tagline, address, phone, email, gstin, default_terms, signatory}.';
