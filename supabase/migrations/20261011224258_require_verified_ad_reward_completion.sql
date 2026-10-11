create or replace function public.claim_economy_reward(p_reward_key text)
returns bigint language plpgsql security definer set search_path = ''
as $$
begin
  if p_reward_key = 'first_activity_reward' then
    raise exception 'The first-activity reward is granted automatically after your first activity';
  end if;
  if p_reward_key = 'ad_reward' then
    raise exception 'Ad rewards are only credited after trusted ad-completion verification';
  end if;
  if p_reward_key <> 'daily_login_reward' then
    raise exception 'This reward cannot be claimed directly';
  end if;
  return public.claim_economy_reward_internal(p_reward_key);
end;
$$;
revoke all on function public.claim_economy_reward(text) from public;
grant execute on function public.claim_economy_reward(text) to authenticated;
