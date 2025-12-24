-- Migration: Add re-scraping columns to chatbots table
-- Phase 3: Re-scraping & Content Management

-- Add new columns for re-scraping functionality
ALTER TABLE chatbots
  ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS scrape_frequency TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS auto_scrape_enabled BOOLEAN DEFAULT false;

-- Add check constraint for valid scrape frequency values
ALTER TABLE chatbots
  ADD CONSTRAINT check_scrape_frequency
  CHECK (scrape_frequency IN ('manual', 'daily', 'weekly', 'monthly'));

-- Create scrape_history table for tracking scraping history
CREATE TABLE IF NOT EXISTS scrape_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  pages_scraped INTEGER DEFAULT 0,
  embeddings_created INTEGER DEFAULT 0,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'scheduled', 'initial'
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient queries on scrape_history
CREATE INDEX IF NOT EXISTS idx_scrape_history_chatbot_id ON scrape_history(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_scrape_history_created_at ON scrape_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_history_status ON scrape_history(status);

-- Create index for scheduled scraping queries
CREATE INDEX IF NOT EXISTS idx_chatbots_auto_scrape ON chatbots(auto_scrape_enabled, scrape_frequency)
  WHERE auto_scrape_enabled = true;

-- Comment on columns for documentation
COMMENT ON COLUMN chatbots.last_scraped_at IS 'Timestamp of the last successful scraping operation';
COMMENT ON COLUMN chatbots.scrape_frequency IS 'Frequency for automatic re-scraping: manual, daily, weekly, or monthly';
COMMENT ON COLUMN chatbots.auto_scrape_enabled IS 'Whether automatic re-scraping is enabled for this chatbot';

COMMENT ON TABLE scrape_history IS 'Tracks history of all scraping operations for chatbots';
COMMENT ON COLUMN scrape_history.triggered_by IS 'What triggered this scrape: manual (user-initiated), scheduled (cron), or initial (first scrape)';
