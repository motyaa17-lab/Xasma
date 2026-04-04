/**
 * Per-user send rate limit (in-memory).
 * Max 5 messages per rolling 5s window; exceeding applies a 10s send block.
 */

const WINDOW_MS = 5000;
const MAX_IN_WINDOW = 5;
const BLOCK_MS = 10_000;

/** @type {Map<number, { blockedUntil: number, timestamps: number[] }>} */
const state = new Map();

function getEntry(userId) {
  const uid = Number(userId);
  if (!uid || Number.isNaN(uid)) return null;
  let e = state.get(uid);
  if (!e) {
    e = { blockedUntil: 0, timestamps: [] };
    state.set(uid, e);
  }
  return e;
}

/**
 * @param {number} userId
 * @returns {{ allowed: true } | { allowed: false, retryAfterMs: number }}
 */
function checkSendRateLimit(userId) {
  const now = Date.now();
  const entry = getEntry(userId);
  if (!entry) return { allowed: true };

  if (entry.blockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.blockedUntil - now };
  }

  const cutoff = now - WINDOW_MS;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= MAX_IN_WINDOW) {
    entry.blockedUntil = now + BLOCK_MS;
    return { allowed: false, retryAfterMs: BLOCK_MS };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

module.exports = { checkSendRateLimit, WINDOW_MS, MAX_IN_WINDOW, BLOCK_MS };
