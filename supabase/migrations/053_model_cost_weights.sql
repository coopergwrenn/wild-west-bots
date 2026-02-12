-- 053_model_cost_weights.sql
-- Model-aware cost weights for daily limits + credit pack system

-- Credit balance on VMs (purchased add-on messages)
ALTER TABLE instaclaw_vms ADD COLUMN IF NOT EXISTS credit_balance INTEGER DEFAULT 0;

-- Credit pack purchase log
CREATE TABLE IF NOT EXISTS instaclaw_credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vm_id UUID NOT NULL REFERENCES instaclaw_vms(id) ON DELETE CASCADE,
  stripe_payment_intent TEXT,
  credits_purchased INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_vm
  ON instaclaw_credit_purchases (vm_id);

-- RLS for credit purchases
ALTER TABLE instaclaw_credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to instaclaw_credit_purchases"
  ON instaclaw_credit_purchases
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Replace the daily limit function with model-aware cost weights + credit overflow
CREATE OR REPLACE FUNCTION instaclaw_check_daily_limit(
  p_vm_id UUID,
  p_tier TEXT,
  p_model TEXT DEFAULT 'claude-haiku-4-5-20251001'
)
RETURNS JSONB AS $$
DECLARE
  daily_limit INTEGER;
  cost_weight INTEGER;
  current_count INTEGER;
  vm_credits INTEGER;
  today DATE := CURRENT_DATE;
BEGIN
  -- Tier limits (in haiku-equivalent message units)
  CASE p_tier
    WHEN 'starter' THEN daily_limit := 100;
    WHEN 'pro'     THEN daily_limit := 500;
    WHEN 'power'   THEN daily_limit := 2000;
    ELSE daily_limit := 100;
  END CASE;

  -- Model cost weights (reflects Anthropic pricing ratios)
  CASE
    WHEN p_model ILIKE '%haiku%'  THEN cost_weight := 1;
    WHEN p_model ILIKE '%sonnet%' THEN cost_weight := 3;
    WHEN p_model ILIKE '%opus%'   THEN cost_weight := 15;
    ELSE cost_weight := 3;  -- default to sonnet-level
  END CASE;

  -- Get current count (without incrementing yet)
  SELECT COALESCE(message_count, 0) INTO current_count
  FROM instaclaw_daily_usage
  WHERE vm_id = p_vm_id AND usage_date = today;

  IF current_count IS NULL THEN
    current_count := 0;
  END IF;

  -- Check if adding this message would exceed the daily limit
  IF current_count + cost_weight > daily_limit THEN
    -- Over daily limit — check credit balance
    SELECT COALESCE(credit_balance, 0) INTO vm_credits
    FROM instaclaw_vms
    WHERE id = p_vm_id;

    IF vm_credits >= cost_weight THEN
      -- Deduct from credits and allow
      UPDATE instaclaw_vms
      SET credit_balance = credit_balance - cost_weight
      WHERE id = p_vm_id;

      -- Still increment usage for tracking
      INSERT INTO instaclaw_daily_usage (vm_id, usage_date, message_count)
      VALUES (p_vm_id, today, cost_weight)
      ON CONFLICT (vm_id, usage_date)
      DO UPDATE SET message_count = instaclaw_daily_usage.message_count + cost_weight,
                    updated_at = NOW();

      RETURN jsonb_build_object(
        'allowed', true,
        'source', 'credits',
        'count', current_count + cost_weight,
        'limit', daily_limit,
        'credits_remaining', vm_credits - cost_weight,
        'cost_weight', cost_weight
      );
    ELSE
      -- No credits — deny
      RETURN jsonb_build_object(
        'allowed', false,
        'count', current_count,
        'limit', daily_limit,
        'credits_remaining', vm_credits,
        'cost_weight', cost_weight
      );
    END IF;
  END IF;

  -- Within daily limit — increment and allow
  INSERT INTO instaclaw_daily_usage (vm_id, usage_date, message_count)
  VALUES (p_vm_id, today, cost_weight)
  ON CONFLICT (vm_id, usage_date)
  DO UPDATE SET message_count = instaclaw_daily_usage.message_count + cost_weight,
                updated_at = NOW()
  RETURNING message_count INTO current_count;

  RETURN jsonb_build_object(
    'allowed', true,
    'source', 'daily_limit',
    'count', current_count,
    'limit', daily_limit,
    'credits_remaining', COALESCE((SELECT credit_balance FROM instaclaw_vms WHERE id = p_vm_id), 0),
    'cost_weight', cost_weight
  );
END;
$$ LANGUAGE plpgsql;

-- Helper: atomically add credits to a VM (used by webhook after Stripe payment)
CREATE OR REPLACE FUNCTION instaclaw_add_credits(
  p_vm_id UUID,
  p_credits INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE instaclaw_vms
  SET credit_balance = COALESCE(credit_balance, 0) + p_credits
  WHERE id = p_vm_id
  RETURNING credit_balance INTO new_balance;

  RETURN COALESCE(new_balance, 0);
END;
$$ LANGUAGE plpgsql;
