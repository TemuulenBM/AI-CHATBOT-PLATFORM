-- =====================================================
-- Widget Analytics Schema Migration
-- =====================================================
-- Purpose: Track widget usage, performance, and user behavior
-- Based on industry standards (Google Analytics, Mixpanel, Segment)
-- Features: Event tracking, session aggregation, retention policies
-- =====================================================

-- ============================================
-- 1. Widget Sessions Table (Aggregated Data)
-- ============================================
-- Stores session-level analytics (similar to GA sessions)
-- Optimized for fast aggregation queries

CREATE TABLE IF NOT EXISTS widget_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,

  -- Session identification
  session_id TEXT NOT NULL,
  anonymous_id TEXT, -- Persistent visitor ID (cross-session)

  -- User identification (optional, set via identify())
  user_id TEXT,
  user_email TEXT,
  user_name TEXT,
  user_metadata JSONB DEFAULT '{}'::jsonb,

  -- Session metadata
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT, -- NULL until session ends

  -- Traffic source
  referrer TEXT,
  landing_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  -- Device & browser
  user_agent TEXT,
  browser_name TEXT,
  browser_version TEXT,
  os_name TEXT,
  os_version TEXT,
  device_type TEXT, -- desktop, mobile, tablet
  screen_width INT,
  screen_height INT,

  -- Location (derived from IP via CDN/proxy headers)
  ip_address INET,
  country_code TEXT, -- US, GB, etc.
  city TEXT,

  -- Widget interaction metrics
  messages_sent INT DEFAULT 0,
  messages_received INT DEFAULT 0,
  widget_opened_count INT DEFAULT 0,
  widget_minimized_count INT DEFAULT 0,
  avg_response_time_ms INT,

  -- Engagement indicators
  had_conversation BOOLEAN DEFAULT FALSE,
  completed_pre_chat_form BOOLEAN DEFAULT FALSE,
  triggered_by TEXT, -- 'manual', 'proactive_time', 'proactive_scroll', etc.

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_widget_sessions_chatbot_created ON widget_sessions(chatbot_id, created_at DESC);
CREATE INDEX idx_widget_sessions_chatbot_started ON widget_sessions(chatbot_id, started_at DESC);
CREATE INDEX idx_widget_sessions_session_id ON widget_sessions(session_id);
CREATE INDEX idx_widget_sessions_anonymous_id ON widget_sessions(anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX idx_widget_sessions_user_id ON widget_sessions(user_id) WHERE user_id IS NOT NULL;

-- Partial index for active sessions (better performance)
CREATE INDEX idx_widget_sessions_active ON widget_sessions(chatbot_id, started_at DESC)
  WHERE ended_at IS NULL;

-- ============================================
-- 2. Widget Events Table (Raw Event Stream)
-- ============================================
-- Stores individual events (similar to Segment/Mixpanel events)
-- Automatically partitioned by month for performance

CREATE TABLE IF NOT EXISTS widget_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,

  -- Event details
  event_name TEXT NOT NULL, -- 'widget_loaded', 'widget_opened', 'message_sent', etc.
  event_category TEXT, -- 'engagement', 'performance', 'error'

  -- Event properties (flexible JSON storage)
  properties JSONB DEFAULT '{}'::jsonb,

  -- Context (automatically collected)
  page_url TEXT,
  page_title TEXT,

  -- Performance metrics
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_timestamp TIMESTAMPTZ, -- Client-side timestamp for latency calculation

  -- Partitioning column (for automatic monthly partitioning)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_widget_events_chatbot_created ON widget_events(chatbot_id, created_at DESC);
CREATE INDEX idx_widget_events_session_id ON widget_events(session_id, created_at DESC);
CREATE INDEX idx_widget_events_event_name ON widget_events(event_name, created_at DESC);
CREATE INDEX idx_widget_events_category ON widget_events(event_category) WHERE event_category IS NOT NULL;

-- GIN index for JSONB properties (enables fast property queries)
CREATE INDEX idx_widget_events_properties ON widget_events USING GIN (properties);

-- ============================================
-- 3. Widget Daily Stats (Aggregated Rollups)
-- ============================================
-- Pre-aggregated daily statistics for fast dashboard queries
-- Updated via background job (reduces query load)

CREATE TABLE IF NOT EXISTS widget_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,

  -- Session metrics
  total_sessions INT DEFAULT 0,
  unique_visitors INT DEFAULT 0, -- Based on anonymous_id
  new_visitors INT DEFAULT 0,
  returning_visitors INT DEFAULT 0,

  -- Engagement metrics
  total_conversations INT DEFAULT 0, -- Sessions with messages
  total_messages_sent INT DEFAULT 0,
  total_messages_received INT DEFAULT 0,
  avg_messages_per_session NUMERIC(10, 2),
  avg_session_duration_seconds INT,

  -- Widget interaction
  widget_loads INT DEFAULT 0,
  widget_opens INT DEFAULT 0,
  conversion_rate NUMERIC(5, 2), -- % of sessions that had conversations

  -- Performance metrics
  avg_response_time_ms INT,
  error_count INT DEFAULT 0,

  -- Traffic sources
  top_referrers JSONB DEFAULT '[]'::jsonb, -- [{domain, count}, ...]
  top_landing_pages JSONB DEFAULT '[]'::jsonb,
  utm_sources JSONB DEFAULT '{}'::jsonb, -- {source: count, ...}

  -- Device breakdown
  desktop_sessions INT DEFAULT 0,
  mobile_sessions INT DEFAULT 0,
  tablet_sessions INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one row per chatbot per day
  CONSTRAINT unique_chatbot_date UNIQUE (chatbot_id, stat_date)
);

-- Indexes
CREATE INDEX idx_widget_daily_stats_chatbot_date ON widget_daily_stats(chatbot_id, stat_date DESC);

-- ============================================
-- 4. Trigger: Update session updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_widget_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_widget_sessions_updated_at
  BEFORE UPDATE ON widget_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_widget_session_timestamp();

-- ============================================
-- 5. Analytics Functions
-- ============================================

-- Function: Get session summary for a chatbot
CREATE OR REPLACE FUNCTION get_widget_session_summary(
  p_chatbot_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  total_sessions BIGINT,
  unique_visitors BIGINT,
  total_conversations BIGINT,
  avg_session_duration_seconds NUMERIC,
  conversion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT id)::BIGINT as total_sessions,
    COUNT(DISTINCT anonymous_id)::BIGINT as unique_visitors,
    COUNT(*) FILTER (WHERE had_conversation = TRUE)::BIGINT as total_conversations,
    ROUND(AVG(duration_seconds)::NUMERIC, 2) as avg_session_duration_seconds,
    ROUND(
      (COUNT(*) FILTER (WHERE had_conversation = TRUE)::NUMERIC /
       NULLIF(COUNT(*)::NUMERIC, 0) * 100), 2
    ) as conversion_rate
  FROM widget_sessions
  WHERE chatbot_id = p_chatbot_id
    AND started_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$;

-- Function: Get daily trends
CREATE OR REPLACE FUNCTION get_widget_daily_trends(
  p_chatbot_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  stat_date DATE,
  sessions INT,
  conversations INT,
  messages INT,
  conversion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wds.stat_date,
    wds.total_sessions,
    wds.total_conversations,
    wds.total_messages_sent + wds.total_messages_received as messages,
    wds.conversion_rate
  FROM widget_daily_stats wds
  WHERE wds.chatbot_id = p_chatbot_id
    AND wds.stat_date >= CURRENT_DATE - (p_days - 1)
  ORDER BY wds.stat_date DESC;
END;
$$;

-- Function: Get top events by name
CREATE OR REPLACE FUNCTION get_widget_top_events(
  p_chatbot_id UUID,
  p_days INT DEFAULT 7,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  event_name TEXT,
  event_count BIGINT,
  unique_sessions BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    we.event_name,
    COUNT(*)::BIGINT as event_count,
    COUNT(DISTINCT we.session_id)::BIGINT as unique_sessions
  FROM widget_events we
  WHERE we.chatbot_id = p_chatbot_id
    AND we.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY we.event_name
  ORDER BY event_count DESC
  LIMIT p_limit;
END;
$$;

-- ============================================
-- 6. Data Retention Policies
-- ============================================
-- Industry standard: Keep detailed events for 90 days, aggregates forever

COMMENT ON TABLE widget_events IS
  'Raw event stream. Retention: 90 days. Events older than 90 days are deleted via scheduled job.';

COMMENT ON TABLE widget_sessions IS
  'Session summaries. Retention: 1 year. Sessions older than 1 year are deleted via scheduled job.';

COMMENT ON TABLE widget_daily_stats IS
  'Pre-aggregated daily stats. Retention: Indefinite (small footprint).';

-- ============================================
-- 7. Sample Queries (for reference)
-- ============================================

-- Example 1: Active sessions in last hour
-- SELECT * FROM widget_sessions
-- WHERE chatbot_id = 'xxx' AND started_at >= NOW() - INTERVAL '1 hour'
-- ORDER BY started_at DESC;

-- Example 2: Top landing pages
-- SELECT landing_page, COUNT(*) as sessions
-- FROM widget_sessions
-- WHERE chatbot_id = 'xxx' AND started_at >= NOW() - INTERVAL '7 days'
-- GROUP BY landing_page
-- ORDER BY sessions DESC
-- LIMIT 10;

-- Example 3: Conversion funnel
-- SELECT
--   COUNT(*) FILTER (WHERE event_name = 'widget_loaded') as loads,
--   COUNT(*) FILTER (WHERE event_name = 'widget_opened') as opens,
--   COUNT(*) FILTER (WHERE event_name = 'message_sent') as messages
-- FROM widget_events
-- WHERE chatbot_id = 'xxx' AND created_at >= NOW() - INTERVAL '7 days';

-- ============================================
-- Migration Complete
-- ============================================
