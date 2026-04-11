import { isPremiumActive } from "./premium.js";

/** Must match backend allowed presets. */
export const TAG_COLOR_PRESETS = [
  { id: "#64748b", label: "Slate" },
  { id: "#38bdf8", label: "Sky" },
  { id: "#a78bfa", label: "Violet" },
  { id: "#f472b6", label: "Pink" },
  { id: "#34d399", label: "Emerald" },
  { id: "#fbbf24", label: "Amber" },
  { id: "#f87171", label: "Rose" },
];

export const USERNAME_STYLE_PRESETS = [
  { id: "", labelKey: "usernameStyleDefault" },
  { id: "silver", labelKey: "usernameStyleSilver" },
  { id: "neonBlue", labelKey: "usernameStyleNeonBlue" },
  { id: "violetGlow", labelKey: "usernameStyleVioletGlow" },
  { id: "platinum", labelKey: "usernameStylePlatinum" },
  { id: "softGlow", labelKey: "usernameStyleSoftGlow" },
];

export const AVATAR_RING_PRESETS = [
  { id: "", labelKey: "avatarRingNone" },
  { id: "gradient", labelKey: "avatarRingGradient" },
  { id: "neon", labelKey: "avatarRingNeon" },
  { id: "diamond", labelKey: "avatarRingDiamond" },
  { id: "soft", labelKey: "avatarRingSoft" },
];

const USERNAME_STYLE_CLASS = {
  silver: "usernameStyle--silver",
  neonBlue: "usernameStyle--neon-blue",
  violetGlow: "usernameStyle--violet-glow",
  platinum: "usernameStyle--platinum",
  softGlow: "usernameStyle--soft-glow",
};

/** CSS classes on username spans (premium presets only). */
export function usernameStyleClass(styleId) {
  const s = String(styleId || "").trim();
  if (!s) return "";
  const cls = USERNAME_STYLE_CLASS[s];
  if (!cls) return "";
  return `usernameStyle ${cls}`;
}

/** Wrapper class for avatar ring (premium). */
export function avatarRingWrapClass(ringId) {
  const s = String(ringId || "").trim();
  if (!s) return "";
  const allowed = new Set(AVATAR_RING_PRESETS.map((p) => p.id).filter(Boolean));
  if (!allowed.has(s)) return "";
  return `avatarRingWrap avatarRingWrap--${s}`;
}

/** Username span: preset class, else default premium gradient when premium. */
export function usernameDisplayClass(user) {
  const st = usernameStyleClass(user?.usernameStyle);
  if (st) return st;
  if (isPremiumActive(user)) return "premiumName";
  return "";
}
