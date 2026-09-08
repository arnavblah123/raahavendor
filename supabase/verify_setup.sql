-- =====================================================================
--  Check that migrations 0001, 0002 and 0003 installed correctly.
--
--  Paste this into the Supabase SQL Editor and press Run, AFTER running
--  all three migrations. Every row should say OK.
--
--  Safe to run any time — it only reads, it changes nothing.
-- =====================================================================

select 'Tables created'   as check, count(*)::text || ' of 20' as result,
       case when count(*) = 20 then 'OK' else 'PROBLEM' end as status
from pg_tables where schemaname = 'public'
union all
select 'Security switched on', count(*)::text || ' of 20',
       case when count(*) = 20 then 'OK' else 'PROBLEM' end
from pg_tables where schemaname = 'public' and rowsecurity
union all
select 'Security rules', count(*)::text || ' policies',
       case when count(*) >= 40 then 'OK' else 'PROBLEM' end
from pg_policies where schemaname = 'public'
union all
select 'Speed indexes', count(*)::text,
       case when count(*) >= 21 then 'OK' else 'PROBLEM' end
from pg_indexes where schemaname = 'public' and indexname like 'idx_%'
union all
select 'Reminder functions', count(*)::text || ' of 4',
       case when count(*) = 4 then 'OK' else 'PROBLEM' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('ensure_overdue_followups','record_dispatch','apply_revision','create_order_with_items')
union all
select 'PO and inward functions', count(*)::text || ' of 4',
       case when count(*) = 4 then 'OK' else 'PROBLEM' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('financial_year_label','next_po_no','create_purchase_order','record_inward')
union all
select 'Measurements on items',
       case when count(*) = 4 then 'columns present' else 'columns missing' end,
       case when count(*) = 4 then 'OK' else 'PROBLEM' end
from information_schema.columns
where table_schema = 'public' and table_name = 'order_items'
  and column_name in ('measurements','measurement_unit','photo_path','qty_received')
union all
select 'PO company details',
       case when count(*) = 1 then 'column present' else 'run 0003_po_details.sql' end,
       case when count(*) = 1 then 'OK' else 'PROBLEM' end
from information_schema.columns
where table_schema = 'public' and table_name = 'app_settings' and column_name = 'po_details'
union all
select 'Photo storage bucket',
       case when count(*) = 1 then 'order-photos (private)' else 'missing' end,
       case when count(*) = 1 then 'OK' else 'PROBLEM' end
from storage.buckets where id = 'order-photos' and not public
union all
select 'Photo storage rules', count(*)::text || ' policies',
       case when count(*) >= 3 then 'OK' else 'PROBLEM' end
from pg_policies where schemaname = 'storage' and policyname like 'order photos%'
union all
select 'Vendor types ready', count(*)::text || ' categories',
       case when count(*) = 6 then 'OK' else 'PROBLEM' end
from vendor_categories
union all
select 'Message templates', case when count(*) = 1 then 'loaded' else 'missing' end,
       case when count(*) = 1 then 'OK' else 'PROBLEM' end
from app_settings
union all
select 'Public access blocked',
       case when bool_or(has_table_privilege('anon', c.oid, 'SELECT'))
            then 'anon CAN read data' else 'anon locked out' end,
       case when bool_or(has_table_privilege('anon', c.oid, 'SELECT'))
            then 'PROBLEM' else 'OK' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
union all
select 'Signed-in access works',
       case when bool_and(has_table_privilege('authenticated', c.oid, 'SELECT'))
            then 'all tables readable' else 'some tables unreadable' end,
       case when bool_and(has_table_privilege('authenticated', c.oid, 'SELECT'))
            then 'OK' else 'PROBLEM' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
