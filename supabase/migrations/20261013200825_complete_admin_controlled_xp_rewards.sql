
create or replace function public.award_xp_for_activity(p_user_id uuid,p_activity_key text,p_reference_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_setting_key text; v_amount bigint:=0; v_is_vip boolean:=false; v_new_total bigint; v_level text;
begin
 select coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at>now()) into v_is_vip
 from public.profiles p where p.id=p_user_id;
 if coalesce(v_is_vip,false) then return; end if;
 v_setting_key:=case p_activity_key
  when 'create_post' then 'xp_create_post'
  when 'reply_post' then 'xp_reply_post'
  when 'create_event' then 'xp_create_event'
  when 'attend_event' then 'xp_attend_event'
  when 'join_group' then 'xp_join_group'
  when 'create_group' then 'xp_create_group'
  when 'private_message' then 'xp_private_message'
  when 'group_message' then 'xp_group_message'
  when 'daily_login' then 'xp_daily_login'
  when 'daily_activity' then 'xp_daily_activity'
  when 'dating_match_chat' then 'xp_dating_match_chat'
  when 'wcw_vote' then 'xp_wcw_vote'
  when 'mcm_vote' then 'xp_wcw_vote'
  when 'wheel_spin' then 'xp_wheel_spin'
  when 'buy_gift' then 'xp_buy_gift'
  when 'complete_profile' then 'xp_complete_profile'
  else null end;
 if v_setting_key is null then return; end if;
 select es.numeric_value into v_amount from public.economy_settings es where es.setting_key=v_setting_key;
 v_amount:=coalesce(v_amount,0);
 if v_amount<=0 then return; end if;
 insert into public.user_xp(user_id,xp_total,level_name) values(p_user_id,0,'Novice') on conflict(user_id) do nothing;
 update public.user_xp set xp_total=xp_total+v_amount,updated_at=now() where user_id=p_user_id returning xp_total into v_new_total;
 v_level:=case when v_new_total>=550000 then 'Legendary' when v_new_total>=250000 then 'Mysterious' when v_new_total>=110000 then 'Shadow' when v_new_total>=60000 then 'Panda General' when v_new_total>=27000 then 'Kung Fu' when v_new_total>=8000 then 'Growing' else 'Novice' end;
 update public.user_xp set level_name=v_level where user_id=p_user_id;
end;
$$;

create or replace function public.award_daily_login_xp()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_ref uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 perform pg_advisory_xact_lock(hashtext(v_uid::text));
 if exists(select 1 from public.user_activity_events where user_id=v_uid and activity_key='daily_login' and created_at>now()-interval '24 hours') then
  return jsonb_build_object('awarded',false,'reason','cooldown');
 end if;
 v_ref:=gen_random_uuid();
 insert into public.user_activity_events(user_id,activity_key,reference_id) values(v_uid,'daily_login',v_ref);
 perform public.award_xp_for_activity(v_uid,'daily_login',v_ref);
 return jsonb_build_object('awarded',true);
end;
$$;
revoke all on function public.award_daily_login_xp() from public,anon;
grant execute on function public.award_daily_login_xp() to authenticated;
