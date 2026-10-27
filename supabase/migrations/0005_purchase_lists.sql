-- =====================================================================
--  Raaha by Archana Bansal — Vendor Follow-Up & Delivery Tracker
--  Migration 0005: purchase lists built at the vendor's shop
--
--  Paste this whole file into the Supabase SQL Editor and press Run,
--  AFTER 0004_vendor_address.sql. It is safe to run once.
--
--  What it adds:
--    • purchase_lists — one visit to one vendor's shop or store
--    • purchase_list_items — one photographed piece per row
--    • purchase_list_item_finance — the price, if it was known on the day
--      (admin-only to read, like every other money table)
--    • save_purchase_list() — saves a list and all its pieces in one go
--
--  A list is a draft until it is turned into an order. The order form
--  reads the pieces straight off it, so nothing is typed twice.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create type purchase_list_status as enum ('draft', 'converted');

create table purchase_lists (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references vendors(id),
  visit_date  date not null,
  status      purchase_list_status not null default 'draft',
  notes       text,
  -- Set when the list becomes an order. The order carries the pieces on.
  order_id    uuid references orders(id) on delete set null,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table purchase_lists is
  'Pieces picked in person at a vendor''s shop, photographed one by one. Becomes an order.';

create table purchase_list_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references purchase_lists(id) on delete cascade,
  product_name  text,
  design_code   text,
  colour        text,
  category      product_category not null default 'other',
  quantity      int  not null default 1 check (quantity >= 1),
  unit          item_unit not null default 'pcs',
  notes         text,
  -- Object path inside the private order-photos bucket. The photo IS the
  -- line: a piece without one is unusual, but allowed.
  photo_path    text,
  -- Lets staff see that a price was noted without seeing the number.
  has_rate      boolean not null default false,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

-- Price per piece, if known on the day. Staff may write it (they are the
-- ones standing in the shop) but never read it back — same rule as the
-- invoice price at inward.
create table purchase_list_item_finance (
  item_id uuid primary key references purchase_list_items(id) on delete cascade,
  rate    numeric(12,2)
);

create trigger purchase_lists_touch_updated_at
  before update on purchase_lists
  for each row execute function touch_updated_at();

create index idx_purchase_lists_vendor on purchase_lists (vendor_id);
create index idx_purchase_lists_status on purchase_lists (status, visit_date desc);
create index idx_purchase_list_items_list on purchase_list_items (list_id, sort_order);


-- ---------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------

alter table purchase_lists             enable row level security;
alter table purchase_list_items        enable row level security;
alter table purchase_list_item_finance enable row level security;

create policy purchase_lists_select on purchase_lists for select to authenticated
  using (is_member());
create policy purchase_lists_insert on purchase_lists for insert to authenticated
  with check (is_member());
create policy purchase_lists_update on purchase_lists for update to authenticated
  using (is_member()) with check (is_member());
create policy purchase_lists_delete_admin on purchase_lists for delete to authenticated
  using (is_admin());

create policy purchase_list_items_select on purchase_list_items for select to authenticated
  using (is_member());
create policy purchase_list_items_insert on purchase_list_items for insert to authenticated
  with check (is_member());
create policy purchase_list_items_update on purchase_list_items for update to authenticated
  using (is_member()) with check (is_member());
-- Removing a piece from a draft is part of building the list, so members may.
create policy purchase_list_items_delete on purchase_list_items for delete to authenticated
  using (is_member());

-- Price: members write and replace; only an admin reads.
create policy plif_insert on purchase_list_item_finance for insert to authenticated
  with check (is_member());
create policy plif_delete on purchase_list_item_finance for delete to authenticated
  using (is_member());
create policy plif_admin_read on purchase_list_item_finance for select to authenticated
  using (is_admin());
create policy plif_admin_update on purchase_list_item_finance for update to authenticated
  using (is_admin()) with check (is_admin());

revoke all on purchase_lists, purchase_list_items, purchase_list_item_finance from anon;
grant select, insert, update, delete
  on purchase_lists, purchase_list_items, purchase_list_item_finance to authenticated;


-- ---------------------------------------------------------------------
-- 3. save_purchase_list() — the list and every piece, in one transaction
--
--    p_list:  {id?, vendor_id, visit_date, notes}
--    p_items: [{id?, key?, product_name, design_code, colour, category,
--               quantity, unit, notes, photo_path, rate?}]
--
--    Returns {id, item_count, items: [{key, id}]} so the screen can learn
--    the row id of every piece it has just saved (key is whatever the
--    screen sent, echoed back).
--
--    Pieces not in p_items are removed from the list. A piece's price is
--    only touched when the "rate" key is present: a number sets it, null
--    clears it, absent leaves whatever is there — so a staff member who
--    cannot see the price cannot wipe it by saving.
-- ---------------------------------------------------------------------

create or replace function save_purchase_list(
  p_list  jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_list_id   uuid := nullif(p_list->>'id', '')::uuid;
  v_vendor_id uuid := nullif(p_list->>'vendor_id', '')::uuid;
  v_date      date := coalesce(nullif(p_list->>'visit_date', '')::date,
                               (now() at time zone 'Asia/Kolkata')::date);
  v_status    purchase_list_status;
  v_item      jsonb;
  v_item_id   uuid;
  v_keep      uuid[] := '{}';
  v_idx       int := 0;
  v_rate      numeric;
  v_count     int;
  v_saved     jsonb := '[]'::jsonb;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;
  if v_vendor_id is null then
    raise exception 'Choose a vendor first';
  end if;

  if v_list_id is null then
    insert into purchase_lists (vendor_id, visit_date, notes, created_by)
    values (v_vendor_id, v_date, nullif(trim(p_list->>'notes'), ''), auth.uid())
    returning id into v_list_id;
  else
    select status into v_status from purchase_lists where id = v_list_id for update;
    if not found then
      raise exception 'Purchase list not found';
    end if;
    if v_status <> 'draft' then
      raise exception 'This list has already become an order and cannot be changed';
    end if;
    update purchase_lists
       set vendor_id  = v_vendor_id,
           visit_date = v_date,
           notes      = nullif(trim(p_list->>'notes'), '')
     where id = v_list_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item->>'id', '')::uuid;

    -- An id we do not know (or one from another list) becomes a new row.
    if v_item_id is not null and not exists (
      select 1 from purchase_list_items where id = v_item_id and list_id = v_list_id
    ) then
      v_item_id := null;
    end if;

    if v_item_id is null then
      insert into purchase_list_items (list_id, product_name, design_code, colour, category,
                                       quantity, unit, notes, photo_path, sort_order)
      values (
        v_list_id,
        nullif(trim(v_item->>'product_name'), ''),
        nullif(trim(v_item->>'design_code'), ''),
        nullif(trim(v_item->>'colour'), ''),
        coalesce(nullif(v_item->>'category', ''), 'other')::product_category,
        greatest(1, coalesce((v_item->>'quantity')::int, 1)),
        coalesce(nullif(v_item->>'unit', ''), 'pcs')::item_unit,
        nullif(trim(v_item->>'notes'), ''),
        nullif(v_item->>'photo_path', ''),
        v_idx
      )
      returning id into v_item_id;
    else
      update purchase_list_items
         set product_name = nullif(trim(v_item->>'product_name'), ''),
             design_code  = nullif(trim(v_item->>'design_code'), ''),
             colour       = nullif(trim(v_item->>'colour'), ''),
             category     = coalesce(nullif(v_item->>'category', ''), 'other')::product_category,
             quantity     = greatest(1, coalesce((v_item->>'quantity')::int, 1)),
             unit         = coalesce(nullif(v_item->>'unit', ''), 'pcs')::item_unit,
             notes        = nullif(trim(v_item->>'notes'), ''),
             photo_path   = nullif(v_item->>'photo_path', ''),
             sort_order   = v_idx
       where id = v_item_id;
    end if;

    -- The price, only when the form sent one (see the note above).
    if v_item ? 'rate' then
      v_rate := nullif(v_item->>'rate', '')::numeric;
      if v_rate is not null and v_rate < 0 then
        raise exception 'A price cannot be negative';
      end if;
      delete from purchase_list_item_finance where item_id = v_item_id;
      if v_rate is not null then
        insert into purchase_list_item_finance (item_id, rate) values (v_item_id, v_rate);
      end if;
      update purchase_list_items set has_rate = (v_rate is not null) where id = v_item_id;
    end if;

    v_keep  := v_keep || v_item_id;
    v_saved := v_saved || jsonb_build_object('key', v_item->>'key', 'id', v_item_id);
    v_idx   := v_idx + 1;
  end loop;

  delete from purchase_list_items
   where list_id = v_list_id and not (id = any (v_keep));

  select count(*) into v_count from purchase_list_items where list_id = v_list_id;

  return jsonb_build_object('id', v_list_id, 'item_count', v_count, 'items', v_saved);
end;
$$;


-- ---------------------------------------------------------------------
-- 4. convert_purchase_list() — marks a draft as turned into an order
--
--    Called right after create_order_with_items() succeeds. Kept as its
--    own function so the check "still a draft, and the order exists" and
--    the status change cannot drift apart.
-- ---------------------------------------------------------------------

create or replace function convert_purchase_list(
  p_list_id  uuid,
  p_order_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status purchase_list_status;
begin
  if not is_member() then
    raise exception 'Not authorised';
  end if;
  select status into v_status from purchase_lists where id = p_list_id for update;
  if not found then
    raise exception 'Purchase list not found';
  end if;
  if v_status <> 'draft' then
    raise exception 'This list has already become an order';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found';
  end if;

  update purchase_lists
     set status = 'converted', order_id = p_order_id
   where id = p_list_id;

  insert into activity_log (order_id, action, detail, actor_id)
  values (p_order_id, 'created', 'Placed from a purchase list made at the vendor''s shop', auth.uid());
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Function privileges — same shape as 0001
-- ---------------------------------------------------------------------

grant execute on function save_purchase_list(jsonb, jsonb),
                          convert_purchase_list(uuid, uuid)
  to authenticated;

revoke execute on function save_purchase_list(jsonb, jsonb),
                           convert_purchase_list(uuid, uuid)
  from anon, public;


-- =====================================================================
--  Done. Purchase lists from shop visits are ready.
-- =====================================================================
