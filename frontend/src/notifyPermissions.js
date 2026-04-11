import { Capacitor, registerPlugin } from "@capacitor/core";

const AndroidNotifyPerms = registerPlugin("AndroidNotifyPerms", {
  web: () => ({
    getPostNotificationStatus: async () => ({ display: "unsupported" }),
    requestPostNotifications: async () => {},
    openAppNotificationSettings: async () => {},
  }),
});

export { AndroidNotifyPerms };

export async function getNativeAndroidPostNotificationDisplay() {
  if (typeof window === "undefined") return "unsupported";
  try {
    if (Capacitor.getPlatform() !== "android") return "unsupported";
    const r = await AndroidNotifyPerms.getPostNotificationStatus();
    return typeof r?.display === "string" ? r.display : "prompt";
  } catch {
    // On Android, never pretend OS permission is "unsupported" — treat as unknown / need prompt.
    return Capacitor.getPlatform() === "android" ? "prompt" : "unsupported";
  }
}

/** Request Android 13+ POST_NOTIFICATIONS (no-op on web / older Android). */
export async function requestAndroidPostNotifications() {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await AndroidNotifyPerms.requestPostNotifications();
  } catch {
    /* user denied or plugin error */
  }
}

export async function openAndroidNotificationSettings() {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await AndroidNotifyPerms.openAppNotificationSettings();
  } catch {
    /* ignore */
  }
}

/**
 * Full path to actually show a Web Notification (settings + Web API + Android POST on 13+).
 */
export async function canDeliverMessageNotifications(settings) {
  if (!settings?.messageNotificationsEnabled) return false;
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  const nd = await getNativeAndroidPostNotificationDisplay();
  if (Capacitor.getPlatform() === "android") {
    // APK: must match real OS state (POST_NOTIFICATIONS + notifications enabled); do not treat errors as granted.
    return nd === "granted";
  }
  if (nd === "denied" || nd === "prompt") return false;
  return true;
}

/** If OS has permanently blocked Android notifications, clear in-app preference on resume. */
export async function shouldClearNotificationPreferenceDueToOs(settings) {
  if (!settings?.messageNotificationsEnabled) return false;
  const nd = await getNativeAndroidPostNotificationDisplay();
  if (nd === "denied") return true;
  if (typeof Notification !== "undefined" && Notification.permission === "denied") return true;
  return false;
}
