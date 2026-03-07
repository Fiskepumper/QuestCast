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
