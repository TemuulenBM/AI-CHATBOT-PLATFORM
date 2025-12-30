-- GDPR Compliance: Data Export and Deletion Tables
-- Migration: 011_gdpr_data_export_and_deletion.sql
-- Created: 2025-12-30

-- Table: data_export_requests
-- Stores user data export requests (Subject Access Requests - SAR)
CREATE TABLE IF NOT EXISTS data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  export_format VARCHAR(10) NOT NULL DEFAULT 'json', -- json, html
  file_path TEXT, -- Path to export file
  file_size_bytes BIGINT,
  expires_at TIMESTAMPTZ, -- Export link expires after 7 days
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Ensure valid status
  CONSTRAINT valid_export_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Ensure valid format
  CONSTRAINT valid_export_format CHECK (export_format IN ('json', 'html'))
);

-- Indexes for data_export_requests
CREATE INDEX idx_data_export_requests_user_id ON data_export_requests(user_id);
CREATE INDEX idx_data_export_requests_status ON data_export_requests(status);
CREATE INDEX idx_data_export_requests_expires_at ON data_export_requests(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_data_export_requests_request_date ON data_export_requests(request_date DESC);

-- Table: deletion_requests
-- Stores user account deletion requests (Right to Erasure)
CREATE TABLE IF NOT EXISTS deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
  scheduled_deletion_date TIMESTAMPTZ, -- 30-day grace period
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT REFERENCES users(id),

  -- Audit trail
  deleted_data JSONB, -- Summary of deleted data
  retention_exceptions JSONB, -- Data kept for legal reasons (e.g., billing records)

  -- Ensure valid status
  CONSTRAINT valid_deletion_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

-- Indexes for deletion_requests
CREATE INDEX idx_deletion_requests_user_id ON deletion_requests(user_id);
CREATE INDEX idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX idx_deletion_requests_scheduled ON deletion_requests(scheduled_deletion_date) WHERE scheduled_deletion_date IS NOT NULL;
CREATE INDEX idx_deletion_requests_request_date ON deletion_requests(request_date DESC);

-- Enable Row Level Security
ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for data_export_requests
-- Users can view their own export requests
CREATE POLICY "Users can view own export requests"
  ON data_export_requests
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Users can create their own export requests
CREATE POLICY "Users can create own export requests"
  ON data_export_requests
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Service role has full access
CREATE POLICY "Service role has full access to export requests"
  ON data_export_requests
  FOR ALL
  USING (auth.role() = 'service_role');

-- RLS Policies for deletion_requests
-- Users can view their own deletion requests
CREATE POLICY "Users can view own deletion requests"
  ON deletion_requests
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Users can create their own deletion requests
CREATE POLICY "Users can create own deletion requests"
  ON deletion_requests
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Users can cancel their own pending deletion requests
CREATE POLICY "Users can cancel own deletion requests"
  ON deletion_requests
  FOR UPDATE
  USING (auth.uid()::text = user_id::text AND status = 'pending');

-- Service role has full access
CREATE POLICY "Service role has full access to deletion requests"
  ON deletion_requests
  FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON data_export_requests TO authenticated, service_role;
GRANT ALL ON deletion_requests TO authenticated, service_role;

-- Comments for documentation
COMMENT ON TABLE data_export_requests IS 'Stores GDPR Subject Access Requests (SAR). Users can request a full export of their personal data.';
COMMENT ON TABLE deletion_requests IS 'Stores GDPR Right to Erasure requests. Users can request account deletion with a 30-day grace period.';
COMMENT ON COLUMN data_export_requests.status IS 'Request status: pending (queued), processing (generating export), completed (ready for download), failed (error occurred)';
COMMENT ON COLUMN data_export_requests.expires_at IS 'Export download link expires 7 days after completion for security';
COMMENT ON COLUMN deletion_requests.status IS 'Request status: pending (scheduled), processing (being deleted), completed (deleted), failed (error), cancelled (user cancelled within grace period)';
COMMENT ON COLUMN deletion_requests.scheduled_deletion_date IS '30-day grace period allows users to cancel deletion request';
COMMENT ON COLUMN deletion_requests.retention_exceptions IS 'Data retained for legal/compliance reasons (e.g., billing records must be kept for 7 years)';
