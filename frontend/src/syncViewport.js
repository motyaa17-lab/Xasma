/**
 * Keeps CSS vars in sync with iOS Safari layout vs visual viewport.
 * When an open mobile chat locks the document, #root uses full innerHeight;
 * the chat shell uses visualViewport for height/offset so the composer sits above the keyboard.
 */

/** Added to document.body while mobile open-chat is active (locks document scroll). */
export const MOBILE_CHAT_OPEN_BODY_CLASS = "body--mobileConversationOpen";

/** #root / .appRoot height: full layout viewport while chat is open, else visual viewport height. */
export function syncAppRootHeight() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    if (document.body.classList.contains(MOBILE_CHAT_OPEN_BODY_CLASS)) {
      document.documentElement.style.setProperty("--app-height", `${Math.round(window.innerHeight)}px`);
      return;
    }
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${Math.round(h)}px`);
  } catch {
    // ignore
  }
}

/** Fixed mobile chat shell: align with visual viewport (keyboard-safe). */
export function syncMobileChatVisualViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const vv = window.visualViewport;
    if (!vv) {
      document.documentElement.style.setProperty("--vv-offset-top", "0px");
      document.documentElement.style.setProperty("--vv-height", `${Math.round(window.innerHeight)}px`);
      return;
    }
    document.documentElement.style.setProperty("--vv-offset-top", `${Math.round(vv.offsetTop)}px`);
    document.documentElement.style.setProperty("--vv-height", `${Math.round(vv.height)}px`);
  } catch {
    // ignore
  }
}
