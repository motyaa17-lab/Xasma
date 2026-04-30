const PREFIX = "xasma.chatMute.v1.";

function key(chatId) {
  return `${PREFIX}${Number(chatId)}`;
}

export function isChatMuted(chatId) {
  const cid = Number(chatId);
  if (!cid) return false;
  try {
    return localStorage.getItem(key(cid)) === "1";
  } catch {
    return false;
  }
}

export function setChatMuted(chatId, muted) {
  const cid = Number(chatId);
  if (!cid) return;
  try {
    if (muted) localStorage.setItem(key(cid), "1");
    else localStorage.removeItem(key(cid));
  } catch {
    // ignore quota / private mode
  }
}

