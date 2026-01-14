-- Set default showBranding to true for all existing chatbots
-- This ensures backward compatibility and enforces branding by default

UPDATE chatbots
SET settings = jsonb_set(
  settings,
  '{showBranding}',
  'true'::jsonb,
  true
)
WHERE settings->>'showBranding' IS NULL;

-- Add comment to document the default behavior
COMMENT ON COLUMN chatbots.settings IS
  'JSONB settings object. showBranding defaults to true (Growth+ plans can set to false)';
