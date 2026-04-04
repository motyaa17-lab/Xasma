import React from "react";
import { activityBracketLabel } from "../activityBadge.js";

export default function ActivityBadge({ messageCount, t, className = "" }) {
  const label = activityBracketLabel(messageCount, t);
  if (!label) return null;
  const legendary =
    (Number(messageCount) || 0) >= 2000 ? " activityBadge--legendary" : "";
  return (
    <span className={`activityBadge${legendary}${className ? ` ${className}` : ""}`} title={label}>
      {label}
    </span>
  );
}
