
create table if not exists public.event_blast_deliveries (
 blast_id uuid not null references public.event_blasts(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 notification_id uuid references public.notifications(id) on delete set null,
 delivered_at timestamptz not null default now(),
 primary key(blast_id,recipient_id)
);
alter table public.event_blast_deliveries enable row level security;
drop policy if exists "Users can read event blast deliveries sent to them" on public.event_blast_deliveries;
create policy "Users can read event blast deliveries sent to them" on public.event_blast_deliveries for select to authenticated using ((select auth.uid())=recipient_id);

drop trigger if exists add_event_blast_reach_trigger on public.event_blasts;
drop function if exists public.add_event_blast_reach();

create or replace function public.prepare_event_blast_audience()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
 if new.target_scope not in ('worldwide','country','state','city','area') then raise exception 'Invalid target audience'; end if;
 if new.target_scope in ('country','state','city','area') and coalesce(trim(new.target_country),'')='' then raise exception 'Choose a target country'; end if;
 if new.target_scope in ('state','city','area') and coalesce(trim(new.target_state),'')='' then raise exception 'Choose a target state'; end if;
 if new.target_scope in ('city','area') and coalesce(trim(new.target_city),'')='' then raise exception 'Choose a target city'; end if;
 if new.target_scope='area' and coalesce(trim(new.target_area),'')='' then raise exception 'Choose a target area'; end if;
 select count(*)::integer into v_count from (
  select p.id from public.profiles p
  where p.id<>new.user_id
   and (new.target_scope='worldwide' or lower(coalesce(p.country,''))=lower(coalesce(new.target_country,'')))
   and (new.target_scope not in ('state','city','area') or lower(coalesce(p.state_province,p.state,''))=lower(coalesce(new.target_state,'')))
   and (new.target_scope not in ('city','area') or lower(coalesce(p.city,''))=lower(coalesce(new.target_city,'')))
   and (new.target_scope<>'area' or lower(coalesce(p.area,''))=lower(coalesce(new.target_area,'')))
  limit greatest(0,new.unique_reach)
 ) eligible;
 if v_count=0 then raise exception 'No eligible audience members were found for this Event Blast'; end if;
 new.unique_reach:=v_count;
 new.notification_cap:=v_count;
 return new;
end;
$$;
create trigger prepare_event_blast_audience_trigger before insert on public.event_blasts
for each row execute function public.prepare_event_blast_audience();

create or replace function public.deliver_event_blast_notifications()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_title text; v_creator uuid; v_city text; v_country text; v_delivered integer;
begin
 if new.status<>'active' then return new; end if;
 select e.title,e.creator_id,e.city,e.country into v_title,v_creator,v_city,v_country
 from public.events e where e.id=new.event_id;
 with recipients as (
  select p.id from public.profiles p
  where p.id<>new.user_id
   and (new.target_scope='worldwide' or lower(coalesce(p.country,''))=lower(coalesce(new.target_country,'')))
   and (new.target_scope not in ('state','city','area') or lower(coalesce(p.state_province,p.state,''))=lower(coalesce(new.target_state,'')))
   and (new.target_scope not in ('city','area') or lower(coalesce(p.city,''))=lower(coalesce(new.target_city,'')))
   and (new.target_scope<>'area' or lower(coalesce(p.area,''))=lower(coalesce(new.target_area,'')))
  order by p.id
  limit new.unique_reach
 ), inserted_notifications as (
  insert into public.notifications(user_id,actor_id,notification_type,title,body,target_type,target_id)
  select r.id,v_creator,'event_blast','Event near you: '||left(coalesce(v_title,'Circle Panda event'),140),
         left('An event has been promoted for your area.'||case when coalesce(v_city,'')<>'' then ' '||v_city else '' end||case when coalesce(v_country,'')<>'' then ', '||v_country else '' end,240),
         'event',new.event_id
  from recipients r
  returning id,user_id
 )
 insert into public.event_blast_deliveries(blast_id,recipient_id,notification_id)
 select new.id,n.user_id,n.id from inserted_notifications n
 on conflict(blast_id,recipient_id) do nothing;
 get diagnostics v_delivered=row_count;
 update public.events set reach_count=reach_count+v_delivered where id=new.event_id;
 update public.event_blasts set unique_reach=v_delivered,notification_cap=v_delivered where id=new.id;
 return new;
end;
$$;
create trigger deliver_event_blast_notifications_trigger after insert on public.event_blasts
for each row execute function public.deliver_event_blast_notifications();
