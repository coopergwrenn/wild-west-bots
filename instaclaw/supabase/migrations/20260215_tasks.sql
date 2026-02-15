-- Task storage for Command Center
CREATE TABLE IF NOT EXISTS instaclaw_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES instaclaw_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Processing...',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'active')),
  is_recurring BOOLEAN DEFAULT FALSE,
  frequency TEXT,
  streak INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  result TEXT,
  error_message TEXT,
  tools_used TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_instaclaw_tasks_updated_at
  BEFORE UPDATE ON instaclaw_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON instaclaw_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON instaclaw_tasks(user_id, created_at DESC);

-- RLS (service role bypasses, but good practice)
ALTER TABLE instaclaw_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON instaclaw_tasks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own tasks"
  ON instaclaw_tasks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tasks"
  ON instaclaw_tasks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own tasks"
  ON instaclaw_tasks FOR DELETE
  USING (user_id = auth.uid());
