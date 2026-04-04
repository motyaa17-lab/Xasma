/** Default profile aura (matches server). */
export const DEFAULT_AURA_COLOR = "#0096ff";

/**
 * @param {string | null | undefined} raw
 * @returns {string} #rrggbb
 */
export function resolveAuraColor(raw) {
  if (raw == null || raw === "") return DEFAULT_AURA_COLOR;
  const s = String(raw).trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : DEFAULT_AURA_COLOR;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { r: 0, g: 150, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Soft outer glow — subtle, layout-neutral (box-shadow only).
 * @param {string} hex
 * @returns {React.CSSProperties}
 */
export function auraStyleForHex(hex) {
  const c = resolveAuraColor(hex);
  const { r, g, b } = hexToRgb(c);
  return {
    boxShadow: `0 0 8px rgba(${r}, ${g}, ${b}, 0.38), 0 0 18px rgba(${r}, ${g}, ${b}, 0.12)`,
  };
}
