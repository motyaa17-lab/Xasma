import React, { useEffect, useState } from "react";
import { getUserById } from "../api.js";
import AvatarAura from "./AvatarAura.jsx";
import { formatUserStatusLine } from "../userStatusLine.js";
import ActivityBadge from "./ActivityBadge.jsx";

function initials(name) {
  const s = String(name || "").trim();
  return (s[0] || "?").toUpperCase();
}

export default function UserProfileModal({ open, userId, onClose, t, lang = "en" }) {
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
        if (!cancelled) setErr(e.message || t("errorGeneric"));
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
              <AvatarAura auraColor={user.auraColor}>
                <div className="profileAvatar profileAvatar--lg">
                  {user.avatar ? <img src={user.avatar} alt="" /> : <span>{initials(user.username)}</span>}
                </div>
              </AvatarAura>
              <div className="profileMain">
                <div className="profileValue">
                  {user.username}
                  <ActivityBadge messageCount={user.messageCount} t={t} />
                </div>
                <div className="muted small">{formatUserStatusLine(user, t, lang)}</div>
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

