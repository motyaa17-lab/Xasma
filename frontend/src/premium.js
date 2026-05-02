/**
 * Xasma Premium — логика «активен ли премиум» для UI.
 *
 * Источник данных: объект пользователя с полями из `computePremiumInfo` (backend),
 * обычно `isPremium`, `premiumExpiresAt`, `premiumType`, `premiumDaysLeft`, …
 *
 * Что даёт Premium в клиенте (когда `isPremiumActive(user)` === true):
 * - `userPersonalization.js`: стили имени (`usernameStyle`), ободок аватара (`avatarRing`),
 *   цвет/градиент тега (тег всё равно можно задать всем, но премиум‑визуал завязан на `isPremiumActive`).
 * - Профиль: фон профиля (`profileBackground`), «премиум» оформление аватара/бейдж 💎 в модалках.
 * - Self‑activate: `activatePremium()` → POST `/api/me/premium/activate` (кнопку из приложения убрали;
 *   выдача сейчас через админку: `adminGrantPremium` / `adminRemovePremium`).
 *
 * Чтобы снова отключить премиум‑перки без удаления API — временно верни `return false` в начале функции.
 */
export function isPremiumActive(user) {
  if (!user || typeof user !== "object") return false;
  const exp = user.premiumExpiresAt;
  if (exp) {
    const ms = new Date(exp).getTime();
    if (Number.isFinite(ms)) return ms > Date.now();
  }
  return Boolean(user.isPremium);
}
