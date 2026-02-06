-- Daily usage limits for all-inclusive tier
-- Prevents unbounded API costs by capping messages per day per tier

CREATE TABLE instaclaw_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vm_id UUID NOT NULL REFERENCES instaclaw_vms(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_daily_usage UNIQUE (vm_id, usage_date)
);

CREATE INDEX idx_daily_usage_vm_date ON instaclaw_daily_usage (vm_id, usage_date);

CREATE TRIGGER trg_instaclaw_daily_usage_updated_at
  BEFORE UPDATE ON instaclaw_daily_usage
  FOR EACH ROW
  EXECUTE FUNCTION instaclaw_set_updated_at();

-- Increment usage and return whether the request is allowed.
-- Returns JSON: { "allowed": bool, "count": int, "limit": int }
CREATE OR REPLACE FUNCTION instaclaw_check_daily_limit(
  p_vm_id UUID,
  p_tier TEXT
)
RETURNS JSONB AS $$
DECLARE
  daily_limit INTEGER;
  current_count INTEGER;
  today DATE := CURRENT_DATE;
BEGIN
  -- Tier limits
  CASE p_tier
    WHEN 'starter' THEN daily_limit := 100;
    WHEN 'pro'     THEN daily_limit := 500;
    WHEN 'power'   THEN daily_limit := 2000;
    ELSE daily_limit := 100;  -- default to lowest
  END CASE;

  -- Upsert: create today's row if missing, increment counter
  INSERT INTO instaclaw_daily_usage (vm_id, usage_date, message_count)
  VALUES (p_vm_id, today, 1)
  ON CONFLICT (vm_id, usage_date)
  DO UPDATE SET message_count = instaclaw_daily_usage.message_count + 1,
                updated_at = NOW()
  RETURNING message_count INTO current_count;

  -- If over limit, roll back the increment and deny
  IF current_count > daily_limit THEN
    UPDATE instaclaw_daily_usage
    SET message_count = message_count - 1
    WHERE vm_id = p_vm_id AND usage_date = today;

    RETURN jsonb_build_object(
      'allowed', false,
      'count', current_count - 1,
      'limit', daily_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'count', current_count,
    'limit', daily_limit
  );
END;
$$ LANGUAGE plpgsql;

-- Also store tier on instaclaw_vms so the proxy can look it up
ALTER TABLE instaclaw_vms
  ADD COLUMN IF NOT EXISTS tier TEXT;

-- RLS: service role only (backend access)
ALTER TABLE instaclaw_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to instaclaw_daily_usage"
  ON instaclaw_daily_usage
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
