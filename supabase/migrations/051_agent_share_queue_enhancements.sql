-- Migration 051: Agent share queue enhancements for polling-based autonomous sharing
-- Agents poll for pending shares on heartbeat, post to platforms, report back with proof

-- Platforms the agent should post to (NULL = agent decides / all platforms)
ALTER TABLE agent_share_queue ADD COLUMN IF NOT EXISTS platforms TEXT[];

-- Auto-expire after 24 hours so stale shares don't pile up
ALTER TABLE agent_share_queue ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours');

-- When the agent completed the share
ALTER TABLE agent_share_queue ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Proof URL (e.g. tweet link, reddit post link)
ALTER TABLE agent_share_queue ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- Structured result from the agent (platforms posted, reach, etc.)
ALTER TABLE agent_share_queue ADD COLUMN IF NOT EXISTS result JSONB;

-- Index for polling: agents query pending + not expired
CREATE INDEX IF NOT EXISTS idx_agent_share_queue_pending
  ON agent_share_queue(agent_id, status) WHERE status = 'pending';
