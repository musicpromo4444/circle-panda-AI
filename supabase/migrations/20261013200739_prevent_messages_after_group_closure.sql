
create or replace function public.enforce_group_not_closed_on_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_group uuid; v_closed timestamptz;
begin
 select c.context_id into v_group from public.conversations c where c.id=new.conversation_id and c.conversation_type='group';
 if v_group is not null then
  select closed_at into v_closed from public.chat_groups where id=v_group;
  if v_closed is not null then raise exception 'This group has been closed by its owner'; end if;
 end if;
 return new;
end;
$$;
drop trigger if exists enforce_group_not_closed_on_message_trigger on public.messages;
create trigger enforce_group_not_closed_on_message_trigger before insert on public.messages
for each row execute function public.enforce_group_not_closed_on_message();
