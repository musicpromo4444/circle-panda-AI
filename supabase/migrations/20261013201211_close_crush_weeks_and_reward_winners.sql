
alter table public.crush_posts add column if not exists closed_at timestamptz;
create table if not exists public.crush_week_closures (
 kind text not null check(kind in ('wcw','mcm')),
 week_start date not null,
 closed_at timestamptz not null default now(),
 winner_post_id uuid references public.crush_posts(id) on delete set null,
 primary key(kind,week_start)
);
alter table public.crush_week_closures enable row level security;
insert into public.economy_settings(setting_key,numeric_value)
values('crush_winner_reward',100),('crush_nomination_cost',5)
on conflict(setting_key) do nothing;

create or replace function public.close_crush_week_secure()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_week record; v_post record; v_closure uuid; v_reward bigint; v_winners jsonb:='[]'::jsonb; v_closed integer:=0;
begin
 select coalesce(numeric_value,100) into v_reward from public.economy_settings where setting_key='crush_winner_reward';
 v_reward:=coalesce(v_reward,100);
 for v_week in
  select cp.crush_type as kind,cp.week_start
  from public.crush_posts cp
  where cp.closed_at is null and cp.scheduled_for+interval '7 days'<=now()
  group by cp.crush_type,cp.week_start
 loop
  insert into public.crush_week_closures(kind,week_start)
  values(v_week.kind,v_week.week_start)
  on conflict(kind,week_start) do nothing
  returning kind into v_closure;
  if v_closure is null then continue; end if;
  select cp.id,cp.user_id,coalesce(nullif(p.display_name,''),'Anonymous Panda') as display_name,
         count(cv.id)::bigint as votes
  into v_post
  from public.crush_posts cp
  left join public.crush_votes cv on cv.post_id=cp.id
  left join public.profiles p on p.id=cp.user_id
  where cp.crush_type=v_week.kind and cp.week_start=v_week.week_start
  group by cp.id,cp.user_id,p.display_name,cp.created_at
  order by count(cv.id) desc,cp.created_at asc
  limit 1;
  update public.crush_posts set closed_at=now() where crush_type=v_week.kind and week_start=v_week.week_start;
  if v_post.id is not null then
   insert into public.crush_winners(kind,display_name,user_id,week_start)
   values(v_week.kind,v_post.display_name,v_post.user_id,v_week.week_start)
   on conflict(kind,week_start) do nothing;
   update public.crush_week_closures set winner_post_id=v_post.id where kind=v_week.kind and week_start=v_week.week_start;
   if v_reward>0 and v_post.user_id is not null then
    insert into public.wallet_accounts(user_id,bc_balance) values(v_post.user_id,0) on conflict(user_id) do nothing;
    update public.wallet_accounts set bc_balance=bc_balance+v_reward,updated_at=now() where user_id=v_post.user_id;
    insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
    values(v_post.user_id,'BC',v_reward,'reward:crush_winner',v_post.id);
   end if;
   v_winners:=v_winners||jsonb_build_array(jsonb_build_object('kind',v_week.kind,'name',v_post.display_name,'user_id',v_post.user_id,'votes',v_post.votes,'week_start',v_week.week_start));
  end if;
  v_closed:=v_closed+1;
  v_closure:=null;
 end loop;
 return jsonb_build_object('closed',v_closed>0,'winners',v_winners);
end;
$$;
revoke all on function public.close_crush_week_secure() from public,anon;
grant execute on function public.close_crush_week_secure() to authenticated;
