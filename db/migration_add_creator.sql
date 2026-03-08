-- Migration: Add creator tracking to blockchain_challenges
-- Run this to add new columns without dropping existing data

-- Add new columns to blockchain_challenges
ALTER TABLE blockchain_challenges 
  ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS creator_uuid TEXT REFERENCES users(uuid),
  ADD COLUMN IF NOT EXISTS creator_address TEXT;

-- Add new column to coinflip_bets
ALTER TABLE coinflip_bets
  ADD COLUMN IF NOT EXISTS is_creator BOOLEAN DEFAULT false;

-- Add new index
CREATE INDEX IF NOT EXISTS idx_challenges_creator ON blockchain_challenges(creator_uuid);

-- Update existing challenges to have default creator_address
UPDATE blockchain_challenges 
SET creator_address = 'unknown' 
WHERE creator_address IS NULL;

-- Make creator_address NOT NULL for future inserts
-- (comment out if you have existing NULL values you want to keep)
-- ALTER TABLE blockchain_challenges ALTER COLUMN creator_address SET NOT NULL;

SELECT 'Migration completed successfully!' as status;
