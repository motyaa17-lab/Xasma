const { Pool } = require("pg");
const crypto = require("crypto");

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
      email TEXT,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      status_kind TEXT,
      status_text TEXT,
      about TEXT,
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
      reply_to_message_id BIGINT,
      forward_from_message_id BIGINT,
      deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      edited_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS message_hidden (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, message_id)
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
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_kind TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_text TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS about TEXT`);

  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS forward_from_message_id BIGINT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_messages_forward_from ON messages(forward_from_message_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_messages_deleted_for_all ON messages(deleted_for_all, deleted_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS message_hidden (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, message_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_message_hidden_user ON message_hidden(user_id, created_at DESC)`);

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

  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url TEXT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_url TEXT`);

  // One official "Xasma" system chat per user (not a shared group).
  await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS official_for_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS chats_official_for_user_uidx
    ON chats (official_for_user_id)
    WHERE type = 'official'
  `);

  // Message safety flags (keyword review; does not block delivery).
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS risk_level TEXT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS flagged_reason TEXT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_messages_flagged ON messages (flagged, flagged_at DESC) WHERE flagged = TRUE`
  );

  await query(`
    CREATE TABLE IF NOT EXISTS message_reports (
      id BIGSERIAL PRIMARY KEY,
      message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL CHECK (reason IN ('spam', 'scam', 'abuse')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (message_id, reporter_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_message_reports_created ON message_reports (created_at DESC)`);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS aura_color TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_sent_count BIGINT NOT NULL DEFAULT 0`);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_tag TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tag_color TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tag_style TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username_style TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_ring TEXT`);

  // Unique @handle (stored lowercase, no "@"); `username` remains the visible display name + login by display.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_handle TEXT`);

  // Referrals (MVP).
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by BIGINT REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referrals_count BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_custom_bg BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_badge BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_reactions BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_premium_lite BOOLEAN NOT NULL DEFAULT FALSE`);
  // Premium (separate from Premium-lite rewards).
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_activated_at TIMESTAMPTZ`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_bg_url TEXT`);
  // Timed premium access (source of truth).
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_type TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_granted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uidx
    ON users (referral_code)
    WHERE referral_code IS NOT NULL
  `);

  function base62(bytes) {
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = "";
    while (n > 0n) {
      out = alphabet[Number(n % 62n)] + out;
      n = n / 62n;
    }
    return out || "0";
  }

  function generateReferralCode() {
    // 6-10 chars typical; keep short but unique enough.
    const raw = base62(crypto.randomBytes(6)).replace(/0/g, "a");
    return raw.slice(0, 8);
  }

  // Backfill referral codes for existing users (idempotent, retries on rare collisions).
  for (let rounds = 0; rounds < 50; rounds++) {
    const r = await query(`SELECT id FROM users WHERE referral_code IS NULL LIMIT 200`);
    if (!r.rows.length) break;
    for (const row of r.rows) {
      const uid = Number(row.id);
      if (!uid) continue;
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = generateReferralCode();
        try {
          await query(`UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL`, [code, uid]);
          break;
        } catch (e) {
          // Unique collision; retry.
          const msg = String(e?.message || "");
          if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) continue;
          break;
        }
      }
    }
  }

  await query(`
    ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_message_id BIGINT
    REFERENCES messages(id) ON DELETE SET NULL
  `);

  await query(`ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS list_pinned_at TIMESTAMPTZ`);

  // Backfill message counts from existing text messages (system excluded).
  await query(`
    UPDATE users u
    SET messages_sent_count = COALESCE(s.cnt, 0)
    FROM (
      SELECT sender_id, COUNT(*)::bigint AS cnt
      FROM messages
      WHERE COALESCE(message_type, 'text') = 'text'
      GROUP BY sender_id
    ) s
    WHERE u.id = s.sender_id
  `);

  const RESERVED_HANDLES = new Set([
    "xasma",
    "xasma_official",
    "admin",
    "system",
    "official",
    "support",
    "xasmaofficial",
  ]);

  function randomUserHandleCandidate() {
    return `user${1000000 + Math.floor(Math.random() * 9000000)}`;
  }

  // Official bot account: stable public handle.
  await query(
    `UPDATE users SET user_handle = 'xasma' WHERE username = 'xasma_official' AND (user_handle IS NULL OR TRIM(COALESCE(user_handle, '')) = '')`
  );

  for (let rounds = 0; rounds < 200; rounds++) {
    const r = await query(
      `SELECT id FROM users WHERE user_handle IS NULL OR TRIM(COALESCE(user_handle, '')) = '' LIMIT 150`
    );
    if (!r.rows.length) break;
    for (const row of r.rows) {
      const uid = Number(row.id);
      if (!uid) continue;
      let set = false;
      for (let attempt = 0; attempt < 40 && !set; attempt++) {
        const h = randomUserHandleCandidate();
        if (RESERVED_HANDLES.has(h)) continue;
        try {
          const up = await query(
            `UPDATE users SET user_handle = $1 WHERE id = $2 AND (user_handle IS NULL OR TRIM(COALESCE(user_handle, '')) = '')`,
            [h, uid]
          );
          if (up.rowCount > 0) set = true;
        } catch (e) {
          const msg = String(e?.message || "").toLowerCase();
          if (msg.includes("duplicate") || msg.includes("unique")) continue;
          throw e;
        }
      }
    }
  }

  const leftNull = await query(
    `SELECT COUNT(*)::int AS n FROM users WHERE user_handle IS NULL OR TRIM(COALESCE(user_handle, '')) = ''`
  );
  if (Number(leftNull.rows[0]?.n) === 0) {
    await query(`ALTER TABLE users ALTER COLUMN user_handle SET NOT NULL`);
  }

  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_user_handle_uidx ON users (user_handle)`);

  // Email login: enforce uniqueness case-insensitively (NULL allowed for legacy users).
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx
    ON users (LOWER(email))
    WHERE email IS NOT NULL AND TRIM(email) <> ''
  `);

  // Ensure initial admin (safe if user doesn't exist).
  await query(`UPDATE users SET role = 'admin' WHERE username = 'Xasma'`);
}

module.exports = { pool, query, initDb };

