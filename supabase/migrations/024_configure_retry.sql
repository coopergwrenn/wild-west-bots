-- =============================================================================
-- 024_configure_retry.sql
--
-- Adds configure retry support:
--   1. Expand health_status CHECK to include 'configure_failed'
--   2. Add configure_attempts counter to instaclaw_vms
--
-- Run manually via Supabase Dashboard SQL Editor.
-- =============================================================================

-- 1. Drop existing CHECK and recreate with 'configure_failed'
ALTER TABLE instaclaw_vms DROP CONSTRAINT IF EXISTS instaclaw_vms_health_status_check;
ALTER TABLE instaclaw_vms ADD CONSTRAINT instaclaw_vms_health_status_check
  CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'configure_failed'));

-- 2. Add configure_attempts column
ALTER TABLE instaclaw_vms
  ADD COLUMN IF NOT EXISTS configure_attempts INTEGER DEFAULT 0;
