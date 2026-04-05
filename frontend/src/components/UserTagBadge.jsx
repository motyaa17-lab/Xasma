import React from "react";

/** Mix hex color toward white for gradient partner stop (no heavy deps). */
function lightenHex(hex, t) {
  const h = String(hex || "").trim();
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) return "#a5b4fc";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const rr = Math.round(r + (255 - r) * t);
  const gg = Math.round(g + (255 - g) * t);
  const bb = Math.round(b + (255 - b) * t);
  return `#${[rr, gg, bb].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Small pill next to username. Renders nothing if tag is empty.
 * @param {{ tag?: string | null, tagColor?: string, tagStyle?: string, className?: string }} props
 */
export default function UserTagBadge({ tag, tagColor = "#6366f1", tagStyle = "solid", className = "" }) {
  const text = typeof tag === "string" ? tag.trim() : "";
  if (!text) return null;

  const base = String(tagColor || "").trim() || "#6366f1";
  const isGradient = String(tagStyle || "").toLowerCase() === "gradient";
  const light = lightenHex(base, 0.42);

  if (isGradient) {
    return (
      <span
        className={`userTagBadge userTagBadge--gradient ${className}`.trim()}
        style={{
          "--user-tag-c": base,
          "--user-tag-c2": light,
        }}
      >
        {text}
      </span>
    );
  }

  return (
    <span className={`userTagBadge userTagBadge--solid ${className}`.trim()} style={{ background: base }}>
      {text}
    </span>
  );
}
