-- Analytics Functions for Dashboard Statistics
-- Run this migration after schema.sql

-- Add index on conversations for faster analytics queries
CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_created
ON conversations(chatbot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_updated
ON conversations(updated_at DESC);

-- Function to get conversation statistics for a user over a date range
CREATE OR REPLACE FUNCTION get_conversation_stats(
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
AS $$
BEGIN
  RETURN QUERY
  WITH user_chatbots AS (
    SELECT id FROM chatbots WHERE user_id = p_user_id
  ),
  daily_stats AS (
    SELECT
      DATE(c.created_at) as stat_date,
      COUNT(DISTINCT c.id) as convos,
      SUM(jsonb_array_length(c.messages)) as msgs
    FROM conversations c
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

-- Function to get message trends for a specific chatbot
CREATE OR REPLACE FUNCTION get_message_trends(
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
AS $$
BEGIN
  RETURN QUERY
  WITH daily_stats AS (
    SELECT
      DATE(c.created_at) as stat_date,
      COUNT(DISTINCT c.id) as convos,
      SUM(jsonb_array_length(c.messages)) as msgs
    FROM conversations c
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

-- Function to get popular queries/questions for a chatbot
CREATE OR REPLACE FUNCTION get_popular_queries(
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
AS $$
BEGIN
  RETURN QUERY
  WITH user_messages AS (
    SELECT
      msg->>'content' as content,
      (msg->>'timestamp')::TIMESTAMPTZ as msg_timestamp
    FROM conversations c,
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

-- Function to get aggregated dashboard stats for a user
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id UUID)
RETURNS TABLE (
  total_chatbots BIGINT,
  active_chatbots BIGINT,
  total_conversations BIGINT,
  total_messages BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_chatbot_ids AS (
    SELECT id FROM chatbots WHERE user_id = p_user_id
  ),
  chatbot_counts AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'ready') as active
    FROM chatbots
    WHERE user_id = p_user_id
  ),
  conversation_stats AS (
    SELECT
      COUNT(DISTINCT c.id) as convo_count,
      COALESCE(SUM(jsonb_array_length(c.messages)), 0) as msg_count
    FROM conversations c
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

-- Function to get conversations with pagination
CREATE OR REPLACE FUNCTION get_conversations_paginated(
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
  FROM conversations c
  WHERE c.chatbot_id = p_chatbot_id
    AND (p_start_date IS NULL OR c.created_at >= p_start_date)
    AND (p_end_date IS NULL OR c.created_at <= p_end_date)
  ORDER BY c.updated_at DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;

-- Function to get conversation count for pagination
CREATE OR REPLACE FUNCTION get_conversations_count(
  p_chatbot_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM conversations c
    WHERE c.chatbot_id = p_chatbot_id
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_end_date IS NULL OR c.created_at <= p_end_date)
  );
END;
$$;

-- Grant execute permissions to authenticated users (via service role)
-- These functions use SECURITY DEFINER so they run with elevated privileges
