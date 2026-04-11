import { USER_STATUS_TEXT_MAX } from "./userStatusLine.js";

function normalizeBaseUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  return v.endsWith("/") ? v.slice(0, -1) : v;
}

/** Prefer `VITE_API_URL`, then legacy `VITE_API_BASE`. */
function apiUrlFromEnv() {
  const a = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (a) return a;
  return normalizeBaseUrl(import.meta.env.VITE_API_BASE);
}

/**
 * Some setups mistakenly used the static-file port (3000) as the API base.
 * If the URL is origin-only on port 3000, rewrite to 4000 (this app's backend port).
 */
function fixMisconfiguredApiPort(base) {
  const b = normalizeBaseUrl(base);
  if (!b) return b;
  try {
    const u = new URL(b);
    if (u.port !== "3000") return b;
    if (u.pathname && u.pathname !== "/") return b;
    u.port = "4000";
    return normalizeBaseUrl(u.origin);
  } catch {
    return b;
  }
}

function isCapacitorAndroid() {
  if (typeof window === "undefined") return false;
  const cap = window.Capacitor;
  if (!cap) return false;
  if (typeof cap.getPlatform === "function") return cap.getPlatform() === "android";
  if (typeof cap.platform === "string") return cap.platform === "android";
  return false;
}

function isCordovaAndroid() {
  if (typeof window === "undefined") return false;
  // Cordova/PhoneGap exposes `window.cordova` in native WebViews.
  if (!window.cordova) return false;
  return /Android/i.test(navigator.userAgent || "");
}

function computeApiBase() {
  // Deployments: set `VITE_API_URL` (preferred) or legacy `VITE_API_BASE` to your public API origin.
  const envBase = fixMisconfiguredApiPort(apiUrlFromEnv());
  if (envBase) return envBase;

  // Local development fallbacks only.
  if (isCapacitorAndroid() || isCordovaAndroid()) return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

const API_BASE = computeApiBase();

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log("[Xasma] API_BASE resolved", {
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_API_BASE: import.meta.env.VITE_API_BASE,
    API_BASE,
  });
}

export function getApiBase() {
  return API_BASE;
}

/** Thrown by apiFetch; includes HTTP status (0 = network / unreachable). */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getToken() {
  return localStorage.getItem("token");
}

async function apiFetch(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = token || getToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Network error", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data;
}

export async function register({ username, password, avatar, inviteCode }) {
  return apiFetch("/api/register", {
    method: "POST",
    body: { username, password, avatar, inviteCode: inviteCode || "" },
    token: null,
  });
}

export async function login({ username, password }) {
  return apiFetch("/api/login", {
    method: "POST",
    body: { username, password },
    token: null,
  });
}

export async function getMe() {
  const data = await apiFetch("/api/me");
  return data.user;
}

export async function updateMyAvatar(avatar) {
  const data = await apiFetch("/api/me/avatar", {
    method: "PUT",
    body: { avatar: avatar || "" },
  });
  return data.user;
}

export async function updateMyProfile({ statusKind, statusText, about, auraColor } = {}) {
  const st =
    typeof statusText === "string" ? statusText.trim().slice(0, USER_STATUS_TEXT_MAX) : "";
  const body = {
    statusKind: typeof statusKind === "string" ? statusKind : "",
    statusText: st,
    about: typeof about === "string" ? about : "",
  };
  if (auraColor !== undefined) body.auraColor = auraColor;
  if (typeof arguments[0]?.profileBackground === "string") {
    body.profileBackground = arguments[0].profileBackground;
  }
  const data = await apiFetch("/api/me/profile", {
    method: "PUT",
    body,
  });
  return data.user;
}

export async function activatePremium() {
  const data = await apiFetch("/api/me/premium/activate", { method: "POST", body: {} });
  return data.user;
}

export async function adminGrantPremium(userId, { type, days }) {
  return apiFetch(`/api/admin/users/${userId}/premium`, {
    method: "POST",
    body: { type, days },
  });
}

export async function adminRemovePremium(userId) {
  return apiFetch(`/api/admin/users/${userId}/premium`, {
    method: "DELETE",
  });
}

export async function searchUsers(q) {
  const data = await apiFetch(`/api/users?q=${encodeURIComponent(q)}`);
  return data.users;
}

export async function getUserById(userId) {
  const uid = Number(userId);
  const data = await apiFetch(`/api/users/${uid}`);
  return data.user;
}

export async function getChats() {
  const data = await apiFetch("/api/chats");
  return data.chats;
}

export async function createChat(withUserId) {
  const data = await apiFetch("/api/chats", {
    method: "POST",
    body: { withUserId },
  });
  return data.chatId;
}

/** Pin a message in a chat, or pass `null` to unpin. */
export async function patchChatPin(chatId, messageId) {
  const data = await apiFetch(`/api/chats/${chatId}/pin`, {
    method: "PATCH",
    body: { messageId: messageId == null ? null : Number(messageId) },
  });
  return data;
}

/** Pin / unpin chat in the inbox list (per user). */
export async function patchChatListPin(chatId, pinned) {
  return apiFetch(`/api/chats/${chatId}/list-pin`, {
    method: "PATCH",
    body: { pinned: Boolean(pinned) },
  });
}

/** Leave / hide chat for the current user (removes membership). */
export async function deleteChatMembership(chatId) {
  return apiFetch(`/api/chats/${chatId}/membership`, {
    method: "DELETE",
  });
}

export async function createGroup({ title, memberUserIds }) {
  const data = await apiFetch("/api/groups", {
    method: "POST",
    body: { title, memberUserIds },
  });
  return data.chatId;
}

export async function createChannel({ title, avatar, memberUserIds }) {
  const body = { title, memberUserIds: memberUserIds || [] };
  if (avatar) body.avatar = avatar;
  const data = await apiFetch("/api/channels", {
    method: "POST",
    body,
  });
  return data.chatId;
}

export async function getGroup(chatId) {
  return apiFetch(`/api/groups/${chatId}`);
}

export async function patchGroupAvatar(chatId, avatar) {
  const data = await apiFetch(`/api/groups/${chatId}/avatar`, {
    method: "PATCH",
    body: { avatar: avatar || "" },
  });
  return data.group;
}

export async function addGroupMember(chatId, userId) {
  return apiFetch(`/api/groups/${chatId}/members`, {
    method: "POST",
    body: { userId },
  });
}

export async function removeGroupMember(chatId, userId) {
  return apiFetch(`/api/groups/${chatId}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function postChatMessage(chatId, text, imageUrl, audioUrl, videoUrl) {
  const body = { text: text || "" };
  if (imageUrl) body.imageUrl = imageUrl;
  if (audioUrl) body.audioUrl = audioUrl;
  if (videoUrl) body.videoUrl = videoUrl;
  const data = await apiFetch(`/api/chats/${chatId}/messages`, {
    method: "POST",
    body,
  });
  return data.message;
}

export async function uploadChatImage(file) {
  const fd = new FormData();
  fd.append("image", file);
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  } catch {
    throw new ApiError("Network error", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Upload failed", res.status);
  if (!data.url) throw new ApiError("Upload failed", res.status);
  return data.url;
}

export async function uploadChatAudio(file) {
  const fd = new FormData();
  fd.append("audio", file);
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE}/api/upload/audio`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  } catch {
    throw new ApiError("Network error", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Upload failed", res.status);
  if (!data.url) throw new ApiError("Upload failed", res.status);
  return data.url;
}

export async function uploadChatVideo(file) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[Xasma] uploadChatVideo", {
      name: String(file?.name || ""),
      type: String(file?.type || ""),
      size: Number(file?.size || 0),
      isFile: typeof File !== "undefined" ? file instanceof File : false,
      isBlob: typeof Blob !== "undefined" ? file instanceof Blob : false,
    });
  }
  const fd = new FormData();
  fd.append("video", file);
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE}/api/upload/video`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  } catch {
    throw new ApiError("Network error", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Upload failed", res.status);
  if (!data.url) throw new ApiError("Upload failed", res.status);
  return data.url;
}

export async function getMessages(chatId, limit = 50) {
  const data = await apiFetch(`/api/chats/${chatId}/messages?limit=${limit}`);
  return data.messages;
}

export async function updateMessage(messageId, text) {
  return apiFetch(`/api/messages/${messageId}`, {
    method: "PUT",
    body: { text },
  });
}

export async function toggleReaction(messageId, emoji) {
  return apiFetch(`/api/messages/${messageId}/reactions`, {
    method: "POST",
    body: { emoji },
  });
}

export async function getReactions(messageId) {
  return apiFetch(`/api/messages/${messageId}/reactions`);
}

export function getSocketEndpoint() {
  return API_BASE;
}

// Admin APIs
export async function adminListUsers() {
  return apiFetch("/api/admin/users");
}

export async function adminSetUserRole(userId, role) {
  return apiFetch(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    body: { role },
  });
}

export async function adminSetUserBanned(userId, banned) {
  return apiFetch(`/api/admin/users/${userId}/ban`, {
    method: "PATCH",
    body: { banned: Boolean(banned) },
  });
}

export async function adminPatchUserTag(userId, { tag, tagColor, tagStyle } = {}) {
  return apiFetch(`/api/admin/users/${userId}/tag`, {
    method: "PATCH",
    body: {
      tag: tag != null ? String(tag) : "",
      tagColor: tagColor != null ? String(tagColor) : "",
      tagStyle: tagStyle != null ? String(tagStyle) : "solid",
    },
  });
}

export async function adminDeleteMessage(messageId) {
  return apiFetch(`/api/admin/messages/${messageId}`, {
    method: "DELETE",
  });
}

export async function adminBroadcastOfficial(text) {
  return apiFetch("/api/admin/broadcast-official", {
    method: "POST",
    body: { text: String(text || "").trim() },
  });
}

export async function adminListFlaggedMessages() {
  return apiFetch("/api/admin/flagged-messages");
}

export async function reportMessage(messageId, reason) {
  const mid = Number(messageId);
  return apiFetch(`/api/messages/${mid}/report`, {
    method: "POST",
    body: { reason: String(reason || "").trim().toLowerCase() },
  });
}

export async function adminListMessageReports() {
  return apiFetch("/api/admin/message-reports");
}

