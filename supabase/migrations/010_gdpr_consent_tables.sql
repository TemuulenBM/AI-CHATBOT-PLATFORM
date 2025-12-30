-- GDPR Compliance: Consent Management Tables
-- Migration: 010_gdpr_consent_tables.sql
-- Created: 2025-12-30

-- Table: user_consents
-- Stores user consent records for different data processing categories
CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id VARCHAR(255), -- For non-logged-in users
  consent_type VARCHAR(50) NOT NULL, -- 'essential', 'analytics', 'marketing'
  granted BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  consent_version VARCHAR(20) NOT NULL, -- Privacy policy version
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,

  -- Ensure at least one identifier exists
  CONSTRAINT check_identifier CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL),

  -- Valid consent types
  CONSTRAINT valid_consent_type CHECK (consent_type IN ('essential', 'analytics', 'marketing'))
);

-- Indexes for performance
CREATE INDEX idx_user_consents_user_id ON user_consents(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_user_consents_anonymous_id ON user_consents(anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX idx_user_consents_granted_at ON user_consents(granted_at);
CREATE INDEX idx_user_consents_type ON user_consents(consent_type);
CREATE INDEX idx_user_consents_active ON user_consents(user_id, consent_type, withdrawn_at) WHERE withdrawn_at IS NULL;

-- Table: privacy_policy_versions
-- Stores versioned privacy policy documents
CREATE TABLE IF NOT EXISTS privacy_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) UNIQUE NOT NULL, -- e.g., "1.0.0"
  content TEXT NOT NULL, -- Markdown content
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN DEFAULT false,

  -- Only one active version at a time
  CONSTRAINT only_one_active EXCLUDE USING btree (is_active WITH =) WHERE (is_active = true)
);

CREATE INDEX idx_privacy_policy_active ON privacy_policy_versions(is_active) WHERE is_active = true;
CREATE INDEX idx_privacy_policy_version ON privacy_policy_versions(version);
CREATE INDEX idx_privacy_policy_effective_date ON privacy_policy_versions(effective_date);

-- Insert default privacy policy version
INSERT INTO privacy_policy_versions (version, content, effective_date, is_active)
VALUES (
  '1.0.0',
  '# Privacy Policy

## 1. Introduction

Welcome to ConvoAI. We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and protect your information.

## 2. Data We Collect

### 2.1 Information You Provide
- Email address (for account creation)
- Chatbot configurations
- Conversation data

### 2.2 Automatically Collected Data
- IP address
- Browser type and version
- Device information
- Usage analytics

## 3. How We Use Your Data

We use your data to:
- Provide and improve our services
- Process your chatbot requests
- Communicate with you about your account
- Analyze usage patterns to improve our platform

## 4. Legal Basis for Processing

We process your data based on:
- **Consent**: For analytics and marketing cookies
- **Contract**: To provide our services
- **Legitimate Interest**: To improve our platform and prevent fraud

## 5. Data Sharing

We share your data with:
- **OpenAI**: For AI-powered chatbot responses
- **Clerk**: For authentication services
- **Paddle**: For payment processing
- **Upstash**: For caching and performance

All third-party processors are GDPR compliant and have signed Data Processing Agreements (DPAs).

## 6. Your Rights

You have the right to:
- Access your personal data
- Rectify inaccurate data
- Erase your data ("right to be forgotten")
- Restrict processing
- Data portability
- Object to processing
- Withdraw consent

## 7. Data Retention

- User account data: Retained until account deletion
- Conversation history: Retained until deletion or account closure
- Analytics events: 90 days
- Analytics sessions: 1 year
- Billing records: 7 years (legal requirement)

## 8. Security

We implement industry-standard security measures:
- HTTPS encryption
- Database encryption at rest
- Regular security audits
- Access controls and authentication

## 9. Cookies

We use the following types of cookies:
- **Essential**: Required for authentication and security
- **Analytics**: To understand how you use our service
- **Marketing**: To deliver personalized content

You can manage your cookie preferences at any time.

## 10. Contact Us

For privacy-related questions or to exercise your rights, contact us at:
- Email: privacy@convoai.com

## 11. Changes to This Policy

We may update this privacy policy from time to time. We will notify you of significant changes via email or a notice on our website.

**Last Updated**: 2025-12-30',
  NOW(),
  true
);

-- Enable Row Level Security
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_policy_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_consents
-- Users can view their own consents
CREATE POLICY "Users can view own consents"
  ON user_consents
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Users can insert their own consents
CREATE POLICY "Users can insert own consents"
  ON user_consents
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text OR user_id IS NULL);

-- Users can update their own consents (for withdrawal)
CREATE POLICY "Users can withdraw own consents"
  ON user_consents
  FOR UPDATE
  USING (auth.uid()::text = user_id::text);

-- Service role has full access
CREATE POLICY "Service role has full access to consents"
  ON user_consents
  FOR ALL
  USING (auth.role() = 'service_role');

-- RLS Policies for privacy_policy_versions
-- Everyone can read active privacy policy
CREATE POLICY "Anyone can read active privacy policy"
  ON privacy_policy_versions
  FOR SELECT
  USING (is_active = true OR auth.role() = 'service_role');

-- Only service role can insert/update privacy policies
CREATE POLICY "Service role can manage privacy policies"
  ON privacy_policy_versions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON privacy_policy_versions TO anon, authenticated;
GRANT ALL ON privacy_policy_versions TO service_role;
GRANT ALL ON user_consents TO authenticated, service_role;

-- Comments for documentation
COMMENT ON TABLE user_consents IS 'Stores user consent records for GDPR compliance. Tracks consent for essential, analytics, and marketing data processing.';
COMMENT ON TABLE privacy_policy_versions IS 'Stores versioned privacy policy documents. Only one version can be active at a time.';
COMMENT ON COLUMN user_consents.consent_type IS 'Type of consent: essential (required), analytics (optional), marketing (optional)';
COMMENT ON COLUMN user_consents.consent_version IS 'Privacy policy version at the time of consent';
COMMENT ON COLUMN user_consents.withdrawn_at IS 'Timestamp when consent was withdrawn. NULL means consent is still active.';
