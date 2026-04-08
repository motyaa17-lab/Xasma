require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");

const { query, initDb, pool } = require("./db");
const { scanOutgoingMessageText } = require("./messageSafety");
const { checkSendRateLimit } = require("./sendRateLimit");

const DEFAULT_AURA_COLOR = "#0096ff";

function normalizeAuraColorApi(raw) {
  if (raw == null || raw === "") return DEFAULT_AURA_COLOR;
  const s = String(raw).trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : DEFAULT_AURA_COLOR;
}

function parseAuraColorBody(body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, "auraColor")) {
    return { ok: true, skip: true };
  }
  const v = typeof body.auraColor === "string" ? body.auraColor.trim() : "";
  if (!v) return { ok: true, skip: false, value: null };
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return { ok: true, skip: false, value: v.toLowerCase() };
  return { ok: false };
}

const DEFAULT_TAG_COLOR = "#6366f1";

function normalizeTagColorApi(raw) {
  if (raw == null || raw === "") return DEFAULT_TAG_COLOR;
  const s = String(raw).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const x = s.slice(1);
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
  }
  return DEFAULT_TAG_COLOR;
}

function normalizeTagStyleApi(raw) {
  return String(raw || "").trim().toLowerCase() === "gradient" ? "gradient" : "solid";
}

/** Tag badge fields for API sender/other objects (from users row joined as mr). */
function buildSenderTagsFromRow(mr, fromOfficial) {
  if (fromOfficial) return { tag: null, tagColor: DEFAULT_TAG_COLOR, tagStyle: "solid" };
  const rawTag = mr.user_tag != null ? String(mr.user_tag).trim() : "";
  if (!rawTag) return { tag: null, tagColor: DEFAULT_TAG_COLOR, tagStyle: "solid" };
  return {
    tag: rawTag.length > 40 ? rawTag.slice(0, 40) : rawTag,
    tagColor: normalizeTagColorApi(mr.tag_color),
    tagStyle: normalizeTagStyleApi(mr.tag_style),
  };
}

function buildOtherUserTagsFromChatRow(c) {
  const rawTag = c.other_user_tag != null ? String(c.other_user_tag).trim() : "";
  if (!rawTag) return { tag: null, tagColor: DEFAULT_TAG_COLOR, tagStyle: "solid" };
  return {
    tag: rawTag.length > 40 ? rawTag.slice(0, 40) : rawTag,
    tagColor: normalizeTagColorApi(c.other_tag_color),
    tagStyle: normalizeTagStyleApi(c.other_tag_style),
  };
}

function registrationDateIso(createdAt) {
  if (createdAt == null) return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Early adopters: first accounts by id, or joined before public launch window. */
function isEarlyTesterUser(userId, createdAt) {
  const uid = Number(userId);
  if (uid > 0 && uid <= 5000) return true;
  if (!createdAt) return false;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  return d < new Date("2027-01-01T00:00:00.000Z");
}

const PORT = process.env.PORT || 4000;
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      const safeExt = allowed.includes(ext) ? ext : ".jpg";
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
  },
});

/** Browsers often tag MediaRecorder output as audio/webm or video/webm (audio-only). */
const audioMimeOk = (mime) =>
  /^audio\/(webm|ogg|opus|mpeg|mp4|x-m4a|wav|x-wav|aac|3gpp)$/i.test(String(mime || "")) ||
  /^video\/webm$/i.test(String(mime || ""));

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const allowed = [".webm", ".ogg", ".opus", ".mp3", ".m4a", ".mp4", ".wav", ".aac", ".3gp"];
      const safeExt = allowed.includes(ext) ? ext : ".webm";
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
    },
  }),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (audioMimeOk(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported audio format (use WebM, OGG, MP3, M4A, WAV, etc.)"));
  },
});

const videoMimeOk = (mime) =>
  /^video\/(webm|mp4|quicktime|x-msvideo|3gpp)(;.*)?$/i.test(String(mime || ""));

function extFromVideoMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("quicktime")) return ".mov";
  if (m.includes("3gpp")) return ".3gp";
  if (m.includes("webm")) return ".webm";
  return "";
}

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const allowed = [".webm", ".mp4", ".mov", ".3gp"];
      const mimeExt = extFromVideoMime(file.mimetype);
      const safeExt = allowed.includes(ext)
        ? ext
        : allowed.includes(mimeExt)
          ? mimeExt
          : ".webm";
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
    },
  }),
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedExt = [".webm", ".mp4", ".mov", ".3gp"];
    const mime = String(file.mimetype || "").toLowerCase();

    // iOS Safari sometimes sends empty/unknown mimetype for MediaRecorder blobs.
    // If the extension is safe and known, accept it.
    if (videoMimeOk(mime)) return cb(null, true);
    if ((!mime || mime === "application/octet-stream") && allowedExt.includes(ext)) return cb(null, true);

    return cb(
      new Error(
        `Unsupported video format (use WebM, MP4, or MOV). Rejected: mime="${mime || ""}" ext="${ext}" name="${String(
          file.originalname || ""
        )}"`
      )
    );
  },
});
const JWT_SECRET = process.env.JWT_SECRET || "change_me";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const IS_PROD = process.env.NODE_ENV === "production";

const app = express();
app.use(express.json());

app.use((req, _res, next) => {
  // eslint-disable-next-line no-console
  console.log("REQ:", req.method, req.url, req.headers.origin || "");
  next();
});

const DEV_ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
]);

// Capacitor/Ionic WebView origins in native apps.
// These are not regular web origins you’d serve your site from, but they are the origin of the app WebView.
const NATIVE_APP_ALLOWED_ORIGINS = new Set(["https://localhost", "capacitor://localhost", "ionic://localhost"]);
app.get("/health", (_req, res) => res.json({ ok: true }));

function isOriginAllowed(origin) {
  const o = origin == null ? "" : String(origin);

  // Always allow the explicitly configured frontend origin (prod-safe path).
  if (o && o === FRONTEND_ORIGIN) return true;

  // Always allow native app WebView origins (APK / iOS build).
  if (o && NATIVE_APP_ALLOWED_ORIGINS.has(o)) return true;

  // Local development: allow emulator/webview edge-cases and local origins.
  if (!IS_PROD) {
    if (!o || o === "null") return true; // Native WebViews / file:// / some emulator cases.
    if (DEV_ALLOWED_ORIGINS.has(o)) return true;
  }

  return false;
}

app.use(
  cors({
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
app.options(
  "*",
  cors({
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
app.use("/uploads", express.static(uploadsDir));

app.get("/", (req, res) => {
  res.send("Сервер работает 🚀");
});

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

function isGroupLikeChat(chat) {
  return Boolean(chat && (chat.type === "group" || chat.type === "channel"));
}

/** Group/channel creator or app admin may add/remove members (admin cannot remove the creator). */
function canManageGroupMembers(req, chat) {
  if (!isGroupLikeChat(chat)) return false;
  return Number(chat.created_by) === Number(req.user.id) || req.user.role === "admin";
}

/** Direct: both participants. Group: creator or app admin only. Official: none. */
function canPinMessage(req, chat) {
  if (!chat) return false;
  if (chat.type === "official") return false;
  const uid = Number(req.user.id);
  if (chat.type === "direct") {
    return Number(chat.user1_id) === uid || Number(chat.user2_id) === uid;
  }
  if (chat.type === "group" || chat.type === "channel") {
    return Number(chat.created_by) === uid || req.user.role === "admin";
  }
  return false;
}

async function canSenderPostToChannel(chat, senderId) {
  if (!chat || chat.type !== "channel") return true;
  if (Number(chat.created_by) === Number(senderId)) return true;
  const r = await query(`SELECT role FROM users WHERE id = $1`, [senderId]);
  return r.rows[0]?.role === "admin";
}

/** Short preview for pinned bar (aligned with chat list last-message hints). */
function pinnedPreviewFromPinnedJoinRow(c) {
  if (c.pinned_message_id == null) return null;
  const mt = c.pinned_message_type || "text";
  if (mt === "system") return "[Event]";
  const text = String(c.pinned_text || "").trim();
  if (c.pinned_video_url && !text) return "[Video message]";
  if (c.pinned_audio_url && !text) return "[Voice message]";
  if (c.pinned_image_url && !text) return "[Photo]";
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "…";
  return t.length > 200 ? `${t.slice(0, 197)}…` : t;
}

function normalizeChatUsers(a, b) {
  // Ensure we store each one-to-one chat in a single canonical order.
  return a < b ? [a, b] : [b, a];
}

/** Internal account used only as sender_id for official Xasma announcements (not for login). */
const OFFICIAL_SYSTEM_USERNAME = "xasma_official";
let officialAnnounceUserId = null;

function getOfficialAnnounceUserId() {
  return officialAnnounceUserId;
}

async function ensureOfficialAnnounceUser() {
  const existing = await query(`SELECT id FROM users WHERE username = $1`, [OFFICIAL_SYSTEM_USERNAME]);
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  const ins = await query(
    `INSERT INTO users (username, password_hash, avatar_url, role, banned) VALUES ($1, $2, NULL, 'user', FALSE) RETURNING id`,
    [OFFICIAL_SYSTEM_USERNAME, hash]
  );
  return Number(ins.rows[0].id);
}

async function ensureOfficialChatForUser(userId) {
  const uid = Number(userId);
  if (!uid) return null;
  const existing = await query(
    `SELECT id FROM chats WHERE type = 'official' AND official_for_user_id = $1`,
    [uid]
  );
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const ins = await query(
    `INSERT INTO chats (type, title, user1_id, user2_id, created_by, official_for_user_id, avatar_url)
     VALUES ('official', 'Xasma', NULL, NULL, NULL, $1, NULL) RETURNING id`,
    [uid]
  );
  const chatId = Number(ins.rows[0].id);
  await query(`INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [chatId, uid]);
  return chatId;
}

async function backfillOfficialChatsForAllUsers() {
  const botId = getOfficialAnnounceUserId();
  if (!botId) return;
  const r = await query(`SELECT id FROM users WHERE id != $1`, [botId]);
  for (const row of r.rows) {
    await ensureOfficialChatForUser(Number(row.id));
  }
}

async function getChatById(chatId) {
  const r = await query(
    `SELECT id, type, title, created_by, user1_id, user2_id, avatar_url, official_for_user_id, pinned_message_id FROM chats WHERE id = $1`,
    [chatId]
  );
  return r.rows[0] || null;
}

async function emitChatPinnedUpdated(chatId) {
  const cid = Number(chatId);
  if (!cid) return;
  const r = await query(
    `SELECT c.pinned_message_id,
            pm.message_type AS pinned_message_type,
            pm.text AS pinned_text,
            pm.image_url AS pinned_image_url,
            pm.audio_url AS pinned_audio_url,
            pm.video_url AS pinned_video_url
     FROM chats c
     LEFT JOIN messages pm ON pm.id = c.pinned_message_id
     WHERE c.id = $1`,
    [cid]
  );
  const row = r.rows[0];
  const pid = row?.pinned_message_id != null ? Number(row.pinned_message_id) : null;
  const preview = pid ? pinnedPreviewFromPinnedJoinRow(row) : null;
  await emitToChatMemberSockets(cid, "chat:pinnedUpdated", {
    chatId: cid,
    pinnedMessageId: pid,
    pinnedPreview: preview,
  });
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
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
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

function getPublicBase(req) {
  const envBase = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;
  const proto = req.headers["x-forwarded-proto"]
    ? String(req.headers["x-forwarded-proto"]).split(",")[0].trim()
    : req.protocol;
  return `${proto}://${req.get("host")}`;
}

/** Accept only uploads we issued (prevents arbitrary URLs in DB). */
function validateMessageMediaUrl(req, url) {
  if (!url || typeof url !== "string") return null;
  const t = url.trim();

  // Allow a raw uploads path.
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(t)) return t;

  // Allow an absolute URL, but only to our own /uploads/*; normalize to path.
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const publicBase = getPublicBase(req);
    const pub = new URL(publicBase);
    if (u.host !== pub.host) return null;
    if (!/^\/uploads\/[a-zA-Z0-9._-]+$/.test(u.pathname)) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

/**
 * Socket sends don't have an Express req available.
 * Accept only our uploads paths (or absolute URLs that point to /uploads/*) and normalize to path.
 */
function validateMessageMediaUrlFromSocket(url) {
  if (!url || typeof url !== "string") return null;
  const t = url.trim();
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(t)) return t;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!/^\/uploads\/[a-zA-Z0-9._-]+$/.test(u.pathname)) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

function messageRowToApi(mr, reactions = []) {
  if (!mr) return null;
  const msgType = mr.message_type || "text";
  const payload = mr.system_payload;
  const botId = getOfficialAnnounceUserId();
  const sid = Number(mr.sender_id);
  const fromOfficial = botId && sid === botId;
  const tagInfo = buildSenderTagsFromRow(mr, fromOfficial);
  const sender = fromOfficial
    ? {
        id: sid,
        username: "Xasma",
        avatar: "",
        auraColor: DEFAULT_AURA_COLOR,
        messageCount: 0,
        tag: null,
        tagColor: DEFAULT_TAG_COLOR,
        tagStyle: "solid",
      }
    : {
        id: sid,
        username: mr.username,
        avatar: mr.avatar_url,
        auraColor: normalizeAuraColorApi(mr.aura_color),
        messageCount: Math.max(0, Number(mr.messages_sent_count) || 0),
        ...tagInfo,
      };
  const replyFromOfficial =
    botId && mr.reply_to_sender_id != null && Number(mr.reply_to_sender_id) === botId;
  return {
    id: Number(mr.id),
    chatId: Number(mr.chat_id),
    senderId: sid,
    text: mr.text,
    replyToMessageId: mr.reply_to_message_id != null ? Number(mr.reply_to_message_id) : null,
    deliveredAt: mr.delivered_at,
    readAt: mr.read_at,
    editedAt: mr.edited_at,
    createdAt: mr.created_at,
    sender,
    type: msgType,
    systemKind: mr.system_kind || null,
    systemPayload: payload && typeof payload === "object" ? payload : null,
    imageUrl: mr.image_url || null,
    audioUrl: mr.audio_url || null,
    videoUrl: mr.video_url || null,
    replyTo:
      mr.reply_to_message_id != null
        ? {
            id: Number(mr.reply_to_message_id),
            senderId: mr.reply_to_sender_id != null ? Number(mr.reply_to_sender_id) : null,
            senderUsername: replyFromOfficial ? "Xasma" : mr.reply_to_sender_username || "",
            text: mr.reply_to_text || "",
            imageUrl: mr.reply_to_image_url || null,
            audioUrl: mr.reply_to_audio_url || null,
            videoUrl: mr.reply_to_video_url || null,
          }
        : null,
    reactions,
  };
}

async function fetchMessageById(messageId) {
  const messageRow = await query(
    `
      SELECT m.id, m.chat_id, m.sender_id, m.text, m.reply_to_message_id, m.delivered_at, m.read_at, m.edited_at, m.created_at,
             m.message_type, m.system_kind, m.system_payload, m.image_url, m.audio_url, m.video_url,
             u.username, u.avatar_url, u.aura_color, u.messages_sent_count,
             u.user_tag, u.tag_color, u.tag_style,
             rm.sender_id AS reply_to_sender_id,
             ru.username AS reply_to_sender_username,
             rm.text AS reply_to_text,
             rm.image_url AS reply_to_image_url,
             rm.audio_url AS reply_to_audio_url,
             rm.video_url AS reply_to_video_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      WHERE m.id = $1
    `,
    [messageId]
  );
  return messageRowToApi(messageRow.rows[0], []);
}

async function insertSystemMessageAndBroadcast(chatId, actorUserId, systemKind, payload, bodyText = null) {
  const textStored =
    bodyText != null && String(bodyText).trim() !== "" ? String(bodyText).trim() : "";
  const inserted = await query(
    `
    INSERT INTO messages (chat_id, sender_id, text, message_type, system_kind, system_payload)
    VALUES ($1, $2, $3, 'system', $4, $5::jsonb)
    RETURNING id
  `,
    [chatId, actorUserId, textStored, systemKind, JSON.stringify(payload || {})]
  );
  const insertedId = Number(inserted.rows[0].id);
  const message = await fetchMessageById(insertedId);
  await emitToChatMemberSockets(chatId, "chat:message", message);
  return message;
}

async function insertChatMessageAndBroadcast(
  chatId,
  senderId,
  bodyText,
  imageUrl,
  audioUrl,
  videoUrl,
  replyToMessageId,
  clientTempId
) {
  const chat = await getChatById(chatId);
  if (chat?.type === "official") {
    const bot = getOfficialAnnounceUserId();
    if (!bot || Number(senderId) !== Number(bot)) return null;
  }
  if (chat?.type === "channel" && !(await canSenderPostToChannel(chat, senderId))) {
    return null;
  }

  const text = String(bodyText || "").trim();
  // Note: req not available here; validated at request boundary.
  const img = imageUrl;
  const aud = audioUrl;
  const vid = videoUrl;
  if (!text && !img && !aud && !vid) return null;

  const replyTo = Number(replyToMessageId) || null;
  if (replyTo) {
    const ok = await query(`SELECT 1 FROM messages WHERE id = $1 AND chat_id = $2`, [replyTo, chatId]);
    if (!ok.rows[0]) return null;
  }

  const safety = scanOutgoingMessageText(text);
  const inserted = await query(
    `INSERT INTO messages (
       chat_id, sender_id, text, message_type, image_url, audio_url, video_url, reply_to_message_id,
       flagged, risk_level, flagged_reason, flagged_at
     )
     VALUES ($1, $2, $3, 'text', $4, $5, $6, $7, $8, $9, $10, CASE WHEN $8 THEN now() ELSE NULL END)
     RETURNING id`,
    [
      chatId,
      senderId,
      text,
      img,
      aud,
      vid,
      replyTo,
      Boolean(safety),
      safety ? safety.riskLevel : null,
      safety ? safety.flaggedReason : null,
    ]
  );
  const insertedId = Number(inserted.rows[0].id);

  const inc = await query(
    `UPDATE users SET messages_sent_count = messages_sent_count + 1 WHERE id = $1 RETURNING messages_sent_count`,
    [senderId]
  );
  const newMessageCount = Math.max(0, Number(inc.rows[0]?.messages_sent_count) || 0);
  emitToAll("user:messageCount", { userId: Number(senderId), messageCount: newMessageCount });

  const message = await fetchMessageById(insertedId);
  if (clientTempId) message.clientTempId = String(clientTempId);
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

  const uname = username.trim();
  if (uname.toLowerCase() === OFFICIAL_SYSTEM_USERNAME) {
    return res.status(400).json({ error: "This username is reserved" });
  }

  const avatar_url = typeof avatar === "string" && avatar.trim() ? avatar.trim() : null;

  const existing = await query(`SELECT id FROM users WHERE username = $1`, [uname]);
  if (existing.rows[0]) return res.status(409).json({ error: "Username already exists" });

  const password_hash = await bcrypt.hash(password, 10);
  const inserted = await query(
    `INSERT INTO users (username, password_hash, avatar_url) VALUES ($1, $2, $3) RETURNING id, username, avatar_url, role, banned, aura_color, created_at`,
    [uname, password_hash, avatar_url]
  );
  const user = inserted.rows[0];
  try {
    await ensureOfficialChatForUser(Number(user.id));
  } catch {
    /* non-fatal */
  }
  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      avatar: user.avatar_url,
      role: user.role,
      banned: Boolean(user.banned),
      auraColor: normalizeAuraColorApi(user.aura_color),
      messageCount: 0,
      tag: null,
      tagColor: DEFAULT_TAG_COLOR,
      tagStyle: "solid",
      registrationDate: registrationDateIso(user.created_at),
      isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
    },
  });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });

  const r = await query(
    `SELECT id, username, password_hash, avatar_url, role, banned, aura_color, messages_sent_count,
            user_tag, tag_color, tag_style, created_at
     FROM users WHERE username = $1`,
    [username.trim()]
  );
  const user = r.rows[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.banned) return res.status(403).json({ error: "Banned" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  try {
    await ensureOfficialChatForUser(Number(user.id));
  } catch {
    /* non-fatal */
  }

  const token = signToken(user);
  const tags = buildSenderTagsFromRow(user, false);
  return res.json({
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      avatar: user.avatar_url,
      role: user.role,
      banned: Boolean(user.banned),
      auraColor: normalizeAuraColorApi(user.aura_color),
      messageCount: Math.max(0, Number(user.messages_sent_count) || 0),
      tag: tags.tag,
      tagColor: tags.tagColor,
      tagStyle: tags.tagStyle,
      registrationDate: registrationDateIso(user.created_at),
      isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
    },
  });
});

app.get("/api/me", authRequired, (req, res) => {
  const uid = Number(req.user.id);
  return query(
    `SELECT id, username, avatar_url, role, banned, is_online, last_seen_at, status_kind, status_text, about, aura_color, messages_sent_count,
            user_tag, tag_color, tag_style, created_at
     FROM users WHERE id = $1`,
    [uid]
  ).then((r) => {
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const tags = buildSenderTagsFromRow(user, false);
    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        avatar: user.avatar_url,
        role: user.role,
        banned: Boolean(user.banned),
        isOnline: Boolean(user.is_online),
        lastSeenAt: user.last_seen_at,
        statusKind: user.status_kind || "",
        statusText: user.status_text || "",
        about: user.about || "",
        auraColor: normalizeAuraColorApi(user.aura_color),
        messageCount: Math.max(0, Number(user.messages_sent_count) || 0),
        tag: tags.tag,
        tagColor: tags.tagColor,
        tagStyle: tags.tagStyle,
        registrationDate: registrationDateIso(user.created_at),
        isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
      },
    });
  });
});

app.put("/api/me/profile", authRequired, (req, res) => {
  const statusKindRaw = typeof req.body?.statusKind === "string" ? req.body.statusKind.trim() : "";
  const statusTextRaw = typeof req.body?.statusText === "string" ? req.body.statusText.trim() : "";
  const aboutRaw = typeof req.body?.about === "string" ? req.body.about.trim() : "";

  const allowedKinds = new Set(["", "online", "dnd", "away", "custom"]);
  const statusKind = allowedKinds.has(statusKindRaw) ? statusKindRaw : "";
  const statusText = statusTextRaw.length > 30 ? statusTextRaw.slice(0, 30) : statusTextRaw;
  const about = aboutRaw.length > 600 ? aboutRaw.slice(0, 600) : aboutRaw;

  const auraParsed = parseAuraColorBody(req.body);
  if (!auraParsed.ok) return res.status(400).json({ error: "Invalid aura color (use #RRGGBB)" });

  (async () => {
    const uid = Number(req.user.id);
    if (auraParsed.skip) {
      await query(`UPDATE users SET status_kind = $1, status_text = $2, about = $3 WHERE id = $4`, [
        statusKind || null,
        statusText || null,
        about || null,
        uid,
      ]);
    } else {
      await query(`UPDATE users SET status_kind = $1, status_text = $2, about = $3, aura_color = $4 WHERE id = $5`, [
        statusKind || null,
        statusText || null,
        about || null,
        auraParsed.value,
        uid,
      ]);
    }
    const r = await query(
      `SELECT id, username, avatar_url, role, banned, is_online, last_seen_at, status_kind, status_text, about, aura_color, messages_sent_count,
              user_tag, tag_color, tag_style, created_at
       FROM users WHERE id = $1`,
      [uid]
    );
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const auraColor = normalizeAuraColorApi(user.aura_color);
    const tags = buildSenderTagsFromRow(user, false);
    if (!auraParsed.skip) emitToAll("user:auraColor", { userId: uid, auraColor });
    emitToAll("user:profileStatus", {
      userId: uid,
      statusKind: user.status_kind || "",
      statusText: user.status_text || "",
    });
    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        avatar: user.avatar_url,
        role: user.role,
        banned: Boolean(user.banned),
        isOnline: Boolean(user.is_online),
        lastSeenAt: user.last_seen_at,
        statusKind: user.status_kind || "",
        statusText: user.status_text || "",
        about: user.about || "",
        auraColor,
        messageCount: Math.max(0, Number(user.messages_sent_count) || 0),
        tag: tags.tag,
        tagColor: tags.tagColor,
        tagStyle: tags.tagStyle,
        registrationDate: registrationDateIso(user.created_at),
        isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
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
      SELECT id, username, avatar_url, aura_color, is_online, last_seen_at, status_kind, status_text, messages_sent_count,
             user_tag, tag_color, tag_style
      FROM users
      WHERE id != $1
        AND username != $4
        AND username ILIKE $2
      ORDER BY username ASC
      LIMIT $3
    `,
      [uid, `%${q}%`, limit, OFFICIAL_SYSTEM_USERNAME]
    );
    return res.json({
      users: users.rows.map((u) => {
        const tg = buildSenderTagsFromRow(u, false);
        return {
          id: Number(u.id),
          username: u.username,
          avatar: u.avatar_url,
          auraColor: normalizeAuraColorApi(u.aura_color),
          isOnline: Boolean(u.is_online),
          lastSeenAt: u.last_seen_at,
          statusKind: u.status_kind || "",
          statusText: u.status_text || "",
          messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
          tag: tg.tag,
          tagColor: tg.tagColor,
          tagStyle: tg.tagStyle,
        };
      }),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/users/:userId", authRequired, (req, res) => {
  const uid = Number(req.params.userId);
  if (!uid) return res.status(400).json({ error: "Invalid user id" });
  (async () => {
    const botId = getOfficialAnnounceUserId();
    if (botId && uid === botId) {
      return res.json({
        user: {
          id: botId,
          username: "Xasma",
          avatar: "",
          auraColor: DEFAULT_AURA_COLOR,
          isOnline: false,
          lastSeenAt: null,
          statusKind: "",
          statusText: "",
          about: "",
          messageCount: 0,
          tag: null,
          tagColor: DEFAULT_TAG_COLOR,
          tagStyle: "solid",
          registrationDate: null,
          isEarlyTester: false,
        },
      });
    }
    const r = await query(
      `SELECT id, username, avatar_url, aura_color, is_online, last_seen_at, status_kind, status_text, about, messages_sent_count,
              user_tag, tag_color, tag_style, created_at
       FROM users
       WHERE id = $1`,
      [uid]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    const tg = buildSenderTagsFromRow(u, false);
    return res.json({
      user: {
        id: Number(u.id),
        username: u.username,
        avatar: u.avatar_url || "",
        auraColor: normalizeAuraColorApi(u.aura_color),
        isOnline: Boolean(u.is_online),
        lastSeenAt: u.last_seen_at,
        statusKind: u.status_kind || "",
        statusText: u.status_text || "",
        about: u.about || "",
        messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
        tag: tg.tag,
        tagColor: tg.tagColor,
        tagStyle: tg.tagStyle,
        registrationDate: registrationDateIso(u.created_at),
        isEarlyTester: isEarlyTesterUser(Number(u.id), u.created_at),
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

// (rest of file unchanged from working version)

app.put("/api/me/profile", authRequired, (req, res) => {
  const statusKindRaw = typeof req.body?.statusKind === "string" ? req.body.statusKind.trim() : "";
  const statusTextRaw = typeof req.body?.statusText === "string" ? req.body.statusText.trim() : "";
  const aboutRaw = typeof req.body?.about === "string" ? req.body.about.trim() : "";

  const allowedKinds = new Set(["", "online", "dnd", "away", "custom"]);
  const statusKind = allowedKinds.has(statusKindRaw) ? statusKindRaw : "";
  const statusText = statusTextRaw.length > 30 ? statusTextRaw.slice(0, 30) : statusTextRaw;
  const about = aboutRaw.length > 600 ? aboutRaw.slice(0, 600) : aboutRaw;

  const auraParsed = parseAuraColorBody(req.body);
  if (!auraParsed.ok) return res.status(400).json({ error: "Invalid aura color (use #RRGGBB)" });

  (async () => {
    const uid = Number(req.user.id);
    if (auraParsed.skip) {
      await query(`UPDATE users SET status_kind = $1, status_text = $2, about = $3 WHERE id = $4`, [
        statusKind || null,
        statusText || null,
        about || null,
        uid,
      ]);
    } else {
      await query(`UPDATE users SET status_kind = $1, status_text = $2, about = $3, aura_color = $4 WHERE id = $5`, [
        statusKind || null,
        statusText || null,
        about || null,
        auraParsed.value,
        uid,
      ]);
    }
    const r = await query(
      `SELECT id, username, avatar_url, role, banned, is_online, last_seen_at, status_kind, status_text, about, aura_color, messages_sent_count,
              user_tag, tag_color, tag_style, created_at
       FROM users WHERE id = $1`,
      [uid]
    );
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const auraColor = normalizeAuraColorApi(user.aura_color);
    const tags = buildSenderTagsFromRow(user, false);
    if (!auraParsed.skip) emitToAll("user:auraColor", { userId: uid, auraColor });
    emitToAll("user:profileStatus", {
      userId: uid,
      statusKind: user.status_kind || "",
      statusText: user.status_text || "",
    });
    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        avatar: user.avatar_url,
        role: user.role,
        banned: Boolean(user.banned),
        isOnline: Boolean(user.is_online),
        lastSeenAt: user.last_seen_at,
        statusKind: user.status_kind || "",
        statusText: user.status_text || "",
        about: user.about || "",
        auraColor,
        messageCount: Math.max(0, Number(user.messages_sent_count) || 0),
        tag: tags.tag,
        tagColor: tags.tagColor,
        tagStyle: tags.tagStyle,
        registrationDate: registrationDateIso(user.created_at),
        isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
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
      SELECT id, username, avatar_url, aura_color, is_online, last_seen_at, status_kind, status_text, messages_sent_count,
             user_tag, tag_color, tag_style
      FROM users
      WHERE id != $1
        AND username != $4
        AND username ILIKE $2
      ORDER BY username ASC
      LIMIT $3
    `,
      [uid, `%${q}%`, limit, OFFICIAL_SYSTEM_USERNAME]
    );
    return res.json({
      users: users.rows.map((u) => {
        const tg = buildSenderTagsFromRow(u, false);
        return {
          id: Number(u.id),
          username: u.username,
          avatar: u.avatar_url,
          auraColor: normalizeAuraColorApi(u.aura_color),
          isOnline: Boolean(u.is_online),
          lastSeenAt: u.last_seen_at,
          statusKind: u.status_kind || "",
          statusText: u.status_text || "",
          messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
          tag: tg.tag,
          tagColor: tg.tagColor,
          tagStyle: tg.tagStyle,
        };
      }),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/users/:userId", authRequired, (req, res) => {
  const uid = Number(req.params.userId);
  if (!uid) return res.status(400).json({ error: "Invalid user id" });
  (async () => {
    const botId = getOfficialAnnounceUserId();
    if (botId && uid === botId) {
      return res.json({
        user: {
          id: botId,
          username: "Xasma",
          avatar: "",
          auraColor: DEFAULT_AURA_COLOR,
          isOnline: false,
          lastSeenAt: null,
          statusKind: "",
          statusText: "",
          about: "",
          messageCount: 0,
          tag: null,
          tagColor: DEFAULT_TAG_COLOR,
          tagStyle: "solid",
          registrationDate: null,
          isEarlyTester: false,
        },
      });
    }
    const r = await query(
      `SELECT id, username, avatar_url, aura_color, is_online, last_seen_at, status_kind, status_text, about, messages_sent_count,
              user_tag, tag_color, tag_style, created_at
       FROM users
       WHERE id = $1`,
      [uid]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    const tg = buildSenderTagsFromRow(u, false);
    return res.json({
      user: {
        id: Number(u.id),
        username: u.username,
        avatar: u.avatar_url || "",
        auraColor: normalizeAuraColorApi(u.aura_color),
        isOnline: Boolean(u.is_online),
        lastSeenAt: u.last_seen_at,
        statusKind: u.status_kind || "",
        statusText: u.status_text || "",
        about: u.about || "",
        messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
        tag: tg.tag,
        tagColor: tg.tagColor,
        tagStyle: tg.tagStyle,
        registrationDate: registrationDateIso(u.created_at),
        isEarlyTester: isEarlyTesterUser(Number(u.id), u.created_at),
      },
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
        mym.list_pinned_at,
        c.id AS chat_id,
        c.type AS chat_type,
        c.title AS chat_title,
        c.created_by AS chat_created_by,
        c.avatar_url AS chat_avatar_url,
        c.pinned_message_id,
        pm.message_type AS pinned_message_type,
        pm.text AS pinned_text,
        pm.image_url AS pinned_image_url,
        pm.audio_url AS pinned_audio_url,
        pm.video_url AS pinned_video_url,
        c.user1_id,
        c.user2_id,
        other.id AS other_id,
        other.username AS other_username,
        other.avatar_url AS other_avatar_url,
        other.aura_color AS other_aura_color,
        other.is_online AS other_is_online,
        other.last_seen_at AS other_last_seen_at,
        other.status_kind AS other_status_kind,
        other.status_text AS other_status_text,
        other.messages_sent_count AS other_messages_sent_count,
        other.user_tag AS other_user_tag,
        other.tag_color AS other_tag_color,
        other.tag_style AS other_tag_style,
        lm.id AS last_id,
        lm.text AS last_text,
        lm.created_at AS last_created_at,
        lm.sender_id AS last_sender_id,
        (SELECT COUNT(*)::int FROM chat_members cmx WHERE cmx.chat_id = c.id) AS member_count,
        (
          SELECT COUNT(*)::int
          FROM chat_members cm2
          JOIN users u2 ON u2.id = cm2.user_id
          WHERE cm2.chat_id = c.id AND u2.is_online = TRUE
        ) AS online_member_count,
        (
          SELECT COUNT(*)::int
          FROM messages mu
          WHERE mu.chat_id = c.id
            AND mu.sender_id != $1
            AND mu.read_at IS NULL
            AND COALESCE(mu.message_type, 'text') = 'text'
        ) AS unread_count
      FROM chat_members mym
      JOIN chats c ON c.id = mym.chat_id
      LEFT JOIN messages pm ON pm.id = c.pinned_message_id
      LEFT JOIN users other
        ON c.type = 'direct'
        AND other.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
      LEFT JOIN LATERAL (
        SELECT
          m.id,
          CASE
            WHEN COALESCE(m.message_type, 'text') = 'system' THEN
              CASE COALESCE(m.system_kind, '')
                WHEN 'official_broadcast' THEN LEFT(TRIM(COALESCE(m.text, '')), 200)
                WHEN 'group_created' THEN '[Group created]'
                WHEN 'channel_created' THEN '[Channel created]'
                WHEN 'member_added' THEN '[Member added]'
                WHEN 'member_removed' THEN '[Member removed]'
                ELSE '[Event]'
              END
            WHEN m.video_url IS NOT NULL AND TRIM(COALESCE(m.text, '')) = '' THEN '[Video message]'
            WHEN m.audio_url IS NOT NULL AND TRIM(COALESCE(m.text, '')) = '' THEN '[Voice message]'
            WHEN m.image_url IS NOT NULL AND TRIM(COALESCE(m.text, '')) = '' THEN '[Photo]'
            ELSE TRIM(COALESCE(m.text, ''))
          END AS text,
          m.created_at,
          m.sender_id
        FROM messages m
        WHERE m.chat_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) lm ON true
      WHERE mym.user_id = $1
      ORDER BY
        CASE WHEN mym.list_pinned_at IS NOT NULL THEN 0 ELSE 1 END ASC,
        mym.list_pinned_at DESC NULLS LAST,
        CASE WHEN c.type = 'official' THEN 0 WHEN c.type = 'channel' THEN 1 WHEN c.type = 'group' THEN 2 ELSE 3 END ASC,
        lm.created_at DESC NULLS LAST,
        c.id DESC
    `,
      [uid]
    );

    const botId = getOfficialAnnounceUserId();

    return res.json({
      chats: chats.rows.map((c) => {
        const isGroup = c.chat_type === "group";
        const isChannel = c.chat_type === "channel";
        const isRoom = isGroup || isChannel;
        const isOfficial = c.chat_type === "official";
        const createdBy = c.chat_created_by != null ? Number(c.chat_created_by) : null;
        const canPostMessage =
          isOfficial
            ? false
            : isChannel
              ? createdBy === uid || req.user.role === "admin"
              : true;
        return {
          id: Number(c.chat_id),
          type: isChannel ? "channel" : isGroup ? "group" : isOfficial ? "official" : "direct",
          title: isRoom ? c.chat_title : isOfficial ? c.chat_title || "Xasma" : null,
          createdBy,
          memberCount: isRoom ? Number(c.member_count) : undefined,
          onlineMemberCount: isRoom ? Number(c.online_member_count) : undefined,
          avatar: isRoom ? c.chat_avatar_url || "" : undefined,
          canPostMessage,
          other: isRoom
            ? null
            : isOfficial
              ? {
                  id: botId || 0,
                  username: "Xasma",
                  avatar: "",
                  auraColor: DEFAULT_AURA_COLOR,
                  isOnline: false,
                  lastSeenAt: null,
                  statusKind: "",
                  statusText: "",
                  messageCount: 0,
                  tag: null,
                  tagColor: DEFAULT_TAG_COLOR,
                  tagStyle: "solid",
                }
              : {
                  id: Number(c.other_id),
                  username: c.other_username,
                  avatar: c.other_avatar_url,
                  auraColor: normalizeAuraColorApi(c.other_aura_color),
                  isOnline: Boolean(c.other_is_online),
                  lastSeenAt: c.other_last_seen_at,
                  statusKind: c.other_status_kind || "",
                  statusText: c.other_status_text || "",
                  messageCount: Math.max(0, Number(c.other_messages_sent_count) || 0),
                  ...buildOtherUserTagsFromChatRow(c),
                },
          last: c.last_text
            ? {
                id: c.last_id != null ? Number(c.last_id) : null,
                text: c.last_text,
                createdAt: c.last_created_at,
                senderId: Number(c.last_sender_id),
              }
            : null,
          unreadCount: Number(c.unread_count) || 0,
          pinnedMessageId: c.pinned_message_id != null ? Number(c.pinned_message_id) : null,
          pinnedPreview: pinnedPreviewFromPinnedJoinRow(c),
          listPinned: c.list_pinned_at != null,
          listPinnedAt: c.list_pinned_at,
        };
      }),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

/** Pin/unpin this chat in the user's inbox list (per-user, not the in-chat pinned message). */
app.patch("/api/chats/:chatId/list-pin", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  if (!chatId) return res.status(400).json({ error: "Invalid chat id" });
  const pinned = Boolean(req.body?.pinned);

  (async () => {
    const uid = Number(req.user.id);
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });
    if (pinned) {
      await query(`UPDATE chat_members SET list_pinned_at = now() WHERE chat_id = $1 AND user_id = $2`, [
        chatId,
        uid,
      ]);
    } else {
      await query(`UPDATE chat_members SET list_pinned_at = NULL WHERE chat_id = $1 AND user_id = $2`, [chatId, uid]);
    }
    return res.json({ ok: true, listPinned: pinned });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

/** Remove current user from the chat (hide / leave). Official chat cannot be removed. */
app.delete("/api/chats/:chatId/membership", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  if (!chatId) return res.status(400).json({ error: "Invalid chat id" });

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (chat.type === "official") return res.status(400).json({ error: "Cannot remove the official chat" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });
    await query(`DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, uid]);
    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.patch("/api/chats/:chatId/pin", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  if (!chatId) return res.status(400).json({ error: "Invalid chat id" });
  const raw = req.body?.messageId;
  const messageId = raw === null || raw === undefined || raw === "" ? null : Number(raw);

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });
    if (!canPinMessage(req, chat)) return res.status(403).json({ error: "Not allowed to pin messages" });

    if (messageId === null || Number.isNaN(Number(messageId))) {
      await query(`UPDATE chats SET pinned_message_id = NULL WHERE id = $1`, [chatId]);
      await emitChatPinnedUpdated(chatId);
      return res.json({ ok: true, pinnedMessageId: null, pinnedPreview: null });
    }

    const mid = Number(messageId);
    if (!mid) return res.status(400).json({ error: "Invalid message id" });

    const msgCheck = await query(
      `SELECT id, chat_id, COALESCE(message_type, 'text') AS message_type FROM messages WHERE id = $1 AND chat_id = $2`,
      [mid, chatId]
    );
    const mr = msgCheck.rows[0];
    if (!mr) return res.status(404).json({ error: "Message not found" });
    if (String(mr.message_type) === "system") return res.status(400).json({ error: "Cannot pin system messages" });

    await query(`UPDATE chats SET pinned_message_id = $1 WHERE id = $2`, [mid, chatId]);
    await emitChatPinnedUpdated(chatId);

    const snap = await query(
      `SELECT c.pinned_message_id,
              pm.message_type AS pinned_message_type,
              pm.text AS pinned_text,
              pm.image_url AS pinned_image_url,
              pm.audio_url AS pinned_audio_url,
              pm.video_url AS pinned_video_url
       FROM chats c
       LEFT JOIN messages pm ON pm.id = c.pinned_message_id
       WHERE c.id = $1`,
      [chatId]
    );
    const row = snap.rows[0];
    const pid = row?.pinned_message_id != null ? Number(row.pinned_message_id) : null;
    const preview = pid ? pinnedPreviewFromPinnedJoinRow(row) : null;
    return res.json({ ok: true, pinnedMessageId: pid, pinnedPreview: preview });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/chats", authRequired, (req, res) => {
  const { withUserId } = req.body || {};
  const otherId = Number(withUserId);
  if (!otherId) return res.status(400).json({ error: "withUserId is required" });
  if (otherId === req.user.id) return res.status(400).json({ error: "Cannot chat with yourself" });

  (async () => {
    const botId = getOfficialAnnounceUserId();
    if (botId && otherId === botId) return res.status(400).json({ error: "Invalid user" });
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

app.post("/api/channels", authRequired, (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const rawIds = Array.isArray(req.body?.memberUserIds) ? req.body.memberUserIds : [];
  const avatar =
    typeof req.body?.avatar === "string" && req.body.avatar.trim()
      ? req.body.avatar.trim()
      : null;
  if (!title) return res.status(400).json({ error: "title is required" });
  if (title.length > 200) return res.status(400).json({ error: "title too long" });
  if (avatar) {
    const isDataUrl = avatar.startsWith("data:image/");
    if (!isDataUrl) return res.status(400).json({ error: "Avatar must be an image data URL" });
    if (avatar.length > 400_000) return res.status(400).json({ error: "Avatar too large" });
  }

  const creatorId = Number(req.user.id);
  const memberIds = [...new Set(rawIds.map((x) => Number(x)).filter((n) => n > 0 && n !== creatorId))];

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
        `INSERT INTO chats (type, title, created_by, user1_id, user2_id, avatar_url) VALUES ('channel', $1, $2, NULL, NULL, $3) RETURNING id`,
        [title, creatorId, avatar || null]
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

    await insertSystemMessageAndBroadcast(chatId, creatorId, "channel_created", {
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
    if (!chat || !isGroupLikeChat(chat)) return res.status(404).json({ error: "Group not found" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this group" });

    const members = await query(
      `
      SELECT u.id, u.username, u.avatar_url, u.is_online, u.last_seen_at, u.messages_sent_count,
             u.user_tag, u.tag_color, u.tag_style
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
        avatar: chat.avatar_url || "",
        channel: chat.type === "channel",
      },
      members: members.rows.map((u) => {
        const tg = buildSenderTagsFromRow(u, false);
        return {
          id: Number(u.id),
          username: u.username,
          avatar: u.avatar_url,
          online: Boolean(u.is_online),
          isOnline: Boolean(u.is_online),
          lastSeenAt: u.last_seen_at,
          isCreator: Number(u.id) === createdBy,
          messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
          tag: tg.tag,
          tagColor: tg.tagColor,
          tagStyle: tg.tagStyle,
        };
      }),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.patch("/api/groups/:chatId/avatar", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const avatar = typeof req.body?.avatar === "string" ? req.body.avatar.trim() : "";
  if (!chatId) return res.status(400).json({ error: "Invalid chat id" });

  if (avatar) {
    const isDataUrl = avatar.startsWith("data:image/");
    if (!isDataUrl) return res.status(400).json({ error: "Avatar must be an image data URL" });
    if (avatar.length > 400_000) return res.status(400).json({ error: "Avatar too large" });
  }

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(chatId);
    if (!chat || !isGroupLikeChat(chat)) return res.status(404).json({ error: "Group not found" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this group" });
    if (!canManageGroupMembers(req, chat)) {
      return res.status(403).json({ error: "Only the creator or an admin can change the group avatar" });
    }

    await query(`UPDATE chats SET avatar_url = $1 WHERE id = $2`, [avatar || null, chatId]);
    const r = await query(`SELECT id, title, created_by, avatar_url FROM chats WHERE id = $1`, [chatId]);
    const row = r.rows[0];
    const cnt = await query(`SELECT COUNT(*)::int AS n FROM chat_members WHERE chat_id = $1`, [chatId]);

    const av = row.avatar_url || "";
    await emitToChatMemberSockets(chatId, "group:avatarUpdated", { chatId, avatar: av });

    return res.json({
      group: {
        id: chatId,
        title: row.title,
        createdBy: Number(row.created_by),
        memberCount: Number(cnt.rows[0].n),
        canManage: canManageGroupMembers(req, chat),
        avatar: av,
        channel: chat.type === "channel",
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/groups/:chatId/members", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const addUserId = Number(req.body?.userId);
  if (!chatId || !addUserId) return res.status(400).json({ error: "userId is required" });

  (async () => {
    const chat = await getChatById(chatId);
    if (!chat || !isGroupLikeChat(chat)) return res.status(404).json({ error: "Group not found" });
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
    if (!chat || !isGroupLikeChat(chat)) return res.status(404).json({ error: "Group not found" });
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

app.post(
  "/api/upload",
  authRequired,
  (req, res, next) => {
    imageUpload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      next();
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image file" });
    const base = getPublicBase(req);
    return res.json({ url: `${base}/uploads/${req.file.filename}` });
  }
);

app.post(
  "/api/upload/audio",
  authRequired,
  (req, res, next) => {
    audioUpload.single("audio")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      next();
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio file" });
    const base = getPublicBase(req);
    return res.json({ url: `${base}/uploads/${req.file.filename}` });
  }
);

app.post(
  "/api/upload/video",
  authRequired,
  (req, res, next) => {
    videoUpload.single("video")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      next();
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No video file" });
    // eslint-disable-next-line no-console
    console.log("[Xasma] upload/video ok", {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      filename: req.file.filename,
      size: req.file.size,
    });
    const base = getPublicBase(req);
    return res.json({ url: `${base}/uploads/${req.file.filename}` });
  }
);

app.post("/api/chats/:chatId/messages", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const bodyText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const rawImg = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
  const rawAud = typeof req.body?.audioUrl === "string" ? req.body.audioUrl.trim() : "";
  const rawVid = typeof req.body?.videoUrl === "string" ? req.body.videoUrl.trim() : "";
  const replyToMessageId = req.body?.replyToMessageId;
  const img = validateMessageMediaUrl(req, rawImg);
  const aud = validateMessageMediaUrl(req, rawAud);
  const vid = validateMessageMediaUrl(req, rawVid);
  if (rawImg && !img) return res.status(400).json({ error: "Invalid imageUrl" });
  if (rawAud && !aud) return res.status(400).json({ error: "Invalid audioUrl" });
  if (rawVid && !vid) return res.status(400).json({ error: "Invalid videoUrl" });
  if (!chatId || (!bodyText && !img && !aud && !vid)) {
    return res.status(400).json({ error: "text, imageUrl, audioUrl, or videoUrl is required" });
  }
  if (bodyText.length > 4000) return res.status(400).json({ error: "Message too long" });

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (chat.type === "official") return res.status(403).json({ error: "Cannot send messages in this chat" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });
    if (chat.type === "channel" && !(await canSenderPostToChannel(chat, uid))) {
      return res.status(403).json({ error: "Only the channel owner or an admin can post messages" });
    }

    const rate = checkSendRateLimit(uid);
    if (!rate.allowed) {
      const ra = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
      res.setHeader("Retry-After", String(ra));
      return res.status(429).json({
        error: "Too many messages. Try again in a few seconds.",
        retryAfterMs: Math.ceil(rate.retryAfterMs),
      });
    }

    const message = await insertChatMessageAndBroadcast(chatId, uid, bodyText, img, aud, vid, replyToMessageId);
    if (!message) return res.status(400).json({ error: "Invalid message" });
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
      m.reply_to_message_id,
      m.delivered_at,
      m.read_at,
      m.edited_at,
      m.created_at,
      m.message_type,
      m.system_kind,
      m.system_payload,
      m.image_url,
      m.audio_url,
      m.video_url,
      u.username,
      u.avatar_url,
      u.aura_color,
      u.messages_sent_count,
      u.user_tag,
      u.tag_color,
      u.tag_style,
      rm.sender_id AS reply_to_sender_id,
      ru.username AS reply_to_sender_username,
      rm.text AS reply_to_text,
      rm.image_url AS reply_to_image_url,
      rm.audio_url AS reply_to_audio_url,
      rm.video_url AS reply_to_video_url
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
    LEFT JOIN users ru ON ru.id = rm.sender_id
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

    const safety = scanOutgoingMessageText(bodyText);
    await query(
      `
      UPDATE messages SET
        text = $1,
        edited_at = now(),
        flagged = $2,
        risk_level = CASE WHEN $2 THEN $3 ELSE NULL END,
        flagged_reason = CASE WHEN $2 THEN $4 ELSE NULL END,
        flagged_at = CASE WHEN $2 THEN now() ELSE NULL END
      WHERE id = $5
    `,
      [bodyText, Boolean(safety), safety?.riskLevel || null, safety?.flaggedReason || null, messageId]
    );

    const messageRow = await query(
      `
      SELECT m.id, m.chat_id, m.sender_id, m.text, m.delivered_at, m.read_at, m.edited_at, m.created_at,
             m.message_type, m.system_kind, m.system_payload, m.image_url, m.audio_url, m.video_url,
             u.username, u.avatar_url, u.aura_color, u.messages_sent_count,
             u.user_tag, u.tag_color, u.tag_style
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

app.post("/api/messages/:messageId/report", authRequired, (req, res) => {
  const messageId = Number(req.params.messageId);
  const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason.trim().toLowerCase() : "";
  const allowed = new Set(["spam", "scam", "abuse"]);
  if (!messageId) return res.status(400).json({ error: "Invalid message id" });
  if (!allowed.has(reasonRaw)) return res.status(400).json({ error: "Invalid reason" });

  (async () => {
    const uid = Number(req.user.id);
    const banned = await query(`SELECT banned FROM users WHERE id = $1`, [uid]);
    if (banned.rows[0]?.banned) return res.status(403).json({ error: "Not allowed" });

    const msgR = await query(
      `SELECT m.id, m.chat_id, m.sender_id, m.message_type FROM messages m WHERE m.id = $1`,
      [messageId]
    );
    const msgRow = msgR.rows[0];
    if (!msgRow) return res.status(404).json({ error: "Message not found" });
    if ((msgRow.message_type || "text") === "system") return res.status(400).json({ error: "Cannot report this message" });
    if (Number(msgRow.sender_id) === uid) return res.status(400).json({ error: "Cannot report your own message" });

    const cid = Number(msgRow.chat_id);
    const chat = await getChatById(cid);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (chat.type === "official") return res.status(400).json({ error: "Cannot report in this chat" });
    if (!(await isUserChatMember(cid, uid))) return res.status(403).json({ error: "Not a member of this chat" });

    const ins = await query(
      `
      INSERT INTO message_reports (message_id, reporter_id, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (message_id, reporter_id) DO NOTHING
      RETURNING id
    `,
      [messageId, uid, reasonRaw]
    );
    if (!ins.rows[0]) {
      return res.json({ ok: true, duplicate: true });
    }
    return res.json({ ok: true, duplicate: false });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

function formatChatLabelForFlagged(row) {
  const t = row.chat_type || "direct";
  if (t === "official") return "Xasma (official)";
  if (t === "group") return (row.chat_title && String(row.chat_title).trim()) || `Group #${row.chat_id}`;
  if (t === "channel") return (row.chat_title && String(row.chat_title).trim()) || `Channel #${row.chat_id}`;
  const a = row.direct_u1 || "?";
  const b = row.direct_u2 || "?";
  return `${a} · ${b}`;
}

// Admin APIs
app.get("/api/admin/message-reports", authRequired, requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "100"), 10), 500);
  (async () => {
    const r = await query(
      `
      SELECT
        r.id AS report_id,
        r.reason,
        r.created_at,
        m.id AS message_id,
        m.text AS message_text,
        m.chat_id,
        ru.username AS reporter_username,
        su.username AS sender_username,
        c.type AS chat_type,
        c.title AS chat_title,
        du1.username AS direct_u1,
        du2.username AS direct_u2
      FROM message_reports r
      JOIN messages m ON m.id = r.message_id
      JOIN users ru ON ru.id = r.reporter_id
      JOIN users su ON su.id = m.sender_id
      JOIN chats c ON c.id = m.chat_id
      LEFT JOIN users du1 ON du1.id = c.user1_id
      LEFT JOIN users du2 ON du2.id = c.user2_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $1
    `,
      [limit]
    );
    return res.json({
      reports: r.rows.map((row) => ({
        id: Number(row.report_id),
        reason: row.reason,
        createdAt: row.created_at,
        messageId: Number(row.message_id),
        messageText: row.message_text,
        chatId: Number(row.chat_id),
        reporterUsername: row.reporter_username,
        senderUsername: row.sender_username,
        chatLabel: formatChatLabelForFlagged(row),
      })),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/admin/flagged-messages", authRequired, requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "100"), 10), 500);
  (async () => {
    const r = await query(
      `
      SELECT
        m.id,
        m.chat_id,
        m.text,
        m.flagged_reason,
        m.flagged_at,
        m.created_at,
        u.username AS sender_username,
        c.type AS chat_type,
        c.title AS chat_title,
        du1.username AS direct_u1,
        du2.username AS direct_u2
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      JOIN chats c ON c.id = m.chat_id
      LEFT JOIN users du1 ON du1.id = c.user1_id
      LEFT JOIN users du2 ON du2.id = c.user2_id
      WHERE m.flagged = TRUE
        AND COALESCE(m.message_type, 'text') = 'text'
      ORDER BY COALESCE(m.flagged_at, m.created_at) DESC, m.id DESC
      LIMIT $1
    `,
      [limit]
    );
    return res.json({
      messages: r.rows.map((row) => ({
        id: Number(row.id),
        chatId: Number(row.chat_id),
        senderUsername: row.sender_username,
        text: row.text,
        flaggedReason: row.flagged_reason,
        flaggedAt: row.flagged_at,
        chatLabel: formatChatLabelForFlagged(row),
      })),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/admin/users", authRequired, requireAdmin, (req, res) => {
  (async () => {
    const r = await query(
      `
      SELECT id, username, avatar_url, role, banned, is_online, last_seen_at, created_at, messages_sent_count,
             user_tag, tag_color, tag_style
      FROM users
      WHERE username != $1
      ORDER BY created_at DESC, id DESC
    `,
      [OFFICIAL_SYSTEM_USERNAME]
    );
    return res.json({
      users: r.rows.map((u) => {
        const tg = buildSenderTagsFromRow(u, false);
        return {
          id: Number(u.id),
          username: u.username,
          avatar_url: u.avatar_url,
          role: u.role,
          banned: Boolean(u.banned),
          is_online: Boolean(u.is_online),
          last_seen_at: u.last_seen_at,
          created_at: u.created_at,
          messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
          tag: tg.tag,
          tagColor: tg.tagColor,
          tagStyle: tg.tagStyle,
        };
      }),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.patch("/api/admin/users/:userId/tag", authRequired, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  if (getOfficialAnnounceUserId() && userId === getOfficialAnnounceUserId()) {
    return res.status(400).json({ error: "Not allowed" });
  }

  const tagRaw = typeof req.body?.tag === "string" ? req.body.tag.trim() : "";
  const tag = tagRaw.length > 40 ? tagRaw.slice(0, 40) : tagRaw;
  const tagColorIn = typeof req.body?.tagColor === "string" ? req.body.tagColor.trim() : "";
  const tagStyle = normalizeTagStyleApi(req.body?.tagStyle);

  (async () => {
    let userTag = null;
    let tagColor = null;
    let tagStyleDb = null;
    if (tag) {
      userTag = tag;
      tagColor = normalizeTagColorApi(tagColorIn);
      tagStyleDb = tagStyle;
    }

    const r = await query(
      `UPDATE users SET user_tag = $1, tag_color = $2, tag_style = $3 WHERE id = $4
       RETURNING id, username, avatar_url, role, banned, is_online, last_seen_at, created_at, messages_sent_count, user_tag, tag_color, tag_style`,
      [userTag, tagColor, tagStyleDb, userId]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    const tg = buildSenderTagsFromRow(u, false);
    emitToAll("user:tagUpdated", {
      userId: Number(u.id),
      tag: tg.tag,
      tagColor: tg.tagColor,
      tagStyle: tg.tagStyle,
    });
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
        messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
        tag: tg.tag,
        tagColor: tg.tagColor,
        tagStyle: tg.tagStyle,
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.patch("/api/admin/users/:userId/role", authRequired, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const role = typeof req.body?.role === "string" ? req.body.role : "";
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  if (getOfficialAnnounceUserId() && userId === getOfficialAnnounceUserId()) {
    return res.status(400).json({ error: "Not allowed" });
  }
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
  if (getOfficialAnnounceUserId() && userId === getOfficialAnnounceUserId()) {
    return res.status(400).json({ error: "Not allowed" });
  }

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

    const chatId = Number(row.chat_id);
    const pinR = await query(`SELECT pinned_message_id FROM chats WHERE id = $1`, [chatId]);
    const wasPinned = Number(pinR.rows[0]?.pinned_message_id) === messageId;

    await query(`DELETE FROM messages WHERE id = $1`, [messageId]);

    await emitToChatMemberSockets(chatId, "message:deleted", { chatId, messageId });
    if (wasPinned) await emitChatPinnedUpdated(chatId);

    return res.json({ ok: true });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

/**
 * Broadcast a system-line announcement to every user's official "Xasma" chat.
 * Inserts message_type = system, system_kind = official_broadcast, sender_id = internal Xasma bot
 * (API exposes sender as "Xasma"). Emits chat:message per chat for realtime clients.
 */
app.post("/api/admin/broadcast-official", authRequired, requireAdmin, (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "text is required" });
  if (text.length > 4000) return res.status(400).json({ error: "Message too long" });

  (async () => {
    const bot = getOfficialAnnounceUserId();
    if (!bot) return res.status(500).json({ error: "Official system user not initialized" });
    const usersR = await query(`SELECT id FROM users WHERE id != $1`, [bot]);
    let messageCount = 0;
    for (const ur of usersR.rows) {
      const uid = Number(ur.id);
      const chatId = await ensureOfficialChatForUser(uid);
      if (!chatId) continue;
      const m = await insertSystemMessageAndBroadcast(chatId, bot, "official_broadcast", {}, text);
      if (m) messageCount += 1;
    }
    return res.json({ ok: true, userCount: usersR.rows.length, messageCount });
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

  socket.on(
    "chat:send",
    async ({ chatId, text, imageUrl, audioUrl, videoUrl, replyToMessageId, clientTempId } = {}) => {
    const cid = Number(chatId);
    const bodyText = String(text || "").trim();
    const rawImg = typeof imageUrl === "string" ? imageUrl.trim() : "";
    const rawAud = typeof audioUrl === "string" ? audioUrl.trim() : "";
    const rawVid = typeof videoUrl === "string" ? videoUrl.trim() : "";
      const temp = typeof clientTempId === "string" ? clientTempId.trim() : "";
    const img = validateMessageMediaUrlFromSocket(rawImg);
    const aud = validateMessageMediaUrlFromSocket(rawAud);
    const vid = validateMessageMediaUrlFromSocket(rawVid);
    if (rawImg && !img) return;
    if (rawAud && !aud) return;
    if (rawVid && !vid) return;

    if (!cid || (!bodyText && !img && !aud && !vid)) return;
    if (bodyText.length > 4000) return;

    const chat = await getChatById(cid);
    if (!chat) return;
    if (chat.type === "official") return;
    if (!(await isUserChatMember(cid, Number(userId)))) return;
    if (chat.type === "channel" && !(await canSenderPostToChannel(chat, Number(userId)))) return;

    const rate = checkSendRateLimit(Number(userId));
    if (!rate.allowed) {
      socket.emit("chat:sendRateLimited", { retryAfterMs: Math.ceil(rate.retryAfterMs) });
      return;
    }

    try {
      await insertChatMessageAndBroadcast(cid, Number(userId), bodyText, img, aud, vid, replyToMessageId, temp || null);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[Xasma] chat:send failed", e);
    }
    }
  );

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
      if (chat.type === "official") return;
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
  officialAnnounceUserId = await ensureOfficialAnnounceUser();
  await backfillOfficialChatsForAllUsers();
  server.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", e);
  process.exit(1);
});
