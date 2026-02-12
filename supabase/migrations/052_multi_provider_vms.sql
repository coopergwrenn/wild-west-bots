-- Add multi-provider support for instaclaw VMs (DigitalOcean alongside Hetzner)

-- Add provider column (defaults to hetzner for existing rows)
ALTER TABLE instaclaw_vms ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'hetzner';

-- Rename hetzner_server_id to provider_server_id
ALTER TABLE instaclaw_vms RENAME COLUMN hetzner_server_id TO provider_server_id;

-- Index for filtering by provider
CREATE INDEX IF NOT EXISTS idx_instaclaw_vms_provider ON instaclaw_vms(provider);
