-- Respect group_settings.edit_group_info when members update group name/description.
create or replace function public.update_group_details_secure(p_group_id uuid, p_name text, p_description text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_edit_mode text := 'admins';
begin
  if v_uid is null then
    raise exception 'Sign in is required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 100 then
    raise exception 'Group name must be between 2 and 100 characters';
  end if;
  if length(coalesce(p_description,'')) > 2000 then
    raise exception 'Group description must be 2000 characters or fewer';
  end if;

  select gm.role into v_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid;

  if v_role is null then
    raise exception 'Join the group before editing its details';
  end if;

  select coalesce(gs.edit_group_info,'admins') into v_edit_mode
  from public.group_settings gs
  where gs.group_id = p_group_id;

  if coalesce(v_edit_mode,'admins') = 'admins' and v_role not in ('creator','admin') then
    raise exception 'Only group admins can edit group details';
  end if;

  update public.chat_groups
  set name = trim(p_name), description = trim(coalesce(p_description,''))
  where id = p_group_id and closed_at is null;

  if not found then
    raise exception 'Group not found or already closed';
  end if;

  return true;
end;
$function$;

revoke all on function public.update_group_details_secure(uuid,text,text) from public, anon;
grant execute on function public.update_group_details_secure(uuid,text,text) to authenticated;
