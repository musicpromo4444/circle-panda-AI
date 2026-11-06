-- Restrict Hot Seat SECURITY DEFINER RPCs to signed-in users.
-- These functions operate on sessions, gifts, questions, polls, bids, and BC balances.
-- Anonymous callers must not be able to invoke them through PostgREST.
REVOKE EXECUTE ON FUNCTION public.hot_seat_admin_set_activity(text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_admin_update_gift(text, bigint, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_admin_update_setting(text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_answer_question(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_ask_question(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_bootstrap() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_close_poll(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_create_giveaway(uuid, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_create_poll(uuid, text, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_decide_bid(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_draw_giveaway(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_end_session(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_enter_giveaway(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_pause_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_place_bid(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_resume_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_send_gift(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_set_stream(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_start_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_sync_lifecycle() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_sync_pause() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_toggle_follow(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_toggle_reaction(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hot_seat_vote_poll(uuid, integer) FROM PUBLIC, anon;
