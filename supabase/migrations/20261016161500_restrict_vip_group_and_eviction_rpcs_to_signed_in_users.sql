-- These actions must only be callable by signed-in users.
revoke all on function public.ensure_vip_group(text, text) from public, anon;
grant execute on function public.ensure_vip_group(text, text) to authenticated;

revoke all on function public.request_group_eviction(uuid, uuid, text) from public, anon;
grant execute on function public.request_group_eviction(uuid, uuid, text) to authenticated;

revoke all on function public.vote_group_eviction(uuid, boolean) from public, anon;
grant execute on function public.vote_group_eviction(uuid, boolean) to authenticated;
