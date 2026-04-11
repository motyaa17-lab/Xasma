const PREFIX = "xasma.draft.v1.";

function key(chatId) {
  return `${PREFIX}${Number(chatId)}`;
}

export function readMessageDraft(chatId) {
  const cid = Number(chatId);
  if (!cid) return "";
  try {
    return String(localStorage.getItem(key(cid)) || "");
  } catch {
    return "";
  }
}

export function writeMessageDraft(chatId, text) {
  const cid = Number(chatId);
  if (!cid) return;
  try {
    const s = String(text ?? "");
    if (s.trim() === "") localStorage.removeItem(key(cid));
    else localStorage.setItem(key(cid), s);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearMessageDraft(chatId) {
  const cid = Number(chatId);
  if (!cid) return;
  try {
    localStorage.removeItem(key(cid));
  } catch {
    /* ignore */
  }
}
