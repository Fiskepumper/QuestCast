-- QuestCast database schema

CREATE TABLE IF NOT EXISTS users (
  uuid           TEXT PRIMARY KEY,
  platform       TEXT NOT NULL,
  platform_id    TEXT NOT NULL,
  username       TEXT NOT NULL,
  email          TEXT,
  avatar_url     TEXT,
  display_name   TEXT,
  avatar_choice  TEXT DEFAULT 'platform',
  wallet_address TEXT,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, platform_id)
);

-- Add wallet_address if upgrading from older schema
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;

CREATE TABLE IF NOT EXISTS platform_links (
  email         TEXT NOT NULL,
  user_uuid     TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  platform_id   TEXT NOT NULL,
  PRIMARY KEY (platform, platform_id)
);

-- Hvilken challenge registrerte brukeren seg på?
CREATE TABLE IF NOT EXISTS user_challenges (
  id             SERIAL PRIMARY KEY,
  user_uuid      TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  challenge_uuid TEXT NOT NULL,
  challenge_name TEXT NOT NULL,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_uuid, challenge_uuid)            -- én registrering per challenge per bruker
);

CREATE TABLE IF NOT EXISTS registrations (
  platform      TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0
);

-- Seed platforms so rows always exist
INSERT INTO registrations (platform, count)
VALUES ('metamask', 0), ('google', 0), ('microsoft', 0)
ON CONFLICT (platform) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCKCHAIN CHALLENGES (Cache for UI - Truth is on-chain)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blockchain_challenges (
  chain_id        BIGINT PRIMARY KEY,  -- ID fra smart contract (or timestamp for virtual)
  challenge_type  TEXT NOT NULL,        -- 'coinflip', 'sports', etc.
  status          TEXT NOT NULL,        -- 'open', 'locked', 'settled', 'refunded'
  name            TEXT NOT NULL,
  description     TEXT,
  entry_fee       BIGINT NOT NULL,      -- USDC amount (6 decimals)
  max_players     INTEGER DEFAULT 2,    -- 2 for 1v1, more for multiplayer
  total_pot       BIGINT DEFAULT 0,     -- Total pot (after fees)
  total_fee       BIGINT DEFAULT 0,     -- Total fees collected
  outcome         TEXT,                 -- 'heads', 'tails', or null
  creator_uuid    TEXT REFERENCES users(uuid),  -- Who created this challenge
  creator_address TEXT NOT NULL,        -- Wallet address of creator
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at       TIMESTAMPTZ,
  settled_at      TIMESTAMPTZ,
  tx_hash         TEXT,                 -- Transaction hash for creation
  contract_addr   TEXT NOT NULL         -- ChallengeHub contract address
);

CREATE TABLE IF NOT EXISTS coinflip_bets (
  id              SERIAL PRIMARY KEY,
  challenge_id    BIGINT NOT NULL REFERENCES blockchain_challenges(chain_id),
  user_address    TEXT NOT NULL,        -- Wallet address (lowercase)
  user_uuid       TEXT REFERENCES users(uuid),  -- Optional link to user
  amount          BIGINT NOT NULL,      -- USDC amount AFTER fee (6 decimals)
  fee_paid        BIGINT NOT NULL,      -- Fee amount paid
  choice          TEXT NOT NULL,        -- 'heads' or 'tails'
  is_creator      BOOLEAN DEFAULT false, -- Is this the challenge creator?
  claimed         BOOLEAN DEFAULT false,
  payout          BIGINT,               -- Actual payout if won
  bet_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash         TEXT NOT NULL,        -- Transaction hash
  UNIQUE (challenge_id, user_address)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_challenges_status ON blockchain_challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_type ON blockchain_challenges(challenge_type);
CREATE INDEX IF NOT EXISTS idx_challenges_creator ON blockchain_challenges(creator_uuid);
CREATE INDEX IF NOT EXISTS idx_bets_challenge ON coinflip_bets(challenge_id);
CREATE INDEX IF NOT EXISTS idx_bets_user ON coinflip_bets(user_address);
CREATE INDEX IF NOT EXISTS idx_bets_user_uuid ON coinflip_bets(user_uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER BALANCES (Virtual balance tracking for deposited funds)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_balances (
  wallet_address  TEXT PRIMARY KEY,     -- Wallet address (lowercase)
  deposited       BIGINT DEFAULT 0,     -- Total deposited on-chain (USDC 6 decimals)
  available       BIGINT DEFAULT 0,     -- Available for betting
  locked          BIGINT DEFAULT 0,     -- Locked in active challenges
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_balances_wallet ON user_balances(wallet_address);

-- Migrate existing tables to BIGINT (safe to run multiple times)
DO $$ 
BEGIN
  -- Change chain_id to BIGINT if it's not already
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'blockchain_challenges' 
    AND column_name = 'chain_id' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE coinflip_bets DROP CONSTRAINT IF EXISTS coinflip_bets_challenge_id_fkey;
    ALTER TABLE blockchain_challenges ALTER COLUMN chain_id TYPE BIGINT;
    ALTER TABLE coinflip_bets ALTER COLUMN challenge_id TYPE BIGINT;
    ALTER TABLE coinflip_bets ADD CONSTRAINT coinflip_bets_challenge_id_fkey 
      FOREIGN KEY (challenge_id) REFERENCES blockchain_challenges(chain_id);
    RAISE NOTICE 'Migrated chain_id to BIGINT';
  END IF;
END $$;
