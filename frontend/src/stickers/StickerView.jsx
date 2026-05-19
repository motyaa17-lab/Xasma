import React from "react";
import { getStickerMeta } from "./stickerPack.js";
import {
  StickerBearHi,
  StickerBunnyNod,
  StickerCatWave,
  StickerCorgiWave,
  StickerFrogOk,
  StickerPandaHeart,
  StickerPenguinParty,
  StickerSealLol,
} from "./stickerArt.jsx";

/** Animal sticker canvas (vector + CSS motion). */
export default function StickerView({ stickerId, className = "", size = 168 }) {
  const meta = getStickerMeta(stickerId);
  const anim = Boolean(meta?.animated);
  const n = Number(size);
  const wh = Number.isFinite(n) && n > 0 ? Math.min(320, Math.max(48, n)) : 168;
  const safeId = String(stickerId || "").replace(/[^a-z0-9_-]/gi, "");
  const rootClass = `tgStickerCanvas${anim ? ` tgStickerCanvas--anim tgStickerCanvas--${safeId}` : ""} ${className}`.trim();

  let body = null;
  switch (stickerId) {
    case "tg_wave_anim":
      body = <StickerCatWave animated={anim} />;
      break;
    case "tg_wave_static":
      body = <StickerCorgiWave />;
      break;
    case "tg_nod_anim":
      body = <StickerBunnyNod animated={anim} />;
      break;
    case "tg_heart_static":
      body = <StickerPandaHeart />;
      break;
    case "tg_party_anim":
      body = <StickerPenguinParty animated={anim} />;
      break;
    case "tg_ok_static":
      body = <StickerFrogOk />;
      break;
    case "tg_hi_static":
      body = <StickerBearHi />;
      break;
    case "tg_lol_anim":
      body = <StickerSealLol animated={anim} />;
      break;
    default:
      body = (
        <g opacity="0.35">
          <rect x="12" y="12" width="56" height="56" rx="12" fill="#94a3b8" />
        </g>
      );
  }

  return (
    <div className={rootClass} style={{ width: wh, height: wh }} role="img" aria-hidden={!meta}>
      <svg viewBox="0 0 80 80" width="100%" height="100%" className="tgStickerSvg" aria-hidden="true">
        {body}
      </svg>
    </div>
  );
}
