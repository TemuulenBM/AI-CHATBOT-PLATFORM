-- Migration: Add Paddle columns to subscriptions table
-- This migration adds Paddle-specific columns alongside existing Stripe columns
-- to allow gradual migration and rollback capability

-- Add Paddle columns
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT;

-- Create index on paddle_customer_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_paddle_customer 
  ON subscriptions(paddle_customer_id);

-- Add comment for documentation
COMMENT ON COLUMN subscriptions.paddle_customer_id IS 'Paddle customer ID (replaces stripe_customer_id after migration)';
COMMENT ON COLUMN subscriptions.paddle_subscription_id IS 'Paddle subscription ID (replaces stripe_subscription_id after migration)';

