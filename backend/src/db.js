const path = require("path");
const Database = require("better-sqlite3");

const DATABASE_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, "..", "db.sqlite");

// Singleton DB handle for the whole backend process.
const db = new Database(DATABASE_PATH);

function initDb() {
  // Keep it simple for a dev app.
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      is_online INTEGER NOT NULL DEFAULT 0,
      last_seen_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user1_id, user2_id),
      FOREIGN KEY(user1_id) REFERENCES users(id),
      FOREIGN KEY(user2_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      delivered_at DATETIME,
      read_at DATETIME,
      edited_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(chat_id) REFERENCES chats(id),
      FOREIGN KEY(sender_id) REFERENCES users(id)
    );
  `);

  // Lightweight migrations for existing DB files.
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  if (!cols.includes("is_online")) {
    db.exec(`ALTER TABLE users ADD COLUMN is_online INTEGER NOT NULL DEFAULT 0`);
  }
  if (!cols.includes("last_seen_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN last_seen_at DATETIME`);
  }

  const msgCols = db.prepare(`PRAGMA table_info(messages)`).all().map((c) => c.name);
  if (!msgCols.includes("delivered_at")) {
    db.exec(`ALTER TABLE messages ADD COLUMN delivered_at DATETIME`);
  }
  if (!msgCols.includes("read_at")) {
    db.exec(`ALTER TABLE messages ADD COLUMN read_at DATETIME`);
  }
  if (!msgCols.includes("edited_at")) {
    db.exec(`ALTER TABLE messages ADD COLUMN edited_at DATETIME`);
  }
}

module.exports = { db, initDb };

