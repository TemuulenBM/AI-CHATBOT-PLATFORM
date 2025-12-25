-- Migration: Clerk Authentication
-- Description: Makes password_hash nullable for Clerk users who don't have local passwords
-- Date: 2024

-- Make password_hash nullable for gradual migration to Clerk
-- Clerk users authenticate externally and don't need password hashes
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- Add a comment to document the deprecation
COMMENT ON COLUMN users.password_hash IS
  'DEPRECATED: Used for legacy JWT authentication. Will be removed after Clerk migration is complete. New users via Clerk will have NULL values.';

-- Note: Run the following cleanup migration after 1-2 weeks of production use
-- to completely remove the password_hash column once all users have migrated:
--
-- ALTER TABLE users DROP COLUMN password_hash;
