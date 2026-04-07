import React from "react";
import { auraStyleForHex, resolveAuraColor } from "../avatarAura.js";

/**
 * Wraps a circular avatar so glow is not clipped by overflow:hidden on inner avatar.
 * @param {{ auraColor?: string | null, skip?: boolean, className?: string, children: React.ReactNode }} props
 */
export default function AvatarAura({ auraColor, skip = false, className = "", children }) {
  if (skip) return children;
  const style = auraStyleForHex(resolveAuraColor(auraColor));
  return (
    <div className={`avatarAuraOuter ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
