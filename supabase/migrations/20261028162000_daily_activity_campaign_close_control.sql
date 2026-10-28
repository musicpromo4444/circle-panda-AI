create or replace function public.admin_close_daily_activity_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Administrator access is required'; end if;
 update public.daily_activity_campaigns set status='closed',updated_at=now() where id=p_campaign_id and status='open';
 if not found then raise exception 'This activity is not open'; end if;
 return jsonb_build_object('closed',true,'campaign_id',p_campaign_id);
end $$;
revoke all on function public.admin_close_daily_activity_campaign(uuid) from public,anon;
grant execute on function public.admin_close_daily_activity_campaign(uuid) to authenticated;
