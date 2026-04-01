require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");

const { query, initDb, pool } = require("./db");

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change_me";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const userId = Number(payload.sub);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    const r = await query(`SELECT id, username, role, banned FROM users WHERE id = $1`, [userId]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: "Invalid token" });
    if (user.banned) return res.status(403).json({ error: "Banned" });

    req.user = { id: Number(user.id), username: user.username, role: user.role };
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Missing token" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  return next();
}

/** Group creator or app admin may add/remove members (admin cannot remove the group creator). */
function canManageGroupMembers(req, chat) {
  if (!chat || chat.type !== "group") return false;
  return Number(chat.created_by) === Number(req.user.id) || req.user.role === "admin";
}

function normalizeChatUsers(a, b) {
  // Ensure we store each one-to-one chat in a single canonical order.
  return a < b ? [a, b] : [b, a];
}

async function getChatById(chatId) {
  const r = await query(
    `SELECT id, type, title, created_by, user1_id, user2_id FROM chats WHERE id = $1`,
    [chatId]
  );
  return r.rows[0] || null;
}

async function isUserChatMember(chatId, userId) {
  const r = await query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId]
  );
  return Boolean(r.rows[0]);
}

async function getChatMemberUserIds(chatId) {
  const r = await query(`SELECT user_id FROM chat_members WHERE chat_id = $1`, [chatId]);
  return r.rows.map((row) => Number(row.user_id));
}

async function getOrCreateChat(userA, userB) {
  const [user1_id, user2_id] = normalizeChatUsers(userA, userB);
  const existing = await query(
    `SELECT id FROM chats WHERE user1_id = $1 AND user2_id = $2`,
    [user1_id, user2_id]
  );
  if (existing.rows[0]) return Number(existing.rows[0].id);

  const inserted = await query(
    `INSERT INTO chats (user1_id, user2_id) VALUES ($1, $2) RETURNING id`,
    [user1_id, user2_id]
  );
  const chatId = Number(inserted.rows[0].id);

  // Keep chat_members in sync.
  await query(
    `INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [chatId, user1_id]
  );
  await query(
    `INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [chatId, user2_id]
  );

  return chatId;
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    credentials: true,
  },
});

// Track sockets by authenticated user (direct + group chats).
const userSockets = new Map(); // userId -> Set(socket.id)

async function emitToChatMemberSockets(chatId, event, payload) {
  const ids = await getChatMemberUserIds(chatId);
  const recipients = new Set();
  for (const uid of ids) {
    const s = userSockets.get(uid);
    if (s) s.forEach((sid) => recipients.add(sid));
  }
  recipients.forEach((sid) => io.to(sid).emit(event, payload));
}

function messageRowToApi(mr, reactions = []) {
  if (!mr) return null;
  const msgType = mr.message_type || "text";
  const payload = mr.system_payload;
  return {
    id: Number(mr.id),
    chatId: Number(mr.chat_id),
    senderId: Number(mr.sender_id),
    text: mr.text,
    deliveredAt: mr.delivered_at,
    readAt: mr.read_at,
    editedAt: mr.edited_at,
    createdAt: mr.created_at,
    sender: { id: Number(mr.sender_id), username: mr.username, avatar: mr.avatar_url },
    type: msgType,
    systemKind: mr.system_kind || null,
    systemPayload: payload && typeof payload === "object" ? payload : null,
    reactions,
  };
}

async function fetchMessageById(messageId) {
  const messageRow = await query(
    `
      SELECT m.id, m.chat_id, m.sender_id, m.text, m.delivered_at, m.read_at, m.edited_at, m.created_at,
             m.message_type, m.system_kind, m.system_payload,
             u.username, u.avatar_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = $1
    `,
    [messageId]
  );
  return messageRowToApi(messageRow.rows[0], []);
}

async function insertSystemMessageAndBroadcast(chatId, actorUserId, systemKind, payload) {
  const inserted = await query(
    `
    INSERT INTO messages (chat_id, sender_id, text, message_type, system_kind, system_payload)
    VALUES ($1, $2, '', 'system', $3, $4::jsonb)
    RETURNING id
  `,
    [chatId, actorUserId, systemKind, JSON.stringify(payload || {})]
  );
  const insertedId = Number(inserted.rows[0].id);
  const message = await fetchMessageById(insertedId);
  await emitToChatMemberSockets(chatId, "chat:message", message);
  return message;
}

async function insertChatMessageAndBroadcast(chatId, senderId, bodyText) {
  const inserted = await query(
    `INSERT INTO messages (chat_id, sender_id, text, message_type) VALUES ($1, $2, $3, 'text') RETURNING id`,
    [chatId, senderId, bodyText]
  );
  const insertedId = Number(inserted.rows[0].id);
  const message = await fetchMessageById(insertedId);
  await emitToChatMemberSockets(chatId, "chat:message", message);

  const memberIds = await getChatMemberUserIds(chatId);
  const othersOnline = memberIds.some((id) => id !== Number(senderId) && userSockets.get(id)?.size);
  if (othersOnline) {
    await query(`UPDATE messages SET delivered_at = now() WHERE id = $1 AND delivered_at IS NULL`, [message.id]);
    const row = await query(`SELECT delivered_at FROM messages WHERE id = $1`, [message.id]);
    const deliveredAt = row.rows[0]?.delivered_at || null;
    const payload = { chatId, updates: [{ id: message.id, deliveredAt, readAt: null }] };
    await emitToChatMemberSockets(chatId, "chat:message:status", payload);
  }
  return message;
}

app.post("/api/register", async (req, res) => {
  const { username, password, avatar } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });

  const avatar_url = typeof avatar === "string" && avatar.trim() ? avatar.trim() : null;

  const existing = await query(`SELECT id FROM users WHERE username = $1`, [username.trim()]);
  if (existing.rows[0]) return res.status(409).json({ error: "Username already exists" });

  const password_hash = await bcrypt.hash(password, 10);
  const inserted = await query(
    `INSERT INTO users (username, password_hash, avatar_url) VALUES ($1, $2, $3) RETURNING id, username, avatar_url, role, banned`,
    [username.trim(), password_hash, avatar_url]
  );
  const user = inserted.rows[0];
  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      avatar: user.avatar_url,
      role: user.role,
      banned: Boolean(user.banned),
    },
  });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });

  const r = await query(
    `SELECT id, username, password_hash, avatar_url, role, banned FROM users WHERE username = $1`,
    [username.trim()]
  );
  const user = r.rows[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.banned) return res.status(403).json({ error: "Banned" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      avatar: user.avatar_url,
      role: user.role,
      banned: Boolean(user.banned),
    },
  });
});

app.get("/api/me", authRequired, (req, res) => {
  const uid = Number(req.user.id);
  return query(
    `SELECT id, username, avatar_url, role, banned, is_online, last_seen_at FROM users WHERE id = $1`,
    [uid]
  ).then((r) => {
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({
    user: {
      id: Number(user.id),
      username: user.username,
      avatar: user.avatar_url,
      role: user.role,
      banned: Boolean(user.banned),
      isOnline: Boolean(user.is_online),
      lastSeenAt: user.last_seen_at,
    },
  });
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

function disconnectUserSockets(userId) {
  const sids = userSockets.get(userId);
  if (!sids) return;
  sids.forEach((sid) => io.to(sid).disconnectSockets(true));
  userSockets.delete(userId);
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

  (async () => {
    const uid = Number(req.user.id);
    await query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [avatar || null, uid]);
    const r = await query(
      `SELECT id, username, avatar_url, is_online, last_seen_at FROM users WHERE id = $1`,
      [uid]
    );
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    emitToAll("user:avatar", { userId: Number(user.id), avatar: user.avatar_url || "" });

    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        avatar: user.avatar_url,
        isOnline: Boolean(user.is_online),
        lastSeenAt: user.last_seen_at,
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/users", authRequired, (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(parseInt(req.query.limit || "10", 10), 20);

  if (!q) return res.json({ users: [] });

  (async () => {
    const uid = Number(req.user.id);
    const users = await query(
      `
      SELECT id, username, avatar_url, is_online, last_seen_at
      FROM users
      WHERE id != $1
        AND username ILIKE $2
      ORDER BY username ASC
      LIMIT $3
    `,
      [uid, `%${q}%`, limit]
    );
    return res.json({
      users: users.rows.map((u) => ({
        id: Number(u.id),
        username: u.username,
        avatar: u.avatar_url,
        isOnline: Boolean(u.is_online),
        lastSeenAt: u.last_seen_at,
      })),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/chats", authRequired, (req, res) => {
  const meId = req.user.id;

  (async () => {
    const uid = Number(meId);
    const chats = await query(
      `
      SELECT
        c.id AS chat_id,
        c.type AS chat_type,
        c.title AS chat_title,
        c.created_by AS chat_created_by,
        c.user1_id,
        c.user2_id,
        other.id AS other_id,
        other.username AS other_username,
        other.avatar_url AS other_avatar_url,
        other.is_online AS other_is_online,
        other.last_seen_at AS other_last_seen_at,
        lm.text AS last_text,
        lm.created_at AS last_created_at,
        lm.sender_id AS last_sender_id,
        (SELECT COUNT(*)::int FROM chat_members cmx WHERE cmx.chat_id = c.id) AS member_count
      FROM chat_members mym
      JOIN chats c ON c.id = mym.chat_id
      LEFT JOIN users other
        ON c.type = 'direct'
        AND other.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN COALESCE(m.message_type, 'text') = 'system' THEN
              CASE COALESCE(m.system_kind, '')
                WHEN 'group_created' THEN '[Group created]'
                WHEN 'member_added' THEN '[Member added]'
                WHEN 'member_removed' THEN '[Member removed]'
                ELSE '[Event]'
              END
            ELSE m.text
          END AS text,
          m.created_at,
          m.sender_id
        FROM messages m
        WHERE m.chat_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) lm ON true
      WHERE mym.user_id = $1
      ORDER BY lm.created_at DESC NULLS LAST, c.id DESC
    `,
      [uid]
    );

    return res.json({
      chats: chats.rows.map((c) => {
        const isGroup = c.chat_type === "group";
        return {
          id: Number(c.chat_id),
          type: isGroup ? "group" : "direct",
          title: isGroup ? c.chat_title : null,
          createdBy: c.chat_created_by != null ? Number(c.chat_created_by) : null,
          memberCount: isGroup ? Number(c.member_count) : undefined,
          other: isGroup
            ? null
            : {
                id: Number(c.other_id),
                username: c.other_username,
                avatar: c.other_avatar_url,
                isOnline: Boolean(c.other_is_online),
                lastSeenAt: c.other_last_seen_at,
              },
          last: c.last_text
            ? { text: c.last_text, createdAt: c.last_created_at, senderId: Number(c.last_sender_id) }
            : null,
        };
      }),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/chats", authRequired, (req, res) => {
  const { withUserId } = req.body || {};
  const otherId = Number(withUserId);
  if (!otherId) return res.status(400).json({ error: "withUserId is required" });
  if (otherId === req.user.id) return res.status(400).json({ error: "Cannot chat with yourself" });

  (async () => {
    const other = await query(`SELECT id FROM users WHERE id = $1`, [otherId]);
    if (!other.rows[0]) return res.status(404).json({ error: "User not found" });
    const chatId = await getOrCreateChat(Number(req.user.id), otherId);
    return res.json({ chatId });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/groups", authRequired, (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const rawIds = Array.isArray(req.body?.memberUserIds) ? req.body.memberUserIds : [];
  if (!title) return res.status(400).json({ error: "title is required" });
  if (title.length > 200) return res.status(400).json({ error: "title too long" });

  const creatorId = Number(req.user.id);
  const memberIds = [...new Set(rawIds.map((x) => Number(x)).filter((n) => n > 0 && n !== creatorId))];
  if (memberIds.length < 1) return res.status(400).json({ error: "At least one other member is required" });

  (async () => {
    for (const mid of memberIds) {
      const u = await query(`SELECT id FROM users WHERE id = $1`, [mid]);
      if (!u.rows[0]) return res.status(404).json({ error: `User ${mid} not found` });
    }

    const client = await pool.connect();
    let chatId;
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO chats (type, title, created_by, user1_id, user2_id) VALUES ('group', $1, $2, NULL, NULL) RETURNING id`,
        [title, creatorId]
      );
      chatId = Number(ins.rows[0].id);
      const allMembers = [...new Set([creatorId, ...memberIds])];
      for (const uid of allMembers) {
        await client.query(`INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
          chatId,
          uid,
        ]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    await insertSystemMessageAndBroadcast(chatId, creatorId, "group_created", {
      actorId: creatorId,
      actorUsername: req.user.username,
    });
    return res.json({ chatId });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/groups/:chatId", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  if (!chatId) return res.status(400).json({ error: "Invalid chat id" });

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(chatId);
    if (!chat || chat.type !== "group") return res.status(404).json({ error: "Group not found" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this group" });

    const members = await query(
      `
      SELECT u.id, u.username, u.avatar_url, u.is_online, u.last_seen_at
      FROM chat_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.chat_id = $1
      ORDER BY u.username ASC
    `,
      [chatId]
    );

    const createdBy = Number(chat.created_by);
    const canManage = canManageGroupMembers(req, chat);

    return res.json({
      group: {
        id: chatId,
        title: chat.title,
        createdBy,
        memberCount: members.rows.length,
        canManage,
      },
      members: members.rows.map((u) => ({
        id: Number(u.id),
        username: u.username,
        avatar: u.avatar_url,
        isOnline: Boolean(u.is_online),
        lastSeenAt: u.last_seen_at,
        isCreator: Number(u.id) === createdBy,
      })),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/groups/:chatId/members", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const addUserId = Number(req.body?.userId);
  if (!chatId || !addUserId) return res.status(400).json({ error: "userId is required" });

  (async () => {
    const chat = await getChatById(chatId);
    if (!chat || chat.type !== "group") return res.status(404).json({ error: "Group not found" });
    if (!canManageGroupMembers(req, chat)) return res.status(403).json({ error: "Only the creator or an admin can add members" });

    const u = await query(`SELECT id, username FROM users WHERE id = $1`, [addUserId]);
    if (!u.rows[0]) return res.status(404).json({ error: "User not found" });

    const already = await query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, addUserId]);
    if (already.rows[0]) return res.status(400).json({ error: "User already in group" });

    await query(`INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2)`, [chatId, addUserId]);

    await insertSystemMessageAndBroadcast(chatId, Number(req.user.id), "member_added", {
      actorId: Number(req.user.id),
      actorUsername: req.user.username,
      targetId: addUserId,
      targetUsername: u.rows[0].username,
    });

    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.delete("/api/groups/:chatId/members/:userId", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const targetUserId = Number(req.params.userId);
  if (!chatId || !targetUserId) return res.status(400).json({ error: "Invalid id" });

  (async () => {
    const chat = await getChatById(chatId);
    if (!chat || chat.type !== "group") return res.status(404).json({ error: "Group not found" });
    if (!canManageGroupMembers(req, chat)) return res.status(403).json({ error: "Only the creator or an admin can remove members" });
    if (targetUserId === Number(chat.created_by)) return res.status(400).json({ error: "Cannot remove the creator" });

    const targetUser = await query(`SELECT username FROM users WHERE id = $1`, [targetUserId]);
    if (!targetUser.rows[0]) return res.status(404).json({ error: "User not found" });

    const del = await query(`DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, targetUserId]);
    if (del.rowCount === 0) return res.status(404).json({ error: "Member not in group" });

    await insertSystemMessageAndBroadcast(chatId, Number(req.user.id), "member_removed", {
      actorId: Number(req.user.id),
      actorUsername: req.user.username,
      targetId: targetUserId,
      targetUsername: targetUser.rows[0].username,
    });

    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/chats/:chatId/messages", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const bodyText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!chatId || !bodyText) return res.status(400).json({ error: "text is required" });
  if (bodyText.length > 4000) return res.status(400).json({ error: "Message too long" });

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });

    const message = await insertChatMessageAndBroadcast(chatId, uid, bodyText);
    return res.json({ message });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/chats/:chatId/messages", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);

  // ensure chat exists + membership
  // (also used by socket events)
  // async wrapper below
  (async () => {
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const uid = Number(req.user.id);
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });

  const messages = await query(
    `
    SELECT
      m.id,
      m.chat_id,
      m.sender_id,
      m.text,
      m.delivered_at,
      m.read_at,
      m.edited_at,
      m.created_at,
      m.message_type,
      m.system_kind,
      m.system_payload,
      u.username,
      u.avatar_url
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = $1
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT $2
  `,
    [chatId, limit]
  );

  const textMessageIds = messages.rows
    .filter((m) => (m.message_type || "text") === "text")
    .map((m) => Number(m.id));
  const reactionsByMessageId = await getGroupedReactionsForMessages(textMessageIds, uid);

  return res.json({
    messages: messages.rows.map((m) =>
      messageRowToApi(m, reactionsByMessageId.get(Number(m.id)) || [])
    ),
  });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

async function getMessageRow(messageId) {
  const r = await query(`SELECT id, chat_id, sender_id, message_type FROM messages WHERE id = $1`, [messageId]);
  return r.rows[0] || null;
}

async function getGroupedReactions(messageId, meId) {
  const r = await query(
    `
    SELECT
      emoji,
      COUNT(*)::int AS count,
      BOOL_OR(user_id = $2) AS reacted_by_me
    FROM message_reactions
    WHERE message_id = $1
    GROUP BY emoji
    ORDER BY COUNT(*) DESC, emoji ASC
  `,
    [messageId, meId]
  );
  return r.rows.map((row) => ({
    emoji: row.emoji,
    count: Number(row.count),
    reactedByMe: Boolean(row.reacted_by_me),
  }));
}

async function getGroupedReactionsForMessages(messageIds, meId) {
  const map = new Map();
  if (!messageIds.length) return map;

  const r = await query(
    `
    SELECT
      message_id,
      emoji,
      COUNT(*)::int AS count,
      BOOL_OR(user_id = $2) AS reacted_by_me
    FROM message_reactions
    WHERE message_id = ANY($1::bigint[])
    GROUP BY message_id, emoji
    ORDER BY message_id ASC, COUNT(*) DESC, emoji ASC
  `,
    [messageIds, meId]
  );

  for (const row of r.rows) {
    const mid = Number(row.message_id);
    if (!map.has(mid)) map.set(mid, []);
    map.get(mid).push({
      emoji: row.emoji,
      count: Number(row.count),
      reactedByMe: Boolean(row.reacted_by_me),
    });
  }
  return map;
}

app.get("/api/messages/:messageId/reactions", authRequired, (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!messageId) return res.status(400).json({ error: "Invalid message id" });

  (async () => {
    const uid = Number(req.user.id);
    const msg = await getMessageRow(messageId);
    if (!msg) return res.status(404).json({ error: "Message not found" });

    if (!(await isUserChatMember(Number(msg.chat_id), uid))) return res.status(403).json({ error: "Not a member of this chat" });
    if ((msg.message_type || "text") === "system") return res.status(400).json({ error: "Invalid message" });

    const reactions = await getGroupedReactions(messageId, uid);
    return res.json({ reactions });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/messages/:messageId/reactions", authRequired, (req, res) => {
  const messageId = Number(req.params.messageId);
  const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim() : "";
  if (!messageId) return res.status(400).json({ error: "Invalid message id" });
  if (!emoji) return res.status(400).json({ error: "emoji is required" });
  if (emoji.length > 16) return res.status(400).json({ error: "Invalid emoji" });

  (async () => {
    const uid = Number(req.user.id);
    const msg = await getMessageRow(messageId);
    if (!msg) return res.status(404).json({ error: "Message not found" });

    const cid = Number(msg.chat_id);
    if (!(await isUserChatMember(cid, uid))) return res.status(403).json({ error: "Not a member of this chat" });
    if ((msg.message_type || "text") === "system") return res.status(400).json({ error: "Invalid message" });

    const del = await query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, uid, emoji]
    );
    if (del.rowCount === 0) {
      await query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [messageId, uid, emoji]
      );
    }

    const reactions = await getGroupedReactions(messageId, uid);

    const chatIdNum = cid;
    await emitToChatMemberSockets(chatIdNum, "message:reactionsUpdated", {
      chatId: chatIdNum,
      messageId,
      reactions,
    });

    return res.json({ reactions });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.put("/api/messages/:messageId", authRequired, (req, res) => {
  const messageId = Number(req.params.messageId);
  const bodyText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!messageId) return res.status(400).json({ error: "Invalid message id" });
  if (!bodyText) return res.status(400).json({ error: "text is required" });
  if (bodyText.length > 4000) return res.status(400).json({ error: "Message too long" });

  (async () => {
    const uid = Number(req.user.id);
    const row = await query(`SELECT id, chat_id, sender_id, message_type FROM messages WHERE id = $1`, [messageId]);
    const msgRow = row.rows[0];
    if (!msgRow) return res.status(404).json({ error: "Message not found" });
    if ((msgRow.message_type || "text") === "system") return res.status(403).json({ error: "Cannot edit this message" });
    if (Number(msgRow.sender_id) !== uid) return res.status(403).json({ error: "Not allowed" });

    const cidCheck = Number(msgRow.chat_id);
    if (!(await isUserChatMember(cidCheck, uid))) return res.status(403).json({ error: "Not a member of this chat" });

    await query(`UPDATE messages SET text = $1, edited_at = now() WHERE id = $2`, [bodyText, messageId]);

    const messageRow = await query(
      `
      SELECT m.id, m.chat_id, m.sender_id, m.text, m.delivered_at, m.read_at, m.edited_at, m.created_at,
             m.message_type, m.system_kind, m.system_payload,
             u.username, u.avatar_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = $1
    `,
      [messageId]
    );
    const m = messageRow.rows[0];
    const reactions = await getGroupedReactions(messageId, uid);
    const message = messageRowToApi(m, reactions);

    const cid = Number(msgRow.chat_id);
    await emitToChatMemberSockets(cid, "message:edited", { chatId: cid, message });

    return res.json({ message });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

// Admin APIs
app.get("/api/admin/users", authRequired, requireAdmin, (req, res) => {
  (async () => {
    const r = await query(
      `
      SELECT id, username, avatar_url, role, banned, is_online, last_seen_at, created_at
      FROM users
      ORDER BY created_at DESC, id DESC
    `
    );
    return res.json({
      users: r.rows.map((u) => ({
        id: Number(u.id),
        username: u.username,
        avatar_url: u.avatar_url,
        role: u.role,
        banned: Boolean(u.banned),
        is_online: Boolean(u.is_online),
        last_seen_at: u.last_seen_at,
        created_at: u.created_at,
      })),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.patch("/api/admin/users/:userId/role", authRequired, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const role = typeof req.body?.role === "string" ? req.body.role : "";
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  if (role !== "user" && role !== "admin") return res.status(400).json({ error: "Invalid role" });

  (async () => {
    const r = await query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, avatar_url, role, banned, is_online, last_seen_at, created_at`,
      [role, userId]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    // Notify the affected user (and any connected clients) to refresh permissions.
    emitToUser(Number(u.id), "user:roleUpdated", { userId: Number(u.id), role: u.role });

    return res.json({
      user: {
        id: Number(u.id),
        username: u.username,
        avatar_url: u.avatar_url,
        role: u.role,
        banned: Boolean(u.banned),
        is_online: Boolean(u.is_online),
        last_seen_at: u.last_seen_at,
        created_at: u.created_at,
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.patch("/api/admin/users/:userId/ban", authRequired, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const banned = Boolean(req.body?.banned);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });

  (async () => {
    const r = await query(
      `UPDATE users SET banned = $1 WHERE id = $2 RETURNING id, username, avatar_url, role, banned, is_online, last_seen_at, created_at`,
      [banned, userId]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });

    // Notify user of ban/unban and force-disconnect on ban.
    emitToUser(Number(u.id), "user:banned", { userId: Number(u.id), banned: Boolean(u.banned) });
    if (banned) {
      await query(`UPDATE users SET is_online = FALSE, last_seen_at = now() WHERE id = $1`, [userId]);
      emitToAll("user:presence", { userId, isOnline: false, lastSeenAt: new Date().toISOString() });
      disconnectUserSockets(userId);
    }

    return res.json({
      user: {
        id: Number(u.id),
        username: u.username,
        avatar_url: u.avatar_url,
        role: u.role,
        banned: Boolean(u.banned),
        is_online: Boolean(u.is_online),
        last_seen_at: u.last_seen_at,
        created_at: u.created_at,
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.delete("/api/admin/messages/:messageId", authRequired, requireAdmin, (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!messageId) return res.status(400).json({ error: "Invalid message id" });

  (async () => {
    const r = await query(`SELECT m.id, m.chat_id FROM messages m WHERE m.id = $1`, [messageId]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: "Message not found" });

    await query(`DELETE FROM messages WHERE id = $1`, [messageId]);

    const chatId = Number(row.chat_id);
    await emitToChatMemberSockets(chatId, "message:deleted", { chatId, messageId });

    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

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

  const userId = Number(payload.sub);
  if (!userId) {
    socket.disconnect(true);
    return;
  }

  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socket.id);

  // Mark online (simple presence).
  (async () => {
    const r = await query(`SELECT banned FROM users WHERE id = $1`, [userId]);
    const u = r.rows[0];
    if (!u || u.banned) {
      socket.disconnect(true);
      return;
    }
    await query(`UPDATE users SET is_online = TRUE WHERE id = $1`, [userId]);
    emitToAll("user:presence", { userId, isOnline: true, lastSeenAt: null });
  })().catch(() => {});

  socket.on("disconnect", () => {
    const set = userSockets.get(userId);
    if (!set) return;
    set.delete(socket.id);
    if (set.size === 0) {
      userSockets.delete(userId);
      (async () => {
        await query(`UPDATE users SET is_online = FALSE, last_seen_at = now() WHERE id = $1`, [Number(userId)]);
        const row = await query(`SELECT last_seen_at FROM users WHERE id = $1`, [Number(userId)]);
        emitToAll("user:presence", {
          userId: Number(userId),
          isOnline: false,
          lastSeenAt: row.rows[0]?.last_seen_at || null,
        });
      })().catch(() => {});
    }
  });

  socket.on("chat:send", async ({ chatId, text } = {}) => {
    const cid = Number(chatId);
    const bodyText = String(text || "").trim();

    if (!cid || !bodyText) return;
    if (bodyText.length > 4000) return;

    const chat = await getChatById(cid);
    if (!chat) return;
    if (!(await isUserChatMember(cid, Number(userId)))) return;

    await insertChatMessageAndBroadcast(cid, Number(userId), bodyText);
  });

  socket.on("chat:read", async ({ chatId, upToMessageId } = {}) => {
    const cid = Number(chatId);
    const upTo = Number(upToMessageId);
    if (!cid || !upTo) return;

    const chat = await getChatById(cid);
    if (!chat) return;
    if (!(await isUserChatMember(cid, Number(userId)))) return;

    // Mark delivered for any messages from the other user that were never delivered.
    await query(
      `
      UPDATE messages
      SET delivered_at = COALESCE(delivered_at, now())
      WHERE chat_id = $1
        AND sender_id != $2
        AND id <= $3
        AND delivered_at IS NULL
        AND COALESCE(message_type, 'text') = 'text'
    `,
      [cid, Number(userId), upTo]
    );

    // Mark read for any messages from the other user.
    await query(
      `
      UPDATE messages
      SET read_at = COALESCE(read_at, now())
      WHERE chat_id = $1
        AND sender_id != $2
        AND id <= $3
        AND read_at IS NULL
        AND COALESCE(message_type, 'text') = 'text'
    `,
      [cid, Number(userId), upTo]
    );

    const updated = await query(
      `
      SELECT id, delivered_at, read_at
      FROM messages
      WHERE chat_id = $1
        AND sender_id != $2
        AND id <= $3
        AND (delivered_at IS NOT NULL OR read_at IS NOT NULL)
        AND COALESCE(message_type, 'text') = 'text'
      ORDER BY id ASC
    `,
      [cid, Number(userId), upTo]
    );

    if (!updated.rows.length) return;

    const payload = {
      chatId: cid,
      updates: updated.rows.map((r) => ({
        id: Number(r.id),
        deliveredAt: r.delivered_at,
        readAt: r.read_at,
      })),
    };

    await emitToChatMemberSockets(cid, "chat:message:status", payload);
  });

  socket.on("chat:typing", ({ chatId, isTyping } = {}) => {
    const cid = Number(chatId);
    const typing = Boolean(isTyping);
    if (!cid) return;

    (async () => {
      const chat = await getChatById(cid);
      if (!chat) return;
      if (!(await isUserChatMember(cid, Number(userId)))) return;
      const members = await getChatMemberUserIds(cid);
      for (const mid of members) {
        if (Number(mid) === Number(userId)) continue;
        emitToUser(mid, "chat:typing", { chatId: cid, userId: Number(userId), isTyping: typing });
      }
    })().catch(() => {});
  });

});

async function main() {
  await initDb();
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", e);
  process.exit(1);
});

