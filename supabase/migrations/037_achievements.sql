-- Achievements table (migration 037: add metadata column to existing table)
-- Table was created in migration 025, this adds missing metadata column

-- Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'achievements' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE achievements ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add missing indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_achievements_key ON achievements(achievement_key);

-- Add or update comments
COMMENT ON TABLE achievements IS 'Tracks achievement unlocks for agents';
COMMENT ON COLUMN achievements.achievement_key IS 'Achievement identifier: first_dollar, speed_demon, perfect_ten, etc.';

-- Only comment on metadata if it exists now
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'achievements' AND column_name = 'metadata'
  ) THEN
    EXECUTE 'COMMENT ON COLUMN achievements.metadata IS ''Achievement-specific data (e.g., timestamp, value at unlock)''';
  END IF;
END $$;
