
create table if not exists public.secret_reactions (
 id uuid primary key default gen_random_uuid(),
 secret_id uuid not null references public.feed_posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 reaction text not null,
 created_at timestamptz not null default now(),
 unique(secret_id,user_id),
 check(reaction in ('heart','laugh','wow','angry','panda'))
);
create table if not exists public.secret_comments (
 id uuid primary key default gen_random_uuid(),
 secret_id uuid not null references public.feed_posts(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null,
 created_at timestamptz not null default now()
);
alter table public.secret_reactions enable row level security;
alter table public.secret_comments enable row level security;
drop policy if exists "Signed in users can read confession reactions" on public.secret_reactions;
create policy "Signed in users can read confession reactions" on public.secret_reactions for select to authenticated using (true);
drop policy if exists "Signed in users can read confession comments" on public.secret_comments;
create policy "Signed in users can read confession comments" on public.secret_comments for select to authenticated using (true);

create or replace function public.create_confession(p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))<3 or length(p_body)>2000 then raise exception 'Confession must be between 3 and 2000 characters'; end if;
 insert into public.feed_posts(author_id,post_type,body,is_anonymous) values(v_uid,'confession',trim(p_body),true) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.get_public_confessions(p_limit integer default 50)
returns table(id uuid,body text,is_anonymous boolean,created_at timestamptz,author_id uuid)
language sql stable security definer set search_path = ''
as $$
 select fp.id,fp.body,fp.is_anonymous,fp.created_at,fp.author_id
 from public.feed_posts fp where fp.post_type='confession'
 order by fp.created_at desc limit greatest(1,least(coalesce(p_limit,50),100));
$$;

create or replace function public.toggle_secret_reaction(p_secret_id uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_current text;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_reaction not in ('heart','laugh','wow','angry','panda') then raise exception 'Unsupported reaction'; end if;
 if not exists(select 1 from public.feed_posts where id=p_secret_id and post_type='confession') then raise exception 'Confession not found'; end if;
 select reaction into v_current from public.secret_reactions where secret_id=p_secret_id and user_id=v_uid;
 if v_current=p_reaction then
  delete from public.secret_reactions where secret_id=p_secret_id and user_id=v_uid;
  return jsonb_build_object('active',false);
 end if;
 insert into public.secret_reactions(secret_id,user_id,reaction) values(p_secret_id,v_uid,p_reaction)
 on conflict(secret_id,user_id) do update set reaction=excluded.reaction,created_at=now();
 return jsonb_build_object('active',true,'reaction',p_reaction);
end;
$$;

create or replace function public.add_secret_comment(p_secret_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))<1 or length(p_body)>2000 then raise exception 'Comment must be between 1 and 2000 characters'; end if;
 if not exists(select 1 from public.feed_posts where id=p_secret_id and post_type='confession') then raise exception 'Confession not found'; end if;
 insert into public.secret_comments(secret_id,author_id,body) values(p_secret_id,v_uid,trim(p_body)) returning id into v_id;
 return v_id;
end;
$$;

revoke all on function public.create_confession(text) from public,anon;
grant execute on function public.create_confession(text) to authenticated;
revoke all on function public.get_public_confessions(integer) from public,anon;
grant execute on function public.get_public_confessions(integer) to authenticated;
revoke all on function public.toggle_secret_reaction(uuid,text) from public,anon;
grant execute on function public.toggle_secret_reaction(uuid,text) to authenticated;
revoke all on function public.add_secret_comment(uuid,text) from public,anon;
grant execute on function public.add_secret_comment(uuid,text) to authenticated;
