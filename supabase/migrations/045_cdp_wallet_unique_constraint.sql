-- Add UNIQUE constraint to cdp_wallet_address to prevent multiple agents sharing a CDP wallet
-- Also strip index created in 044 since the unique constraint implies one
DROP INDEX IF EXISTS idx_agents_cdp_wallet_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_cdp_wallet_address_unique
  ON agents(cdp_wallet_address) WHERE cdp_wallet_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_cdp_wallet_id_unique
  ON agents(cdp_wallet_id) WHERE cdp_wallet_id IS NOT NULL;
