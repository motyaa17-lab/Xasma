/** Built-in sticker ids (keep in sync with frontend/src/stickers/stickerPack.js). */
const ALLOWED = new Set([
  "tg_wave_anim",
  "tg_wave_static",
  "tg_nod_anim",
  "tg_heart_static",
  "tg_party_anim",
  "tg_ok_static",
  "tg_hi_static",
  "tg_lol_anim",
]);

function normalizeStickerId(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.length > 64) return null;
  if (!/^tg_[a-z0-9_]+$/.test(s)) return null;
  return ALLOWED.has(s) ? s : null;
}

module.exports = { ALLOWED_STICKER_IDS: ALLOWED, normalizeStickerId };
