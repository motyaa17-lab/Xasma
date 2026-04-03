import React, { useEffect, useState } from "react";
import { getUserById } from "../api.js";

function initials(name) {
  const s = String(name || "").trim();
  return (s[0] || "?").toUpperCase();
}

function renderStatusLine(u, t) {
  const kind = String(u?.statusKind || "");
  const text = String(u?.statusText || "").trim();
  if (kind === "dnd") return t("statusDnd");
  if (kind === "away") return t("statusAway");
  if (kind === "online") return t("statusOnline");
  if (kind === "custom" && text) return text;
  return u?.isOnline ? t("online") : t("lastSeen");
}

export default function UserProfileModal({ open, userId, onClose, t }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!open || !userId) return undefined;
    setLoading(true);
    setErr("");
    setUser(null);
    (async () => {
      try {
        const u = await getUserById(userId);
        if (!cancelled) setUser(u);
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  if (!open) return null;

  return (
    <div className="modalBackdrop modalBackdrop--app" role="presentation" onClick={onClose}>
      <div className="modalCard modalCard--mobileFriendly" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{t("profile")}</div>
          <button type="button" className="iconCloseBtn" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="modalBody">
          {loading ? <div className="muted">{t("loading")}</div> : null}
          {err ? <div className="authError">{err}</div> : null}
          {user ? (
            <div className="profilePanel profilePanel--stack">
              <div className="profileAvatar profileAvatar--lg">
                {user.avatar ? <img src={user.avatar} alt="" /> : <span>{initials(user.username)}</span>}
              </div>
              <div className="profileMain">
                <div className="profileValue">{user.username}</div>
                <div className="muted small">{renderStatusLine(user, t)}</div>
                {String(user.about || "").trim() ? (
                  <div className="profileAbout">{String(user.about || "").trim()}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

