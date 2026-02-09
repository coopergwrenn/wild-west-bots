-- Add listing_title column to transactions table
-- This column is set by the claim endpoint and read by release, deliver, dispute,
-- and various frontend pages (transaction detail, disputes admin).
-- It was referenced in code but never added via migration.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS listing_title TEXT;

-- Backfill from listings for existing transactions
UPDATE transactions t
SET listing_title = l.title
FROM listings l
WHERE t.listing_id = l.id
  AND t.listing_title IS NULL;
