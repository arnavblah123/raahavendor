-- =====================================================================
--  Raaha by Archana Bansal — Vendor Follow-Up & Delivery Tracker
--  Migration 0002: measurements & photos on items, purchase orders,
--                  and the inwarding (goods receipt) system
--
--  Paste this whole file into the Supabase SQL Editor and press Run,
--  AFTER 0001_init.sql. It is safe to run once.
--
--  What it adds:
--    • order_items gains measurements, a photo, and a "received" count
--    • purchase_orders with an automatic PO number (PO/2026-27/0001)
--    • inwards / inward_items: what arrived against a PO, at what price,
--      whether the measurements matched, and any problem flagged for the
--      owner to look at
--    • a private storage bucket for the photos
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------

create type po_status   as enum ('issued', 'partially_received', 'received', 'cancelled');
create type flag_status as enum ('open', 'resolved');


-- ---------------------------------------------------------------------
-- 2. Order items: measurements, photo, received count
-- ---------------------------------------------------------------------

alter table order_items
  add column measurements     jsonb   not null default '[]'::jsonb,
  add column measurement_unit text    not null default 'in'
                                      check (measurement_unit in ('in', 'cm')),
  add column photo_path       text,
  add column qty_received     int     not null default 0 check (qty_received >= 0),
  add constraint qty_received_within_ordered check (qty_received <= quantity);

comment on column order_items.measurements is
  'JSON array of {name, value} in measurement_unit. Checked again at inward.';
comment on column order_items.photo_path is
  'Object path inside the private order-photos storage bucket.';
comment on column order_items.qty_received is
  'Pieces physically received and inwarded against the PO. qty_dispatched is what the vendor SENT.';

-- Order numbers used to read RAAHA-PO-0001, which now clashes with real
-- purchase order numbers. New orders read RAAHA-ORD-0005 onwards; existing
-- orders keep the number they were given.
alter table orders
  alter column order_no set default 'RAAHA-ORD-' || lpad(nextval('order_no_seq')::text, 4, '0');


-- ---------------------------------------------------------------------
-- 3. Purchase order numbering — restarts every Indian financial year
-- ---------------------------------------------------------------------

create table po_counters (
  financial_year text primary key,          -- e.g. '2026-27'
  last_seq       int  not null default 0
);

-- April to March. 8 Sep 2026 -> '2026-27'; 15 Feb 2027 -> '2026-27'.
create or replace function financial_year_label(p_date date)
returns text
language sql
immutable
as $$
  select case
    when extract(month from p_date) >= 4
      then extract(year from p_date)::int::text
           || '-' || lpad(((extract(year from p_date)::int + 1) % 100)::text, 2, '0')
    else (extract(year from p_date)::int - 1)::text
           || '-' || lpad((extract(year from p_date)::int % 100)::text, 2, '0')
  end
$$;

-- The row-level lock taken by the upsert means two POs created at the same
-- instant still get consecutive numbers, never the same one.
create or replace function next_po_no(p_date date)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_fy  text := financial_year_label(p_date);
  v_seq int;
begin
  insert into po_counters (financial_year, last_seq)
  values (v_fy, 1)
  on conflict (financial_year) do update set last_seq = po_counters.last_seq + 1
  returning last_seq into v_seq;

  return format('PO/%s/%s', v_fy, lpad(v_seq::text, 4, '0'));
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Purchase orders
-- ---------------------------------------------------------------------

create table purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  po_no       text unique not null,
  order_id    uuid not null references orders(id) on delete cascade,
  vendor_id   uuid not null references vendors(id),

  po_date                date not null,
  expected_delivery_date date not null,
  status      po_status not null default 'issued',

  terms       text,
  notes       text,

  -- Frozen copy of the order lines at the moment the PO was issued (no
  -- money — that lives in purchase_order_finance so staff cannot read it).
  lines       jsonb not null default '[]'::jsonb,

  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One live PO per order. A cancelled PO can be replaced.
create unique index purchase_orders_one_live_per_order
  on purchase_orders (order_id) where status <> 'cancelled';

create table purchase_order_finance (
  po_id         uuid primary key references purchase_orders(id) on delete cascade,
  lines         jsonb not null default '[]'::jsonb,   -- [{order_item_id, rate, amount}]
  total_amount  numeric(12,2),
  advance_paid  numeric(12,2)
);

create trigger purchase_orders_touch_updated_at
  before update on purchase_orders
  for each row execute function touch_updated_at();


-- ---------------------------------------------------------------------
-- 5. Inwards — goods received against a PO
-- ---------------------------------------------------------------------

create table inwards (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references purchase_orders(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  inward_no     int  not null,               -- 1st, 2nd, 3rd inward against this PO
  inward_date   date not null,
  invoice_no    text,
  received_by   text,
  remarks       text,
  pcs_received  int  not null default 0,
  flagged_count int  not null default 0,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  unique (po_id, inward_no)
);

create table inward_items (
  id                  uuid primary key default gen_random_uuid(),
  inward_id           uuid not null references inwards(id) on delete cascade,
  order_item_id       uuid not null references order_items(id) on delete cascade,
  qty_received        int  not null check (qty_received >= 0),

  -- [{name, ordered, received, diff}] — a copy, so the check survives even
  -- if the order's measurements are edited later.
  measurement_checks  jsonb   not null default '[]'::jsonb,
  measurements_checked boolean not null default false,
  has_deviation       boolean not null default false,

  -- The problem the owner needs to see. Flagged by staff at inward; only an
  -- admin can mark it resolved.
  is_flagged          boolean not null default false,
  flag_reason         text,
  flag_status         flag_status,
  resolved_by         uuid references profiles(id),
  resolved_at         timestamptz,
  resolution_note     text,

  created_at          timestamptz not null default now(),

  constraint flagged_needs_reason
    check (not is_flagged or (flag_reason is not null and flag_status is not null))
);

-- The price typed in from the vendor's invoice. Staff may WRITE it (they are
-- the ones holding the invoice) but never read it back.
create table inward_item_finance (
  inward_item_id uuid primary key references inward_items(id) on delete cascade,
  rate    numeric(12,2),
  amount  numeric(12,2)
);


-- ---------------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------------

create index idx_purchase_orders_order  on purchase_orders (order_id);
create index idx_purchase_orders_vendor on purchase_orders (vendor_id);
create index idx_inwards_po             on inwards (po_id);
create index idx_inwards_order          on inwards (order_id);
create index idx_inward_items_inward    on inward_items (inward_id);
create index idx_inward_items_open_flags on inward_items (created_at desc)
  where is_flagged and flag_status = 'open';


-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------

alter table po_counters            enable row level security;
alter table purchase_orders        enable row level security;
alter table purchase_order_finance enable row level security;
alter table inwards                enable row level security;
alter table inward_items           enable row level security;
alter table inward_item_finance    enable row level security;

-- The counter is only ever touched through next_po_no(), but that runs as
-- the caller, so members need to be allowed through.
create policy po_counters_member on po_counters for all to authenticated
  using (is_member()) with check (is_member());

create policy purchase_orders_select on purchase_orders for select to authenticated
  using (is_member());
create policy purchase_orders_insert on purchase_orders for insert to authenticated
  with check (is_member());
create policy purchase_orders_update on purchase_orders for update to authenticated
  using (is_member()) with check (is_member());
create policy purchase_orders_delete_admin on purchase_orders for delete to authenticated
  using (is_admin());

-- Agreed rates: admin only, read and write.
create policy purchase_order_finance_admin on purchase_order_finance for all to authenticated
  using (is_admin()) with check (is_admin());

create policy inwards_select on inwards for select to authenticated
  using (is_member());
create policy inwards_insert on inwards for insert to authenticated
  with check (is_member());
create policy inwards_delete_admin on inwards for delete to authenticated
  using (is_admin());

create policy inward_items_select on inward_items for select to authenticated
  using (is_member());
create policy inward_items_insert on inward_items for insert to authenticated
  with check (is_member());
-- Resolving a flag is the owner's call.
create policy inward_items_update_admin on inward_items for update to authenticated
  using (is_admin()) with check (is_admin());
create policy inward_items_delete_admin on inward_items for delete to authenticated
  using (is_admin());

-- Staff can write the invoice price; only admin can ever read it.
create policy inward_item_finance_insert on inward_item_finance for insert to authenticated
  with check (is_member());
create policy inward_item_finance_admin_read on inward_item_finance for select to authenticated
  using (is_admin());
create policy inward_item_finance_admin_update on inward_item_finance for update to authenticated
  using (is_admin()) with check (is_admin());
create policy inward_item_finance_admin_delete on inward_item_finance for delete to authenticated
  using (is_admin());

-- Belt and braces, as in 0001: anonymous gets nothing.
revoke all on po_counters, purchase_orders, purchase_order_finance,
              inwards, inward_items, inward_item_finance from anon;
grant select, insert, update, delete on po_counters, purchase_orders, purchase_order_finance,
              inwards, inward_items, inward_item_finance to authenticated;


-- ---------------------------------------------------------------------
-- 8. Photo storage — a private bucket, readable by signed-in users only
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "order photos: members read"
  on storage.objects for select to authenticated
  using (bucket_id = 'order-photos' and public.is_member());

create policy "order photos: members upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'order-photos' and public.is_member());

-- You can remove a photo you uploaded yourself; the admin can remove any.
create policy "order photos: own or admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'order-photos' and (owner = auth.uid() or public.is_admin()));


-- ---------------------------------------------------------------------
-- 9. create_order_with_items() — now also stores measurements and photo
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
                             size, category, quantity, unit, sort_order,
                             measurements, measurement_unit, photo_path)
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
      v_idx,
      case when jsonb_typeof(v_item->'measurements') = 'array'
           then v_item->'measurements' else '[]'::jsonb end,
      case when v_item->>'measurement_unit' in ('in','cm')
           then v_item->>'measurement_unit' else 'in' end,
      nullif(v_item->>'photo_path','')
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
-- 10. create_purchase_order() — PO number, line snapshot and money, atomically
-- ---------------------------------------------------------------------

create or replace function create_purchase_order(
  p_order_id uuid,
  p_po_date  date default null,
  p_terms    text default null,
  p_notes    text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order   record;
  v_po_id   uuid;
  v_po_no   text;
  v_date    date := coalesce(p_po_date, (now() at time zone 'Asia/Kolkata')::date);
  v_lines   jsonb;
  v_money   jsonb;
  v_total   numeric;
  v_advance numeric;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.stage in ('cancelled', 'closed') then
    raise exception 'Cannot raise a purchase order for a % order', v_order.stage;
  end if;
  if exists (select 1 from purchase_orders where order_id = p_order_id and status <> 'cancelled') then
    raise exception 'This order already has a purchase order';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_item_id',    i.id,
           'product_name',     i.product_name,
           'description',      i.description,
           'design_code',      i.design_code,
           'colour',           i.colour,
           'size',             i.size,
           'category',         i.category,
           'quantity',         i.quantity,
           'unit',             i.unit,
           'measurements',     i.measurements,
           'measurement_unit', i.measurement_unit,
           'photo_path',       i.photo_path
         ) order by i.sort_order, i.created_at), '[]'::jsonb)
  into v_lines
  from order_items i where i.order_id = p_order_id;

  if v_lines = '[]'::jsonb then
    raise exception 'The order has no items';
  end if;

  v_po_no := next_po_no(v_date);

  insert into purchase_orders (po_no, order_id, vendor_id, po_date, expected_delivery_date,
                               terms, notes, lines, created_by)
  values (v_po_no, p_order_id, v_order.vendor_id, v_date, v_order.current_expected_dispatch_date,
          nullif(p_terms, ''), nullif(p_notes, ''), v_lines, auth.uid())
  returning id into v_po_id;

  -- Rates are copied only when an admin raises the PO; for staff the rows
  -- simply do not exist, and the admin can still see the live rates on the
  -- order itself.
  if is_admin() then
    select coalesce(jsonb_agg(jsonb_build_object(
             'order_item_id', i.id, 'rate', f.rate, 'amount', f.amount)
             order by i.sort_order), '[]'::jsonb)
    into v_money
    from order_items i
    left join order_item_finance f on f.order_item_id = i.id
    where i.order_id = p_order_id;

    select total_amount, advance_paid into v_total, v_advance
    from order_finance where order_id = p_order_id;

    insert into purchase_order_finance (po_id, lines, total_amount, advance_paid)
    values (v_po_id, v_money, v_total, v_advance);
  end if;

  insert into activity_log (order_id, vendor_id, action, detail, actor_id)
  values (p_order_id, v_order.vendor_id, 'po',
          format('Purchase order %s raised', v_po_no), auth.uid());

  return jsonb_build_object('id', v_po_id, 'po_no', v_po_no);
end;
$$;


-- ---------------------------------------------------------------------
-- 11. record_inward() — goods received against a PO, in one transaction
--
--     Receives pieces per line, stores the price and the measurement check,
--     flags problems for the owner, keeps the dispatch tally consistent
--     (goods that arrived were necessarily sent) and closes the order when
--     the last piece is in.
-- ---------------------------------------------------------------------

create or replace function record_inward(
  p_po_id       uuid,
  p_inward_date date,
  p_items       jsonb,        -- [{order_item_id, qty_received, rate, measurement_checks,
                              --   measurements_checked, has_deviation, is_flagged, flag_reason}]
  p_invoice_no  text default null,
  p_received_by text default null,
  p_remarks     text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_po          record;
  v_order       record;
  v_inward_id   uuid;
  v_inward_no   int;
  v_item        jsonb;
  v_item_id     uuid;
  v_qty         int;
  v_line        record;
  v_pcs         int := 0;
  v_flagged     int := 0;
  v_ii_id       uuid;
  v_rate        numeric;
  v_to_dispatch jsonb := '[]'::jsonb;
  v_gap         int;
  v_flag        boolean;
  v_reason      text;
  v_ordered     int;
  v_received    int;
  v_dispatch_bal int;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'Purchase order not found';
  end if;
  if v_po.status = 'cancelled' then
    raise exception 'This purchase order has been cancelled';
  end if;

  select * into v_order from orders where id = v_po.order_id for update;
  if v_order.stage in ('cancelled', 'closed') then
    raise exception 'Cannot inward against a % order', v_order.stage;
  end if;

  -- Validate every line BEFORE writing anything.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'order_item_id')::uuid;
    v_qty     := coalesce((v_item->>'qty_received')::int, 0);
    v_flag    := coalesce((v_item->>'is_flagged')::boolean, false);
    v_reason  := nullif(trim(v_item->>'flag_reason'), '');

    if v_qty < 0 then
      raise exception 'Received quantity cannot be negative';
    end if;
    if v_flag and v_reason is null then
      raise exception 'Write down the problem for every flagged item';
    end if;

    select id, product_name, quantity, qty_received into v_line
    from order_items where id = v_item_id and order_id = v_po.order_id;
    if not found then
      raise exception 'Item does not belong to this purchase order';
    end if;
    if v_line.qty_received + v_qty > v_line.quantity then
      raise exception 'Cannot receive % of "%" — only % still expected',
        v_qty, v_line.product_name, v_line.quantity - v_line.qty_received;
    end if;

    v_pcs := v_pcs + v_qty;
    if v_flag then v_flagged := v_flagged + 1; end if;
  end loop;

  if v_pcs = 0 and v_flagged = 0 then
    raise exception 'Enter at least one piece received';
  end if;

  select coalesce(max(inward_no), 0) + 1 into v_inward_no from inwards where po_id = p_po_id;

  insert into inwards (po_id, order_id, inward_no, inward_date, invoice_no, received_by,
                       remarks, pcs_received, flagged_count, created_by)
  values (p_po_id, v_po.order_id, v_inward_no, p_inward_date, nullif(p_invoice_no, ''),
          nullif(p_received_by, ''), nullif(p_remarks, ''), v_pcs, v_flagged, auth.uid())
  returning id into v_inward_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'order_item_id')::uuid;
    v_qty     := coalesce((v_item->>'qty_received')::int, 0);
    v_flag    := coalesce((v_item->>'is_flagged')::boolean, false);
    v_reason  := nullif(trim(v_item->>'flag_reason'), '');

    -- A line with nothing received and nothing flagged is simply skipped.
    continue when v_qty = 0 and not v_flag;

    insert into inward_items (inward_id, order_item_id, qty_received,
                              measurement_checks, measurements_checked, has_deviation,
                              is_flagged, flag_reason, flag_status)
    values (
      v_inward_id, v_item_id, v_qty,
      case when jsonb_typeof(v_item->'measurement_checks') = 'array'
           then v_item->'measurement_checks' else '[]'::jsonb end,
      coalesce((v_item->>'measurements_checked')::boolean, false),
      coalesce((v_item->>'has_deviation')::boolean, false),
      v_flag,
      case when v_flag then v_reason end,
      case when v_flag then 'open'::flag_status end
    )
    returning id into v_ii_id;

    -- The invoice price. Written by whoever is holding the invoice; readable
    -- only by the admin (RLS on inward_item_finance).
    v_rate := nullif(v_item->>'rate', '')::numeric;
    if v_rate is not null then
      insert into inward_item_finance (inward_item_id, rate, amount)
      values (v_ii_id, v_rate, v_rate * v_qty);
    end if;

    if v_qty > 0 then
      update order_items
        set qty_received = qty_received + v_qty
        where id = v_item_id
        returning qty_received - qty_dispatched into v_gap;

      -- Goods that arrived were necessarily sent. If the dispatch was never
      -- logged, record it now so the follow-up ladder closes properly.
      if v_gap > 0 then
        v_to_dispatch := v_to_dispatch
          || jsonb_build_object('order_item_id', v_item_id, 'quantity', v_gap);
      end if;
    end if;
  end loop;

  if v_to_dispatch <> '[]'::jsonb then
    perform record_dispatch(
      v_po.order_id, p_inward_date, v_to_dispatch, null, null,
      format('Recorded automatically from inward %s', v_inward_no));
  end if;

  select coalesce(sum(quantity), 0), coalesce(sum(qty_received), 0), coalesce(sum(qty_balance), 0)
  into v_ordered, v_received, v_dispatch_bal
  from order_items where order_id = v_po.order_id;

  if v_received >= v_ordered then
    update purchase_orders set status = 'received' where id = p_po_id;
    update orders
      set stage = 'received',
          received_date = coalesce(received_date, p_inward_date)
      where id = v_po.order_id;
  elsif v_received > 0 then
    update purchase_orders set status = 'partially_received' where id = p_po_id;
  end if;

  insert into activity_log (order_id, vendor_id, action, detail, actor_id)
  values (v_po.order_id, v_order.vendor_id, 'inward',
          format('Inward %s against %s — %s pcs received%s',
                 v_inward_no, v_po.po_no, v_pcs,
                 case when v_flagged > 0
                      then format(', %s flagged for the owner', v_flagged) else '' end),
          auth.uid());

  return jsonb_build_object(
    'inward_id',        v_inward_id,
    'inward_no',        v_inward_no,
    'pcs',              v_pcs,
    'flagged',          v_flagged,
    'received_total',   v_received,
    'ordered_total',    v_ordered,
    'balance',          v_ordered - v_received,
    'dispatch_balance', v_dispatch_bal
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 12. Function privileges — same shape as 0001
-- ---------------------------------------------------------------------

grant execute on function financial_year_label(date),
                          next_po_no(date),
                          create_purchase_order(uuid, date, text, text),
                          record_inward(uuid, date, jsonb, text, text, text)
  to authenticated;

revoke execute on function financial_year_label(date),
                           next_po_no(date),
                           create_purchase_order(uuid, date, text, text),
                           record_inward(uuid, date, jsonb, text, text, text)
  from anon, public;


-- =====================================================================
--  Done. Photos, measurements, purchase orders and inwarding are ready.
-- =====================================================================
