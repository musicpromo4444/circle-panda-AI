
alter table public.crush_posts
 add column if not exists media_url text,
 add column if not exists media_type text not null default 'image',
 add column if not exists emoji text not null default '🐼';

create or replace function public.get_my_profile_gender()
returns text language sql stable security definer set search_path = ''
as $$ select gender from public.profiles where id=auth.uid() limit 1; $$;

create or replace function public.set_profile_gender_secure(p_gender text)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_gender text;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if lower(coalesce(p_gender,'')) not in ('male','female') then raise exception 'Choose male or female'; end if;
 select gender into v_gender from public.profiles where id=auth.uid() for update;
 if v_gender is not null and v_gender<>'' and lower(v_gender)<>lower(p_gender) then
   raise exception 'Account gender is locked after it has been set';
 end if;
 update public.profiles set gender=lower(p_gender),updated_at=now() where id=auth.uid();
 return lower(p_gender);
end;
$$;

create or replace function public.submit_crush_media_secure(
 p_media_url text,p_media_type text,p_caption text default '',p_emoji text default '🐼'
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_gender text; v_kind text; v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if coalesce(trim(p_media_url),'')='' then raise exception 'Choose a photo or video first'; end if;
 if coalesce(p_media_type,'image') not in ('image','video') then raise exception 'Unsupported media type'; end if;
 select gender into v_gender from public.profiles where id=v_uid;
 if lower(coalesce(v_gender,'')) not in ('male','female') then raise exception 'Set your account gender before uploading WCW/MCM'; end if;
 v_kind:=case when lower(v_gender)='male' then 'mcm' else 'wcw' end;
 if exists(select 1 from public.crush_posts where user_id=v_uid and crush_type=v_kind and week_start >= date_trunc('week',now())::date) then
   raise exception 'You already have a scheduled entry for this WCW/MCM week';
 end if;
 insert into public.crush_posts(user_id,crush_type,caption,image_path,media_url,media_type,emoji)
 values(v_uid,v_kind,left(coalesce(p_caption,''),500),p_media_url,p_media_url,p_media_type,coalesce(nullif(p_emoji,''),'🐼'))
 returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.get_wcw_mcm_current_week()
returns table(id uuid,kind text,display_name text,emoji text,media_url text,media_type text,vote_count bigint,reaction_count bigint)
language sql stable security definer set search_path = ''
as $$
 select cp.id,cp.crush_type,coalesce(nullif(p.display_name,''),'Anonymous Panda'),
        coalesce(cp.emoji,'🐼'),coalesce(cp.media_url,cp.image_path),coalesce(cp.media_type,'image'),
        (select count(*) from public.crush_votes cv where cv.post_id=cp.id),
        (select count(*) from public.crush_reactions cr where cr.post_id=cp.id)
 from public.crush_posts cp
 left join public.profiles p on p.id=cp.user_id
 where cp.scheduled_for >= date_trunc('week',now())-interval '7 days'
   and cp.scheduled_for < date_trunc('week',now())+interval '14 days'
 order by cp.scheduled_for desc,cp.created_at desc;
$$;

create or replace function public.cast_crush_vote_secure(p_post_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select public.cast_crush_vote(p_post_id); $$;

create or replace function public.get_crush_vote_status_secure()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_used integer;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 select count(*)::integer into v_used from public.crush_votes
 where user_id=auth.uid() and created_at>=date_trunc('week',now()) and created_at<date_trunc('week',now())+interval '7 days';
 return jsonb_build_object('free_votes_used',coalesce(v_used,0),'free_votes_remaining',greatest(0,3-coalesce(v_used,0)));
end;
$$;

revoke all on function public.get_my_profile_gender() from public,anon;
grant execute on function public.get_my_profile_gender() to authenticated;
revoke all on function public.set_profile_gender_secure(text) from public,anon;
grant execute on function public.set_profile_gender_secure(text) to authenticated;
revoke all on function public.submit_crush_media_secure(text,text,text,text) from public,anon;
grant execute on function public.submit_crush_media_secure(text,text,text,text) to authenticated;
revoke all on function public.get_wcw_mcm_current_week() from public,anon;
grant execute on function public.get_wcw_mcm_current_week() to authenticated;
revoke all on function public.cast_crush_vote_secure(uuid) from public,anon;
grant execute on function public.cast_crush_vote_secure(uuid) to authenticated;
revoke all on function public.get_crush_vote_status_secure() from public,anon;
grant execute on function public.get_crush_vote_status_secure() to authenticated;
