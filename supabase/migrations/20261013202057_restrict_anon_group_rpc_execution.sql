REVOKE EXECUTE ON FUNCTION public.review_group_join_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_group_message(uuid, text, text, text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_group_join_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_group_message(uuid, text, text, text, uuid, boolean, text) TO authenticated;
