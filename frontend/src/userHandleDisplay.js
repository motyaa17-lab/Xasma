/** Stored handles have no "@"; UI shows @prefix. */
export function formatAtUserHandle(handle) {
  const h = String(handle || "").trim();
  if (!h) return "";
  return `@${h}`;
}
