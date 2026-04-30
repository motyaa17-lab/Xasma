/**
 * Browser Notification API helpers for incoming chat messages.
 * Fails silently when unsupported or permission denied.
 */

import { canDeliverMessageNotifications } from "./notifyPermissions.js";
import { isChatMuted } from "./chatMute.js";

export function notificationsSupported() {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

/** Incoming message from someone else, not system; suppress if user is focused on that chat. */
export function shouldSuppressMessageNotification(msg, { meId, openChatId }) {
  if (!msg || meId == null) return true;
  if (msg.type === "system") return true;
  if (Number(msg.senderId) === Number(meId)) return true;
  const cid = Number(msg.chatId);
  if (openChatId == null || Number(openChatId) !== cid) return false;
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
  return true;
}

export function buildMessageNotificationTitle(msg, t) {
  const name = msg?.sender?.username;
  if (name && String(name).trim()) return String(name).trim();
  return t("notifyUnknownSender");
}

export function buildMessageNotificationBody(msg, t) {
  const parts = [];
  if (msg.imageUrl) parts.push(t("notifyPreviewPhoto"));
  if (msg.audioUrl) parts.push(t("notifyPreviewVoice"));
  if (msg.videoUrl) parts.push(t("notifyPreviewVideo"));
  const text = String(msg.text ?? "").trim();
  if (text) parts.push(text);
  const s = parts.join(" · ");
  if (s) return s.length > 240 ? `${s.slice(0, 237)}…` : s;
  return t("notifyBodyFallback");
}

/**
 * Show a desktop notification for an incoming message (caller ensures filters).
 */
export async function tryShowIncomingMessageNotification(msg, { meId, openChatId, settings, t, onOpenChat }) {
  try {
    if (!notificationsSupported()) return;
    if (!(await canDeliverMessageNotifications(settings))) return;
    if (shouldSuppressMessageNotification(msg, { meId, openChatId })) return;

    const title = buildMessageNotificationTitle(msg, t);
    const body = buildMessageNotificationBody(msg, t);
    const chatId = Number(msg.chatId);
    if (!chatId) return;
    if (isChatMuted(chatId)) return;

    const n = new Notification(title, {
      body,
      tag: `xasma-chat-${chatId}`,
      renotify: true,
    });

    n.onclick = () => {
      try {
        window.focus();
        n.close();
        onOpenChat?.(chatId);
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore (e.g. mobile Safari restrictions, insecure context)
  }
}
