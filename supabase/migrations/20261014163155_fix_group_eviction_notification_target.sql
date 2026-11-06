create or replace function public.vote_group_eviction(p_request_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_req public.group_eviction_requests%rowtype; v_yes integer; v_no integer; v_conversation uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select * into v_req from public.group_eviction_requests where id=p_request_id for update;
 if not found then raise exception 'Removal request not found'; end if;
 if v_req.status<>'pending' then raise exception 'This removal vote is already closed'; end if;
 if v_uid=v_req.target_user_id then raise exception 'You cannot vote on your own removal'; end if;
 if not exists(select 1 from public.group_members where group_id=v_req.group_id and user_id=v_uid) then raise exception 'Only group members can vote'; end if;
 insert into public.group_eviction_votes(request_id,voter_id,approve) values(p_request_id,v_uid,p_approve);
 select count(*) filter(where approve),count(*) filter(where not approve) into v_yes,v_no from public.group_eviction_votes where request_id=p_request_id;
 if v_yes>=3 then
   select id into v_conversation from public.conversations where conversation_type='group' and context_id=v_req.group_id limit 1;
   delete from public.group_members where group_id=v_req.group_id and user_id=v_req.target_user_id;
   if v_conversation is not null then delete from public.conversation_members where conversation_id=v_conversation and user_id=v_req.target_user_id; end if;
   update public.group_eviction_requests set status='approved',resolved_at=now() where id=p_request_id;
   insert into public.notifications(user_id,notification_type,title,body,target_type,target_id)
   values(v_req.target_user_id,'group_eviction','Group membership ended','Three group members approved your removal from a group.','group',v_req.group_id);
 elsif v_no>=3 then
   update public.group_eviction_requests set status='rejected',resolved_at=now() where id=p_request_id;
 end if;
 return jsonb_build_object('status',case when v_yes>=3 then 'approved' when v_no>=3 then 'rejected' else 'pending' end,'approvals',v_yes,'rejections',v_no);
end;
$$;
revoke all on function public.vote_group_eviction(uuid,boolean) from public;
grant execute on function public.vote_group_eviction(uuid,boolean) to authenticated;
