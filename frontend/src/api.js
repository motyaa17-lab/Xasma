const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

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

export async function register({ username, password, avatar }) {
  return apiFetch("/api/register", {
    method: "POST",
    body: { username, password, avatar },
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

export async function updateMyProfile({ statusKind, statusText, about } = {}) {
  const data = await apiFetch("/api/me/profile", {
    method: "PUT",
    body: {
      statusKind: typeof statusKind === "string" ? statusKind : "",
      statusText: typeof statusText === "string" ? statusText : "",
      about: typeof about === "string" ? about : "",
    },
  });
  return data.user;
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

export async function createGroup({ title, memberUserIds }) {
  const data = await apiFetch("/api/groups", {
    method: "POST",
    body: { title, memberUserIds },
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

