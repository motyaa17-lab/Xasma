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

    CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, id);
  `);
}

module.exports = { pool, query, initDb };

