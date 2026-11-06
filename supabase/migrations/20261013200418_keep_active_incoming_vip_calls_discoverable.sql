
create or replace function public.get_my_incoming_vip_calls()
returns table(id uuid,thread_id uuid,caller_id uuid,call_type text,status text,created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
 select c.id,c.thread_id,c.caller_id,c.call_type,c.status,c.created_at
 from public.vip_private_calls c
 where c.recipient_id=auth.uid() and c.status in ('ringing','active')
 and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_vip=true and (p.vip_expires_at is null or p.vip_expires_at>now()))
 order by c.created_at desc limit 5;
$$;
