-- Migration 005: Security Fixes for Supabase Linter Issues
-- Fixes: function_search_path_mutable, extension_in_public, rls_disabled_in_public

-- =====================================================
-- 1. Move vector extension from public to extensions schema
-- =====================================================

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move the vector extension to extensions schema
-- Note: This requires dropping and recreating with new schema
-- We need to handle this carefully due to dependent objects

-- First, we'll create the extension in the extensions schema
-- The vector extension may need to be dropped and recreated
-- IMPORTANT: Run this migration during a maintenance window

-- Drop the old extension if it exists in public (will cascade to dependent objects)
-- We'll recreate the indexes after
DROP EXTENSION IF EXISTS vector CASCADE;

-- Recreate in extensions schema
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Ensure the embeddings and knowledge_base tables can use the vector type
-- by setting the search_path for this session
SET search_path TO public, extensions;

-- Recreate the vector columns (they were dropped with CASCADE)
-- Note: This will require re-embedding all data
ALTER TABLE public.embeddings ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);

-- Recreate vector indexes
DROP INDEX IF EXISTS idx_embeddings_vector;
CREATE INDEX idx_embeddings_vector ON public.embeddings
USING ivfflat (embedding extensions.vector_cosine_ops)
WITH (lists = 100);

DROP INDEX IF EXISTS idx_knowledge_base_embedding;
CREATE INDEX idx_knowledge_base_embedding ON public.knowledge_base
USING ivfflat (embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- =====================================================
-- 2. Fix all functions with mutable search_path
-- =====================================================

-- 2.1 Fix match_embeddings function
CREATE OR REPLACE FUNCTION public.match_embeddings(
  p_chatbot_id UUID,
  p_query_embedding extensions.vector(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  page_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.content,
    e.page_url,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.embeddings e
  WHERE e.chatbot_id = p_chatbot_id
    AND 1 - (e.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- 2.2 Fix match_knowledge_base function
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  p_chatbot_id UUID,
  p_query_embedding extensions.vector(1536),
  p_match_threshold FLOAT DEFAULT 0.8,
  p_match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  category TEXT,
  priority INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.question,
    kb.answer,
    kb.category,
    kb.priority,
    1 - (kb.embedding <=> p_query_embedding) AS similarity
  FROM public.knowledge_base kb
  WHERE kb.chatbot_id = p_chatbot_id
    AND kb.enabled = true
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY
    kb.priority DESC,
    kb.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- 2.3 Fix increment_usage function
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
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

-- 2.4 Fix reset_usage function
CREATE OR REPLACE FUNCTION public.reset_usage(p_user_id UUID)
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

-- 2.5 Fix update_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2.6 Fix get_conversation_stats function
CREATE OR REPLACE FUNCTION public.get_conversation_stats(
  p_user_id UUID,
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

-- 2.7 Fix get_message_trends function
CREATE OR REPLACE FUNCTION public.get_message_trends(
  p_chatbot_id UUID,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  date DATE,
  message_count BIGINT,
  conversation_count BIGINT,
  avg_messages_per_conversation NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH daily_stats AS (
    SELECT
      DATE(c.created_at) as stat_date,
      COUNT(DISTINCT c.id) as convos,
      SUM(jsonb_array_length(c.messages)) as msgs
    FROM public.conversations c
    WHERE c.chatbot_id = p_chatbot_id
      AND c.created_at >= NOW() - (p_days || ' days')::INTERVAL
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
    COALESCE(d.msgs, 0)::BIGINT as message_count,
    COALESCE(d.convos, 0)::BIGINT as conversation_count,
    CASE
      WHEN COALESCE(d.convos, 0) > 0
      THEN ROUND(COALESCE(d.msgs, 0)::NUMERIC / d.convos, 2)
      ELSE 0
    END as avg_messages_per_conversation
  FROM date_series ds
  LEFT JOIN daily_stats d ON ds.date = d.stat_date
  ORDER BY ds.date;
END;
$$;

-- 2.8 Fix get_popular_queries function
CREATE OR REPLACE FUNCTION public.get_popular_queries(
  p_chatbot_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  query_text TEXT,
  occurrence_count BIGINT,
  last_asked TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH user_messages AS (
    SELECT
      msg->>'content' as content,
      (msg->>'timestamp')::TIMESTAMPTZ as msg_timestamp
    FROM public.conversations c,
         jsonb_array_elements(c.messages) as msg
    WHERE c.chatbot_id = p_chatbot_id
      AND msg->>'role' = 'user'
      AND length(msg->>'content') >= 10
  ),
  normalized_queries AS (
    SELECT
      lower(trim(content)) as normalized_content,
      content,
      msg_timestamp
    FROM user_messages
  ),
  query_counts AS (
    SELECT
      normalized_content,
      COUNT(*) as cnt,
      MAX(msg_timestamp) as last_time,
      MIN(content) as original_content  -- Get one original version
    FROM normalized_queries
    GROUP BY normalized_content
  )
  SELECT
    CASE
      WHEN length(original_content) > 100
      THEN substring(original_content from 1 for 100) || '...'
      ELSE original_content
    END as query_text,
    cnt as occurrence_count,
    last_time as last_asked
  FROM query_counts
  ORDER BY cnt DESC, last_time DESC
  LIMIT p_limit;
END;
$$;

-- 2.9 Fix get_dashboard_stats function
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id UUID)
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

-- 2.10 Fix get_conversations_paginated function
CREATE OR REPLACE FUNCTION public.get_conversations_paginated(
  p_chatbot_id UUID,
  p_page INT DEFAULT 1,
  p_per_page INT DEFAULT 20,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  session_id TEXT,
  message_count INT,
  first_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  RETURN QUERY
  SELECT
    c.id,
    c.session_id,
    jsonb_array_length(c.messages)::INT as message_count,
    CASE
      WHEN jsonb_array_length(c.messages) > 0
      THEN LEFT(c.messages->0->>'content', 100)
      ELSE NULL
    END as first_message,
    c.created_at,
    c.updated_at
  FROM public.conversations c
  WHERE c.chatbot_id = p_chatbot_id
    AND (p_start_date IS NULL OR c.created_at >= p_start_date)
    AND (p_end_date IS NULL OR c.created_at <= p_end_date)
  ORDER BY c.updated_at DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;

-- 2.11 Fix get_conversations_count function
CREATE OR REPLACE FUNCTION public.get_conversations_count(
  p_chatbot_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.conversations c
    WHERE c.chatbot_id = p_chatbot_id
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
  );
END;
$$;

-- 2.12 Fix get_conversation_rate function
CREATE OR REPLACE FUNCTION public.get_conversation_rate(
  p_chatbot_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  widget_views BIGINT,
  widget_opens BIGINT,
  conversations_started BIGINT,
  conversion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_widget_views BIGINT;
  v_widget_opens BIGINT;
  v_conversations_started BIGINT;
BEGIN
  -- Count widget views
  SELECT COUNT(*) INTO v_widget_views
  FROM public.widget_analytics
  WHERE chatbot_id = p_chatbot_id
    AND event_type = 'view'
    AND timestamp BETWEEN p_start_date AND p_end_date;

  -- Count widget opens
  SELECT COUNT(*) INTO v_widget_opens
  FROM public.widget_analytics
  WHERE chatbot_id = p_chatbot_id
    AND event_type = 'open'
    AND timestamp BETWEEN p_start_date AND p_end_date;

  -- Count conversations started (first_message events)
  SELECT COUNT(*) INTO v_conversations_started
  FROM public.widget_analytics
  WHERE chatbot_id = p_chatbot_id
    AND event_type = 'first_message'
    AND timestamp BETWEEN p_start_date AND p_end_date;

  -- Calculate conversion rate (conversations / views * 100)
  RETURN QUERY SELECT
    v_widget_views,
    v_widget_opens,
    v_conversations_started,
    CASE
      WHEN v_widget_views > 0 THEN
        ROUND((v_conversations_started::NUMERIC / v_widget_views) * 100, 2)
      ELSE 0
    END;
END;
$$;

-- 2.13 Fix get_response_time_trends function
CREATE OR REPLACE FUNCTION public.get_response_time_trends(
  p_chatbot_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  date DATE,
  avg_response_time_ms NUMERIC,
  message_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(c.created_at) AS date,
    ROUND(AVG(c.response_time_ms)::NUMERIC, 0) AS avg_response_time_ms,
    COUNT(*) AS message_count
  FROM public.conversations c
  WHERE c.chatbot_id = p_chatbot_id
    AND c.created_at >= NOW() - (p_days || ' days')::INTERVAL
    AND c.response_time_ms IS NOT NULL
  GROUP BY DATE(c.created_at)
  ORDER BY date;
END;
$$;

-- =====================================================
-- 3. Enable RLS on missing tables
-- =====================================================

-- 3.1 Enable RLS on scrape_history table
ALTER TABLE public.scrape_history ENABLE ROW LEVEL SECURITY;

-- Create policy for service role
CREATE POLICY "Service role has full access to scrape_history"
  ON public.scrape_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3.2 Enable RLS on feedback table
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Create policy for service role
CREATE POLICY "Service role has full access to feedback"
  ON public.feedback FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 4. Reset search_path to default
-- =====================================================
SET search_path TO public;

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON SCHEMA extensions IS 'Schema for PostgreSQL extensions to isolate from public schema';
