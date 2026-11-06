-- Basic abuse protection for the public account-creation Edge Function.
create table if not exists public.signup_rate_limits (
  fingerprint text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists signup_rate_limits_fingerprint_time_idx
  on public.signup_rate_limits(fingerprint, attempted_at desc);
alter table public.signup_rate_limits enable row level security;
revoke all on table public.signup_rate_limits from public, anon, authenticated;

create or replace function public.check_signup_rate_limit(p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_attempts integer;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid signup rate-limit fingerprint';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));

  delete from public.signup_rate_limits
  where attempted_at < now() - interval '24 hours';

  select count(*)::integer into v_attempts
  from public.signup_rate_limits
  where fingerprint = p_fingerprint
    and attempted_at >= now() - interval '1 hour';

  if v_attempts >= 5 then
    return false;
  end if;

  insert into public.signup_rate_limits(fingerprint, attempted_at)
  values (p_fingerprint, now());

  return true;
end;
$function$;

revoke all on function public.check_signup_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_signup_rate_limit(text) to service_role;
