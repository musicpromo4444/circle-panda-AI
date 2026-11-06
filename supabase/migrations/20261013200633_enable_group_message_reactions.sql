
create unique index if not exists group_message_reactions_one_per_user_idx on public.group_message_reactions(message_id,user_id);

create or replace function public.toggle_group_message_reaction(p_message_id uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_group_id uuid; v_current text;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_reaction not in ('❤️','😂','😮','😡','🐼','heart','laugh','wow','angry','panda') then raise exception 'Unsupported reaction'; end if;
 select c.context_id into v_group_id from public.messages m join public.conversations c on c.id=m.conversation_id
 where m.id=p_message_id and c.conversation_type='group';
 if v_group_id is null or not exists(select 1 from public.group_members where group_id=v_group_id and user_id=v_uid) then
  raise exception 'Join this group to react to messages';
 end if;
 select reaction into v_current from public.group_message_reactions where message_id=p_message_id and user_id=v_uid;
 if v_current=p_reaction then
  delete from public.group_message_reactions where message_id=p_message_id and user_id=v_uid;
  return jsonb_build_object('active',false,'reaction',p_reaction);
 end if;
 insert into public.group_message_reactions(message_id,user_id,reaction) values(p_message_id,v_uid,p_reaction)
 on conflict(message_id,user_id) do update set reaction=excluded.reaction,created_at=now();
 return jsonb_build_object('active',true,'reaction',p_reaction);
end;
$$;
revoke all on function public.toggle_group_message_reaction(uuid,text) from public,anon;
grant execute on function public.toggle_group_message_reaction(uuid,text) to authenticated;
