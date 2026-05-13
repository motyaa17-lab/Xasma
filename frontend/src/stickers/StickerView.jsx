import React from "react";
import { getStickerMeta } from "./stickerPack.js";

function Face({ mood = "neutral" }) {
  if (mood === "lol") {
    return (
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M18 26l6 6M24 26l-6 6M42 26l6 6M48 26l-6 6" />
        <path d="M22 44c10 14 30 14 40 0" />
      </g>
    );
  }
  if (mood === "happy") {
    return (
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="currentColor">
        <circle cx="26" cy="26" r="3" />
        <circle cx="54" cy="26" r="3" />
        <path d="M26 44c6 10 18 12 28 0" fill="none" />
      </g>
    );
  }
  return (
    <g fill="currentColor">
      <circle cx="26" cy="26" r="3" />
      <circle cx="54" cy="26" r="3" />
      <rect x="28" y="44" width="24" height="4" rx="2" />
    </g>
  );
}

/** Telegram-like sticker canvas (vector + CSS motion). */
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
    case "tg_wave_static":
      body = (
        <g>
          <ellipse cx="40" cy="52" rx="22" ry="26" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="40" cy="28" r="18" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <Face mood="happy" />
          <g className={stickerId === "tg_wave_anim" ? "tgStickerWaveArm" : undefined}>
            <path
              d="M62 40c10 2 18 12 16 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </g>
        </g>
      );
      break;
    case "tg_nod_anim":
      body = (
        <g className="tgStickerNodHead">
          <ellipse cx="40" cy="56" rx="24" ry="22" fill="var(--tg-sticker-shirt, #5b8def)" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="40" cy="30" r="19" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <Face />
          <path d="M26 18c6-8 18-8 28 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
      break;
    case "tg_heart_static":
      body = (
        <g>
          <path
            d="M40 24c-10-12-28 2-14 18l14 14 14-14c14-16-4-30-14-18z"
            fill="var(--tg-sticker-heart, #f43f5e)"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <ellipse cx="40" cy="68" rx="18" ry="10" fill="rgba(0,0,0,.06)" />
        </g>
      );
      break;
    case "tg_party_anim":
      body = (
        <g className="tgStickerPartyBounce">
          <ellipse cx="40" cy="56" rx="22" ry="24" fill="var(--tg-sticker-shirt, #6366f1)" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="40" cy="34" r="18" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <Face mood="happy" />
          <path d="M22 12 L40 4 L58 12 L52 26 L28 26 Z" fill="var(--tg-sticker-hat, #a855f7)" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M18 6l4 8M56 6l-4 8M40 2v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
      break;
    case "tg_ok_static":
      body = (
        <g>
          <circle cx="40" cy="40" r="28" fill="var(--tg-sticker-ok-bg, #22c55e)" stroke="currentColor" strokeWidth="2.5" />
          <path d="M24 40l10 10 22-22" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
      break;
    case "tg_hi_static":
      body = (
        <g>
          <ellipse cx="36" cy="54" rx="20" ry="24" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="36" cy="28" r="17" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <Face mood="happy" />
          <path d="M58 22c12-4 18 8 10 18-6 8-18 4-22-6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      );
      break;
    case "tg_lol_anim":
      body = (
        <g className="tgStickerLolShake">
          <ellipse cx="40" cy="54" rx="22" ry="26" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="40" cy="28" r="18" fill="var(--tg-sticker-skin, #f6d4b)" stroke="currentColor" strokeWidth="2.5" />
          <Face mood="lol" />
          <path d="M14 50 Q40 62 66 50" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
      break;
    default:
      body = (
        <g opacity="0.35">
          <rect x="12" y="12" width="56" height="56" rx="12" fill="currentColor" />
        </g>
      );
  }

  return (
    <div className={rootClass} style={{ width: wh, height: wh }} role="img" aria-hidden={!meta}>
      <svg viewBox="0 0 80 80" width="100%" height="100%" className="tgStickerSvg">
        {body}
      </svg>
    </div>
  );
}
