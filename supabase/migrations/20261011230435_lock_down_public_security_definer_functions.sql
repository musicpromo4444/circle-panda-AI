begin;

-- SECURITY DEFINER routines must not be callable through PostgREST by anonymous users.
revoke execute on function public.award_xp_for_activity(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.charge_message_wallet() from public, anon, authenticated;
revoke execute on function public.claim_economy_reward(text) from public, anon, authenticated;
revoke execute on function public.claim_economy_reward_internal(text) from public, anon, authenticated;
revoke execute on function public.create_chat_group(text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.enforce_published_dating_age() from public, anon, authenticated;
revoke execute on function public.get_my_date_of_birth() from public, anon, authenticated;
revoke execute on function public.guard_group_chat_open() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_conversation_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.join_chat_group(uuid) from public, anon, authenticated;
revoke execute on function public.log_activity_and_reward() from public, anon, authenticated;
revoke execute on function public.open_group_chat(uuid) from public, anon, authenticated;
revoke execute on function public.respond_message_request(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.send_message_request(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.send_post_message_request(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_economy_setting(text, bigint) from public, anon, authenticated;
revoke execute on function public.sync_group_member_to_conversation() from public, anon, authenticated;
revoke execute on function public.validate_message_request_source() from public, anon, authenticated;

-- Explicitly grant only the user-facing RPCs to signed-in users.
grant execute on function public.create_chat_group(text, text, text, boolean) to authenticated;
grant execute on function public.get_my_date_of_birth() to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.join_chat_group(uuid) to authenticated;
grant execute on function public.open_group_chat(uuid) to authenticated;
grant execute on function public.respond_message_request(uuid, boolean) to authenticated;
grant execute on function public.send_message_request(uuid, text, uuid, text) to authenticated;
grant execute on function public.send_post_message_request(uuid, text) to authenticated;
grant execute on function public.set_economy_setting(text, bigint) to authenticated;
grant execute on function public.claim_economy_reward(text) to authenticated;

-- Make the public feed view obey the querying user's RLS policies.
alter view public.feed_posts_public set (security_invoker = true);

commit;
