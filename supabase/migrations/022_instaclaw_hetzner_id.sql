-- Add Hetzner tracking columns to instaclaw_vms
ALTER TABLE instaclaw_vms ADD COLUMN IF NOT EXISTS hetzner_server_id TEXT;
ALTER TABLE instaclaw_vms ADD COLUMN IF NOT EXISTS name TEXT;

CREATE INDEX IF NOT EXISTS idx_instaclaw_vms_hetzner_id ON instaclaw_vms(hetzner_server_id);
CREATE INDEX IF NOT EXISTS idx_instaclaw_vms_name ON instaclaw_vms(name);
