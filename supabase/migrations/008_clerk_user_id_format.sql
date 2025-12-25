-- Migration 008: Change user ID from UUID to TEXT for Clerk compatibility
-- Description: Clerk uses string IDs like "user_xxxxx" instead of UUIDs
-- Date: 2024-12-25
--
-- IMPORTANT: This is a breaking migration. Backup your database before running.
-- Existing UUID-based user IDs will need to be migrated or users will need to re-register.

-- =====================================================
-- Step 1: Drop foreign key constraints
-- =====================================================

-- Drop FK on subscriptions.user_id
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;

-- Drop FK on chatbots.user_id
ALTER TABLE public.chatbots DROP CONSTRAINT IF EXISTS chatbots_user_id_fkey;

-- =====================================================
-- Step 2: Alter column types from UUID to TEXT
-- =====================================================

-- Change users.id from UUID to TEXT
ALTER TABLE public.users ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- Change subscriptions.user_id from UUID to TEXT
ALTER TABLE public.subscriptions ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Change chatbots.user_id from UUID to TEXT
ALTER TABLE public.chatbots ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- =====================================================
-- Step 3: Recreate foreign key constraints
-- =====================================================

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.chatbots
  ADD CONSTRAINT chatbots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- =====================================================
-- Step 4: Update functions to use TEXT instead of UUID
-- =====================================================

-- 4.1 Fix increment_usage function
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id TEXT,
  p_field TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET
    usage = jsonb_set(
      usage,
      ARRAY[p_field],
      to_jsonb((usage->>p_field)::int + 1)
    ),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Insert default subscription if not exists
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (user_id, usage)
    VALUES (
      p_user_id,
      CASE
        WHEN p_field = 'messages_count' THEN '{"messages_count": 1, "chatbots_count": 0}'::jsonb
        ELSE '{"messages_count": 0, "chatbots_count": 1}'::jsonb
      END
    )
    ON CONFLICT (user_id) DO UPDATE SET
      usage = jsonb_set(
        public.subscriptions.usage,
        ARRAY[p_field],
        to_jsonb((public.subscriptions.usage->>p_field)::int + 1)
      ),
      updated_at = NOW();
  END IF;
END;
$$;

-- 4.2 Fix reset_usage function
CREATE OR REPLACE FUNCTION public.reset_usage(p_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET
    usage = '{"messages_count": 0, "chatbots_count": 0}'::jsonb,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- 4.3 Fix get_conversation_stats function
CREATE OR REPLACE FUNCTION public.get_conversation_stats(
  p_user_id TEXT,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  date DATE,
  conversation_count BIGINT,
  message_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_chatbots AS (
    SELECT id FROM public.chatbots WHERE user_id = p_user_id
  ),
  daily_stats AS (
    SELECT
      DATE(c.created_at) as stat_date,
      COUNT(DISTINCT c.id) as convos,
      SUM(jsonb_array_length(c.messages)) as msgs
    FROM public.conversations c
    JOIN user_chatbots uc ON c.chatbot_id = uc.id
    WHERE c.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE(c.created_at)
  ),
  date_series AS (
    SELECT generate_series(
      (NOW() - (p_days - 1 || ' days')::INTERVAL)::DATE,
      NOW()::DATE,
      '1 day'::INTERVAL
    )::DATE as date
  )
  SELECT
    ds.date,
    COALESCE(d.convos, 0)::BIGINT as conversation_count,
    COALESCE(d.msgs, 0)::BIGINT as message_count
  FROM date_series ds
  LEFT JOIN daily_stats d ON ds.date = d.stat_date
  ORDER BY ds.date;
END;
$$;

-- 4.4 Fix get_dashboard_stats function
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id TEXT)
RETURNS TABLE (
  total_chatbots BIGINT,
  active_chatbots BIGINT,
  total_conversations BIGINT,
  total_messages BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_chatbot_ids AS (
    SELECT id FROM public.chatbots WHERE user_id = p_user_id
  ),
  chatbot_counts AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'ready') as active
    FROM public.chatbots
    WHERE user_id = p_user_id
  ),
  conversation_stats AS (
    SELECT
      COUNT(DISTINCT c.id) as convo_count,
      COALESCE(SUM(jsonb_array_length(c.messages)), 0) as msg_count
    FROM public.conversations c
    JOIN user_chatbot_ids uc ON c.chatbot_id = uc.id
  )
  SELECT
    cc.total::BIGINT as total_chatbots,
    cc.active::BIGINT as active_chatbots,
    cs.convo_count::BIGINT as total_conversations,
    cs.msg_count::BIGINT as total_messages
  FROM chatbot_counts cc, conversation_stats cs;
END;
$$;

-- =====================================================
-- Step 5: Add index for performance
-- =====================================================

-- Ensure indexes exist for the text columns
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_user_id ON public.chatbots(user_id);

-- =====================================================
-- Documentation
-- =====================================================
COMMENT ON COLUMN public.users.id IS 'Clerk user ID (format: user_xxxxx). Previously UUID, changed for Clerk compatibility.';
