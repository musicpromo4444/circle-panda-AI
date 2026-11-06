begin;
grant execute on function public.mark_onboarding_seen(text) to authenticated;
commit;
