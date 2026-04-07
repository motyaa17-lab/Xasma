/** Thresholds (inclusive): 10 → Lv.1, 100 → Lv.2, 500 → Lv.3, 2000 → Legendary */
export function activityBracketLabel(messageCount, t) {
  const c = Math.max(0, Number(messageCount) || 0);
  if (c < 10) return null;
  if (c >= 2000) return `[${t("activityLegendary")}]`;
  if (c >= 500) return `[${t("activityLvN").replace("{n}", "3")}]`;
  if (c >= 100) return `[${t("activityLvN").replace("{n}", "2")}]`;
  return `[${t("activityLvN").replace("{n}", "1")}]`;
}
