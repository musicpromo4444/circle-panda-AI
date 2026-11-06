DO $$
DECLARE
  fk record;
  column_list text;
BEGIN
  FOR fk IN
    SELECT c.conname, ns.nspname AS schema_name, tbl.relname AS table_name,
           array_agg(att.attname ORDER BY key_col.ordinality) AS column_names
    FROM pg_constraint c
    JOIN pg_class tbl ON tbl.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS key_col(attnum, ordinality)
    JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = key_col.attnum
    WHERE c.contype = 'f'
      AND ns.nspname = 'public'
      AND c.conname IN ('chat_groups_creator_id_fkey', 'conversation_members_user_id_fkey', 'conversations_created_by_fkey', 'crush_comments_user_id_fkey', 'crush_reactions_user_id_fkey', 'crush_reports_reporter_id_fkey', 'crush_week_closures_winner_post_id_fkey', 'crush_winners_user_id_fkey', 'dating_matches_thread_id_fkey', 'dating_requests_sender_id_fkey', 'economy_settings_updated_by_fkey', 'event_attendees_user_id_fkey', 'event_blast_deliveries_notification_id_fkey', 'event_blast_deliveries_recipient_id_fkey', 'events_creator_id_fkey', 'group_eviction_requests_requested_by_fkey', 'group_eviction_requests_target_user_id_fkey', 'group_eviction_votes_voter_id_fkey', 'group_join_requests_responded_by_fkey', 'group_join_requests_user_id_fkey', 'group_media_views_user_id_fkey', 'group_members_user_id_fkey', 'group_message_reactions_user_id_fkey', 'group_messages_sender_id_fkey', 'group_user_reports_group_id_fkey', 'group_user_reports_reported_user_id_fkey', 'group_user_reports_reporter_id_fkey', 'message_requests_conversation_id_fkey', 'message_requests_sender_id_fkey', 'notifications_actor_id_fkey', 'post_comments_author_id_fkey', 'post_reactions_user_id_fkey', 'secret_comments_author_id_fkey', 'secret_comments_secret_id_fkey', 'secret_reactions_user_id_fkey', 'sponsor_campaign_events_user_id_fkey', 'sponsor_campaigns_created_by_fkey', 'user_blocks_blocked_id_fkey', 'vip_private_call_candidates_sender_id_fkey', 'vip_private_calls_caller_id_fkey', 'vip_private_calls_thread_id_fkey', 'wallet_transactions_user_id_fkey')
    GROUP BY c.conname, ns.nspname, tbl.relname
  LOOP
    SELECT string_agg(format('%I', col), ', ')
      INTO column_list
      FROM unnest(fk.column_names) AS col;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      left('idx_' || fk.conname, 60),
      fk.schema_name,
      fk.table_name,
      column_list
    );
  END LOOP;
END $$;
