-- Persist the two first-run onboarding steps across sessions and devices.
alter table public.profiles
  add column if not exists welcome_popup_seen_at timestamptz,
  add column if not exists app_tour_seen_at timestamptz;

create or replace function public.mark_onboarding_seen(p_step text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if p_step = 'welcome' then
    update public.profiles set welcome_popup_seen_at = coalesce(welcome_popup_seen_at, now())
      where id = v_user_id;
  elsif p_step = 'tour' then
    update public.profiles set app_tour_seen_at = coalesce(app_tour_seen_at, now())
      where id = v_user_id;
  else
    raise exception 'Unknown onboarding step';
  end if;
end;
$$;
revoke all on function public.mark_onboarding_seen(text) from public;
revoke all on function public.mark_onboarding_seen(text) from anon;
grant execute on function public.mark_onboarding_seen(text) to authenticated;
