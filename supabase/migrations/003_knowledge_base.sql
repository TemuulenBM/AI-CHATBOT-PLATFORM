-- Migration: Add knowledge_base table
-- Phase 4: Manual Q&A Knowledge Base

-- Create knowledge_base table for manual Q&A entries
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT, -- 'pricing', 'support', 'features', etc.
  priority INTEGER DEFAULT 0, -- Higher = used first
  enabled BOOLEAN DEFAULT true,
  embedding vector(1536), -- OpenAI embedding for semantic search
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_knowledge_base_chatbot_id ON knowledge_base(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_enabled ON knowledge_base(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_base_priority ON knowledge_base(priority DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);

-- Vector similarity search index (IVFFlat for performance)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Trigger to update updated_at on knowledge_base
CREATE OR REPLACE TRIGGER knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function for knowledge base semantic search
CREATE OR REPLACE FUNCTION match_knowledge_base(
  p_chatbot_id UUID,
  p_query_embedding vector(1536),
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
  FROM knowledge_base kb
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

-- Enable RLS on knowledge_base
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS Policy for service role
CREATE POLICY "Service role has full access to knowledge_base"
  ON knowledge_base FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE knowledge_base IS 'Manual Q&A knowledge base entries for chatbots with semantic search';
COMMENT ON COLUMN knowledge_base.question IS 'The question that triggers this knowledge base entry';
COMMENT ON COLUMN knowledge_base.answer IS 'The curated answer to provide';
COMMENT ON COLUMN knowledge_base.category IS 'Category for organizing knowledge entries (pricing, support, features, etc.)';
COMMENT ON COLUMN knowledge_base.priority IS 'Priority level - higher values are matched first (0 = normal, 1+ = high priority)';
COMMENT ON COLUMN knowledge_base.enabled IS 'Whether this knowledge entry is active';
COMMENT ON COLUMN knowledge_base.embedding IS 'Vector embedding of question+answer for semantic search';
