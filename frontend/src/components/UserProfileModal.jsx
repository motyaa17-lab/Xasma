import React, { useEffect, useState } from "react";
import { getUserById } from "../api.js";
import AvatarAura from "./AvatarAura.jsx";
import { formatUserStatusLine } from "../userStatusLine.js";
import { localeForLang } from "../i18n.js";
import ActivityBadge from "./ActivityBadge.jsx";
import UserTagBadge from "./UserTagBadge.jsx";

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || "?";
}

function formatMemberSince(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(localeForLang(lang), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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

  const memberSince = user?.registrationDate ? formatMemberSince(user.registrationDate, lang) : "";

  return (
    <div className="modalBackdrop modalBackdrop--app" role="presentation" onClick={onClose}>
      <div
        className="modalCard modalCard--mobileFriendly modalCard--userProfile"
        role="dialog"
        aria-labelledby="userProfileTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitle" id="userProfileTitle">
            {t("profile")}
          </div>
          <button type="button" className="iconCloseBtn" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="modalBody modalBody--userProfile">
          {loading ? <div className="muted userProfileLoading">{t("loading")}</div> : null}
          {err ? <div className="authError">{err}</div> : null}
          {user ? (
            <div className="userProfileCard">
              <div className="userProfileHero">
                <AvatarAura auraColor={user.auraColor}>
                  <div className="profileAvatar userProfileAvatar userProfileAvatar--xl">
                    {user.avatar ? <img src={user.avatar} alt="" /> : <span>{initials(user.username)}</span>}
                  </div>
                </AvatarAura>
                {user.isEarlyTester ? (
                  <span className="userProfileEarlyBadge">{t("earlyTesterBadge")}</span>
                ) : null}
              </div>

              <div className="userProfileNameBlock">
                <h2 className="userProfileDisplayName">{user.username}</h2>
                <div className="userProfileBadgesRow">
                  <UserTagBadge tag={user.tag} tagColor={user.tagColor} tagStyle={user.tagStyle} />
                  <ActivityBadge messageCount={user.messageCount} t={t} />
                </div>
              </div>

              <div className="userProfileSections">
                <div className="userProfileSection">
                  <div className="userProfileSectionLabel">{t("statusLabel")}</div>
                  <div className="userProfileSectionValue">{formatUserStatusLine(user, t, lang)}</div>
                </div>

                {String(user.about || "").trim() ? (
                  <div className="userProfileSection">
                    <div className="userProfileSectionLabel">{t("aboutLabel")}</div>
                    <div className="userProfileSectionValue userProfileAbout">
                      {String(user.about || "").trim()}
                    </div>
                  </div>
                ) : null}

                {memberSince ? (
                  <div className="userProfileSection userProfileSection--meta">
                    <div className="userProfileSectionLabel">{t("profileMemberSince")}</div>
                    <div className="userProfileSectionValue userProfileSectionValue--muted">{memberSince}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
