-- Add user_email to deletion_requests table
-- Migration: 014_add_email_to_deletion_requests.sql
-- Created: 2026-01-12
-- Purpose: Store user email for GDPR confirmation emails (required before user record deletion)

-- Add user_email column to deletion_requests
ALTER TABLE deletion_requests
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Create index for email lookup
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_email ON deletion_requests(user_email) WHERE user_email IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN deletion_requests.user_email IS 'User email stored before account deletion to send GDPR confirmation email. Required for Article 17 compliance.';
