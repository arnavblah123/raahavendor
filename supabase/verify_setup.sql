-- =====================================================================
--  Check that 0001_init.sql installed correctly.
--
--  Paste this into the Supabase SQL Editor and press Run, AFTER running
--  the migration. Every row should say OK.
--
--  Safe to run any time — it only reads, it changes nothing.
-- =====================================================================

select 'Tables created'   as check, count(*)::text || ' of 14' as result,
       case when count(*) = 14 then 'OK' else 'PROBLEM' end as status
from pg_tables where schemaname = 'public'
union all
select 'Security switched on', count(*)::text || ' of 14',
       case when count(*) = 14 then 'OK' else 'PROBLEM' end
from pg_tables where schemaname = 'public' and rowsecurity
union all
select 'Security rules', count(*)::text || ' policies',
       case when count(*) >= 25 then 'OK' else 'PROBLEM' end
from pg_policies where schemaname = 'public'
union all
select 'Speed indexes', count(*)::text,
       case when count(*) >= 15 then 'OK' else 'PROBLEM' end
from pg_indexes where schemaname = 'public' and indexname like 'idx_%'
union all
select 'Reminder functions', count(*)::text || ' of 4',
       case when count(*) = 4 then 'OK' else 'PROBLEM' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('ensure_overdue_followups','record_dispatch','apply_revision','create_order_with_items')
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
