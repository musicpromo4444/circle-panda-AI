
create or replace view public.groups with (security_invoker=true) as
 select id,name,coalesce(about,description,'') as topic,creator_id,created_at,is_vip,vip_scope,country_restriction
 from public.chat_groups;
grant select on public.groups to authenticated;

create or replace view public.dm_threads with (security_invoker=true) as
 select c.id,
        least(cm1.user_id,cm2.user_id) as user_a,
        greatest(cm1.user_id,cm2.user_id) as user_b,
        case when exists(select 1 from public.dating_matches dm where dm.thread_id=c.id and dm.status='matched') then 'matched' else 'active' end as status,
        c.created_at,
        greatest(c.created_at,coalesce(max(m.created_at),c.created_at)) as updated_at
 from public.conversations c
 join public.conversation_members cm1 on cm1.conversation_id=c.id
 join public.conversation_members cm2 on cm2.conversation_id=c.id and cm2.user_id<>cm1.user_id
 left join public.messages m on m.conversation_id=c.id
 where c.conversation_type in ('direct','dating')
 group by c.id,c.created_at,cm1.user_id,cm2.user_id
 having cm1.user_id < cm2.user_id;
grant select on public.dm_threads to authenticated;

create or replace view public.dm_messages with (security_invoker=true) as
 select id,conversation_id as thread_id,sender_id,body,created_at,media_type,media_path
 from public.messages m
 where exists(select 1 from public.conversation_members cm where cm.conversation_id=m.conversation_id and cm.user_id=(select auth.uid()));
grant select on public.dm_messages to authenticated;

create or replace view public.dm_requests with (security_invoker=true) as
 select id,sender_id,recipient_id,source_type as context_type,source_id as context_id,
 case source_type when 'dating' then 'Dating 💌' when 'event' then 'Event' when 'group' then 'Group' when 'wcw' then 'WCW' when 'mcm' then 'MCM' when 'confession' then 'Confession' when 'feed' then 'Feed' else 'Message Request' end as source_label,
 created_at,status,responded_at,conversation_id as thread_id,greeting as message
 from public.message_requests;
grant select on public.dm_requests to authenticated;
