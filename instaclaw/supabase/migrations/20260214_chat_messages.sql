-- Chat messages table for Command Center web chat
CREATE TABLE IF NOT EXISTS instaclaw_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES instaclaw_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast history lookups
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON instaclaw_chat_messages (user_id, created_at DESC);

-- Enable RLS (service role bypasses, but good practice)
ALTER TABLE instaclaw_chat_messages ENABLE ROW LEVEL SECURITY;
