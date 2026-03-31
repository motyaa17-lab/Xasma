require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");

const { db, initDb } = require("./db");

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change_me";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

initDb();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function normalizeChatUsers(a, b) {
  // Ensure we store each one-to-one chat in a single canonical order.
  return a < b ? [a, b] : [b, a];
}

function getChatParticipants(chatId) {
  return db
    .prepare(
      `
      SELECT user1_id, user2_id
      FROM chats
      WHERE id = ?
    `
    )
    .get(chatId);
}

function getOrCreateChat(userA, userB) {
  const [user1_id, user2_id] = normalizeChatUsers(userA, userB);
  const existing = db
    .prepare(`SELECT id FROM chats WHERE user1_id = ? AND user2_id = ?`)
    .get(user1_id, user2_id);
  if (existing) return existing.id;
  const inserted = db
    .prepare(`INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)`)
    .run(user1_id, user2_id);
  return inserted.lastInsertRowid;
}

function getOtherUser(chatRow, meId) {
  const otherId = chatRow.user1_id === meId ? chatRow.user2_id : chatRow.user1_id;
  return db.prepare(`SELECT id, username, avatar_url FROM users WHERE id = ?`).get(otherId);
}

app.post("/api/register", async (req, res) => {
  const { username, password, avatar } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });

  const avatar_url = typeof avatar === "string" && avatar.trim() ? avatar.trim() : null;

  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username.trim());
  if (existing) return res.status(409).json({ error: "Username already exists" });

  const password_hash = await bcrypt.hash(password, 10);
  const inserted = db
    .prepare(`INSERT INTO users (username, password_hash, avatar_url) VALUES (?, ?, ?)`)
    .run(username.trim(), password_hash, avatar_url);

  const user = db.prepare(`SELECT id, username, avatar_url FROM users WHERE id = ?`).get(inserted.lastInsertRowid);
  const token = signToken(user);
  return res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar_url } });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });

  const user = db.prepare(`SELECT id, username, password_hash, avatar_url FROM users WHERE username = ?`).get(username.trim());
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  return res.json({
    token,
    user: { id: user.id, username: user.username, avatar: user.avatar_url },
  });
});

app.get("/api/me", authRequired, (req, res) => {
  const user = db
    .prepare(`SELECT id, username, avatar_url, is_online, last_seen_at FROM users WHERE id = ?`)
    .get(req.user.id);
  return res.json({
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar_url,
      isOnline: Boolean(user.is_online),
      lastSeenAt: user.last_seen_at,
    },
  });
});

function emitToUser(userId, event, payload) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.forEach((sid) => io.to(sid).emit(event, payload));
}

function emitToAll(event, payload) {
  userSockets.forEach((sids) => {
    sids.forEach((sid) => io.to(sid).emit(event, payload));
  });
}

app.put("/api/me/avatar", authRequired, (req, res) => {
  const avatar = typeof req.body?.avatar === "string" ? req.body.avatar.trim() : "";

  // Allow clearing avatar with empty string.
  if (avatar) {
    // Keep it simple: accept base64 data URLs for now.
    const isDataUrl = avatar.startsWith("data:image/");
    if (!isDataUrl) return res.status(400).json({ error: "Avatar must be an image data URL" });
    if (avatar.length > 400_000) return res.status(400).json({ error: "Avatar too large" });
  }

  db.prepare(`UPDATE users SET avatar_url = ? WHERE id = ?`).run(avatar || null, req.user.id);
  const user = db
    .prepare(`SELECT id, username, avatar_url, is_online, last_seen_at FROM users WHERE id = ?`)
    .get(req.user.id);

  // Broadcast so other users update UI immediately.
  emitToAll("user:avatar", { userId: user.id, avatar: user.avatar_url || "" });

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar_url,
      isOnline: Boolean(user.is_online),
      lastSeenAt: user.last_seen_at,
    },
  });
});

app.get("/api/users", authRequired, (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(parseInt(req.query.limit || "10", 10), 20);

  if (!q) return res.json({ users: [] });

  const users = db
    .prepare(
      `
      SELECT id, username, avatar_url, is_online, last_seen_at
      FROM users
      WHERE id != ?
        AND username LIKE ?
      ORDER BY username ASC
      LIMIT ?
    `
    )
    .all(req.user.id, `%${q}%`, limit);

  return res.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar_url,
      isOnline: Boolean(u.is_online),
      lastSeenAt: u.last_seen_at,
    })),
  });
});

app.get("/api/chats", authRequired, (req, res) => {
  const meId = req.user.id;

  const chats = db
    .prepare(
      `
      SELECT
        c.id AS chat_id,
        c.user1_id,
        c.user2_id,
        other.id AS other_id,
        other.username AS other_username,
        other.avatar_url AS other_avatar_url,
        other.is_online AS other_is_online,
        other.last_seen_at AS other_last_seen_at,
        (
          SELECT m.text
          FROM messages m
          WHERE m.chat_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_text,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.chat_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_created_at,
        (
          SELECT m.sender_id
          FROM messages m
          WHERE m.chat_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_sender_id
      FROM chats c
      JOIN users other
        ON other.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
      WHERE c.user1_id = ? OR c.user2_id = ?
      ORDER BY last_created_at DESC, c.id DESC
    `
    )
    .all(meId, meId, meId);

  return res.json({
    chats: chats.map((c) => ({
      id: c.chat_id,
      other: {
        id: c.other_id,
        username: c.other_username,
        avatar: c.other_avatar_url,
        isOnline: Boolean(c.other_is_online),
        lastSeenAt: c.other_last_seen_at,
      },
      last: c.last_text
        ? { text: c.last_text, createdAt: c.last_created_at, senderId: c.last_sender_id }
        : null,
    })),
  });
});

app.post("/api/chats", authRequired, (req, res) => {
  const { withUserId } = req.body || {};
  const otherId = Number(withUserId);
  if (!otherId) return res.status(400).json({ error: "withUserId is required" });
  if (otherId === req.user.id) return res.status(400).json({ error: "Cannot chat with yourself" });

  const other = db.prepare(`SELECT id FROM users WHERE id = ?`).get(otherId);
  if (!other) return res.status(404).json({ error: "User not found" });

  const chatId = getOrCreateChat(req.user.id, otherId);

  return res.json({ chatId });
});

app.get("/api/chats/:chatId/messages", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);

  const chat = getChatParticipants(chatId);
  if (!chat) return res.status(404).json({ error: "Chat not found" });

  const isMember = chat.user1_id === req.user.id || chat.user2_id === req.user.id;
  if (!isMember) return res.status(403).json({ error: "Not a member of this chat" });

  const messages = db
    .prepare(
      `
      SELECT
        m.id,
        m.chat_id,
        m.sender_id,
        m.text,
        m.delivered_at,
        m.read_at,
        m.created_at,
        u.username,
        u.avatar_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT ?
    `
    )
    .all(chatId, limit)
    .map((m) => ({
      id: m.id,
      chatId: m.chat_id,
      senderId: m.sender_id,
      text: m.text,
      deliveredAt: m.delivered_at,
      readAt: m.read_at,
      createdAt: m.created_at,
      sender: { id: m.sender_id, username: m.username, avatar: m.avatar_url },
    }));

  return res.json({ messages });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    credentials: true,
  },
});

// Track sockets by authenticated user so we can emit to both participants.
const userSockets = new Map(); // userId -> Set(socket.id)

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    socket.disconnect(true);
    return;
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    socket.disconnect(true);
    return;
  }

  const userId = payload.sub;

  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socket.id);

  // Mark online (simple presence).
  db.prepare(`UPDATE users SET is_online = 1 WHERE id = ?`).run(userId);
  emitToAll("user:presence", { userId, isOnline: true, lastSeenAt: null });

  socket.on("disconnect", () => {
    const set = userSockets.get(userId);
    if (!set) return;
    set.delete(socket.id);
    if (set.size === 0) {
      userSockets.delete(userId);
      // Mark offline + save last seen time.
      db.prepare(`UPDATE users SET is_online = 0, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`).run(userId);
      const row = db.prepare(`SELECT last_seen_at FROM users WHERE id = ?`).get(userId);
      emitToAll("user:presence", { userId, isOnline: false, lastSeenAt: row?.last_seen_at || null });
    }
  });

  // Receive a new message and broadcast it to both chat participants.
  socket.on("chat:send", ({ chatId, text } = {}) => {
    const cid = Number(chatId);
    const bodyText = String(text || "").trim();

    if (!cid || !bodyText) return;
    if (bodyText.length > 4000) return;

    const chat = getChatParticipants(cid);
    if (!chat) return;

    const isMember = chat.user1_id === userId || chat.user2_id === userId;
    if (!isMember) return;

    const inserted = db
      .prepare(`INSERT INTO messages (chat_id, sender_id, text) VALUES (?, ?, ?)`)
      .run(cid, userId, bodyText);

    const messageRow = db
      .prepare(
        `
        SELECT m.id, m.chat_id, m.sender_id, m.text, m.delivered_at, m.read_at, m.created_at,
               u.username, u.avatar_url
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.id = ?
      `
      )
      .get(inserted.lastInsertRowid);

    const message = {
      id: messageRow.id,
      chatId: messageRow.chat_id,
      senderId: messageRow.sender_id,
      text: messageRow.text,
      deliveredAt: messageRow.delivered_at,
      readAt: messageRow.read_at,
      createdAt: messageRow.created_at,
      sender: { id: messageRow.sender_id, username: messageRow.username, avatar: messageRow.avatar_url },
    };

    // Emit to both users that are connected.
    const u1 = chat.user1_id;
    const u2 = chat.user2_id;
    const recipients = new Set([
      ...(userSockets.get(u1) ? Array.from(userSockets.get(u1)) : []),
      ...(userSockets.get(u2) ? Array.from(userSockets.get(u2)) : []),
    ]);

    recipients.forEach((sid) => io.to(sid).emit("chat:message", message));

    // Mark delivered if recipient is currently connected.
    const otherId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
    if (userSockets.get(otherId)?.size) {
      db.prepare(`UPDATE messages SET delivered_at = CURRENT_TIMESTAMP WHERE id = ? AND delivered_at IS NULL`).run(message.id);
      const row = db.prepare(`SELECT delivered_at FROM messages WHERE id = ?`).get(message.id);
      const deliveredAt = row?.delivered_at || null;
      const payload = { chatId: cid, updates: [{ id: message.id, deliveredAt, readAt: null }] };
      const both = new Set([
        ...(userSockets.get(userId) ? Array.from(userSockets.get(userId)) : []),
        ...(userSockets.get(otherId) ? Array.from(userSockets.get(otherId)) : []),
      ]);
      both.forEach((sid) => io.to(sid).emit("chat:message:status", payload));
    }
  });

  // Mark messages as read up to messageId for this chat (1:1).
  socket.on("chat:read", ({ chatId, upToMessageId } = {}) => {
    const cid = Number(chatId);
    const upTo = Number(upToMessageId);
    if (!cid || !upTo) return;

    const chat = getChatParticipants(cid);
    if (!chat) return;
    const isMember = chat.user1_id === userId || chat.user2_id === userId;
    if (!isMember) return;

    // Mark delivered for any messages from the other user that were never delivered.
    db.prepare(
      `
      UPDATE messages
      SET delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
      WHERE chat_id = ?
        AND sender_id != ?
        AND id <= ?
        AND delivered_at IS NULL
    `
    ).run(cid, userId, upTo);

    // Mark read for any messages from the other user.
    db.prepare(
      `
      UPDATE messages
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE chat_id = ?
        AND sender_id != ?
        AND id <= ?
        AND read_at IS NULL
    `
    ).run(cid, userId, upTo);

    const updated = db.prepare(
      `
      SELECT id, delivered_at, read_at
      FROM messages
      WHERE chat_id = ?
        AND sender_id != ?
        AND id <= ?
        AND (delivered_at IS NOT NULL OR read_at IS NOT NULL)
      ORDER BY id ASC
    `
    ).all(cid, userId, upTo);

    if (!updated.length) return;

    const otherId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
    const payload = {
      chatId: cid,
      updates: updated.map((r) => ({ id: r.id, deliveredAt: r.delivered_at, readAt: r.read_at })),
    };

    const recipients = new Set([
      ...(userSockets.get(userId) ? Array.from(userSockets.get(userId)) : []),
      ...(userSockets.get(otherId) ? Array.from(userSockets.get(otherId)) : []),
    ]);
    recipients.forEach((sid) => io.to(sid).emit("chat:message:status", payload));
  });

  // Typing indicator: forwarded only to the other participant.
  socket.on("chat:typing", ({ chatId, isTyping } = {}) => {
    const cid = Number(chatId);
    const typing = Boolean(isTyping);
    if (!cid) return;

    const chat = getChatParticipants(cid);
    if (!chat) return;

    const isMember = chat.user1_id === userId || chat.user2_id === userId;
    if (!isMember) return;

    const otherId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
    emitToUser(otherId, "chat:typing", { chatId: cid, userId, isTyping: typing });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`);
});

