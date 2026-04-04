/**
 * Beta-level keyword scan for outgoing user text messages (no blocking).
 * Longer phrases are matched first (substring safety).
 */
const RISKY_KEYWORDS_BASE = [
  "переведи деньги",
  "скинь деньги",
  "дай код",
  "код из смс",
  "подтверди код",
  "введи код",
  "crypto",
  "биткоин",
  "заработок",
  "быстрый заработок",
  "инвестиции",
  "100% доход",
  "без риска",
  "наркотики",
  "купить паспорт",
  "обнал",
  "террор",
  "взрыв",
  "бомба",
];

const RISKY_KEYWORDS = [...RISKY_KEYWORDS_BASE].sort((a, b) => b.length - a.length);

/**
 * @param {string} text
 * @returns {{ flagged: true, riskLevel: 'medium', flaggedReason: string } | null}
 */
function scanOutgoingMessageText(text) {
  const s = String(text || "").toLowerCase();
  if (!s.trim()) return null;
  for (const kw of RISKY_KEYWORDS) {
    if (s.includes(kw)) {
      return { flagged: true, riskLevel: "medium", flaggedReason: kw };
    }
  }
  return null;
}

module.exports = { RISKY_KEYWORDS, RISKY_KEYWORDS_BASE, scanOutgoingMessageText };
