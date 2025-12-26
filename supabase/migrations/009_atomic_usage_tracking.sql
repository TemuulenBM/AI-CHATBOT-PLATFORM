-- Migration: Atomic Usage Tracking and Billing Improvements
-- Created: 2025-12-26
-- Purpose: Fix race conditions and add safeguards for billing/usage tracking

-- ============================================================================
-- 1. ATOMIC USAGE CHECK AND INCREMENT
-- ============================================================================
-- This function atomically checks the usage limit and increments the counter
-- in a single transaction, preventing race conditions where multiple concurrent
-- requests could bypass usage limits.

CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  p_user_id TEXT,
  p_field TEXT,
  p_plan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_usage INT;
  v_limit INT;
  v_subscription RECORD;
BEGIN
  -- Define plan limits
  CASE p_plan
    WHEN 'free' THEN
      IF p_field = 'messages_count' THEN v_limit := 100;
      ELSE v_limit := 1;
      END IF;
    WHEN 'starter' THEN
      IF p_field = 'messages_count' THEN v_limit := 2000;
      ELSE v_limit := 3;
      END IF;
    WHEN 'growth' THEN
      IF p_field = 'messages_count' THEN v_limit := 10000;
      ELSE v_limit := 10;
      END IF;
    WHEN 'business' THEN
      IF p_field = 'messages_count' THEN v_limit := 50000;
      ELSE v_limit := 999;
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid plan: %', p_plan;
  END CASE;

  -- Lock the row for update to prevent concurrent modifications
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Get current usage
  IF v_subscription IS NULL THEN
    v_current_usage := 0;
  ELSE
    v_current_usage := COALESCE((v_subscription.usage->>p_field)::INT, 0);
  END IF;

  -- Check if limit would be exceeded
  IF v_current_usage >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_usage', v_current_usage,
      'limit', v_limit,
      'plan', p_plan
    );
  END IF;

  -- Increment usage atomically
  IF v_subscription IS NULL THEN
    -- Create new subscription if doesn't exist
    INSERT INTO public.subscriptions (user_id, plan, usage, current_period_start, current_period_end)
    VALUES (
      p_user_id,
      'free',
      CASE
        WHEN p_field = 'messages_count' THEN '{"messages_count": 1, "chatbots_count": 0}'::jsonb
        ELSE '{"messages_count": 0, "chatbots_count": 1}'::jsonb
      END,
      NOW(),
      NOW() + INTERVAL '30 days'
    );
    v_current_usage := 1;
  ELSE
    -- Update existing subscription
    UPDATE public.subscriptions
    SET
      usage = jsonb_set(
        usage,
        ARRAY[p_field],
        to_jsonb((usage->>p_field)::int + 1)
      ),
      updated_at = NOW()
    WHERE user_id = p_user_id;
    v_current_usage := v_current_usage + 1;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_usage', v_current_usage,
    'limit', v_limit,
    'plan', p_plan
  );
END;
$$;

COMMENT ON FUNCTION public.check_and_increment_usage IS
'Atomically checks usage limit and increments counter to prevent race conditions';


-- ============================================================================
-- 2. DECREMENT USAGE FUNCTION (for chatbot deletion)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.decrement_usage(
  p_user_id TEXT,
  p_field TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET
    usage = jsonb_set(
      usage,
      ARRAY[p_field],
      to_jsonb(GREATEST((usage->>p_field)::int - 1, 0))
    ),
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.decrement_usage IS
'Decrements usage counter (e.g., when chatbot is deleted). Never goes below 0.';


-- ============================================================================
-- 3. WEBHOOK IDEMPOTENCY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processor TEXT NOT NULL, -- 'stripe' or 'paddle'
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processor ON public.webhook_events(processor, event_type);

COMMENT ON TABLE public.webhook_events IS
'Tracks processed webhook events to ensure idempotency';

-- Auto-delete old webhook events after 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_events()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.webhook_events
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;


-- ============================================================================
-- 4. VALIDATE PLAN DOWNGRADE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_plan_change(
  p_user_id TEXT,
  p_new_plan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_current_chatbots INT;
  v_new_chatbot_limit INT;
  v_current_messages INT;
  v_new_message_limit INT;
BEGIN
  -- Get current subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- Get current usage
  v_current_chatbots := COALESCE((v_subscription.usage->>'chatbots_count')::INT, 0);
  v_current_messages := COALESCE((v_subscription.usage->>'messages_count')::INT, 0);

  -- Determine new limits
  CASE p_new_plan
    WHEN 'free' THEN
      v_new_chatbot_limit := 1;
      v_new_message_limit := 100;
    WHEN 'starter' THEN
      v_new_chatbot_limit := 3;
      v_new_message_limit := 2000;
    WHEN 'growth' THEN
      v_new_chatbot_limit := 10;
      v_new_message_limit := 10000;
    WHEN 'business' THEN
      v_new_chatbot_limit := 999;
      v_new_message_limit := 50000;
    ELSE
      RAISE EXCEPTION 'Invalid plan: %', p_new_plan;
  END CASE;

  -- Check if current usage exceeds new limits
  IF v_current_chatbots > v_new_chatbot_limit THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'chatbot_limit_exceeded',
      'message', format('You have %s chatbots but the %s plan allows only %s. Please delete %s chatbot(s) before downgrading.',
                       v_current_chatbots, p_new_plan, v_new_chatbot_limit, v_current_chatbots - v_new_chatbot_limit),
      'current_chatbots', v_current_chatbots,
      'new_limit', v_new_chatbot_limit
    );
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

COMMENT ON FUNCTION public.validate_plan_change IS
'Validates that user can downgrade to a new plan based on current usage';


-- ============================================================================
-- 5. GET ACTUAL CHATBOT COUNT (for accurate tracking)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_chatbot_count(p_user_id TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual_count INT;
BEGIN
  -- Count actual chatbots
  SELECT COUNT(*) INTO v_actual_count
  FROM public.chatbots
  WHERE user_id = p_user_id
    AND status != 'deleted'; -- Exclude soft-deleted chatbots if applicable

  -- Update subscription with actual count
  UPDATE public.subscriptions
  SET
    usage = jsonb_set(
      usage,
      ARRAY['chatbots_count'],
      to_jsonb(v_actual_count)
    ),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN v_actual_count;
END;
$$;

COMMENT ON FUNCTION public.sync_chatbot_count IS
'Synchronizes chatbot count in subscription with actual database count';


-- ============================================================================
-- 6. GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_plan_change TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_chatbot_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_events TO authenticated;

-- Allow service role to manage webhook events
GRANT ALL ON TABLE public.webhook_events TO service_role;
GRANT SELECT, INSERT ON TABLE public.webhook_events TO authenticated;
