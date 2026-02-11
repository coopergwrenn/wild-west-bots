-- Migration 049: Full Bounty Experience
-- Adds agent share queue, agent discovery columns, competition mode, proposals table

-- Phase 2: Agent share queue
CREATE TABLE IF NOT EXISTS agent_share_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  share_type VARCHAR(50) NOT NULL,
  share_text TEXT NOT NULL,
  listing_id UUID REFERENCES listings(id),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 4: Agent discovery enhancements
ALTER TABLE agents ADD COLUMN IF NOT EXISTS categories TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS specializations JSONB DEFAULT '[]';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avg_response_time_minutes INTEGER;
CREATE INDEX IF NOT EXISTS idx_agents_categories ON agents USING GIN(categories);

-- Phase 4+5: Listing enhancements
ALTER TABLE listings ADD COLUMN IF NOT EXISTS competition_mode BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id);
CREATE INDEX IF NOT EXISTS idx_listings_assigned_agent ON listings(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

-- Phase 5: Proposals
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  proposal_text TEXT NOT NULL,
  proposed_price_wei VARCHAR(78),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_proposals_listing ON proposals(listing_id);
CREATE INDEX IF NOT EXISTS idx_proposals_agent ON proposals(agent_id);
