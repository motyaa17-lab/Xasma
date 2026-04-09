export function isPremiumActive(user) {
  if (!user || typeof user !== "object") return false;
  const exp = user.premiumExpiresAt;
  if (exp) {
    const ms = new Date(exp).getTime();
    if (Number.isFinite(ms)) return ms > Date.now();
  }
  return Boolean(user.isPremium);
}

