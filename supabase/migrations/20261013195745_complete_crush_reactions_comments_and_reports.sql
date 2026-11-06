
alter table public.crush_comments
 add column if not exists nominee_id uuid,
 add column if not exists attachment_url text,
 add column if not exists attachment_type text;
update public.crush_comments set nominee_id=post_id where nominee_id is null;

create or replace function public.sync_crush_comment_post_id()
returns trigger language plpgsql set search_path = ''
as $$
begin
 if new.post_id is null then new.post_id:=new.nominee_id; end if;
 if new.nominee_id is null then new.nominee_id:=new.post_id; end if;
 return new;
end;
$$;
drop trigger if exists sync_crush_comment_post_id_trigger on public.crush_comments;
create trigger sync_crush_comment_post_id_trigger before insert or update on public.crush_comments
for each row execute function public.sync_crush_comment_post_id();

create table if not exists public.crush_reports (
 id uuid primary key default gen_random_uuid(),
 nominee_id uuid not null references public.crush_posts(id) on delete cascade,
 reporter_id uuid not null references public.profiles(id) on delete cascade,
 reason text not null,
 details text,
 created_at timestamptz not null default now(),
 unique(nominee_id,reporter_id)
);
alter table public.crush_reports enable row level security;

create or replace function public.get_crush_reactions(p_nominee_id uuid)
returns table(reaction text,reaction_count bigint,mine boolean)
language sql stable security definer set search_path = ''
as $$
 select cr.reaction,count(*)::bigint,(bool_or(cr.user_id=auth.uid())) as mine
 from public.crush_reactions cr
 where cr.post_id=p_nominee_id
 group by cr.reaction
 order by cr.reaction;
$$;

create or replace function public.react_to_crush_secure(p_nominee_id uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_reaction not in ('❤️','😂','😮','😡','🐼','heart','laugh','wow','angry','panda') then raise exception 'Unsupported reaction'; end if;
 if not exists(select 1 from public.crush_posts cp where cp.id=p_nominee_id and cp.user_id<>v_uid and cp.scheduled_for<=now()) then
   raise exception 'You can react only to another Panda''s live crush card';
 end if;
 delete from public.crush_reactions where post_id=p_nominee_id and user_id=v_uid;
 insert into public.crush_reactions(post_id,user_id,reaction) values(p_nominee_id,v_uid,p_reaction);
 return jsonb_build_object('success',true);
end;
$$;

create or replace function public.add_crush_comment_secure(
 p_nominee_id uuid,p_body text,p_attachment_url text default null,p_attachment_type text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))=0 and p_attachment_url is null then raise exception 'Write a comment first'; end if;
 if not exists(select 1 from public.crush_posts cp where cp.id=p_nominee_id and cp.user_id<>v_uid and cp.scheduled_for<=now()) then
   raise exception 'You can comment only on another Panda''s live crush card';
 end if;
 insert into public.crush_comments(post_id,nominee_id,user_id,body,attachment_url,attachment_type)
 values(p_nominee_id,p_nominee_id,v_uid,left(coalesce(p_body,''),2000),p_attachment_url,p_attachment_type)
 returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.delete_crush_submission(p_nominee_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_deleted integer;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 delete from public.crush_posts where id=p_nominee_id and user_id=auth.uid();
 get diagnostics v_deleted=row_count;
 if v_deleted=0 then raise exception 'You can delete only your own crush submission'; end if;
 return jsonb_build_object('success',true);
end;
$$;

create or replace function public.report_crush_secure(p_nominee_id uuid,p_reason text,p_details text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.crush_posts where id=p_nominee_id) then raise exception 'Crush card not found'; end if;
 if coalesce(trim(p_reason),'')='' then raise exception 'Choose a reason for the report'; end if;
 insert into public.crush_reports(nominee_id,reporter_id,reason,details)
 values(p_nominee_id,auth.uid(),left(trim(p_reason),120),left(coalesce(p_details,''),2000))
 on conflict(nominee_id,reporter_id) do update set reason=excluded.reason,details=excluded.details;
 return jsonb_build_object('success',true);
end;
$$;

revoke all on function public.get_crush_reactions(uuid) from public,anon;
grant execute on function public.get_crush_reactions(uuid) to authenticated;
revoke all on function public.react_to_crush_secure(uuid,text) from public,anon;
grant execute on function public.react_to_crush_secure(uuid,text) to authenticated;
revoke all on function public.add_crush_comment_secure(uuid,text,text,text) from public,anon;
grant execute on function public.add_crush_comment_secure(uuid,text,text,text) to authenticated;
revoke all on function public.delete_crush_submission(uuid) from public,anon;
grant execute on function public.delete_crush_submission(uuid) to authenticated;
revoke all on function public.report_crush_secure(uuid,text,text) from public,anon;
grant execute on function public.report_crush_secure(uuid,text,text) to authenticated;
