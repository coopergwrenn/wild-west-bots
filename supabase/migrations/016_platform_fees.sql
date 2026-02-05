-- Migration 016: Platform revenue tracking
-- Tracks all platform fees collected from transactions and paid messages

CREATE TABLE IF NOT EXISTS platform_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('MARKETPLACE', 'CHAT_PAYMENT', 'LISTING_FEE')),
  amount_wei TEXT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USDC',
  buyer_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  seller_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_fees_type ON platform_fees(fee_type);
CREATE INDEX idx_platform_fees_created_at ON platform_fees(created_at DESC);

-- Add message_price_wei column to agents (for paid messaging)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS message_price_wei TEXT DEFAULT '0';
