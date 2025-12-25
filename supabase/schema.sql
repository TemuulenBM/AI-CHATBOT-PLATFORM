-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chatbots table
CREATE TABLE IF NOT EXISTS chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scraping', 'embedding', 'ready', 'failed')),
  settings JSONB NOT NULL DEFAULT '{
    "personality": 50,
    "primaryColor": "#7c3aed",
    "welcomeMessage": "Hi! How can I help you today?"
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Embeddings table with vector storage
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  page_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'growth', 'business')),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  paddle_subscription_id TEXT,
  paddle_customer_id TEXT,
  usage JSONB NOT NULL DEFAULT '{"messages_count": 0, "chatbots_count": 0}'::jsonb,
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chatbots_user_id ON chatbots(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_status ON chatbots(status);
CREATE INDEX IF NOT EXISTS idx_embeddings_chatbot_id ON embeddings(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_session ON conversations(chatbot_id, session_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paddle_customer ON subscriptions(paddle_customer_id);

-- Feedback table for CSAT (Customer Satisfaction)
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_chatbot_id ON feedback(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_feedback_conversation_id ON feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

-- Vector similarity search index (IVFFlat for performance)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Function for similarity search
CREATE OR REPLACE FUNCTION match_embeddings(
  p_chatbot_id UUID,
  p_query_embedding vector(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  page_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.content,
    e.page_url,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM embeddings e
  WHERE e.chatbot_id = p_chatbot_id
    AND 1 - (e.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_field TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE subscriptions
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
    INSERT INTO subscriptions (user_id, usage)
    VALUES (
      p_user_id,
      CASE
        WHEN p_field = 'messages_count' THEN '{"messages_count": 1, "chatbots_count": 0}'::jsonb
        ELSE '{"messages_count": 0, "chatbots_count": 1}'::jsonb
      END
    )
    ON CONFLICT (user_id) DO UPDATE SET
      usage = jsonb_set(
        subscriptions.usage,
        ARRAY[p_field],
        to_jsonb((subscriptions.usage->>p_field)::int + 1)
      ),
      updated_at = NOW();
  END IF;
END;
$$;

-- Function to reset usage (called at billing period start)
CREATE OR REPLACE FUNCTION reset_usage(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE subscriptions
  SET
    usage = '{"messages_count": 0, "chatbots_count": 0}'::jsonb,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER chatbots_updated_at
  BEFORE UPDATE ON chatbots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (for service role, bypass RLS)
-- These are for the backend service using service_role key
-- Frontend should use anon key with proper policies

-- Grant usage to service role (these policies allow all access for service role)
CREATE POLICY "Service role has full access to users"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to chatbots"
  ON chatbots FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to embeddings"
  ON embeddings FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to conversations"
  ON conversations FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to subscriptions"
  ON subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
