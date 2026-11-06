-- Remove the redundant unique index; the table's UNIQUE(message_id, user_id)
-- constraint already provides the same index and enforces one reaction per user.
DROP INDEX IF EXISTS public.group_message_reactions_one_per_user_idx;
