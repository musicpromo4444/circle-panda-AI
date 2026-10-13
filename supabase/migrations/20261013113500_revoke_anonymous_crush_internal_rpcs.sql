begin;

-- These are trigger/internal routines, not public RPC endpoints. Remove the
-- default PUBLIC grant so neither anonymous nor signed-in clients can invoke
-- them directly through PostgREST. Trigger execution remains managed by Postgres.
revoke execute on function public.notify_crush_interaction() from public, anon, authenticated;
revoke execute on function public.schedule_crush_post() from public, anon, authenticated;

commit;
