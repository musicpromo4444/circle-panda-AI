-- READ-ONLY security release gate for Circle Panda Daily Activities.
-- Run only against project chcyncvieekjousgzlrg after rollout. This script
-- reports evidence; it does not modify schema, grants, data, wallets or ledger.

-- A. Client write privileges on daily attempts (every operation must be false).
select
  has_table_privilege('anon','public.user_daily_activity_attempts','INSERT') as anon_insert,
  has_table_privilege('anon','public.user_daily_activity_attempts','UPDATE') as anon_update,
  has_table_privilege('anon','public.user_daily_activity_attempts','DELETE') as anon_delete,
  has_table_privilege('anon','public.user_daily_activity_attempts','TRUNCATE') as anon_truncate,
  has_table_privilege('authenticated','public.user_daily_activity_attempts','INSERT') as auth_insert,
  has_table_privilege('authenticated','public.user_daily_activity_attempts','UPDATE') as auth_update,
  has_table_privilege('authenticated','public.user_daily_activity_attempts','DELETE') as auth_delete,
  has_table_privilege('authenticated','public.user_daily_activity_attempts','TRUNCATE') as auth_truncate;

-- B. Browser roles must have no privilege of any kind on private answer tables.
select table_name, role_name,
  has_table_privilege(role_name, format('private.%I', table_name), 'SELECT') as can_select,
  has_table_privilege(role_name, format('private.%I', table_name), 'INSERT') as can_insert,
  has_table_privilege(role_name, format('private.%I', table_name), 'UPDATE') as can_update,
  has_table_privilege(role_name, format('private.%I', table_name), 'DELETE') as can_delete,
  has_table_privilege(role_name, format('private.%I', table_name), 'TRUNCATE') as can_truncate
from (values ('daily_activity_skill_questions'), ('daily_activity_sponsor_questions')) t(table_name)
cross join (values ('anon'), ('authenticated')) r(role_name)
order by table_name, role_name;

-- C. Function contracts. Missing RPCs are explicitly shown; SECURITY DEFINER
-- routines must have an empty search_path and must not be executable by anon/PUBLIC.
with expected(function_name) as (
  values ('start_daily_activity'), ('record_daily_activity_action'),
         ('complete_daily_activity'), ('get_daily_sponsor_guess'),
         ('submit_daily_sponsor_guess'), ('admin_manage_sponsor_campaign')
)
select e.function_name, p.oid is not null as exists,
  coalesce(p.prosecdef, false) as security_definer,
  coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) as authenticated_execute,
  coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false) as anon_execute,
  coalesce(exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ), false) as public_execute,
  p.proconfig as function_settings
from expected e
left join pg_proc p on p.proname = e.function_name
left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.oid is null or n.oid is not null
order by e.function_name;

-- D. Private schema boundary: only owner / trusted database roles should have USAGE.
select has_schema_privilege('anon','private','USAGE') as anon_private_usage,
       has_schema_privilege('authenticated','private','USAGE') as authenticated_private_usage;

-- E. Sponsor Reveal eligibility (requires >= 2 distinct sponsor names AND >= 2
-- active campaigns; avoid a single sponsor appearing twice as fake variety).
select count(*) as active_campaigns,
       count(distinct lower(trim(sponsor_name))) as distinct_sponsors,
       (count(*) >= 2 and count(distinct lower(trim(sponsor_name))) >= 2) as ready
from public.sponsor_campaigns
where status = 'active' and format = 'sponsor_reveal'
  and starts_at <= now() and ends_at > now();
