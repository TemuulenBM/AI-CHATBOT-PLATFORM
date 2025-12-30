-- GDPR Compliance: Subscription Anonymization Columns
-- Migration: 012_add_subscription_anonymization.sql
-- Created: 2025-12-30
--
-- Purpose: Add columns to track anonymized subscription records
-- for GDPR compliance (7-year legal retention requirement)
-- When a user requests account deletion, billing records are anonymized
-- (not deleted) to comply with tax/accounting regulations

-- Add anonymization tracking columns to subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymized_reason TEXT;

-- Create index for efficient queries on anonymized records
CREATE INDEX IF NOT EXISTS idx_subscriptions_anonymized 
  ON subscriptions(anonymized_at) WHERE anonymized_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN subscriptions.anonymized_at IS 'Timestamp when subscription record was anonymized due to GDPR deletion request. NULL means record is still linked to a user.';
COMMENT ON COLUMN subscriptions.anonymized_reason IS 'Reason for anonymization (e.g., "GDPR deletion request"). Used for audit trail.';

