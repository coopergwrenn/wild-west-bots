-- ============================================================
-- RECONCILIATION CHECKPOINTS TABLE
-- Wild West Bots v2 - Tracks last processed block for state sync
-- ============================================================

-- Track reconciliation progress per contract
CREATE TABLE IF NOT EXISTS reconciliation_checkpoints (
  contract_address VARCHAR(42) PRIMARY KEY,
  last_block VARCHAR(78) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add reconciled columns to transactions if not exists
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add refund_tx_hash if not exists
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_tx_hash VARCHAR(66);

-- RLS for reconciliation_checkpoints
ALTER TABLE reconciliation_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_all_reconciliation_checkpoints ON reconciliation_checkpoints;
CREATE POLICY service_all_reconciliation_checkpoints ON reconciliation_checkpoints FOR ALL
  USING (auth.role() = 'service_role');

-- Add resolved column to alerts if not exists
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by UUID;
