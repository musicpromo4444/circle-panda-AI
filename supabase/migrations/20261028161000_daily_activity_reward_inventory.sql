create table if not exists public.user_activity_rewards(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid references public.daily_activity_campaigns(id) on delete set null,
 reward_type text not null check(reward_type in ('BC','WC','gift','icon','badge')), reward_amount bigint not null default 0,
 reward_label text not null default '', created_at timestamptz not null default now()
);
alter table public.user_activity_rewards enable row level security;
drop policy if exists "Users can view own activity rewards" on public.user_activity_rewards;
create policy "Users can view own activity rewards" on public.user_activity_rewards for select to authenticated
using(user_id=auth.uid() or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'));
revoke all on public.user_activity_rewards from anon,authenticated;
grant select on public.user_activity_rewards to authenticated;

create or replace function public.admin_draw_daily_activity_campaign(p_campaign_id uuid) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.daily_activity_campaigns; chosen uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into c from public.daily_activity_campaigns where id=p_campaign_id for update;
 if not found or c.status not in ('open','closed') then raise exception 'This activity cannot be drawn'; end if;
 select e.user_id into chosen from public.daily_activity_campaign_entries e where e.campaign_id=c.id order by random() limit 1;
 if chosen is null then raise exception 'No entries yet'; end if;
 if c.prize_type in ('BC','WC') and c.prize_amount>0 then
   insert into public.wallet_accounts(user_id,bc_balance,wc_balance) values(chosen,0,0) on conflict(user_id) do nothing;
   if c.prize_type='BC' then update public.wallet_accounts set bc_balance=bc_balance+c.prize_amount,updated_at=now() where user_id=chosen;
   else update public.wallet_accounts set wc_balance=wc_balance+c.prize_amount,updated_at=now() where user_id=chosen; end if;
   insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(chosen,c.prize_type,c.prize_amount,'activity_campaign_prize:'||c.id::text,c.id);
 end if;
 insert into public.user_activity_rewards(user_id,campaign_id,reward_type,reward_amount,reward_label)
 values(chosen,c.id,c.prize_type,c.prize_amount,coalesce(nullif(c.prize_label,''),c.title));
 update public.daily_activity_campaigns set status='drawn',winner_id=chosen,drawn_at=now(),updated_at=now() where id=c.id;
 return jsonb_build_object('campaign_id',c.id,'winner_id',chosen,'prize_type',c.prize_type,'prize_amount',c.prize_amount,'prize_label',c.prize_label);
end $$;
revoke all on function public.admin_draw_daily_activity_campaign(uuid) from public,anon;
grant execute on function public.admin_draw_daily_activity_campaign(uuid) to authenticated;
