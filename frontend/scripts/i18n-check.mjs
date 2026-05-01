import { translations } from "../src/i18n.js";

function keysOf(obj) {
  return new Set(Object.keys(obj || {}));
}

const base = translations.en;
if (!base) {
  console.error("[i18n-check] Missing base translations.en");
  process.exitCode = 1;
} else {
  const baseKeys = keysOf(base);
  const langs = Object.keys(translations).filter((l) => l !== "en");

  let ok = true;
  for (const lang of langs) {
    const table = translations[lang] || {};
    const ks = keysOf(table);
    const missing = [];
    for (const k of baseKeys) {
      if (!ks.has(k)) missing.push(k);
    }
    if (missing.length) {
      ok = false;
      console.warn(`[i18n-check] ${lang}: missing ${missing.length} keys`);
      console.warn(missing.slice(0, 120).join(", ") + (missing.length > 120 ? " …" : ""));
    }
  }

  // Non-fatal by default: runtime falls back to English.
  // Set CI=true to fail builds if desired.
  if (!ok && process.env.CI) {
    process.exitCode = 1;
  }
}

