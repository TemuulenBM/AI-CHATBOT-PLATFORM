-- Migration: Add Admin Role
-- Description: Adds is_admin boolean field to users table for admin authorization
-- Date: 2026-01-05

-- Add is_admin column to users table
ALTER TABLE users
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for admin queries (optional but improves performance)
CREATE INDEX idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- Add comment to document the column
COMMENT ON COLUMN users.is_admin IS
  'Admin flag for users with elevated privileges. Admin users can access admin-only routes and perform privileged operations.';
