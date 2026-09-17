-- =====================================================================
--  Raaha by Archana Bansal — Vendor Follow-Up & Delivery Tracker
--  Migration 0004: vendor address
--
--  Paste this whole file into the Supabase SQL Editor and press Run,
--  AFTER 0001, 0002 and 0003. Safe to run more than once.
--
--  Adds address, state and pincode to vendors, and fills them in for the
--  vendors carried over from the old software (whose area, pincode and
--  state were kept in the notes field until now).
-- =====================================================================

alter table vendors
  add column if not exists address text,
  add column if not exists state   text,
  add column if not exists pincode text;

-- Backfill from the imported notes, which look like
-- "Park Street · 700016 · West Bengal" (any part may be missing).
update vendors
set
  pincode = coalesce(pincode, substring(notes from '\m(\d{6})\M')),
  state   = coalesce(state, substring(notes from '(West Bengal|Delhi|Maharashtra|Uttar Pradesh|Rajasthan)')),
  address = coalesce(
    address,
    nullif(trim(regexp_replace(
      split_part(notes, ' · ', 1),
      '^(\d{6}|West Bengal|Delhi|Maharashtra|Uttar Pradesh|Rajasthan|dummy number.*|unusual number.*)$', '')), '')
  )
where notes is not null
  and (address is null or state is null or pincode is null);
