-- Migration 042: Add platform balance system for oracle-funded escrows
-- Instead of buyers signing transactions, they deposit USDC to platform balance
-- Oracle wallet fronts all escrow transactions on their behalf

-- Add platform balance to users table (human buyers)
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_balance_wei BIGINT DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_balance_wei BIGINT DEFAULT 0 NOT NULL;

-- Add platform balance to agents table (agent buyers/sellers)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS platform_balance_wei BIGINT DEFAULT 0 NOT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS locked_balance_wei BIGINT DEFAULT 0 NOT NULL;

-- Create platform_transactions table to track deposits, withdrawals, and internal transfers
CREATE TABLE IF NOT EXISTS platform_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wallet VARCHAR(42),
  agent_id UUID REFERENCES agents(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'LOCK', 'UNLOCK', 'DEBIT', 'CREDIT')),
  amount_wei BIGINT NOT NULL,
  reference_id UUID,  -- transaction_id or listing_id that caused this
  tx_hash VARCHAR(66),  -- on-chain deposit/withdrawal transaction
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT platform_transactions_user_check CHECK (user_wallet IS NOT NULL OR agent_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_platform_transactions_user ON platform_transactions(user_wallet) WHERE user_wallet IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_transactions_agent ON platform_transactions(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_transactions_type ON platform_transactions(type);
CREATE INDEX IF NOT EXISTS idx_platform_transactions_reference ON platform_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- Add flag to transactions to track if escrow was oracle-funded
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS oracle_funded BOOLEAN DEFAULT false;

-- Add oracle wallet address to transactions (tracks which wallet fronted the escrow)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS oracle_wallet VARCHAR(42);

COMMENT ON COLUMN users.platform_balance_wei IS 'USDC balance held by platform (in wei/6 decimals)';
COMMENT ON COLUMN users.locked_balance_wei IS 'USDC locked in active bounties/escrows';
COMMENT ON COLUMN agents.platform_balance_wei IS 'USDC balance held by platform (in wei/6 decimals)';
COMMENT ON COLUMN agents.locked_balance_wei IS 'USDC locked in active bounties/escrows';
COMMENT ON COLUMN transactions.oracle_funded IS 'True if oracle wallet fronted the escrow on behalf of buyer';
COMMENT ON COLUMN transactions.oracle_wallet IS 'Oracle wallet address that fronted this escrow';
COMMENT ON TABLE platform_transactions IS 'Ledger of all platform balance changes (deposits, withdrawals, locks, credits, debits)';

-- Database functions for atomic balance operations

-- Increment user balance (used for deposits and credits)
CREATE OR REPLACE FUNCTION increment_user_balance(p_wallet_address VARCHAR, p_amount_wei BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET platform_balance_wei = platform_balance_wei + p_amount_wei
  WHERE wallet_address = p_wallet_address;
END;
$$ LANGUAGE plpgsql;

-- Increment agent balance (used for deposits and credits)
CREATE OR REPLACE FUNCTION increment_agent_balance(p_agent_id UUID, p_amount_wei BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE agents
  SET platform_balance_wei = platform_balance_wei + p_amount_wei
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Lock user balance (transfer from available to locked)
CREATE OR REPLACE FUNCTION lock_user_balance(p_wallet_address VARCHAR, p_amount_wei BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_available BIGINT;
BEGIN
  SELECT platform_balance_wei INTO v_available
  FROM users
  WHERE wallet_address = p_wallet_address
  FOR UPDATE;

  IF v_available < p_amount_wei THEN
    RETURN false;
  END IF;

  UPDATE users
  SET platform_balance_wei = platform_balance_wei - p_amount_wei,
      locked_balance_wei = locked_balance_wei + p_amount_wei
  WHERE wallet_address = p_wallet_address;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Lock agent balance (transfer from available to locked)
CREATE OR REPLACE FUNCTION lock_agent_balance(p_agent_id UUID, p_amount_wei BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_available BIGINT;
BEGIN
  SELECT platform_balance_wei INTO v_available
  FROM agents
  WHERE id = p_agent_id
  FOR UPDATE;

  IF v_available < p_amount_wei THEN
    RETURN false;
  END IF;

  UPDATE agents
  SET platform_balance_wei = platform_balance_wei - p_amount_wei,
      locked_balance_wei = locked_balance_wei + p_amount_wei
  WHERE id = p_agent_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Unlock user balance (transfer from locked back to available)
CREATE OR REPLACE FUNCTION unlock_user_balance(p_wallet_address VARCHAR, p_amount_wei BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET platform_balance_wei = platform_balance_wei + p_amount_wei,
      locked_balance_wei = locked_balance_wei - p_amount_wei
  WHERE wallet_address = p_wallet_address;
END;
$$ LANGUAGE plpgsql;

-- Unlock agent balance (transfer from locked back to available)
CREATE OR REPLACE FUNCTION unlock_agent_balance(p_agent_id UUID, p_amount_wei BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE agents
  SET platform_balance_wei = platform_balance_wei + p_amount_wei,
      locked_balance_wei = locked_balance_wei - p_amount_wei
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Debit locked user balance (remove from locked, used when escrow is created on-chain)
CREATE OR REPLACE FUNCTION debit_locked_user_balance(p_wallet_address VARCHAR, p_amount_wei BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET locked_balance_wei = locked_balance_wei - p_amount_wei
  WHERE wallet_address = p_wallet_address;
END;
$$ LANGUAGE plpgsql;

-- Debit locked agent balance (remove from locked, used when escrow is created on-chain)
CREATE OR REPLACE FUNCTION debit_locked_agent_balance(p_agent_id UUID, p_amount_wei BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE agents
  SET locked_balance_wei = locked_balance_wei - p_amount_wei
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;
