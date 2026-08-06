-- =====================================================================
--  Raaha by Archana Bansal — Vendor Follow-Up & Delivery Tracker
--  Migration 0001: schema, row level security, indexes, functions
--
--  Paste this whole file into the Supabase SQL Editor and press Run.
--  It is safe to run once on a fresh project.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------

create type user_role         as enum ('admin', 'staff');
create type order_stage       as enum ('ordered', 'in_production', 'ready_for_dispatch',
                                       'dispatched', 'received', 'closed', 'on_hold', 'cancelled');
create type order_priority    as enum ('normal', 'urgent');
create type followup_status   as enum ('pending', 'done', 'skipped');
create type contact_method    as enum ('call', 'whatsapp', 'visit', 'email');
create type checkpoint_profile as enum ('standard', 'tight', 'light');
create type product_category  as enum ('lehenga', 'gown', 'anarkali', 'kurta_set',
                                       'saree', 'indo_western', 'other');
create type item_unit         as enum ('pcs', 'set');


-- ---------------------------------------------------------------------
-- 2. Profiles — every app user has exactly one row here
-- ---------------------------------------------------------------------

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text        not null default '',
  role        user_role   not null default 'staff',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

comment on table profiles is
  'App users. Created automatically on first sign-up via the handle_new_user trigger.
   You create the login itself in Supabase Dashboard > Authentication > Users.';

-- The FIRST user to sign up becomes admin; everyone after is staff.
-- That way you are not locked out of your own app on day one.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from public.profiles;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when is_first then 'admin'::user_role else 'staff'::user_role end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- Helper used by nearly every policy below. SECURITY DEFINER so that reading
-- the caller's own role does not itself require a policy (which would recurse).
create or replace function current_role_name()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_role_name() = 'admin', false)
$$;

-- "Is the caller a known, active user of this app?" — the baseline for all reads.
create or replace function is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;


-- ---------------------------------------------------------------------
-- 3. Reference data
-- ---------------------------------------------------------------------

-- A table rather than an enum, so categories are editable from /settings
-- without needing a migration.
create table vendor_categories (
  slug        text primary key,
  label       text    not null,
  sort_order  int     not null default 0,
  is_active   boolean not null default true
);

insert into vendor_categories (slug, label, sort_order) values
  ('fabric',     'Fabric',     1),
  ('embroidery', 'Embroidery', 2),
  ('tailoring',  'Tailoring',  3),
  ('jewellery',  'Jewellery',  4),
  ('packaging',  'Packaging',  5),
  ('other',      'Other',      6);

-- Single-row settings table: WhatsApp templates and checkpoint percentages.
create table app_settings (
  id                    boolean primary key default true check (id),
  whatsapp_template     text  not null,
  whatsapp_template_overdue text not null,
  checkpoint_profiles   jsonb not null,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references profiles(id)
);

insert into app_settings (id, whatsapp_template, whatsapp_template_overdue, checkpoint_profiles) values (
  true,
  'Namaste {vendor_name}, this is Raaha by Archana Bansal.' || E'\n\n' ||
  'Following up on our order {order_no} placed on {order_date}:' || E'\n' || '{items}' || E'\n\n' ||
  'It has been {days_pending} days and the promised delivery date is {promised_date}. ' ||
  'Could you please confirm the current status and the dispatch date?' || E'\n\n' ||
  'Thank you.' || E'\n' || '— Raaha by Archana Bansal',

  'Namaste {vendor_name}, this is Raaha by Archana Bansal.' || E'\n\n' ||
  'Our order {order_no} ({items}) was due on {promised_date} and is now {days_overdue} days overdue.' || E'\n\n' ||
  'Please share the dispatch date today so we can plan our store deliveries.' || E'\n\n' ||
  'Thank you.' || E'\n' || '— Raaha by Archana Bansal',

  '{"standard":[30,50,75,90],"tight":[25,50,70,85,95],"light":[50,90]}'::jsonb
);


-- ---------------------------------------------------------------------
-- 4. Vendors
-- ---------------------------------------------------------------------

create table vendors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  company_name    text,
  category        text not null default 'other' references vendor_categories(slug),
  contact_person  text,
  phone           text,                -- E.164 (e.g. +919812345678) for wa.me links
  alt_phone       text,
  email           text,
  city            text,
  gst_no          text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);

-- Payment terms live apart from the vendor record because staff must not see them.
-- Postgres RLS is row-level only, so column-level secrecy needs its own table.
create table vendor_finance (
  vendor_id      uuid primary key references vendors(id) on delete cascade,
  payment_terms  text
);


-- ---------------------------------------------------------------------
-- 5. Orders
-- ---------------------------------------------------------------------

create sequence order_no_seq start 1;

create table orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text unique not null default 'RAAHA-PO-' || lpad(nextval('order_no_seq')::text, 4, '0'),
  vendor_id     uuid not null references vendors(id),

  order_date        date not null,
  lead_time_days    int  not null check (lead_time_days >= 0),

  -- Frozen at creation. Every delay figure in the app measures against this.
  original_expected_dispatch_date date not null,
  -- Moves each time the vendor gives a new promise.
  current_expected_dispatch_date  date not null,
  -- Set only when the LAST piece has shipped.
  actual_dispatch_date            date,
  -- Kept separately so we can see "ships on time, then drags the balance".
  first_dispatch_date             date,

  stage       order_stage    not null default 'ordered',
  priority    order_priority not null default 'normal',

  transporter text,
  docket_no   text,

  checkpoint_profile checkpoint_profile not null default 'standard',
  placed_by   text,
  notes       text,

  revision_count int not null default 0,

  received_date date,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references profiles(id),
  updated_at    timestamptz not null default now(),

  -- Always correct, never needs recomputing. Negative means the vendor was early.
  delay_days int generated always as (actual_dispatch_date - original_expected_dispatch_date) stored
);

-- Money is a separate table: staff can read `orders` but not this.
create table order_finance (
  order_id      uuid primary key references orders(id) on delete cascade,
  total_amount  numeric(12,2),
  advance_paid  numeric(12,2) default 0,
  payment_notes text
);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_name  text not null,
  description   text,
  design_code   text,
  colour        text,
  size          text,
  category      product_category not null default 'other',

  -- Finished garments. Pieces and sets only — never metres or kilograms.
  quantity      int not null check (quantity > 0),
  unit          item_unit not null default 'pcs',

  qty_dispatched int not null default 0 check (qty_dispatched >= 0),
  qty_balance    int generated always as (quantity - qty_dispatched) stored,

  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),

  -- The invariant that protects the whole dispatch flow.
  constraint qty_dispatched_within_ordered check (qty_dispatched <= quantity)
);

create table order_item_finance (
  order_item_id uuid primary key references order_items(id) on delete cascade,
  rate    numeric(12,2),
  amount  numeric(12,2)
);


-- ---------------------------------------------------------------------
-- 6. Follow-ups, revisions, dispatches
-- ---------------------------------------------------------------------

create table followups (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,

  -- 30/50/75/90/100 for ladder rungs; NULL for a 3-day overdue nudge.
  checkpoint_pct  int check (checkpoint_pct between 1 and 100),
  due_date        date not null,
  status          followup_status not null default 'pending',

  done_at         timestamptz,
  done_by         uuid references profiles(id),
  contacted_via   contact_method,
  spoke_to        text,
  vendor_response text,
  new_promised_date date,
  next_action     text,

  snooze_count    int not null default 0,
  created_at      timestamptz not null default now()
);

-- Makes ensure_overdue_followups() idempotent: a second dashboard load in the
-- same day cannot create a duplicate nudge.
create unique index followups_overdue_unique
  on followups (order_id, due_date)
  where checkpoint_pct is null;

create table order_revisions (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  old_expected_date date not null,
  new_expected_date date not null,
  days_added        int  not null,
  reason            text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now()
);

create table dispatches (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  dispatch_no   int  not null,          -- 1st, 2nd, 3rd dispatch of this order
  dispatch_date date not null,
  is_partial    boolean not null default false,
  transporter   text,
  docket_no     text,
  received_date date,
  received_by   text,
  remarks       text,
  created_at    timestamptz not null default now(),
  created_by    uuid references profiles(id),
  unique (order_id, dispatch_no)
);

create table dispatch_items (
  id                  uuid primary key default gen_random_uuid(),
  dispatch_id         uuid not null references dispatches(id) on delete cascade,
  order_item_id       uuid not null references order_items(id) on delete cascade,
  quantity_dispatched int  not null check (quantity_dispatched > 0),
  remarks             text
);

-- Plain-language trail for the order detail page.
create table activity_log (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references orders(id) on delete cascade,
  vendor_id  uuid references vendors(id) on delete cascade,
  action     text not null,
  detail     text,
  actor_id   uuid references profiles(id),
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 7. Indexes — sized for the dashboard, which must stay under 2 seconds
-- ---------------------------------------------------------------------

create index idx_followups_due_status   on followups (due_date, status);
create index idx_followups_order        on followups (order_id);
create index idx_followups_pending_due  on followups (due_date) where status = 'pending';

create index idx_orders_stage           on orders (stage);
create index idx_orders_vendor          on orders (vendor_id);
create index idx_orders_current_expected on orders (current_expected_dispatch_date);
create index idx_orders_open_expected   on orders (current_expected_dispatch_date)
  where stage in ('ordered','in_production','ready_for_dispatch','on_hold');
create index idx_orders_order_date      on orders (order_date);
create index idx_orders_actual_dispatch on orders (actual_dispatch_date);

create index idx_order_items_order      on order_items (order_id);
create index idx_order_items_balance    on order_items (order_id) where qty_balance > 0;
create index idx_dispatches_order       on dispatches (order_id);
create index idx_dispatch_items_dispatch on dispatch_items (dispatch_id);
create index idx_revisions_order        on order_revisions (order_id);
create index idx_activity_order         on activity_log (order_id, created_at desc);
create index idx_vendors_active         on vendors (is_active, name);


-- ---------------------------------------------------------------------
-- 8. Triggers
-- ---------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch_updated_at
  before update on orders
  for each row execute function touch_updated_at();

-- Staff must never move the original promise — that is the baseline every
-- delay report is measured against. Enforced in the database, not just the UI.
create or replace function guard_original_expected_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.original_expected_dispatch_date is distinct from old.original_expected_dispatch_date
     and not is_admin() then
    raise exception 'Only an admin can change the original expected dispatch date';
  end if;
  return new;
end;
$$;

create trigger orders_guard_original_date
  before update on orders
  for each row execute function guard_original_expected_date();


-- ---------------------------------------------------------------------
-- 9. Row Level Security
--    Every table on. No anon access anywhere.
-- ---------------------------------------------------------------------

alter table profiles           enable row level security;
alter table vendor_categories  enable row level security;
alter table app_settings       enable row level security;
alter table vendors            enable row level security;
alter table vendor_finance     enable row level security;
alter table orders             enable row level security;
alter table order_finance      enable row level security;
alter table order_items        enable row level security;
alter table order_item_finance enable row level security;
alter table followups          enable row level security;
alter table order_revisions    enable row level security;
alter table dispatches         enable row level security;
alter table dispatch_items     enable row level security;
alter table activity_log       enable row level security;

-- profiles: everyone sees the team (needed for "logged by" names).
create policy profiles_select on profiles for select to authenticated
  using (is_member());
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = current_role_name());
create policy profiles_admin_all on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- Reference data: everyone reads, admin writes.
create policy vendor_categories_select on vendor_categories for select to authenticated
  using (is_member());
create policy vendor_categories_admin on vendor_categories for all to authenticated
  using (is_admin()) with check (is_admin());

create policy app_settings_select on app_settings for select to authenticated
  using (is_member());
create policy app_settings_admin on app_settings for all to authenticated
  using (is_admin()) with check (is_admin());

-- Vendors: staff may read and create/edit; only admin may deactivate.
create policy vendors_select on vendors for select to authenticated
  using (is_member());
create policy vendors_insert on vendors for insert to authenticated
  with check (is_member());
create policy vendors_update on vendors for update to authenticated
  using (is_member()) with check (is_member());
create policy vendors_delete_admin on vendors for delete to authenticated
  using (is_admin());

-- Vendor payment terms: admin only, read AND write.
create policy vendor_finance_admin on vendor_finance for all to authenticated
  using (is_admin()) with check (is_admin());

-- Orders: staff may read and create; nobody but admin may hard-delete.
create policy orders_select on orders for select to authenticated
  using (is_member());
create policy orders_insert on orders for insert to authenticated
  with check (is_member());
create policy orders_update on orders for update to authenticated
  using (
    is_admin()
    -- Staff cannot touch an order once it has been closed or cancelled.
    or (is_member() and stage not in ('closed', 'cancelled'))
  )
  with check (is_member());
create policy orders_delete_admin on orders for delete to authenticated
  using (is_admin());

-- Order money: admin only. Staff queries simply return no rows.
create policy order_finance_admin on order_finance for all to authenticated
  using (is_admin()) with check (is_admin());

create policy order_items_select on order_items for select to authenticated
  using (is_member());
create policy order_items_write on order_items for all to authenticated
  using (is_member()) with check (is_member());
create policy order_items_delete_admin on order_items for delete to authenticated
  using (is_admin());

create policy order_item_finance_admin on order_item_finance for all to authenticated
  using (is_admin()) with check (is_admin());

create policy followups_select on followups for select to authenticated
  using (is_member());
create policy followups_write on followups for all to authenticated
  using (is_member()) with check (is_member());

create policy revisions_select on order_revisions for select to authenticated
  using (is_member());
create policy revisions_insert on order_revisions for insert to authenticated
  with check (is_member());
create policy revisions_delete_admin on order_revisions for delete to authenticated
  using (is_admin());

create policy dispatches_select on dispatches for select to authenticated
  using (is_member());
create policy dispatches_write on dispatches for all to authenticated
  using (is_member()) with check (is_member());
create policy dispatches_delete_admin on dispatches for delete to authenticated
  using (is_admin());

create policy dispatch_items_select on dispatch_items for select to authenticated
  using (is_member());
create policy dispatch_items_write on dispatch_items for all to authenticated
  using (is_member()) with check (is_member());

create policy activity_select on activity_log for select to authenticated
  using (is_member());
create policy activity_insert on activity_log for insert to authenticated
  with check (is_member());

-- ---------------------------------------------------------------------
-- 9b. Table privileges
--
--     RLS decides WHICH ROWS a user may touch, but Postgres still needs a
--     plain GRANT before it will let the role touch the table at all.
--     Supabase's default privileges usually cover this; granting explicitly
--     means this migration is correct on its own and cannot be broken by a
--     change to those defaults.
-- ---------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Anything added by a later migration should behave the same way.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- Belt and braces: the anonymous role gets nothing, anywhere.
-- Every route in the app is behind auth, so nothing should ever reach here
-- as `anon` — but if it does, it reads no rows rather than leaking data.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;
alter default privileges in schema public revoke all on tables from anon;


-- ---------------------------------------------------------------------
-- 10. ensure_overdue_followups() — this is what replaces a cron job
--
--     The dashboard calls this once per load. It creates the 3-day overdue
--     nudges that have come due since the last visit. Idempotent thanks to
--     followups_overdue_unique, so loading the page twice is harmless.
-- ---------------------------------------------------------------------

create or replace function ensure_overdue_followups(p_today date default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today   date := coalesce(p_today, (now() at time zone 'Asia/Kolkata')::date);
  v_order   record;
  v_due     date;
  v_created int := 0;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;

  for v_order in
    select id, current_expected_dispatch_date
    from orders
    where stage in ('ordered', 'in_production', 'ready_for_dispatch', 'on_hold')
      and current_expected_dispatch_date < v_today
  loop
    v_due := v_order.current_expected_dispatch_date + 3;
    while v_due <= v_today loop
      insert into followups (order_id, checkpoint_pct, due_date, status)
      values (v_order.id, null, v_due, 'pending')
      on conflict do nothing;

      if found then v_created := v_created + 1; end if;
      v_due := v_due + 3;
    end loop;
  end loop;

  return v_created;
end;
$$;


-- ---------------------------------------------------------------------
-- 11. record_dispatch() — the whole partial-dispatch flow in one transaction
--
--     Piece counts, dispatch rows, quantity roll-up and stage transition
--     either all happen or none do. A half-applied dispatch would silently
--     corrupt every balance figure in the app.
-- ---------------------------------------------------------------------

create or replace function record_dispatch(
  p_order_id      uuid,
  p_dispatch_date date,
  p_items         jsonb,        -- [{"order_item_id": "...", "quantity": 5}, ...]
  p_transporter   text default null,
  p_docket_no     text default null,
  p_remarks       text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dispatch_id uuid;
  v_no          int;
  v_item        jsonb;
  v_item_id     uuid;
  v_qty         int;
  v_balance     int;
  v_name        text;
  v_total_bal   int;
  v_is_partial  boolean;
  v_order       record;
  v_pcs         int := 0;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.stage in ('cancelled', 'closed') then
    raise exception 'Cannot dispatch a % order', v_order.stage;
  end if;

  -- Validate every line BEFORE writing anything.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'order_item_id')::uuid;
    v_qty     := coalesce((v_item->>'quantity')::int, 0);

    if v_qty < 0 then
      raise exception 'Dispatch quantity cannot be negative';
    end if;
    continue when v_qty = 0;   -- a zero line is simply skipped

    select qty_balance, product_name into v_balance, v_name
    from order_items where id = v_item_id and order_id = p_order_id;

    if not found then
      raise exception 'Item does not belong to this order';
    end if;
    if v_qty > v_balance then
      raise exception 'Cannot dispatch % of "%" — only % pending', v_qty, v_name, v_balance;
    end if;
    v_pcs := v_pcs + v_qty;
  end loop;

  if v_pcs = 0 then
    raise exception 'Enter at least one piece to dispatch';
  end if;

  select coalesce(max(dispatch_no), 0) + 1 into v_no from dispatches where order_id = p_order_id;

  insert into dispatches (order_id, dispatch_no, dispatch_date, is_partial,
                          transporter, docket_no, remarks, created_by)
  values (p_order_id, v_no, p_dispatch_date, true, p_transporter, p_docket_no, p_remarks, auth.uid())
  returning id into v_dispatch_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'order_item_id')::uuid;
    v_qty     := coalesce((v_item->>'quantity')::int, 0);
    continue when v_qty = 0;

    insert into dispatch_items (dispatch_id, order_item_id, quantity_dispatched)
    values (v_dispatch_id, v_item_id, v_qty);

    update order_items
      set qty_dispatched = qty_dispatched + v_qty
      where id = v_item_id;
  end loop;

  select coalesce(sum(qty_balance), 0) into v_total_bal
  from order_items where order_id = p_order_id;

  v_is_partial := v_total_bal > 0;
  update dispatches set is_partial = v_is_partial where id = v_dispatch_id;

  if v_order.first_dispatch_date is null then
    update orders set first_dispatch_date = p_dispatch_date where id = p_order_id;
  end if;

  if v_total_bal = 0 then
    -- Everything has shipped. Close the follow-up ladder.
    update orders
      set stage = 'dispatched',
          actual_dispatch_date = p_dispatch_date,
          transporter = coalesce(p_transporter, transporter),
          docket_no   = coalesce(p_docket_no, docket_no)
      where id = p_order_id;

    update followups set status = 'skipped'
      where order_id = p_order_id and status = 'pending';
  else
    -- Balance outstanding: the order stays open and keeps appearing on the
    -- dashboard. The caller then asks for a promised date for the balance.
    update orders set stage = 'in_production' where id = p_order_id
      and stage in ('ordered', 'ready_for_dispatch');
  end if;

  insert into activity_log (order_id, vendor_id, action, detail, actor_id)
  values (p_order_id, v_order.vendor_id, 'dispatch',
          format('Dispatch %s — %s pcs on %s%s', v_no, v_pcs, p_dispatch_date,
                 case when p_docket_no is not null then ' — Docket ' || p_docket_no else '' end),
          auth.uid());

  return jsonb_build_object(
    'dispatch_id',  v_dispatch_id,
    'dispatch_no',  v_no,
    'pcs',          v_pcs,
    'balance',      v_total_bal,
    'is_partial',   v_is_partial
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 12. apply_revision() — new promised date, atomically
--
--     Regenerates the remaining ladder across today -> new date, records the
--     revision for history, and leaves original_expected_dispatch_date alone.
-- ---------------------------------------------------------------------

create or replace function apply_revision(
  p_order_id     uuid,
  p_new_date     date,
  p_checkpoints  jsonb,        -- [{"checkpoint_pct": 50, "due_date": "2025-10-18"}, ...]
  p_reason       text default null,
  p_today        date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today  date := coalesce(p_today, (now() at time zone 'Asia/Kolkata')::date);
  v_order  record;
  v_cp     jsonb;
  v_added  int;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if p_new_date < v_today then
    raise exception 'A promised date cannot be in the past';
  end if;

  v_added := p_new_date - v_order.current_expected_dispatch_date;

  -- Pending rungs that already came due stay as evidence; ones that never
  -- came due are removed so the timeline does not fill with noise.
  update followups set status = 'skipped'
    where order_id = p_order_id and status = 'pending' and due_date <= v_today;

  delete from followups
    where order_id = p_order_id and status = 'pending' and due_date > v_today;

  for v_cp in select * from jsonb_array_elements(p_checkpoints)
  loop
    insert into followups (order_id, checkpoint_pct, due_date, status)
    values (
      p_order_id,
      nullif(v_cp->>'checkpoint_pct', '')::int,
      (v_cp->>'due_date')::date,
      coalesce(nullif(v_cp->>'status', ''), 'pending')::followup_status
    )
    on conflict do nothing;
  end loop;

  insert into order_revisions (order_id, old_expected_date, new_expected_date,
                               days_added, reason, created_by)
  values (p_order_id, v_order.current_expected_dispatch_date, p_new_date,
          v_added, p_reason, auth.uid());

  update orders
    set current_expected_dispatch_date = p_new_date,
        revision_count = revision_count + 1
    where id = p_order_id;

  insert into activity_log (order_id, vendor_id, action, detail, actor_id)
  values (p_order_id, v_order.vendor_id, 'revision',
          format('Promised date moved from %s to %s (%s days)',
                 v_order.current_expected_dispatch_date, p_new_date,
                 case when v_added >= 0 then '+' || v_added else v_added::text end),
          auth.uid());

  return jsonb_build_object('days_added', v_added, 'revision_count', v_order.revision_count + 1);
end;
$$;


-- ---------------------------------------------------------------------
-- 13. create_order_with_items() — order, items, money and ladder atomically
-- ---------------------------------------------------------------------

create or replace function create_order_with_items(
  p_order       jsonb,
  p_items       jsonb,
  p_checkpoints jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_no text;
  v_item     jsonb;
  v_item_id  uuid;
  v_cp       jsonb;
  v_idx      int := 0;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;

  insert into orders (
    vendor_id, order_date, lead_time_days,
    original_expected_dispatch_date, current_expected_dispatch_date,
    stage, priority, checkpoint_profile, placed_by, notes, created_by
  ) values (
    (p_order->>'vendor_id')::uuid,
    (p_order->>'order_date')::date,
    (p_order->>'lead_time_days')::int,
    (p_order->>'expected_date')::date,
    (p_order->>'expected_date')::date,
    coalesce(nullif(p_order->>'stage',''), 'ordered')::order_stage,
    coalesce(nullif(p_order->>'priority',''), 'normal')::order_priority,
    coalesce(nullif(p_order->>'checkpoint_profile',''), 'standard')::checkpoint_profile,
    nullif(p_order->>'placed_by',''),
    nullif(p_order->>'notes',''),
    auth.uid()
  )
  returning id, order_no into v_order_id, v_order_no;

  -- Money only if the caller is an admin; the RLS policy would reject it
  -- for staff, so we skip rather than fail the whole order.
  if is_admin() and (p_order ? 'total_amount' or p_order ? 'advance_paid' or p_order ? 'payment_notes') then
    insert into order_finance (order_id, total_amount, advance_paid, payment_notes)
    values (
      v_order_id,
      nullif(p_order->>'total_amount','')::numeric,
      coalesce(nullif(p_order->>'advance_paid','')::numeric, 0),
      nullif(p_order->>'payment_notes','')
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into order_items (order_id, product_name, description, design_code, colour,
                             size, category, quantity, unit, sort_order)
    values (
      v_order_id,
      coalesce(nullif(v_item->>'product_name',''), 'Item'),
      nullif(v_item->>'description',''),
      nullif(v_item->>'design_code',''),
      nullif(v_item->>'colour',''),
      nullif(v_item->>'size',''),
      coalesce(nullif(v_item->>'category',''), 'other')::product_category,
      greatest(1, coalesce((v_item->>'quantity')::int, 1)),
      coalesce(nullif(v_item->>'unit',''), 'pcs')::item_unit,
      v_idx
    )
    returning id into v_item_id;

    if is_admin() and (v_item ? 'rate' or v_item ? 'amount') then
      insert into order_item_finance (order_item_id, rate, amount)
      values (v_item_id,
              nullif(v_item->>'rate','')::numeric,
              nullif(v_item->>'amount','')::numeric);
    end if;

    v_idx := v_idx + 1;
  end loop;

  for v_cp in select * from jsonb_array_elements(p_checkpoints)
  loop
    insert into followups (order_id, checkpoint_pct, due_date, status)
    values (
      v_order_id,
      nullif(v_cp->>'checkpoint_pct','')::int,
      (v_cp->>'due_date')::date,
      coalesce(nullif(v_cp->>'status',''), 'pending')::followup_status
    )
    on conflict do nothing;
  end loop;

  insert into activity_log (order_id, vendor_id, action, detail, actor_id)
  values (v_order_id, (p_order->>'vendor_id')::uuid, 'created',
          format('Order %s placed, %s day lead time', v_order_no, p_order->>'lead_time_days'),
          auth.uid());

  return jsonb_build_object('id', v_order_id, 'order_no', v_order_no);
end;
$$;


-- ---------------------------------------------------------------------
-- 14. Vendor scorecard — computed in the database so the page stays fast
-- ---------------------------------------------------------------------

create or replace view vendor_stats as
select
  v.id as vendor_id,
  count(o.id)                                             as total_orders,
  count(o.id) filter (where o.actual_dispatch_date is not null) as completed_orders,
  count(o.id) filter (where o.stage in ('ordered','in_production','ready_for_dispatch','on_hold')) as open_orders,
  count(o.id) filter (where o.delay_days is not null and o.delay_days <= 0) as on_time_orders,
  round(avg(o.delay_days) filter (where o.delay_days is not null), 1)       as avg_delay_days,
  max(o.delay_days)                                       as worst_delay_days,
  round(avg(o.revision_count), 1)                         as avg_revisions,
  -- Fill rate: share of completed orders that shipped in a single dispatch.
  count(o.id) filter (
    where o.actual_dispatch_date is not null
      and (select count(*) from dispatches d where d.order_id = o.id) = 1
  )                                                       as single_dispatch_orders,
  round(avg(o.actual_dispatch_date - o.first_dispatch_date)
        filter (where o.actual_dispatch_date is not null
                  and o.first_dispatch_date is not null), 1) as avg_dispatch_spread_days
from vendors v
left join orders o on o.vendor_id = v.id and o.stage <> 'cancelled'
group by v.id;

-- Views run with the caller's permissions in PG15+; be explicit for safety.
alter view vendor_stats set (security_invoker = true);

grant select on vendor_stats to authenticated;


-- =====================================================================
--  Done. Create your login in Authentication > Users — the first account
--  to sign in automatically becomes the admin.
-- =====================================================================
