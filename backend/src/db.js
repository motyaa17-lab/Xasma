const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required (Railway Postgres).");
}

// Shared connection pool.
const pool = new Pool({
  connectionString: DATABASE_URL,
  // Railway commonly requires SSL in production.
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initDb() {
  // Postgres schema initialization (idempotent).
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      banned BOOLEAN NOT NULL DEFAULT FALSE,
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chats (
      id BIGSERIAL PRIMARY KEY,
      user1_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chats_unique_pair UNIQUE (user1_id, user2_id)
    );

    -- Required by spec; useful for future group chats.
    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      edited_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id BIGSERIAL PRIMARY KEY,
      message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, id);
    CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
  `);

  // Migrations for existing DBs (safe/idempotent).
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE`);

  // Group chats: type, title, creator; direct chats keep ordered user1_id/user2_id.
  await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'direct'`);
  await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS title TEXT`);
  await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id)`);
  await query(`ALTER TABLE chats ALTER COLUMN user1_id DROP NOT NULL`);
  await query(`ALTER TABLE chats ALTER COLUMN user2_id DROP NOT NULL`);

  await query(`ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_unique_pair`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS chats_direct_pair_uidx
    ON chats (user1_id, user2_id)
    WHERE type = 'direct' AND user1_id IS NOT NULL AND user2_id IS NOT NULL
  `);

  // Ensure chat_members has rows for existing direct chats (idempotent).
  await query(`
    INSERT INTO chat_members (chat_id, user_id)
    SELECT c.id, c.user1_id FROM chats c
    WHERE c.user1_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  await query(`
    INSERT INTO chat_members (chat_id, user_id)
    SELECT c.id, c.user2_id FROM chats c
    WHERE c.user2_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);

  // System / membership timeline events (group chats).
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS system_kind TEXT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS system_payload JSONB`);

  await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT`);

  // Ensure initial admin (safe if user doesn't exist).
  await query(`UPDATE users SET role = 'admin' WHERE username = 'Xasma'`);
}

module.exports = { pool, query, initDb };

