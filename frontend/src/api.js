const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

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

export async function searchUsers(q) {
  const data = await apiFetch(`/api/users?q=${encodeURIComponent(q)}`);
  return data.users;
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

