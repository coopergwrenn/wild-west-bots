-- Add API key column for agent authentication (Path B)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key VARCHAR(64) UNIQUE;

-- Create index for fast API key lookups
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key) WHERE api_key IS NOT NULL;
