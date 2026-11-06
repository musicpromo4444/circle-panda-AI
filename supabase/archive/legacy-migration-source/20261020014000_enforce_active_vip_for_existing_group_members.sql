-- Expired VIP users may remain as historical group members, but must not read or
-- send messages in VIP rooms. Standard groups retain the three-member activation gate.
create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then return false; end if;
  return exists (
    select 1 from public.conversation_members cm
    join public.conversations c on c.id=cm.conversation_id
    left join public.chat_groups g on c.conversation_type='group' and g.id=c.context_id
    left join public.profiles p on p.id=auth.uid()
    where cm.conversation_id=p_conversation_id and cm.user_id=auth.uid()
      and (
        c.conversation_type <> 'group'
        or (
          g.id is not null
          and (
            not coalesce(g.is_vip,false)
            or (
              (coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at > now()))
              or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin')
            )
          )
        )
      )
  );
end;
$function$;

create or replace function public.guard_group_chat_open()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
declare
  v_group_id uuid; v_member_count bigint; v_member_role text; v_send_messages boolean := true;
  v_closed_at timestamptz; v_is_vip boolean := false; v_user_vip boolean := false; v_is_admin boolean := false;
begin
  select c.context_id into v_group_id from public.conversations c
  where c.id=new.conversation_id and c.conversation_type='group';
  if v_group_id is null then return new; end if;
  select g.closed_at,coalesce(g.is_vip,false) into v_closed_at,v_is_vip from public.chat_groups g where g.id=v_group_id;
  if v_closed_at is not null then raise exception 'This group has been closed by its owner'; end if;
  if v_is_vip then
    select coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at>now())
      into v_user_vip from public.profiles p where p.id=new.sender_id;
    select exists(select 1 from public.user_roles r where r.user_id=new.sender_id and r.role='admin') into v_is_admin;
    if not coalesce(v_user_vip,false) and not coalesce(v_is_admin,false) then
      raise exception 'Active VIP membership is required to send messages in this room';
    end if;
  end if;
  select count(*) into v_member_count from public.group_members gm where gm.group_id=v_group_id;
  if not coalesce(v_is_vip,false) and v_member_count<3 then raise exception 'This group opens when it has at least 3 members'; end if;
  select gm.role into v_member_role from public.group_members gm where gm.group_id=v_group_id and gm.user_id=new.sender_id;
  if v_member_role is null then raise exception 'Only group members can send messages'; end if;
  select coalesce(gs.send_messages,true) into v_send_messages from public.group_settings gs where gs.group_id=v_group_id;
  if not coalesce(v_send_messages,true) and v_member_role not in ('creator','admin') then raise exception 'Group admins have turned off member messaging'; end if;
  return new;
end;
$function$;
revoke all on function public.guard_group_chat_open() from public, anon, authenticated;
revoke all on function public.is_conversation_member(uuid,uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid,uuid) to authenticated;

drop policy if exists "group members can read authorized group media" on storage.objects;
create policy "group members can read authorized group media"
on storage.objects for select to authenticated
using (
  bucket_id='group-media'
  and exists (
    select 1 from public.group_members gm
    join public.chat_groups g on g.id=gm.group_id
    left join public.profiles p on p.id=auth.uid()
    where gm.user_id=auth.uid()
      and gm.group_id::text=(storage.foldername(objects.name))[2]
      and (
        not coalesce(g.is_vip,false)
        or (
          (coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at>now()))
          or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin')
        )
      )
  )
  and exists (
    select 1 from public.messages m
    join public.conversations c on c.id=m.conversation_id
    where m.media_path=objects.name and c.conversation_type='group'
      and c.context_id::text=(storage.foldername(objects.name))[2]
      and (
        not coalesce(m.view_once,false)
        or exists (
          select 1 from public.group_media_views v
          where v.message_id=m.id and v.user_id=auth.uid() and v.opened_at>now()-interval '30 seconds'
        )
      )
  )
);
