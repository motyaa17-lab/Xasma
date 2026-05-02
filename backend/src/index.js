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
/** Non-premium users always show this tag color in API output. */
const NEUTRAL_TAG_GRAY = "#64748b";

const TAG_COLOR_PRESETS = new Set([
  "#64748b",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#f87171",
]);

const USERNAME_STYLE_ALLOWED = new Set(["", "silver", "neonBlue", "violetGlow", "platinum", "softGlow"]);
const AVATAR_RING_ALLOWED = new Set(["", "gradient", "neon", "diamond", "soft"]);

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

function normalizeTagColorPreset(raw) {
  const n = normalizeTagColorApi(raw);
  if (TAG_COLOR_PRESETS.has(n)) return n;
  return "#38bdf8";
}

function isPremiumActiveRow(row) {
  const exp = row?.premium_expires_at;
  if (!exp) return false;
  const ms = new Date(exp).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

/** 2–4 uppercase A–Z / 0–9 only (for user-set tags). */
function normalizeTagTextForApi(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length < 2) return null;
  return s.slice(0, 4);
}

function normalizeUsernameStyleApi(raw) {
  const s = String(raw || "").trim();
  return USERNAME_STYLE_ALLOWED.has(s) ? s : "";
}

function normalizeAvatarRingApi(raw) {
  const s = String(raw || "").trim();
  return AVATAR_RING_ALLOWED.has(s) ? s : "";
}

function computePremiumInfo(row) {
  const typeRaw = row?.premium_type;
  const premiumType =
    typeRaw === "invite" || typeRaw === "paid" || typeRaw === "admin" ? String(typeRaw) : null;
  const expiresAt = row?.premium_expires_at || null;
  const expMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const now = Date.now();
  const isPremium = Boolean(expMs && expMs > now);
  const daysLeft = isPremium ? Math.max(0, Math.ceil((expMs - now) / (24 * 3600 * 1000))) : 0;
  return {
    isPremium,
    premiumType: isPremium ? premiumType : null,
    premiumExpiresAt: expiresAt,
    premiumDaysLeft: daysLeft,
  };
}

function normalizeTagStyleApi(raw) {
  return String(raw || "").trim().toLowerCase() === "gradient" ? "gradient" : "solid";
}

/** Tag badge fields for API sender/other objects (from users row joined as mr). */
function buildSenderTagsFromRow(mr, fromOfficial) {
  if (fromOfficial) return { tag: null, tagColor: NEUTRAL_TAG_GRAY, tagStyle: "solid" };
  const rawTag = mr.user_tag != null ? String(mr.user_tag).trim() : "";
  const canonical = rawTag ? normalizeTagTextForApi(rawTag) : null;
  if (!canonical) return { tag: null, tagColor: NEUTRAL_TAG_GRAY, tagStyle: "solid" };
  const displayTag = canonical;
  const prem = isPremiumActiveRow(mr);
  if (!prem) {
    return { tag: displayTag, tagColor: NEUTRAL_TAG_GRAY, tagStyle: "solid" };
  }
  return {
    tag: displayTag,
    tagColor: normalizeTagColorPreset(mr.tag_color),
    tagStyle: normalizeTagStyleApi(mr.tag_style),
  };
}

function senderPersonalizationFromRow(mr, fromOfficial) {
  if (fromOfficial) return { usernameStyle: "", avatarRing: "" };
  const prem = isPremiumActiveRow(mr);
  if (!prem) return { usernameStyle: "", avatarRing: "" };
  return {
    usernameStyle: normalizeUsernameStyleApi(mr.username_style),
    avatarRing: normalizeAvatarRingApi(mr.avatar_ring),
  };
}

function buildOtherUserTagsFromChatRow(c) {
  const rawTag = c.other_user_tag != null ? String(c.other_user_tag).trim() : "";
  const canonical = rawTag ? normalizeTagTextForApi(rawTag) : null;
  if (!canonical) return { tag: null, tagColor: NEUTRAL_TAG_GRAY, tagStyle: "solid" };
  const displayTag = canonical;
  const prem = isPremiumActiveRow({
    premium_expires_at: c.other_premium_expires_at,
    premium_type: c.other_premium_type,
  });
  if (!prem) {
    return { tag: displayTag, tagColor: NEUTRAL_TAG_GRAY, tagStyle: "solid" };
  }
  return {
    tag: displayTag,
    tagColor: normalizeTagColorPreset(c.other_tag_color),
    tagStyle: normalizeTagStyleApi(c.other_tag_style),
  };
}

function personalizationSocketPayload(userId, userRow) {
  const botId = getOfficialAnnounceUserId();
  const fromOfficial = Boolean(botId && Number(userId) === Number(botId));
  const tags = buildSenderTagsFromRow(userRow, fromOfficial);
  const pers = senderPersonalizationFromRow(userRow, fromOfficial);
  return {
    userId: Number(userId),
    tag: tags.tag,
    tagColor: tags.tagColor,
    tagStyle: tags.tagStyle,
    usernameStyle: pers.usernameStyle,
    avatarRing: pers.avatarRing,
  };
}

async function applyPersonalizationFromProfileBody(uid, body) {
  const persKeys = ["userTag", "tagColor", "tagStyle", "usernameStyle", "avatarRing"];
  if (!persKeys.some((k) => Object.prototype.hasOwnProperty.call(body || {}, k))) {
    return { ok: true, changed: false };
  }

  const curR = await query(
    `SELECT user_tag, tag_color, tag_style, username_style, avatar_ring, premium_expires_at FROM users WHERE id = $1`,
    [uid]
  );
  const row = curR.rows[0];
  if (!row) return { error: "User not found" };

  const prem = isPremiumActiveRow(row);

  let nextTag =
    row.user_tag != null && String(row.user_tag).trim() !== ""
      ? normalizeTagTextForApi(String(row.user_tag).trim())
      : null;

  if (Object.prototype.hasOwnProperty.call(body, "userTag")) {
    const raw = typeof body.userTag === "string" ? body.userTag.trim() : "";
    if (raw === "") nextTag = null;
    else {
      const c = normalizeTagTextForApi(raw);
      if (!c) return { error: "Tag must be 2-4 letters or numbers" };
      nextTag = c;
    }
  }

  let nextTagColor = row.tag_color;
  let nextTagStyle = row.tag_style;
  const tagActive = Boolean(nextTag);
  if (tagActive) {
    if (prem) {
      if (Object.prototype.hasOwnProperty.call(body, "tagColor")) nextTagColor = normalizeTagColorPreset(body.tagColor);
      else nextTagColor = nextTagColor || "#38bdf8";
      if (Object.prototype.hasOwnProperty.call(body, "tagStyle")) nextTagStyle = normalizeTagStyleApi(body.tagStyle);
      else nextTagStyle = nextTagStyle || "solid";
    } else {
      nextTagColor = NEUTRAL_TAG_GRAY;
      nextTagStyle = "solid";
    }
  } else {
    nextTagColor = null;
    nextTagStyle = null;
  }

  let nextUsernameStyle = row.username_style;
  if (Object.prototype.hasOwnProperty.call(body, "usernameStyle")) {
    const v = normalizeUsernameStyleApi(body.usernameStyle);
    nextUsernameStyle = prem ? v || null : null;
  }

  let nextAvatarRing = row.avatar_ring;
  if (Object.prototype.hasOwnProperty.call(body, "avatarRing")) {
    const v = normalizeAvatarRingApi(body.avatarRing);
    nextAvatarRing = prem ? v || null : null;
  }

  await query(
    `UPDATE users SET user_tag = $1, tag_color = $2, tag_style = $3, username_style = $4, avatar_ring = $5 WHERE id = $6`,
    [nextTag, nextTagColor, nextTagStyle, nextUsernameStyle || null, nextAvatarRing || null, uid]
  );
  return { ok: true, changed: true };
}

function registrationDateIso(createdAt) {
  if (createdAt == null) return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Early tester badge is currently disabled; keep field shape stable for clients. */
function isEarlyTesterUser(userId, createdAt) {
  void userId;
  void createdAt;
  return false;
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
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.31.112:3000",
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
    // Allow any localhost port during local development (Vite can pick a new port if busy).
    if (/^https?:\/\/localhost:\d{2,5}$/i.test(o)) return true;
    if (/^https?:\/\/127\.0\.0\.1:\d{2,5}$/i.test(o)) return true;
    // Allow same-LAN testing (explicitly scoped to private IPv4 ranges).
    if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d{2,5}$/i.test(o)) return true;
    if (/^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/i.test(o)) return true;
    if (/^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}:\d{2,5}$/i.test(o)) return true;
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
const OFFICIAL_USER_HANDLE = "xasma";
const RESERVED_USER_HANDLES = new Set([
  OFFICIAL_USER_HANDLE,
  "xasma_official",
  "admin",
  "system",
  "official",
  "support",
]);
let officialAnnounceUserId = null;

function getOfficialAnnounceUserId() {
  return officialAnnounceUserId;
}

/** Public API: unique @handle without "@" (lowercase in DB). */
function userHandleApi(row) {
  const h = row?.user_handle;
  return h != null && String(h).trim() !== "" ? String(h).trim() : "";
}

function loginHandleNormalized(loginInput) {
  return String(loginInput || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function escapeLikePattern(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

async function allocateUniqueUserHandle(dbRunner) {
  const run = typeof dbRunner?.query === "function" ? (t, p) => dbRunner.query(t, p) : query;
  for (let i = 0; i < 120; i++) {
    const h = `user${1000000 + Math.floor(Math.random() * 9000000)}`;
    if (RESERVED_USER_HANDLES.has(h)) continue;
    const ex = await run(`SELECT 1 FROM users WHERE user_handle = $1`, [h]);
    if (ex.rows[0]) continue;
    return h;
  }
  throw new Error("Could not allocate user handle");
}

async function ensureOfficialAnnounceUser() {
  const existing = await query(`SELECT id FROM users WHERE username = $1`, [OFFICIAL_SYSTEM_USERNAME]);
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  try {
    const ins = await query(
      `INSERT INTO users (username, password_hash, avatar_url, role, banned, user_handle)
       VALUES ($1, $2, NULL, 'user', FALSE, $3) RETURNING id`,
      [OFFICIAL_SYSTEM_USERNAME, hash, OFFICIAL_USER_HANDLE]
    );
    return Number(ins.rows[0].id);
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (!msg.includes("user_handle") && !msg.includes("duplicate") && !msg.includes("unique")) throw e;
    const h2 = await allocateUniqueUserHandle();
    const ins2 = await query(
      `INSERT INTO users (username, password_hash, avatar_url, role, banned, user_handle)
       VALUES ($1, $2, NULL, 'user', FALSE, $3) RETURNING id`,
      [OFFICIAL_SYSTEM_USERNAME, hash, h2]
    );
    return Number(ins2.rows[0].id);
  }
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

// 1:1 call signaling state (in-memory MVP).
// NOTE: This is intentionally ephemeral: a server restart ends all calls.
const activeCalls = new Map(); // callId -> { callId, chatId, callerId, calleeId, state, createdAt, acceptedAt }
const userActiveCall = new Map(); // userId -> callId
const callInviteTimers = new Map(); // callId -> timeoutId

function isUserOnline(userId) {
  const s = userSockets.get(Number(userId));
  return Boolean(s && s.size > 0);
}

function endCallInternal(callId, { reason = "ended", endedByUserId = null } = {}) {
  const id = String(callId || "");
  const call = activeCalls.get(id);
  if (!call) return;

  // Insert a persisted system message into the direct chat (call log).
  // Fire-and-forget to avoid blocking the signaling path.
  (() => {
    const chatId = Number(call.chatId);
    const callerId = Number(call.callerId);
    const calleeId = Number(call.calleeId);
    const r = String(reason || "ended");
    const acceptedAt = call.acceptedAt ? new Date(call.acceptedAt).getTime() : 0;
    const createdAt = call.createdAt ? new Date(call.createdAt).getTime() : 0;
    const endAt = Date.now();
    const durationSeconds = acceptedAt ? Math.max(0, Math.floor((endAt - acceptedAt) / 1000)) : null;

    let result = "answered";
    if (r === "missed" || r === "offline") result = "missed";
    else if (r === "cancelled") result = "cancelled";
    else if (r === "rejected" || r === "busy") result = "declined";
    else if (r === "disconnect") result = acceptedAt ? "answered" : "missed";

    // Only meaningful for direct chats; call flow already restricts to direct chats.
    const payload = {
      kind: "audio",
      callId: id,
      callerId,
      calleeId,
      result,
      durationSeconds,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
      endedAt: new Date(endAt).toISOString(),
    };

    insertSystemMessageAndBroadcast(chatId, callerId, "call_log", payload, null).catch(() => {});
  })();

  activeCalls.delete(id);
  callInviteTimers.get(id) && clearTimeout(callInviteTimers.get(id));
  callInviteTimers.delete(id);

  if (call.callerId) userActiveCall.delete(Number(call.callerId));
  if (call.calleeId) userActiveCall.delete(Number(call.calleeId));

  const payload = {
    callId: id,
    chatId: Number(call.chatId),
    reason: String(reason || "ended"),
    endedByUserId: endedByUserId != null ? Number(endedByUserId) : null,
  };

  emitToUser(Number(call.callerId), "call:ended", payload);
  emitToUser(Number(call.calleeId), "call:ended", payload);
}

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
  const pers = senderPersonalizationFromRow(mr, fromOfficial);
  const sender = fromOfficial
    ? {
        id: sid,
        username: "Xasma",
        userHandle: OFFICIAL_USER_HANDLE,
        avatar: "",
        auraColor: DEFAULT_AURA_COLOR,
        messageCount: 0,
        tag: null,
        tagColor: NEUTRAL_TAG_GRAY,
        tagStyle: "solid",
        usernameStyle: "",
        avatarRing: "",
        isPremium: false,
      }
    : {
        id: sid,
        username: mr.username,
        userHandle: userHandleApi(mr),
        avatar: mr.avatar_url,
        auraColor: normalizeAuraColorApi(mr.aura_color),
        messageCount: Math.max(0, Number(mr.messages_sent_count) || 0),
        ...tagInfo,
        ...pers,
        ...computePremiumInfo(mr),
      };
  const replyFromOfficial =
    botId && mr.reply_to_sender_id != null && Number(mr.reply_to_sender_id) === botId;
  const forwardFromOfficial =
    botId && mr.forward_from_sender_id != null && Number(mr.forward_from_sender_id) === botId;
  const deletedForAll = Boolean(mr.deleted_for_all);
  return {
    id: Number(mr.id),
    chatId: Number(mr.chat_id),
    senderId: sid,
    text: deletedForAll ? "" : mr.text,
    replyToMessageId: mr.reply_to_message_id != null ? Number(mr.reply_to_message_id) : null,
    forwardFromMessageId: mr.forward_from_message_id != null ? Number(mr.forward_from_message_id) : null,
    deletedForAll,
    deletedAt: mr.deleted_at || null,
    deliveredAt: mr.delivered_at,
    readAt: mr.read_at,
    editedAt: deletedForAll ? null : mr.edited_at,
    createdAt: mr.created_at,
    sender,
    type: msgType,
    systemKind: mr.system_kind || null,
    systemPayload: payload && typeof payload === "object" ? payload : null,
    imageUrl: deletedForAll ? null : mr.image_url || null,
    audioUrl: deletedForAll ? null : mr.audio_url || null,
    videoUrl: deletedForAll ? null : mr.video_url || null,
    replyTo:
      !deletedForAll && mr.reply_to_message_id != null
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
    forwardFrom:
      !deletedForAll && mr.forward_from_message_id != null
        ? {
            id: Number(mr.forward_from_message_id),
            senderId: mr.forward_from_sender_id != null ? Number(mr.forward_from_sender_id) : null,
            senderUsername: forwardFromOfficial ? "Xasma" : mr.forward_from_sender_username || "",
            text: mr.forward_from_text || "",
            imageUrl: mr.forward_from_image_url || null,
            audioUrl: mr.forward_from_audio_url || null,
            videoUrl: mr.forward_from_video_url || null,
          }
        : null,
    reactions,
  };
}

async function fetchMessageById(messageId) {
  const messageRow = await query(
    `
      SELECT m.id, m.chat_id, m.sender_id, m.text, m.reply_to_message_id, m.forward_from_message_id, m.deleted_for_all, m.deleted_at,
             m.delivered_at, m.read_at, m.edited_at, m.created_at,
             m.message_type, m.system_kind, m.system_payload, m.image_url, m.audio_url, m.video_url,
             u.username, u.avatar_url, u.aura_color, u.messages_sent_count,
             u.user_tag, u.tag_color, u.tag_style,
             u.username_style, u.avatar_ring,
             u.user_handle,
             u.premium_type, u.premium_expires_at, u.premium_granted_at,
             rm.sender_id AS reply_to_sender_id,
             ru.username AS reply_to_sender_username,
             rm.text AS reply_to_text,
             rm.image_url AS reply_to_image_url,
             rm.audio_url AS reply_to_audio_url,
             rm.video_url AS reply_to_video_url,
             fm.sender_id AS forward_from_sender_id,
             fu.username AS forward_from_sender_username,
             fm.text AS forward_from_text,
             fm.image_url AS forward_from_image_url,
             fm.audio_url AS forward_from_audio_url,
             fm.video_url AS forward_from_video_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      LEFT JOIN messages fm ON fm.id = m.forward_from_message_id
      LEFT JOIN users fu ON fu.id = fm.sender_id
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
       chat_id, sender_id, text, message_type, image_url, audio_url, video_url, reply_to_message_id, forward_from_message_id,
       flagged, risk_level, flagged_reason, flagged_at
     )
     VALUES ($1, $2, $3, 'text', $4, $5, $6, $7, NULL, $8, $9, $10, CASE WHEN $8 THEN now() ELSE NULL END)
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

async function insertForwardedMessageAndBroadcast(toChatId, senderId, fromMessageId, clientTempId) {
  const toChat = await getChatById(toChatId);
  if (!toChat) return null;
  if (toChat?.type === "official") {
    const bot = getOfficialAnnounceUserId();
    if (!bot || Number(senderId) !== Number(bot)) return null;
  }
  if (toChat?.type === "channel" && !(await canSenderPostToChannel(toChat, senderId))) {
    return null;
  }

  const src = await query(
    `
    SELECT id, chat_id, sender_id, text, image_url, audio_url, video_url, message_type
    FROM messages
    WHERE id = $1
  `,
    [fromMessageId]
  );
  const srcRow = src.rows[0];
  if (!srcRow) return null;
  if ((srcRow.message_type || "text") !== "text") return null;

  // Ensure the user has access to the source message and can post to destination.
  if (!(await isUserChatMember(Number(srcRow.chat_id), Number(senderId)))) return null;
  if (!(await isUserChatMember(Number(toChatId), Number(senderId)))) return null;

  const text = String(srcRow.text || "").trim();
  const img = srcRow.image_url || null;
  const aud = srcRow.audio_url || null;
  const vid = srcRow.video_url || null;
  if (!text && !img && !aud && !vid) return null;

  const safety = scanOutgoingMessageText(text);
  const inserted = await query(
    `INSERT INTO messages (
       chat_id, sender_id, text, message_type, image_url, audio_url, video_url, reply_to_message_id, forward_from_message_id,
       flagged, risk_level, flagged_reason, flagged_at
     )
     VALUES ($1, $2, $3, 'text', $4, $5, $6, NULL, $7, $8, $9, $10, CASE WHEN $8 THEN now() ELSE NULL END)
     RETURNING id`,
    [
      toChatId,
      senderId,
      text,
      img,
      aud,
      vid,
      Number(fromMessageId),
      Boolean(safety),
      safety ? safety.riskLevel : null,
      safety ? safety.flaggedReason : null,
    ]
  );
  const insertedId = Number(inserted.rows[0].id);

  const message = await fetchMessageById(insertedId);
  if (clientTempId) message.clientTempId = String(clientTempId);
  await emitToChatMemberSockets(toChatId, "chat:message", message);
  return message;
}

app.post("/api/register", async (req, res) => {
  const { username, email, password, avatar, inviteCode } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email and password are required" });
  }

  const uname = username.trim();
  if (uname.toLowerCase() === OFFICIAL_SYSTEM_USERNAME) {
    return res.status(400).json({ error: "This username is reserved" });
  }

  const emailRaw = String(email || "").trim();
  const emailNorm = emailRaw.toLowerCase();
  // Keep validation intentionally simple; server-side uniqueness is enforced by DB index.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const avatar_url = typeof avatar === "string" && avatar.trim() ? avatar.trim() : null;

  const existing = await query(`SELECT id FROM users WHERE username = $1`, [uname]);
  if (existing.rows[0]) return res.status(409).json({ error: "Username already exists" });

  const existingEmail = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [emailNorm]);
  if (existingEmail.rows[0]) return res.status(409).json({ error: "Email already exists" });

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
    const raw = base62(crypto.randomBytes(6)).replace(/0/g, "a");
    return raw.slice(0, 8);
  }

  const password_hash = await bcrypt.hash(password, 10);

  const invCode = typeof inviteCode === "string" ? inviteCode.trim() : "";
  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");

    let inviterId = null;
    if (invCode) {
      const inv = await client.query(`SELECT id FROM users WHERE referral_code = $1`, [invCode]);
      if (inv.rows[0]?.id) inviterId = Number(inv.rows[0].id);
    }

    // Generate a unique referral code for the new user.
    let myCode = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const c = generateReferralCode();
      const user_handle = await allocateUniqueUserHandle(client);
      try {
        const inserted = await client.query(
          `INSERT INTO users (username, email, password_hash, avatar_url, referral_code, invited_by, user_handle)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, username, avatar_url, role, banned, aura_color, created_at,
                     referral_code, invited_by, referrals_count,
                     has_custom_bg, has_badge, has_reactions, has_premium_lite,
                     premium_type, premium_expires_at, premium_granted_at, profile_bg_url, user_handle`,
          [uname, emailNorm, password_hash, avatar_url, c, inviterId, user_handle]
        );
        user = inserted.rows[0];
        myCode = c;
        break;
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("user_handle") && (msg.includes("duplicate") || msg.includes("unique"))) continue;
        if (msg.includes("referral") && (msg.includes("duplicate") || msg.includes("unique"))) continue;
        if (msg.includes("users_username_key") || msg.includes("username")) throw e;
        // Any other error: rethrow.
        throw e;
      }
    }
    if (!user) throw new Error("Failed to create user");

    // Prevent self-invite (shouldn't happen, but keep it safe).
    if (user.invited_by != null && Number(user.invited_by) === Number(user.id)) {
      await client.query(`UPDATE users SET invited_by = NULL WHERE id = $1`, [Number(user.id)]);
      user.invited_by = null;
      inviterId = null;
    }

    if (inviterId) {
      const up = await client.query(
        `UPDATE users
         SET referrals_count = referrals_count + 1,
             has_custom_bg = has_custom_bg OR (referrals_count + 1) >= 1,
             has_badge = has_badge OR (referrals_count + 1) >= 3,
             has_reactions = has_reactions OR (referrals_count + 1) >= 5,
             has_premium_lite = has_premium_lite OR (referrals_count + 1) >= 10
         WHERE id = $1
         RETURNING referrals_count, has_custom_bg, has_badge, has_reactions, has_premium_lite,
                   premium_type, premium_expires_at`,
        [inviterId]
      );
      const after = up.rows[0];
      const nextRef = Math.max(0, Number(after?.referrals_count) || 0);
      const hitPremiumLite = nextRef >= 10;
      if (hitPremiumLite) {
        // Grant invite premium for 14 days (timed), without overriding stronger active premium.
        const curType = String(after?.premium_type || "");
        const curExpMs = after?.premium_expires_at ? new Date(after.premium_expires_at).getTime() : 0;
        const now = Date.now();
        const curActive = Boolean(curExpMs && curExpMs > now);
        const strongerActive = curActive && (curType === "paid" || curType === "admin");
        if (!strongerActive) {
          const base = curActive && curType === "invite" ? curExpMs : now;
          const exp = new Date(Math.max(base, now) + 14 * 24 * 3600 * 1000).toISOString();
          await client.query(
            `UPDATE users
             SET premium_type = 'invite',
                 premium_granted_at = now(),
                 premium_expires_at = $2
             WHERE id = $1`,
            [inviterId, exp]
          );
        }
      }
      // (Optional future: emit realtime toast to inviter here.)
      void up;
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("users_email_lower_uidx") || (msg.includes("email") && (msg.includes("duplicate") || msg.includes("unique")))) {
      return res.status(409).json({ error: "Email already exists" });
    }
    throw e;
  } finally {
    client.release();
  }

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
      userHandle: userHandleApi(user),
      avatar: user.avatar_url,
      role: user.role,
      banned: Boolean(user.banned),
      auraColor: normalizeAuraColorApi(user.aura_color),
      messageCount: 0,
      tag: null,
      tagColor: NEUTRAL_TAG_GRAY,
      tagStyle: "solid",
      usernameStyle: "",
      avatarRing: "",
      registrationDate: registrationDateIso(user.created_at),
      isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
      referralCode: user.referral_code || myCode || "",
      invitedBy: user.invited_by != null ? Number(user.invited_by) : null,
      referralsCount: Math.max(0, Number(user.referrals_count) || 0),
      hasCustomBg: Boolean(user.has_custom_bg),
      hasBadge: Boolean(user.has_badge),
      hasReactions: Boolean(user.has_reactions),
      hasPremiumLite: Boolean(user.has_premium_lite),
    },
  });
});

app.post("/api/login", async (req, res) => {
  const { email, password, username } = req.body || {};
  const loginInput = String(email || username || "").trim();
  if (!loginInput || !password) return res.status(400).json({ error: "email and password are required" });

  const looksLikeEmail = loginInput.includes("@");
  const handleGuess = loginHandleNormalized(loginInput);

  const sql = looksLikeEmail
    ? `SELECT id, username, password_hash, avatar_url, role, banned, aura_color, messages_sent_count,
              user_tag, tag_color, tag_style, username_style, avatar_ring, user_handle, created_at,
              referral_code, invited_by, referrals_count,
              has_custom_bg, has_badge, has_reactions, has_premium_lite,
              is_premium, premium_activated_at, profile_bg_url,
              premium_type, premium_expires_at, premium_granted_at
       FROM users WHERE LOWER(email) = LOWER($1)`
    : `SELECT id, username, password_hash, avatar_url, role, banned, aura_color, messages_sent_count,
              user_tag, tag_color, tag_style, username_style, avatar_ring, user_handle, created_at,
              referral_code, invited_by, referrals_count,
              has_custom_bg, has_badge, has_reactions, has_premium_lite,
              is_premium, premium_activated_at, profile_bg_url,
              premium_type, premium_expires_at, premium_granted_at
       FROM users WHERE username = $1 OR user_handle = $2`;

  const params = looksLikeEmail ? [loginInput.toLowerCase()] : [loginInput, handleGuess];
  const r = await query(sql, params);
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
  const persLogin = senderPersonalizationFromRow(user, false);
  return res.json({
    token,
    user: {
      id: Number(user.id),
      username: user.username,
      userHandle: userHandleApi(user),
      avatar: user.avatar_url,
      role: user.role,
      banned: Boolean(user.banned),
      auraColor: normalizeAuraColorApi(user.aura_color),
      messageCount: Math.max(0, Number(user.messages_sent_count) || 0),
      tag: tags.tag,
      tagColor: tags.tagColor,
      tagStyle: tags.tagStyle,
      usernameStyle: persLogin.usernameStyle,
      avatarRing: persLogin.avatarRing,
      registrationDate: registrationDateIso(user.created_at),
      isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
      referralCode: user.referral_code || "",
      invitedBy: user.invited_by != null ? Number(user.invited_by) : null,
      referralsCount: Math.max(0, Number(user.referrals_count) || 0),
      hasCustomBg: Boolean(user.has_custom_bg),
      hasBadge: Boolean(user.has_badge),
      hasReactions: Boolean(user.has_reactions),
      hasPremiumLite: Boolean(user.has_premium_lite),
      ...computePremiumInfo(user),
      profileBackground: user.profile_bg_url || "",
    },
  });
});

app.get("/api/me", authRequired, (req, res) => {
  const uid = Number(req.user.id);
  return query(
    `SELECT id, username, email, user_handle, avatar_url, role, banned, is_online, last_seen_at, status_kind, status_text, about, aura_color, messages_sent_count,
            user_tag, tag_color, tag_style, username_style, avatar_ring, created_at,
            referral_code, invited_by, referrals_count,
            has_custom_bg, has_badge, has_reactions, has_premium_lite,
            is_premium, premium_activated_at, profile_bg_url,
            premium_type, premium_expires_at, premium_granted_at
     FROM users WHERE id = $1`,
    [uid]
  ).then((r) => {
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const tags = buildSenderTagsFromRow(user, false);
    const persMe = senderPersonalizationFromRow(user, false);
    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        email: user.email || "",
        userHandle: userHandleApi(user),
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
        usernameStyle: persMe.usernameStyle,
        avatarRing: persMe.avatarRing,
        registrationDate: registrationDateIso(user.created_at),
        isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
        referralCode: user.referral_code || "",
        invitedBy: user.invited_by != null ? Number(user.invited_by) : null,
        referralsCount: Math.max(0, Number(user.referrals_count) || 0),
        hasCustomBg: Boolean(user.has_custom_bg),
        hasBadge: Boolean(user.has_badge),
        hasReactions: Boolean(user.has_reactions),
        hasPremiumLite: Boolean(user.has_premium_lite),
        ...computePremiumInfo(user),
        profileBackground: user.profile_bg_url || "",
      },
    });
  });
});

app.put("/api/me/email", authRequired, async (req, res) => {
  const uid = Number(req.user.id);
  const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const emailNorm = emailRaw.toLowerCase();
  if (!emailNorm) return res.status(400).json({ error: "Email is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ error: "Invalid email" });

  // Fast path: ensure unique (case-insensitive).
  const existing = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2`, [emailNorm, uid]);
  if (existing.rows[0]) return res.status(409).json({ error: "Email already exists" });

  try {
    const up = await query(`UPDATE users SET email = $1 WHERE id = $2 RETURNING email`, [emailNorm, uid]);
    if (!up.rows[0]) return res.status(404).json({ error: "User not found" });
    return res.json({ email: up.rows[0].email || "" });
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("users_email_lower_uidx") || (msg.includes("email") && (msg.includes("duplicate") || msg.includes("unique")))) {
      return res.status(409).json({ error: "Email already exists" });
    }
    throw e;
  }
});

/** Public @handle: lowercase letters, digits, underscore; 3–32 chars; not reserved. */
function normalizeUserHandleInput(raw) {
  const h = loginHandleNormalized(raw);
  if (h.length < 3 || h.length > 32) return { ok: false, error: "Handle must be 3–32 characters" };
  if (!/^[a-z0-9_]+$/.test(h)) return { ok: false, error: "Handle may only use letters, digits, and underscore" };
  if (RESERVED_USER_HANDLES.has(h)) return { ok: false, error: "This handle is reserved" };
  return { ok: true, value: h };
}

app.put("/api/me/user-handle", authRequired, async (req, res) => {
  const uid = Number(req.user.id);
  const parsed = normalizeUserHandleInput(typeof req.body?.userHandle === "string" ? req.body.userHandle : "");
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const existing = await query(`SELECT id FROM users WHERE user_handle = $1 AND id != $2`, [parsed.value, uid]);
  if (existing.rows[0]) return res.status(409).json({ error: "Handle already taken" });

  try {
    const up = await query(`UPDATE users SET user_handle = $1 WHERE id = $2 RETURNING user_handle`, [parsed.value, uid]);
    if (!up.rows[0]) return res.status(404).json({ error: "User not found" });
    // Use normalized request value for API/socket — pg row keys vary; empty here would wipe clients.
    const userHandle = userHandleApi(up.rows[0]) || parsed.value;
    emitToAll("user:userHandle", { userId: uid, userHandle });
    return res.json({ userHandle });
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (msg.includes("user_handle") && (msg.includes("duplicate") || msg.includes("unique"))) {
      return res.status(409).json({ error: "Handle already taken" });
    }
    throw e;
  }
});

app.put("/api/me/profile", authRequired, (req, res) => {
  const statusKindRaw = typeof req.body?.statusKind === "string" ? req.body.statusKind.trim() : "";
  const statusTextRaw = typeof req.body?.statusText === "string" ? req.body.statusText.trim() : "";
  const aboutRaw = typeof req.body?.about === "string" ? req.body.about.trim() : "";
  const profileBackgroundFieldPresent = Object.prototype.hasOwnProperty.call(req.body || {}, "profileBackground");
  const profileBackgroundRaw =
    typeof req.body?.profileBackground === "string" ? req.body.profileBackground.trim() : "";

  const allowedKinds = new Set(["", "online", "dnd", "away", "custom"]);
  const statusKind = allowedKinds.has(statusKindRaw) ? statusKindRaw : "";
  const statusText = statusTextRaw.length > 30 ? statusTextRaw.slice(0, 30) : statusTextRaw;
  const about = aboutRaw.length > 600 ? aboutRaw.slice(0, 600) : aboutRaw;

  const auraParsed = parseAuraColorBody(req.body);
  if (!auraParsed.ok) return res.status(400).json({ error: "Invalid aura color (use #RRGGBB)" });

  (async () => {
    const uid = Number(req.user.id);
    const persResult = await applyPersonalizationFromProfileBody(uid, req.body || {});
    if (persResult.error === "User not found") return res.status(404).json({ error: persResult.error });
    if (persResult.error) return res.status(400).json({ error: persResult.error });

    let profileBg = null;
    if (profileBackgroundFieldPresent) {
      // Allow clearing background (empty string) regardless of premium status.
      if (!profileBackgroundRaw) {
        profileBg = null;
      } else {
      const isDataUrl = profileBackgroundRaw.startsWith("data:image/");
      if (!isDataUrl) return res.status(400).json({ error: "Profile background must be an image data URL" });
      if (profileBackgroundRaw.length > 1_200_000) {
        return res.status(400).json({ error: "Profile background too large" });
      }
      const prem = await query(`SELECT premium_expires_at FROM users WHERE id = $1`, [uid]);
      const expMs = prem.rows[0]?.premium_expires_at ? new Date(prem.rows[0].premium_expires_at).getTime() : 0;
      if (!(expMs && expMs > Date.now())) return res.status(403).json({ error: "Premium required" });
      profileBg = profileBackgroundRaw;
      }
    }

    if (auraParsed.skip) {
      if (profileBackgroundFieldPresent) {
        await query(`UPDATE users SET status_kind = $1, status_text = $2, about = $3, profile_bg_url = $4 WHERE id = $5`, [
          statusKind || null,
          statusText || null,
          about || null,
          profileBg,
          uid,
        ]);
      } else {
        await query(`UPDATE users SET status_kind = $1, status_text = $2, about = $3 WHERE id = $4`, [
          statusKind || null,
          statusText || null,
          about || null,
          uid,
        ]);
      }
    } else {
      if (profileBackgroundFieldPresent) {
        await query(
          `UPDATE users SET status_kind = $1, status_text = $2, about = $3, aura_color = $4, profile_bg_url = $5 WHERE id = $6`,
          [statusKind || null, statusText || null, about || null, auraParsed.value, profileBg, uid]
        );
      } else {
        await query(`UPDATE users SET status_kind = $1, status_text = $2, about = $3, aura_color = $4 WHERE id = $5`, [
          statusKind || null,
          statusText || null,
          about || null,
          auraParsed.value,
          uid,
        ]);
      }
    }
    const r = await query(
      `SELECT id, username, user_handle, avatar_url, role, banned, is_online, last_seen_at, status_kind, status_text, about, aura_color, messages_sent_count,
              user_tag, tag_color, tag_style, username_style, avatar_ring, created_at,
              referral_code, invited_by, referrals_count,
              has_custom_bg, has_badge, has_reactions, has_premium_lite,
              is_premium, premium_activated_at, profile_bg_url,
              premium_type, premium_expires_at, premium_granted_at
       FROM users WHERE id = $1`,
      [uid]
    );
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const auraColor = normalizeAuraColorApi(user.aura_color);
    const tags = buildSenderTagsFromRow(user, false);
    const persOut = senderPersonalizationFromRow(user, false);
    if (!auraParsed.skip) emitToAll("user:auraColor", { userId: uid, auraColor });
    if (persResult.changed) emitToAll("user:tagUpdated", personalizationSocketPayload(uid, user));
    emitToAll("user:profileStatus", {
      userId: uid,
      statusKind: user.status_kind || "",
      statusText: user.status_text || "",
    });
    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        userHandle: userHandleApi(user),
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
        usernameStyle: persOut.usernameStyle,
        avatarRing: persOut.avatarRing,
        registrationDate: registrationDateIso(user.created_at),
        isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
        referralCode: user.referral_code || "",
        invitedBy: user.invited_by != null ? Number(user.invited_by) : null,
        referralsCount: Math.max(0, Number(user.referrals_count) || 0),
        hasCustomBg: Boolean(user.has_custom_bg),
        hasBadge: Boolean(user.has_badge),
        hasReactions: Boolean(user.has_reactions),
        hasPremiumLite: Boolean(user.has_premium_lite),
        ...computePremiumInfo(user),
        profileBackground: user.profile_bg_url || "",
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

// Premium MVP: activate paid premium for current user (30 days, extends if already active).
app.post("/api/me/premium/activate", authRequired, (req, res) => {
  (async () => {
    const uid = Number(req.user.id);
    const cur = await query(`SELECT premium_type, premium_expires_at FROM users WHERE id = $1`, [uid]);
    const row = cur.rows[0] || {};
    const now = Date.now();
    const curType = String(row.premium_type || "");
    const curExpMs = row.premium_expires_at ? new Date(row.premium_expires_at).getTime() : 0;
    const curActive = Boolean(curExpMs && curExpMs > now);

    // Paid rules:
    // - if already active paid -> extend from current expiry by +30 days
    // - else start from now
    const baseMs = curActive && curType === "paid" ? curExpMs : now;
    const exp = new Date(baseMs + 30 * 24 * 3600 * 1000).toISOString();

    await query(
      `UPDATE users
       SET premium_type = 'paid',
           premium_granted_at = now(),
           premium_expires_at = $2,
           is_premium = TRUE,
           premium_activated_at = COALESCE(premium_activated_at, now())
       WHERE id = $1`,
      [uid, exp]
    );
    const r = await query(
      `SELECT id, username, user_handle, avatar_url, role, banned, is_online, last_seen_at, status_kind, status_text, about, aura_color, messages_sent_count,
              user_tag, tag_color, tag_style, username_style, avatar_ring, created_at,
              referral_code, invited_by, referrals_count,
              has_custom_bg, has_badge, has_reactions, has_premium_lite,
               is_premium, premium_activated_at, profile_bg_url,
               premium_type, premium_expires_at, premium_granted_at
       FROM users WHERE id = $1`,
      [uid]
    );
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const tags = buildSenderTagsFromRow(user, false);
    const persPrem = senderPersonalizationFromRow(user, false);
    return res.json({
      user: {
        id: Number(user.id),
        username: user.username,
        userHandle: userHandleApi(user),
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
        usernameStyle: persPrem.usernameStyle,
        avatarRing: persPrem.avatarRing,
        registrationDate: registrationDateIso(user.created_at),
        isEarlyTester: isEarlyTesterUser(Number(user.id), user.created_at),
        referralCode: user.referral_code || "",
        invitedBy: user.invited_by != null ? Number(user.invited_by) : null,
        referralsCount: Math.max(0, Number(user.referrals_count) || 0),
        hasCustomBg: Boolean(user.has_custom_bg),
        hasBadge: Boolean(user.has_badge),
        hasReactions: Boolean(user.has_reactions),
        hasPremiumLite: Boolean(user.has_premium_lite),
        ...computePremiumInfo(user),
        profileBackground: user.profile_bg_url || "",
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
    const needle = q.replace(/^@+/, "").trim();
    if (!needle) return res.json({ users: [] });
    const likePat = `%${escapeLikePattern(needle)}%`;
    const exactHandle = needle.toLowerCase();
    const prefixPat = `${escapeLikePattern(needle.toLowerCase())}%`;
    const users = await query(
      `
      SELECT id, username, user_handle, avatar_url, aura_color, is_online, last_seen_at, status_kind, status_text, messages_sent_count,
             user_tag, tag_color, tag_style,
             username_style, avatar_ring,
             premium_type, premium_expires_at, premium_granted_at
      FROM users
      WHERE id != $1
        AND username != $6
        AND (
          username ILIKE $2 ESCAPE '\\'
          OR user_handle ILIKE $2 ESCAPE '\\'
        )
      ORDER BY
        CASE WHEN LOWER(user_handle) = LOWER($3) THEN 0 ELSE 1 END,
        CASE WHEN user_handle LIKE $4 ESCAPE '\\' THEN 0 ELSE 1 END,
        username ASC
      LIMIT $5
    `,
      [uid, likePat, exactHandle, prefixPat, limit, OFFICIAL_SYSTEM_USERNAME]
    );
    return res.json({
      users: users.rows.map((u) => {
        const tg = buildSenderTagsFromRow(u, false);
        const pers = senderPersonalizationFromRow(u, false);
        return {
          id: Number(u.id),
          username: u.username,
          userHandle: userHandleApi(u),
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
          usernameStyle: pers.usernameStyle,
          avatarRing: pers.avatarRing,
          ...computePremiumInfo(u),
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
          userHandle: OFFICIAL_USER_HANDLE,
          avatar: "",
          auraColor: DEFAULT_AURA_COLOR,
          isOnline: false,
          lastSeenAt: null,
          statusKind: "",
          statusText: "",
          about: "",
          messageCount: 0,
          tag: null,
          tagColor: NEUTRAL_TAG_GRAY,
          tagStyle: "solid",
          usernameStyle: "",
          avatarRing: "",
          registrationDate: null,
          isEarlyTester: false,
        },
      });
    }
    const r = await query(
      `SELECT id, username, user_handle, avatar_url, aura_color, is_online, last_seen_at, status_kind, status_text, about, messages_sent_count,
              user_tag, tag_color, tag_style, username_style, avatar_ring, created_at,
              is_premium, premium_activated_at, profile_bg_url,
              premium_type, premium_expires_at, premium_granted_at
       FROM users
       WHERE id = $1`,
      [uid]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    const tg = buildSenderTagsFromRow(u, false);
    const persU = senderPersonalizationFromRow(u, false);
    return res.json({
      user: {
        id: Number(u.id),
        username: u.username,
        userHandle: userHandleApi(u),
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
        usernameStyle: persU.usernameStyle,
        avatarRing: persU.avatarRing,
        registrationDate: registrationDateIso(u.created_at),
        isEarlyTester: isEarlyTesterUser(Number(u.id), u.created_at),
        ...computePremiumInfo(u),
        profileBackground: u.profile_bg_url || "",
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
        other.user_handle AS other_user_handle,
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
        other.username_style AS other_username_style,
        other.avatar_ring AS other_avatar_ring,
        other.premium_type AS other_premium_type,
        other.premium_expires_at AS other_premium_expires_at,
        other.premium_granted_at AS other_premium_granted_at,
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
                WHEN 'call_log' THEN
                  CASE COALESCE(m.system_payload->>'result', '')
                    WHEN 'missed' THEN '[Missed call]'
                    WHEN 'declined' THEN '[Call declined]'
                    WHEN 'cancelled' THEN '[Call cancelled]'
                    ELSE
                      CASE
                        WHEN COALESCE((m.system_payload->>'durationSeconds')::int, 0) > 0 THEN '[Audio call]'
                        ELSE '[Audio call]'
                      END
                  END
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
                  tagColor: NEUTRAL_TAG_GRAY,
                  tagStyle: "solid",
                  usernameStyle: "",
                  avatarRing: "",
                  userHandle: OFFICIAL_USER_HANDLE,
                }
              : (() => {
                  const otherPrem = computePremiumInfo({
                    premium_type: c.other_premium_type,
                    premium_expires_at: c.other_premium_expires_at,
                    premium_granted_at: c.other_premium_granted_at,
                  });
                  return {
                    id: Number(c.other_id),
                    username: c.other_username,
                    userHandle: userHandleApi({ user_handle: c.other_user_handle }),
                    avatar: c.other_avatar_url,
                    auraColor: normalizeAuraColorApi(c.other_aura_color),
                    isOnline: Boolean(c.other_is_online),
                    lastSeenAt: c.other_last_seen_at,
                    statusKind: c.other_status_kind || "",
                    statusText: c.other_status_text || "",
                    messageCount: Math.max(0, Number(c.other_messages_sent_count) || 0),
                    ...buildOtherUserTagsFromChatRow(c),
                    usernameStyle: otherPrem.isPremium ? normalizeUsernameStyleApi(c.other_username_style) : "",
                    avatarRing: otherPrem.isPremium ? normalizeAvatarRingApi(c.other_avatar_ring) : "",
                    ...otherPrem,
                  };
                })(),
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
      SELECT u.id, u.username, u.user_handle, u.avatar_url, u.is_online, u.last_seen_at, u.messages_sent_count,
             u.user_tag, u.tag_color, u.tag_style,
             u.username_style, u.avatar_ring,
             u.premium_type, u.premium_expires_at, u.premium_granted_at
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
        const pers = senderPersonalizationFromRow(u, false);
        return {
          id: Number(u.id),
          username: u.username,
          userHandle: userHandleApi(u),
          avatar: u.avatar_url,
          online: Boolean(u.is_online),
          isOnline: Boolean(u.is_online),
          lastSeenAt: u.last_seen_at,
          isCreator: Number(u.id) === createdBy,
          messageCount: Math.max(0, Number(u.messages_sent_count) || 0),
          tag: tg.tag,
          tagColor: tg.tagColor,
          tagStyle: tg.tagStyle,
          usernameStyle: pers.usernameStyle,
          avatarRing: pers.avatarRing,
          ...computePremiumInfo(u),
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
      m.forward_from_message_id,
      m.deleted_for_all,
      m.deleted_at,
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
      u.username_style,
      u.avatar_ring,
      u.user_handle,
      u.premium_type,
      u.premium_expires_at,
      u.premium_granted_at,
      rm.sender_id AS reply_to_sender_id,
      ru.username AS reply_to_sender_username,
      rm.text AS reply_to_text,
      rm.image_url AS reply_to_image_url,
      rm.audio_url AS reply_to_audio_url,
      rm.video_url AS reply_to_video_url,
      fm.sender_id AS forward_from_sender_id,
      fu.username AS forward_from_sender_username,
      fm.text AS forward_from_text,
      fm.image_url AS forward_from_image_url,
      fm.audio_url AS forward_from_audio_url,
      fm.video_url AS forward_from_video_url
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
    LEFT JOIN users ru ON ru.id = rm.sender_id
    LEFT JOIN messages fm ON fm.id = m.forward_from_message_id
    LEFT JOIN users fu ON fu.id = fm.sender_id
    LEFT JOIN message_hidden mh ON mh.message_id = m.id AND mh.user_id = $3
    WHERE m.chat_id = $1
      AND mh.message_id IS NULL
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT $2
  `,
    [chatId, limit, uid]
  );

  // We fetch newest-first for performance; return oldest-first for rendering.
  const rows = messages.rows.slice().reverse();

  const textMessageIds = rows
    .filter((m) => (m.message_type || "text") === "text")
    .map((m) => Number(m.id));
  const reactionsByMessageId = await getGroupedReactionsForMessages(textMessageIds, uid);

  return res.json({
    messages: rows.map((m) =>
      messageRowToApi(m, reactionsByMessageId.get(Number(m.id)) || [])
    ),
  });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.get("/api/chats/:chatId/messages/search", authRequired, (req, res) => {
  const chatId = Number(req.params.chatId);
  const q = typeof req.query?.q === "string" ? String(req.query.q).trim() : "";
  const limit = Math.min(parseInt(String(req.query.limit || "30"), 10), 100);
  if (!chatId) return res.status(400).json({ error: "Invalid chat id" });
  if (!q) return res.status(400).json({ error: "q is required" });

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!(await isUserChatMember(chatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });

    const r = await query(
      `
      SELECT m.id, m.text, m.created_at, m.deleted_for_all, u.username
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN message_hidden mh ON mh.message_id = m.id AND mh.user_id = $4
      WHERE m.chat_id = $1
        AND mh.message_id IS NULL
        AND COALESCE(m.message_type, 'text') = 'text'
        AND m.deleted_for_all = FALSE
        AND m.text ILIKE $2 ESCAPE '\\'
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3
    `,
      [chatId, `%${q.replace(/[%_\\]/g, "\\$&")}%`, limit, uid]
    );

    return res.json({
      results: r.rows.map((row) => ({
        id: Number(row.id),
        text: row.text || "",
        createdAt: row.created_at,
        senderUsername: row.username || "",
      })),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/messages/:messageId/forward", authRequired, (req, res) => {
  const fromMessageId = Number(req.params.messageId);
  const toChatId = Number(req.body?.toChatId);
  if (!fromMessageId || !toChatId) return res.status(400).json({ error: "Invalid request" });

  (async () => {
    const uid = Number(req.user.id);
    const chat = await getChatById(toChatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!(await isUserChatMember(toChatId, uid))) return res.status(403).json({ error: "Not a member of this chat" });
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

    const message = await insertForwardedMessageAndBroadcast(toChatId, uid, fromMessageId);
    if (!message) return res.status(400).json({ error: "Invalid message" });
    return res.json({ message });
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
      SELECT m.id, m.chat_id, m.sender_id, m.text, m.deleted_for_all, m.deleted_at, m.delivered_at, m.read_at, m.edited_at, m.created_at,
             m.message_type, m.system_kind, m.system_payload, m.image_url, m.audio_url, m.video_url,
             u.username, u.avatar_url, u.aura_color, u.messages_sent_count,
             u.user_tag, u.tag_color, u.tag_style,
             u.username_style, u.avatar_ring,
             u.user_handle,
             u.premium_type, u.premium_expires_at, u.premium_granted_at
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

app.delete("/api/messages/:messageId", authRequired, (req, res) => {
  const messageId = Number(req.params.messageId);
  const scopeRaw = String(req.query?.scope || req.body?.scope || "").trim().toLowerCase();
  const scope = scopeRaw === "both" || scopeRaw === "self" ? scopeRaw : "";
  if (!messageId) return res.status(400).json({ error: "Invalid message id" });
  if (!scope) return res.status(400).json({ error: "scope is required (self|both)" });

  (async () => {
    const uid = Number(req.user.id);
    const msgR = await query(
      `SELECT id, chat_id, sender_id, message_type, deleted_for_all FROM messages WHERE id = $1`,
      [messageId]
    );
    const msg = msgR.rows[0];
    if (!msg) return res.status(404).json({ error: "Message not found" });
    if ((msg.message_type || "text") === "system") return res.status(403).json({ error: "Not allowed" });

    const cid = Number(msg.chat_id);
    const chat = await getChatById(cid);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!(await isUserChatMember(cid, uid))) return res.status(403).json({ error: "Not a member of this chat" });

    if (scope === "self") {
      // Hide only for the current user (Telegram-like "Delete for me").
      await query(
        `INSERT INTO message_hidden (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [uid, messageId]
      );
      return res.json({ ok: true });
    }

    // scope=both: only author (or admin), only in 1:1 chats.
    const isAdmin = String(req.user?.role || "") === "admin";
    if (!isAdmin && Number(msg.sender_id) !== uid) return res.status(403).json({ error: "Not allowed" });
    if (chat.type !== "direct") return res.status(403).json({ error: "Delete for both is only available in 1:1 chats" });
    if (msg.deleted_for_all) return res.json({ ok: true });

    await query(
      `
      UPDATE messages
      SET deleted_for_all = TRUE,
          deleted_at = now(),
          text = '',
          image_url = NULL,
          audio_url = NULL,
          video_url = NULL,
          reply_to_message_id = NULL,
          forward_from_message_id = NULL,
          edited_at = NULL
      WHERE id = $1
    `,
      [messageId]
    );
    await query(`DELETE FROM message_reactions WHERE message_id = $1`, [messageId]);

    await emitToChatMemberSockets(cid, "message:deletedForAll", {
      chatId: cid,
      messageId,
      deletedAt: new Date().toISOString(),
    });

    return res.json({ ok: true });
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
      SELECT id, username, user_handle, avatar_url, role, banned, is_online, last_seen_at, created_at, messages_sent_count,
             user_tag, tag_color, tag_style,
             premium_type, premium_expires_at, premium_granted_at
      FROM users
      WHERE username != $1
      ORDER BY created_at DESC, id DESC
    `,
      [OFFICIAL_SYSTEM_USERNAME]
    );
    return res.json({
      users: r.rows.map((u) => {
        const tg = buildSenderTagsFromRow(u, false);
        const prem = computePremiumInfo(u);
        return {
          id: Number(u.id),
          username: u.username,
          userHandle: userHandleApi(u),
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
          ...prem,
        };
      }),
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.post("/api/admin/users/:userId/premium", authRequired, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const type = typeof req.body?.type === "string" ? req.body.type : "";
  const days = Number(req.body?.days);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: "Invalid days" });
  if (type !== "admin" && type !== "paid" && type !== "invite") {
    return res.status(400).json({ error: "Invalid type" });
  }
  if (getOfficialAnnounceUserId() && userId === getOfficialAnnounceUserId()) {
    return res.status(400).json({ error: "Not allowed" });
  }

  (async () => {
    // For admin actions we always set expiry from now (custom duration), not extend.
    const exp = new Date(Date.now() + Math.min(3650, Math.floor(days)) * 24 * 3600 * 1000).toISOString();
    const r = await query(
      `UPDATE users
       SET premium_type = $2,
           premium_granted_at = now(),
           premium_expires_at = $3
       WHERE id = $1
       RETURNING id, username, avatar_url, role, banned, is_online, last_seen_at, created_at, messages_sent_count,
                 user_tag, tag_color, tag_style, premium_type, premium_expires_at, premium_granted_at`,
      [userId, type, exp]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    const tg = buildSenderTagsFromRow(u, false);
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
        ...computePremiumInfo(u),
      },
    });
  })().catch(() => res.status(500).json({ error: "Server error" }));
});

app.delete("/api/admin/users/:userId/premium", authRequired, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  if (getOfficialAnnounceUserId() && userId === getOfficialAnnounceUserId()) {
    return res.status(400).json({ error: "Not allowed" });
  }
  (async () => {
    const r = await query(
      `UPDATE users
       SET premium_type = NULL,
           premium_expires_at = NULL
       WHERE id = $1
       RETURNING id, username, avatar_url, role, banned, is_online, last_seen_at, created_at, messages_sent_count,
                 user_tag, tag_color, tag_style, premium_type, premium_expires_at, premium_granted_at`,
      [userId]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    const tg = buildSenderTagsFromRow(u, false);
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
        ...computePremiumInfo(u),
      },
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
  const tagColorIn = typeof req.body?.tagColor === "string" ? req.body.tagColor.trim() : "";
  const tagStyle = normalizeTagStyleApi(req.body?.tagStyle);

  (async () => {
    let userTag = null;
    let tagColor = null;
    let tagStyleDb = null;
    if (tagRaw) {
      const c = normalizeTagTextForApi(tagRaw);
      if (!c) return res.status(400).json({ error: "Invalid tag (use 2-4 letters or digits)" });
      userTag = c;
      tagColor = normalizeTagColorPreset(tagColorIn);
      tagStyleDb = tagStyle;
    }

    const r = await query(
      `UPDATE users SET user_tag = $1, tag_color = $2, tag_style = $3 WHERE id = $4
       RETURNING id, username, avatar_url, role, banned, is_online, last_seen_at, created_at, messages_sent_count,
                 user_tag, tag_color, tag_style, username_style, avatar_ring,
                 premium_type, premium_expires_at, premium_granted_at`,
      [userTag, tagColor, tagStyleDb, userId]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    const tg = buildSenderTagsFromRow(u, false);
    emitToAll("user:tagUpdated", personalizationSocketPayload(Number(u.id), u));
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

      // If user had an active call, end it (covers app kill / network drop).
      const callId = userActiveCall.get(Number(userId));
      if (callId) endCallInternal(callId, { reason: "disconnect", endedByUserId: Number(userId) });

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

  // ========================
  // 1:1 Audio call signaling
  // ========================

  socket.on("call:invite", async ({ chatId } = {}) => {
    const cid = Number(chatId);
    if (!cid) return;

    // Only allow calls in direct chats.
    const chat = await getChatById(cid);
    if (!chat || chat.type !== "direct") return;
    if (!(await isUserChatMember(cid, Number(userId)))) return;

    const callerId = Number(userId);
    const calleeId =
      chat.user1_id != null && Number(chat.user1_id) === callerId
        ? Number(chat.user2_id)
        : chat.user2_id != null && Number(chat.user2_id) === callerId
          ? Number(chat.user1_id)
          : 0;
    if (!calleeId) return;

    // Busy guard.
    if (userActiveCall.get(callerId) || userActiveCall.get(calleeId)) {
      socket.emit("call:reject", { chatId: cid, reason: "busy" });
      return;
    }

    const callId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const call = { callId, chatId: cid, callerId, calleeId, state: "ringing", createdAt, acceptedAt: null };
    activeCalls.set(callId, call);
    userActiveCall.set(callerId, callId);
    userActiveCall.set(calleeId, callId);

    // Notify caller UI that we're ringing (even if callee offline).
    socket.emit("call:ringing", { callId, chatId: cid, toUserId: calleeId });

    // If callee is online, send incoming event; otherwise let it timeout as "offline".
    if (isUserOnline(calleeId)) {
      emitToUser(calleeId, "call:incoming", { callId, chatId: cid, fromUserId: callerId });
    }

    // Unanswered timeout -> missed/offline.
    const timeoutMs = 28_000;
    const tid = setTimeout(() => {
      const c = activeCalls.get(callId);
      if (!c) return;
      const reason = isUserOnline(calleeId) ? "missed" : "offline";
      endCallInternal(callId, { reason, endedByUserId: null });
    }, timeoutMs);
    callInviteTimers.set(callId, tid);
  });

  socket.on("call:accept", async ({ callId } = {}) => {
    const id = String(callId || "");
    const call = activeCalls.get(id);
    if (!call) return;
    if (Number(call.calleeId) !== Number(userId)) return;
    if (!(await isUserChatMember(Number(call.chatId), Number(userId)))) return;

    call.state = "connecting";
    call.acceptedAt = new Date().toISOString();
    activeCalls.set(id, call);

    callInviteTimers.get(id) && clearTimeout(callInviteTimers.get(id));
    callInviteTimers.delete(id);

    emitToUser(Number(call.callerId), "call:accept", { callId: id, chatId: Number(call.chatId) });
    emitToUser(Number(call.calleeId), "call:connecting", { callId: id, chatId: Number(call.chatId) });
  });

  socket.on("call:reject", async ({ callId, reason } = {}) => {
    const id = String(callId || "");
    const call = activeCalls.get(id);
    if (!call) return;
    // Either participant may reject/cancel before connect.
    const uid = Number(userId);
    if (uid !== Number(call.callerId) && uid !== Number(call.calleeId)) return;
    if (!(await isUserChatMember(Number(call.chatId), uid))) return;
    endCallInternal(id, { reason: reason || "rejected", endedByUserId: uid });
  });

  socket.on("call:end", async ({ callId, reason } = {}) => {
    const id = String(callId || "");
    const call = activeCalls.get(id);
    if (!call) return;
    const uid = Number(userId);
    if (uid !== Number(call.callerId) && uid !== Number(call.calleeId)) return;
    if (!(await isUserChatMember(Number(call.chatId), uid))) return;
    endCallInternal(id, { reason: reason || "ended", endedByUserId: uid });
  });

  function relayToOther(call, fromUserId, event, payload) {
    const other = Number(fromUserId) === Number(call.callerId) ? Number(call.calleeId) : Number(call.callerId);
    emitToUser(other, event, payload);
  }

  socket.on("webrtc:offer", async ({ callId, sdp } = {}) => {
    const id = String(callId || "");
    const call = activeCalls.get(id);
    if (!call) return;
    const uid = Number(userId);
    if (uid !== Number(call.callerId) && uid !== Number(call.calleeId)) return;
    if (call.state !== "connecting" && call.state !== "connected") return;
    relayToOther(call, uid, "webrtc:offer", { callId: id, sdp });
  });

  socket.on("webrtc:answer", async ({ callId, sdp } = {}) => {
    const id = String(callId || "");
    const call = activeCalls.get(id);
    if (!call) return;
    const uid = Number(userId);
    if (uid !== Number(call.callerId) && uid !== Number(call.calleeId)) return;
    if (call.state !== "connecting" && call.state !== "connected") return;
    relayToOther(call, uid, "webrtc:answer", { callId: id, sdp });
  });

  socket.on("webrtc:ice-candidate", async ({ callId, candidate } = {}) => {
    const id = String(callId || "");
    const call = activeCalls.get(id);
    if (!call) return;
    const uid = Number(userId);
    if (uid !== Number(call.callerId) && uid !== Number(call.calleeId)) return;
    if (call.state !== "connecting" && call.state !== "connected") return;
    relayToOther(call, uid, "webrtc:ice-candidate", { callId: id, candidate });
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
