/** Built-in sticker set (ids must match backend/src/stickersAllowed.js). */
export const STICKER_PACK = [
  { id: "tg_wave_anim", animated: true, labelKey: "stickerPackWaveAnim" },
  { id: "tg_wave_static", animated: false, labelKey: "stickerPackWaveStatic" },
  { id: "tg_nod_anim", animated: true, labelKey: "stickerPackNodAnim" },
  { id: "tg_heart_static", animated: false, labelKey: "stickerPackHeart" },
  { id: "tg_party_anim", animated: true, labelKey: "stickerPackParty" },
  { id: "tg_ok_static", animated: false, labelKey: "stickerPackOk" },
  { id: "tg_hi_static", animated: false, labelKey: "stickerPackHi" },
  { id: "tg_lol_anim", animated: true, labelKey: "stickerPackLol" },
];

const ID_SET = new Set(STICKER_PACK.map((s) => s.id));

export function isAllowedStickerId(id) {
  return typeof id === "string" && ID_SET.has(id);
}

export function getStickerMeta(id) {
  return STICKER_PACK.find((s) => s.id === id) || null;
}
