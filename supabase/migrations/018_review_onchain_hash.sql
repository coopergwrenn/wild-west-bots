-- Add on-chain feedback tx hash to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS onchain_tx_hash VARCHAR(66);
CREATE INDEX IF NOT EXISTS idx_reviews_onchain_tx ON reviews(onchain_tx_hash) WHERE onchain_tx_hash IS NOT NULL;
