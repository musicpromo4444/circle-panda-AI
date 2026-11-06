
create or replace function public.get_crush_results(p_week_start date)
returns table(nominee_id uuid,display_name text,kind text,emoji text,blurb text,vote_count bigint,media_url text,media_type text,mine boolean)
language sql stable security definer set search_path = ''
as $$
 select cp.id,coalesce(nullif(p.display_name,''),'Anonymous Panda'),cp.crush_type,
        coalesce(cp.emoji,'🐼'),coalesce(cp.caption,''),(select count(*) from public.crush_votes cv where cv.post_id=cp.id),
        coalesce(cp.media_url,cp.image_path),coalesce(cp.media_type,'image'),cp.user_id=auth.uid()
 from public.crush_posts cp left join public.profiles p on p.id=cp.user_id
 where cp.week_start=p_week_start and cp.scheduled_for<=now()
 order by (select count(*) from public.crush_votes cv where cv.post_id=cp.id) desc,cp.created_at asc;
$$;

drop function if exists public.cast_crush_vote_secure(uuid);
create function public.cast_crush_vote_secure(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_used integer; v_limit integer;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if exists(select 1 from public.crush_votes where post_id=p_post_id and user_id=v_uid) then
  return jsonb_build_object('voted',true,'already_voted',true);
 end if;
 select coalesce(numeric_value,3)::integer into v_limit from public.economy_settings where setting_key='weekly_free_votes';
 v_limit:=coalesce(v_limit,3);
 select count(*)::integer into v_used from public.crush_votes
 where user_id=v_uid and created_at>=date_trunc('week',now()) and created_at<date_trunc('week',now())+interval '7 days';
 if v_used>=v_limit then raise exception 'FREE_VOTES_EXHAUSTED'; end if;
 return public.cast_crush_vote(p_post_id);
end;
$$;

create or replace function public.cast_crush_vote_paid_secure(p_nominee_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_used integer; v_limit integer; v_cost bigint; v_balance bigint;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if exists(select 1 from public.crush_votes where post_id=p_nominee_id and user_id=v_uid) then
  return jsonb_build_object('voted',true,'already_voted',true,'charged_bc',0);
 end if;
 if not exists(select 1 from public.crush_posts where id=p_nominee_id and user_id<>v_uid and scheduled_for<=now()) then
  raise exception 'You can vote only for another Panda''s live crush card';
 end if;
 select coalesce(numeric_value,3)::integer into v_limit from public.economy_settings where setting_key='weekly_free_votes';
 v_limit:=coalesce(v_limit,3);
 select count(*)::integer into v_used from public.crush_votes
 where user_id=v_uid and created_at>=date_trunc('week',now()) and created_at<date_trunc('week',now())+interval '7 days';
 if v_used<v_limit then raise exception 'Use your free weekly votes before buying an extra vote'; end if;
 select coalesce(numeric_value,50) into v_cost from public.economy_settings where setting_key='extra_vote_cost';
 v_cost:=coalesce(v_cost,50);
 insert into public.wallet_accounts(user_id,bc_balance) values(v_uid,0) on conflict(user_id) do nothing;
 select bc_balance into v_balance from public.wallet_accounts where user_id=v_uid for update;
 if coalesce(v_balance,0)<v_cost then raise exception 'Not enough BC for an extra vote'; end if;
 update public.wallet_accounts set bc_balance=bc_balance-v_cost,updated_at=now() where user_id=v_uid;
 insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
 values(v_uid,'BC',-v_cost,'crush:extra_vote',p_nominee_id);
 insert into public.crush_votes(post_id,user_id) values(p_nominee_id,v_uid);
 perform public.award_xp_for_activity(v_uid,'wcw_vote',p_nominee_id);
 return jsonb_build_object('voted',true,'charged_bc',v_cost,'balance',v_balance-v_cost);
end;
$$;
revoke all on function public.get_crush_results(date) from public,anon;
grant execute on function public.get_crush_results(date) to authenticated;
revoke all on function public.cast_crush_vote_secure(uuid) from public,anon;
grant execute on function public.cast_crush_vote_secure(uuid) to authenticated;
revoke all on function public.cast_crush_vote_paid_secure(uuid) from public,anon;
grant execute on function public.cast_crush_vote_paid_secure(uuid) to authenticated;
