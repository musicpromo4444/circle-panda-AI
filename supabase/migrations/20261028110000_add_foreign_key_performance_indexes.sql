-- Cover frequently used foreign-key lookups so joins and deletes/updates do not
-- require scans of the referencing tables. Safe to re-run.
create index if not exists idx_admin_audit_log_actor_id on public.admin_audit_log (actor_id);
create index if not exists idx_daily_activity_schedule_activity_key on public.daily_activity_schedule (activity_key);
create index if not exists idx_feed_content_reports_reporter_id on public.feed_content_reports (reporter_id);
create index if not exists idx_hot_seat_bids_bidder_id on public.hot_seat_bids (bidder_id);
create index if not exists idx_hot_seat_comments_user_id on public.hot_seat_comments (user_id);
create index if not exists idx_hot_seat_follows_follower_id on public.hot_seat_follows (follower_id);
create index if not exists idx_hot_seat_gift_transactions_gift_id on public.hot_seat_gift_transactions (gift_id);
create index if not exists idx_hot_seat_gift_transactions_host_id on public.hot_seat_gift_transactions (host_id);
create index if not exists idx_hot_seat_gift_transactions_sender_id on public.hot_seat_gift_transactions (sender_id);
create index if not exists idx_hot_seat_giveaway_entries_user_id on public.hot_seat_giveaway_entries (user_id);
create index if not exists idx_hot_seat_giveaways_host_id on public.hot_seat_giveaways (host_id);
create index if not exists idx_hot_seat_giveaways_winner_id on public.hot_seat_giveaways (winner_id);
create index if not exists idx_hot_seat_poll_votes_user_id on public.hot_seat_poll_votes (user_id);
create index if not exists idx_hot_seat_polls_host_id on public.hot_seat_polls (host_id);
create index if not exists idx_hot_seat_questions_asker_id on public.hot_seat_questions (asker_id);
create index if not exists idx_hot_seat_reactions_user_id on public.hot_seat_reactions (user_id);
create index if not exists idx_hot_seat_sessions_host_id on public.hot_seat_sessions (host_id);
create index if not exists idx_hot_seat_sessions_winning_bid_id on public.hot_seat_sessions (winning_bid_id);
create index if not exists idx_hot_seat_settings_updated_by on public.hot_seat_settings (updated_by);
create index if not exists idx_moderation_reviews_reviewed_by on public.moderation_reviews (reviewed_by);
create index if not exists idx_user_daily_activity_attempts_activity_key on public.user_daily_activity_attempts (activity_key);
create index if not exists idx_user_daily_activity_completions_activity_key on public.user_daily_activity_completions (activity_key);