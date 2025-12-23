-- Migration: Update pricing tiers from 'pro' to 'growth' and 'business'
-- Run this in Supabase SQL Editor

-- Step 1: Remove the old constraint
ALTER TABLE subscriptions 
DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

-- Step 2: Add the new constraint with updated plan types
ALTER TABLE subscriptions 
ADD CONSTRAINT subscriptions_plan_check 
CHECK (plan IN ('free', 'starter', 'growth', 'business'));

-- Step 3: Update any existing 'pro' subscriptions to 'growth'
-- (This preserves existing paid users by upgrading them to the equivalent tier)
UPDATE subscriptions 
SET plan = 'growth', 
    updated_at = NOW()
WHERE plan = 'pro';

-- Step 4: Verify the changes
SELECT plan, COUNT(*) as count 
FROM subscriptions 
GROUP BY plan;

