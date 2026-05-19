import React from "react";

const STROKE = "#1e293b";

function Eye({ cx, cy, r = 3.2 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 1.2} fill="#fff" stroke={STROKE} strokeWidth="1.2" />
      <circle cx={cx + 0.6} cy={cy} r={r * 0.55} fill={STROKE} />
      <circle cx={cx + 1.2} cy={cy - 0.8} r={0.9} fill="#fff" />
    </g>
  );
}

/** Orange tabby cat — waving paw */
export function StickerCatWave({ animated }) {
  return (
    <g>
      <ellipse cx="40" cy="72" rx="20" ry="5" fill="rgba(0,0,0,.12)" />
      <ellipse cx="40" cy="58" rx="22" ry="18" fill="#f59e0b" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="58" rx="14" ry="12" fill="#fbbf24" opacity="0.55" />
      <circle cx="40" cy="34" r="20" fill="#f59e0b" stroke={STROKE} strokeWidth="2" />
      <path d="M24 20 L28 8 L34 18 Z" fill="#f59e0b" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M56 20 L52 8 L46 18 Z" fill="#f59e0b" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M28 32 Q40 26 52 32" fill="none" stroke="#d97706" strokeWidth="2" opacity="0.5" />
      <ellipse cx="40" cy="38" rx="10" ry="7" fill="#fde68a" stroke={STROKE} strokeWidth="1.5" />
      <ellipse cx="40" cy="36" rx="4" ry="3" fill="#f472b6" />
      <Eye cx={32} cy={30} />
      <Eye cx={48} cy={30} />
      <path d="M36 42 Q40 46 44 42" fill="none" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <path d="M30 48 Q40 52 50 48" fill="none" stroke={STROKE} strokeWidth="1.5" strokeLinecap="round" />
      <g className={animated ? "tgStickerCatPaw" : undefined} style={{ transformOrigin: "58px 38px" }}>
        <ellipse cx="58" cy="42" rx="8" ry="6" fill="#f59e0b" stroke={STROKE} strokeWidth="1.8" />
        <circle cx="54" cy="46" r="2.2" fill="#fde68a" stroke={STROKE} strokeWidth="1" />
        <circle cx="58" cy="47" r="2.2" fill="#fde68a" stroke={STROKE} strokeWidth="1" />
        <circle cx="62" cy="46" r="2.2" fill="#fde68a" stroke={STROKE} strokeWidth="1" />
      </g>
      <ellipse cx="22" cy="62" rx="7" ry="5" fill="#f59e0b" stroke={STROKE} strokeWidth="1.6" />
      <ellipse cx="58" cy="64" rx="7" ry="5" fill="#f59e0b" stroke={STROKE} strokeWidth="1.6" />
    </g>
  );
}

/** Corgi — static wave */
export function StickerCorgiWave() {
  return (
    <g>
      <ellipse cx="40" cy="72" rx="20" ry="5" fill="rgba(0,0,0,.12)" />
      <ellipse cx="40" cy="56" rx="24" ry="16" fill="#fcd34d" stroke={STROKE} strokeWidth="2" />
      <rect x="28" y="52" width="24" height="8" rx="3" fill="#fff" opacity="0.7" />
      <ellipse cx="40" cy="32" rx="22" ry="18" fill="#fbbf24" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="28" cy="22" rx="7" ry="11" fill="#fbbf24" stroke={STROKE} strokeWidth="1.8" />
      <ellipse cx="52" cy="22" rx="7" ry="11" fill="#fbbf24" stroke={STROKE} strokeWidth="1.8" />
      <ellipse cx="40" cy="36" rx="12" ry="9" fill="#fff" stroke={STROKE} strokeWidth="1.5" />
      <ellipse cx="40" cy="38" rx="5" ry="4" fill="#1e293b" />
      <ellipse cx="40" cy="36" rx="2" ry="1.5" fill="#f472b6" opacity="0.8" />
      <Eye cx={32} cy={28} r={2.8} />
      <Eye cx={48} cy={28} r={2.8} />
      <path d="M34 44 Q40 48 46 44" fill="none" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <path d="M62 36 L70 28 L68 42 Z" fill="#fbbf24" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
      <ellipse cx="18" cy="60" rx="6" ry="4" fill="#fbbf24" stroke={STROKE} strokeWidth="1.5" />
      <ellipse cx="62" cy="60" rx="6" ry="4" fill="#fbbf24" stroke={STROKE} strokeWidth="1.5" />
    </g>
  );
}

/** Bunny — nodding */
export function StickerBunnyNod({ animated }) {
  return (
    <g className={animated ? "tgStickerBunnyHead" : undefined} style={{ transformOrigin: "40px 32px" }}>
      <ellipse cx="40" cy="72" rx="18" ry="5" fill="rgba(0,0,0,.1)" />
      <ellipse cx="40" cy="58" rx="18" ry="14" fill="#f8fafc" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="36" rx="17" ry="15" fill="#f8fafc" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="28" cy="10" rx="6" ry="16" fill="#f8fafc" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="52" cy="10" rx="6" ry="16" fill="#f8fafc" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="28" cy="12" rx="3" ry="10" fill="#fbcfe8" />
      <ellipse cx="52" cy="12" rx="3" ry="10" fill="#fbcfe8" />
      <ellipse cx="40" cy="40" rx="8" ry="6" fill="#fce7f3" />
      <ellipse cx="40" cy="38" rx="3" ry="2.5" fill="#f472b6" />
      <Eye cx={33} cy={32} r={2.6} />
      <Eye cx={47} cy={32} r={2.6} />
      <ellipse cx="26" cy="38" rx="4" ry="2.5" fill="#fda4af" opacity="0.7" />
      <ellipse cx="54" cy="38" rx="4" ry="2.5" fill="#fda4af" opacity="0.7" />
      <path d="M36 44 Q40 47 44 44" fill="none" stroke={STROKE} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
}

/** Red panda with heart */
export function StickerPandaHeart() {
  return (
    <g>
      <ellipse cx="40" cy="72" rx="18" ry="5" fill="rgba(0,0,0,.1)" />
      <ellipse cx="40" cy="58" rx="20" ry="15" fill="#b45309" stroke={STROKE} strokeWidth="2" />
      <circle cx="40" cy="34" r="19" fill="#dc2626" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="38" rx="11" ry="9" fill="#fef3c7" stroke={STROKE} strokeWidth="1.5" />
      <path d="M26 18 L22 6 L30 16 Z" fill="#dc2626" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M54 18 L58 6 L50 16 Z" fill="#dc2626" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round" />
      <ellipse cx="26" cy="32" rx="5" ry="4" fill="#451a03" opacity="0.35" />
      <ellipse cx="54" cy="32" rx="5" ry="4" fill="#451a03" opacity="0.35" />
      <Eye cx={33} cy={30} r={2.8} />
      <Eye cx={47} cy={30} r={2.8} />
      <ellipse cx="40" cy="36" rx="3" ry="2" fill="#1e293b" />
      <path
        d="M40 48c-8-10-22 0-12 14l12 12 12-12c10-14-4-24-12-14z"
        fill="#ef4444"
        stroke={STROKE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M40 54 L40 62" stroke="#fff" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
    </g>
  );
}

/** Party penguin */
export function StickerPenguinParty({ animated }) {
  return (
    <g className={animated ? "tgStickerPenguin" : undefined}>
      <ellipse cx="40" cy="72" rx="16" ry="5" fill="rgba(0,0,0,.12)" />
      <ellipse cx="40" cy="54" rx="18" ry="22" fill="#1e293b" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="50" rx="12" ry="16" fill="#f8fafc" />
      <circle cx="40" cy="28" r="16" fill="#1e293b" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="32" rx="10" ry="8" fill="#f8fafc" />
      <path d="M22 8 L40 2 L58 8 L54 20 L26 20 Z" fill="#a855f7" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="26" cy="6" r="3" fill="#fbbf24" />
      <circle cx="54" cy="6" r="3" fill="#38bdf8" />
      <Eye cx={34} cy={26} r={2.5} />
      <Eye cx={46} cy={26} r={2.5} />
      <path d="M36 32 L40 38 L44 32 Z" fill="#f59e0b" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="28" cy="56" rx="5" ry="3" fill="#1e293b" stroke={STROKE} strokeWidth="1.4" />
      <ellipse cx="52" cy="56" rx="5" ry="3" fill="#1e293b" stroke={STROKE} strokeWidth="1.4" />
      <path d="M18 4 L22 12 M58 4 L54 12" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/** Frog — OK / thumbs up */
export function StickerFrogOk() {
  return (
    <g>
      <ellipse cx="40" cy="72" rx="18" ry="5" fill="rgba(0,0,0,.1)" />
      <ellipse cx="32" cy="62" rx="14" ry="10" fill="#4ade80" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="48" cy="62" rx="14" ry="10" fill="#4ade80" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="38" rx="22" ry="18" fill="#22c55e" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="28" cy="22" rx="10" ry="8" fill="#22c55e" stroke={STROKE} strokeWidth="1.8" />
      <ellipse cx="52" cy="22" rx="10" ry="8" fill="#22c55e" stroke={STROKE} strokeWidth="1.8" />
      <circle cx="28" cy="20" r="5" fill="#fff" stroke={STROKE} strokeWidth="1.5" />
      <circle cx="52" cy="20" r="5" fill="#fff" stroke={STROKE} strokeWidth="1.5" />
      <circle cx="28" cy="20" r="2.5" fill={STROKE} />
      <circle cx="52" cy="20" r="2.5" fill={STROKE} />
      <path d="M32 44 Q40 50 48 44" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <g>
        <ellipse cx="58" cy="48" rx="8" ry="10" fill="#86efac" stroke={STROKE} strokeWidth="1.8" />
        <path d="M54 52 L58 44 L62 52" fill="#86efac" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <circle cx="40" cy="50" r="9" fill="#15803d" opacity="0.9" />
      <path d="M35 50 L39 54 L46 46" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** Brown bear — hi */
export function StickerBearHi() {
  return (
    <g>
      <ellipse cx="40" cy="72" rx="20" ry="5" fill="rgba(0,0,0,.12)" />
      <ellipse cx="40" cy="56" rx="22" ry="18" fill="#92400e" stroke={STROKE} strokeWidth="2" />
      <circle cx="40" cy="32" r="20" fill="#a16207" stroke={STROKE} strokeWidth="2" />
      <circle cx="22" cy="18" r="9" fill="#a16207" stroke={STROKE} strokeWidth="1.8" />
      <circle cx="58" cy="18" r="9" fill="#a16207" stroke={STROKE} strokeWidth="1.8" />
      <circle cx="22" cy="18" r="5" fill="#d97706" />
      <circle cx="58" cy="18" r="5" fill="#d97706" />
      <ellipse cx="40" cy="38" rx="12" ry="9" fill="#fde68a" stroke={STROKE} strokeWidth="1.5" />
      <ellipse cx="40" cy="36" rx="5" ry="4" fill="#451a03" />
      <Eye cx={32} cy={28} />
      <Eye cx={48} cy={28} />
      <path d="M34 44 Q40 48 46 44" fill="none" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <g className="tgStickerBearPawL" style={{ transformOrigin: "14px 36px" }}>
        <ellipse cx="14" cy="36" rx="8" ry="7" fill="#a16207" stroke={STROKE} strokeWidth="1.6" />
      </g>
      <g className="tgStickerBearPawR" style={{ transformOrigin: "66px 36px" }}>
        <ellipse cx="66" cy="36" rx="8" ry="7" fill="#a16207" stroke={STROKE} strokeWidth="1.6" />
      </g>
    </g>
  );
}

/** Laughing seal */
export function StickerSealLol({ animated }) {
  return (
    <g className={animated ? "tgStickerSeal" : undefined} style={{ transformOrigin: "40px 40px" }}>
      <ellipse cx="40" cy="72" rx="22" ry="5" fill="rgba(0,0,0,.1)" />
      <ellipse cx="40" cy="50" rx="26" ry="22" fill="#94a3b8" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="48" rx="18" ry="14" fill="#e2e8f0" />
      <ellipse cx="40" cy="28" rx="20" ry="16" fill="#94a3b8" stroke={STROKE} strokeWidth="2" />
      <ellipse cx="40" cy="32" rx="12" ry="9" fill="#f1f5f9" stroke={STROKE} strokeWidth="1.5" />
      <path d="M28 24 L24 14 L32 20 Z" fill="#94a3b8" stroke={STROKE} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M28 24 Q40 18 52 24" fill="none" stroke={STROKE} strokeWidth="2" />
      <path d="M26 30 Q30 22 34 30" fill="none" stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M46 30 Q50 22 54 30" fill="none" stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M28 40 Q40 52 52 40" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 44 L36 48 M44 48 L48 44" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}
