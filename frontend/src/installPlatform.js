/** @returns {"ios"|"android"|"desktop"} */
export function detectInstallPlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const iOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* ignore */
  }
  // iOS Safari PWA
  if (typeof window.navigator !== "undefined" && window.navigator.standalone === true) return true;
  return false;
}

export const ANDROID_APK_URL = String(import.meta.env.VITE_ANDROID_APK_URL || "").trim();
