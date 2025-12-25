-- Phase 5: Analytics & Reporting Enhancement Migration
-- Add new columns to conversations table for response time tracking

-- Add response_time_ms column to store AI response time
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS widget_session_duration INTEGER;

-- Create widget_analytics table for tracking widget events
CREATE TABLE IF NOT EXISTS widget_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'open', 'close', 'message', 'first_message')),
  session_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_widget_analytics_chatbot ON widget_analytics(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_widget_analytics_timestamp ON widget_analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_widget_analytics_event_type ON widget_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_widget_analytics_session ON widget_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_widget_analytics_chatbot_timestamp ON widget_analytics(chatbot_id, timestamp);

-- Add index on conversations for response_time_ms queries
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Create function to get conversation rate metrics
CREATE OR REPLACE FUNCTION get_conversation_rate(
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
AS $$
DECLARE
  v_widget_views BIGINT;
  v_widget_opens BIGINT;
  v_conversations_started BIGINT;
BEGIN
  -- Count widget views
  SELECT COUNT(*) INTO v_widget_views
  FROM widget_analytics
  WHERE chatbot_id = p_chatbot_id
    AND event_type = 'view'
    AND timestamp BETWEEN p_start_date AND p_end_date;

  -- Count widget opens
  SELECT COUNT(*) INTO v_widget_opens
  FROM widget_analytics
  WHERE chatbot_id = p_chatbot_id
    AND event_type = 'open'
    AND timestamp BETWEEN p_start_date AND p_end_date;

  -- Count conversations started (first_message events)
  SELECT COUNT(*) INTO v_conversations_started
  FROM widget_analytics
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

-- Create function to get response time trends
CREATE OR REPLACE FUNCTION get_response_time_trends(
  p_chatbot_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  date DATE,
  avg_response_time_ms NUMERIC,
  message_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(c.created_at) AS date,
    ROUND(AVG(c.response_time_ms)::NUMERIC, 0) AS avg_response_time_ms,
    COUNT(*) AS message_count
  FROM conversations c
  WHERE c.chatbot_id = p_chatbot_id
    AND c.created_at >= NOW() - (p_days || ' days')::INTERVAL
    AND c.response_time_ms IS NOT NULL
  GROUP BY DATE(c.created_at)
  ORDER BY date;
END;
$$;

-- RLS policy for widget_analytics
ALTER TABLE widget_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to widget_analytics"
  ON widget_analytics FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE widget_analytics IS 'Tracks widget events for analytics: views, opens, closes, messages';
COMMENT ON COLUMN widget_analytics.event_type IS 'Event type: view, open, close, message, first_message';
COMMENT ON COLUMN widget_analytics.session_id IS 'Browser session identifier for grouping events';
COMMENT ON COLUMN widget_analytics.metadata IS 'Additional event metadata (e.g., page URL, user agent)';
COMMENT ON COLUMN conversations.response_time_ms IS 'Average AI response time in milliseconds for this conversation';
COMMENT ON COLUMN conversations.widget_session_duration IS 'Total widget session duration in seconds';

