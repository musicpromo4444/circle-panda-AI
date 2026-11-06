
create table if not exists public.group_user_reports (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.chat_groups(id) on delete cascade,
 reporter_id uuid not null references public.profiles(id) on delete cascade,
 reported_user_id uuid not null references public.profiles(id) on delete cascade,
 reason text not null,
 details text,
 created_at timestamptz not null default now(),
 check(reporter_id<>reported_user_id)
);
alter table public.group_user_reports enable row level security;
drop policy if exists "Users can read reports they filed" on public.group_user_reports;
create policy "Users can read reports they filed" on public.group_user_reports for select to authenticated using ((select auth.uid())=reporter_id);

create or replace function public.close_group(p_group_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 update public.chat_groups set closed_at=coalesce(closed_at,now()) where id=p_group_id and creator_id=auth.uid();
 if not found then raise exception 'Only the group creator can close this group'; end if;
 return true;
end;
$$;

create or replace function public.report_group_user_secure(p_group_id uuid,p_user_id uuid,p_reason text default 'other')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_user_id is null or p_user_id=v_uid then raise exception 'You cannot report yourself'; end if;
 if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=v_uid) then raise exception 'Join the group to report a member'; end if;
 if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id) then raise exception 'That user is not a member of this group'; end if;
 insert into public.group_user_reports(group_id,reporter_id,reported_user_id,reason)
 values(p_group_id,v_uid,p_user_id,left(coalesce(nullif(trim(p_reason),''),'other'),120));
 return jsonb_build_object('success',true);
end;
$$;
revoke all on function public.close_group(uuid) from public,anon;
grant execute on function public.close_group(uuid) to authenticated;
revoke all on function public.report_group_user_secure(uuid,uuid,text) from public,anon;
grant execute on function public.report_group_user_secure(uuid,uuid,text) to authenticated;
