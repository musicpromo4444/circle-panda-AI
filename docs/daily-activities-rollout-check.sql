-- READ-ONLY release gate. Run only on Circle Panda Rebuilt.
-- No DDL/DML, grants, or RPC invocations.

-- 1) Migration ledger: required pending migrations should appear once applied.
select version, name
from supabase_migrations.schema_migrations
where version in (
  '20261120080500',
  '20261122082300',
  '20261123081000',
  '20261124082300'
)
order by version;

-- 2) Required schema objects.
select table_schema, table_name, column_name
from information_schema.columns
where (table_schema = 'public' and table_name = 'user_daily_activity_attempts' and column_name = 'successful')
   or (table_schema = 'private' and table_name in ('daily_activity_skill_questions','daily_activity_sponsor_questions'))
order by table_schema, table_name, column_name;

-- 3) Client-role table write access must be absent; private answer tables must
-- have no browser-role privileges at all.
select
  has_table_privilege('authenticated','public.user_daily_activity_attempts','SELECT') as attempts_select,
  has_table_privilege('authenticated','public.user_daily_activity_attempts','INSERT') as attempts_insert,
  has_table_privilege('authenticated','public.user_daily_activity_attempts','UPDATE') as attempts_update,
  has_table_privilege('authenticated','public.user_daily_activity_attempts','DELETE') as attempts_delete,
  has_table_privilege('authenticated','private.daily_activity_skill_questions','SELECT') as skill_answer_select,
  has_table_privilege('authenticated','private.daily_activity_sponsor_questions','SELECT') as sponsor_answer_select;

-- 4) Required RPCs: security mode and per-role execution ACL.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_daily_activity',
    'record_daily_activity_action',
    'complete_daily_activity',
    'get_daily_sponsor_guess',
    'submit_daily_sponsor_guess',
    'admin_manage_sponsor_campaign'
  )
order by p.proname;

-- 5) Sponsor Reveal game readiness: needs >= 2 distinct sponsor names and
-- at least two currently active, in-window campaigns.
select
  count(distinct lower(trim(sponsor_name))) as distinct_active_sponsors,
  count(*) as eligible_campaigns,
  (count(distinct lower(trim(sponsor_name))) >= 2) as guess_sponsor_ready
from public.sponsor_campaigns
where status = 'active'
  and format = 'sponsor_reveal'
  and starts_at <= now()
  and ends_at > now();
