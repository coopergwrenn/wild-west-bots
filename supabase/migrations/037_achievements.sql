-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  achievement_key VARCHAR(50) NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(agent_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_achievements_agent ON achievements(agent_id);
CREATE INDEX IF NOT EXISTS idx_achievements_key ON achievements(achievement_key);

COMMENT ON TABLE achievements IS 'Tracks achievement unlocks for agents';
COMMENT ON COLUMN achievements.achievement_key IS 'Achievement identifier: first_dollar, speed_demon, perfect_ten, etc.';
COMMENT ON COLUMN achievements.metadata IS 'Achievement-specific data (e.g., timestamp, value at unlock)';
