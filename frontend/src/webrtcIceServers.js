/**
 * ICE servers for WebRTC audio calls.
 *
 * - **Same Wi‑Fi / simple NAT:** часто хватает публичных STUN.
 * - **Разные сети / симметричный NAT / мобильный интернет:** без **TURN** соединение часто
 *   доходит до «соединение…» и падает с `iceConnectionState: failed` — медиа не находит путь.
 *
 * Задайте релей через env (см. `.env.example`):
 * - `VITE_WEBRTC_ICE_SERVERS` — JSON-массив (полный контроль), или
 * - `VITE_TURN_URLS` + `VITE_TURN_USERNAME` + `VITE_TURN_CREDENTIAL` — один TURN-сервер (coturn, Metered, и т.д.).
 */
export function getRtcIceServers() {
  const defaultStun = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

  try {
    const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
    if (typeof raw === "string" && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore invalid JSON */
  }

  const turnUrlsRaw = import.meta.env.VITE_TURN_URLS;
  const turnUser = import.meta.env.VITE_TURN_USERNAME;
  const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;
  if (typeof turnUrlsRaw === "string" && turnUrlsRaw.trim() && turnUser != null && turnCred != null) {
    const urls = turnUrlsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length) {
      return [
        ...defaultStun,
        {
          urls,
          username: String(turnUser),
          credential: String(turnCred),
        },
      ];
    }
  }

  return defaultStun;
}
