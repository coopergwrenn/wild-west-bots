-- Add columns for dashboard-based Gmail OAuth flow
ALTER TABLE instaclaw_users
  ADD COLUMN IF NOT EXISTS gmail_access_token TEXT,
  ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gmail_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_popup_dismissed BOOLEAN DEFAULT FALSE;
