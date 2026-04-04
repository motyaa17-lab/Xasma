/** Max length for custom status (emoji + text); enforced server-side too. */
export const USER_STATUS_TEXT_MAX = 30;

export function formatLastSeenForStatus(v, lang) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const locale = lang === "ru" ? "ru-RU" : "en-US";
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Resolved status line for a user (presets, custom emoji+text, or presence fallback).
 * @param {object|null|undefined} user
 * @param {(key: string) => string} t
 * @param {string} lang
 */
export function formatUserStatusLine(user, t, lang) {
  if (!user) return "";
  const kind = String(user.statusKind || "");
  const text = String(user.statusText || "").trim();
  if (kind === "online") return t("statusOnline");
  if (kind === "dnd") return t("statusDnd");
  if (kind === "away") return t("statusAway");
  if (kind === "custom" && text) return text;
  if (user.isOnline) return t("online");
  if (user.lastSeenAt) return t("lastSeenAt").replace("{time}", formatLastSeenForStatus(user.lastSeenAt, lang));
  return t("lastSeen");
}
