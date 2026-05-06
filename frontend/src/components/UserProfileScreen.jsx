import React, { useEffect, useMemo, useRef, useState } from "react";
import { getUserById } from "../api.js";
import AvatarAura from "./AvatarAura.jsx";
import ActivityBadge from "./ActivityBadge.jsx";
import UserTagBadge from "./UserTagBadge.jsx";
import { formatUserStatusLine } from "../userStatusLine.js";
import { localeForLang } from "../i18n.js";
import { isPremiumActive } from "../premium.js";
import { avatarRingWrapClass, usernameDisplayClass } from "../userPersonalization.js";
import { formatAtUserHandle } from "../userHandleDisplay.js";
import { IconPhone, IconSearch, IconSpeaker, IconEllipsis } from "./Icons.jsx";

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

/**
 * Telegram-like full-screen user profile.
 * - Opens from chat avatar (full height)
 * - Sticky top bar + hero header + action buttons row + info sections
 */
export default function UserProfileScreen({
  open,
  userId,
  t,
  lang = "en",
  onClose,
  onCall,
  onSearchInChat,
  isMuted = false,
  onToggleMute,
  onChangeWallpaper,
  onClearHistory,
  onBlock,
  onDeleteChat,
}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState("in"); // in | out
  const [moreOpen, setMoreOpen] = useState(false);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (open) {
      setPhase("in");
      return undefined;
    }
    if (!open) {
      setPhase("out");
      closeTimerRef.current = window.setTimeout(() => {
        // nothing else; parent will unmount by open=false
      }, 220);
    }
    return undefined;
  }, [open]);

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
        if (!cancelled) setErr(e?.message || t("errorGeneric"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId, t]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const premiumMode = isPremiumActive(user);
  const memberSince = user?.registrationDate ? formatMemberSince(user.registrationDate, lang) : "";
  const profileBg = String(user?.profileBackground || user?.profileBgUrl || user?.profile_bg_url || "").trim();
  const hasBgImage = Boolean(profileBg);

  const title = useMemo(() => {
    if (!user) return t("profile");
    return user.username || t("profile");
  }, [user, t]);

  if (!open) return null;

  const canCopy = Boolean(user?.userHandle || user?.username);
  const at = user?.userHandle ? formatAtUserHandle(user.userHandle) : "";

  return (
    <div
      className={`tgProfileScreen${phase === "out" ? " tgProfileScreen--out" : ""}${
        premiumMode ? " tgProfileScreen--premium" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={t("profile")}
    >
      <div className="tgProfileTopbar">
        <button type="button" className="tgProfileTopbarBtn" onClick={onClose} aria-label={t("back") ?? t("close")}>
          ←
        </button>
        <div className="tgProfileTopbarTitle" title={user?.username || t("profile")}>
          {user?.username || t("profile")}
        </div>
        <div className="tgProfileTopbarRight">
          <button
            type="button"
            className="tgProfileTopbarBtn"
            onClick={() => setMoreOpen(true)}
            aria-label={t("more")}
            title={t("more")}
          >
            <IconEllipsis size={18} />
          </button>
        </div>
      </div>

      <div className="tgProfileScroll">
        <div className={`tgProfileHero tgProfileHero--ios${hasBgImage ? " tgProfileHero--hasBg" : ""}${premiumMode ? " tgProfileHero--premium" : ""}`}>
          {premiumMode ? <div className="tgProfilePremiumGlow" aria-hidden /> : null}
          {hasBgImage ? (
            <div className="tgProfileBg" style={{ backgroundImage: `url(${profileBg})` }} aria-hidden />
          ) : null}
          <div className="tgProfileBgOverlay" aria-hidden />

          <div className="tgIosProfileHeader">
            <AvatarAura auraColor={user?.auraColor}>
              {(() => {
                const ringC = avatarRingWrapClass(premiumMode ? user?.avatarRing : "");
                const inner = (
                  <div className={`tgIosAvatar${premiumMode ? " tgIosAvatar--premium" : ""}`}>
                    {user?.avatar ? <img src={user.avatar} alt="" /> : <span>{initials(user?.username || "")}</span>}
                  </div>
                );
                return ringC ? <span className={ringC}>{inner}</span> : inner;
              })()}
            </AvatarAura>

            <div className="tgIosName">
              <span className={usernameDisplayClass(user) || undefined}>{user?.username || ""}</span>
              {user?.isPremium ? <span className="premiumBadge">💎</span> : null}
            </div>
            <div className="tgIosSubtitle">
              {at ? `${at} · ` : ""}
              {user ? formatUserStatusLine(user, t, lang) : ""}
            </div>
          </div>
        </div>

        <div className="tgIosActionsRow" role="group" aria-label={t("actions")}>
          <button type="button" className="tgIosAction" onClick={onCall} disabled={!user} aria-label={t("callAudio")} title={t("callAudio")}>
            <span className="tgIosActionIcon">
              <IconPhone size={18} />
            </span>
            <span className="tgIosActionLabel">{t("callAudio")}</span>
          </button>
          <button type="button" className="tgIosAction" onClick={onSearchInChat} aria-label={t("searchInChat")} title={t("searchInChat")}>
            <span className="tgIosActionIcon">
              <IconSearch size={18} />
            </span>
            <span className="tgIosActionLabel">{t("search")}</span>
          </button>
          <button
            type="button"
            className={`tgIosAction${isMuted ? " tgIosAction--on" : ""}`}
            onClick={onToggleMute}
            aria-label={isMuted ? t("unmuteChat") : t("muteChat")}
            title={isMuted ? t("unmuteChat") : t("muteChat")}
          >
            <span className="tgIosActionIcon">
              <IconSpeaker size={18} />
            </span>
            <span className="tgIosActionLabel">{isMuted ? t("unmute") : t("mute")}</span>
          </button>
          <button type="button" className="tgIosAction" onClick={() => setMoreOpen(true)} aria-label={t("more")} title={t("more")}>
            <span className="tgIosActionIcon">
              <IconEllipsis size={18} />
            </span>
            <span className="tgIosActionLabel">{t("more")}</span>
          </button>
        </div>

        <div className="tgProfileCard">
          {loading ? <div className="muted tgProfileLoading">{t("loading")}</div> : null}
          {err ? <div className="authError">{err}</div> : null}

          {user ? (
            <>
              <div className="tgProfileBadges">
                <UserTagBadge tag={user.tag} tagColor={user.tagColor} tagStyle={user.tagStyle} />
                <ActivityBadge messageCount={user.messageCount} t={t} />
              </div>

              {String(user.about || "").trim() ? (
                <div className="tgProfileSection">
                  <div className="tgProfileSectionLabel">{t("aboutLabel")}</div>
                  <div className="tgProfileSectionValue">{String(user.about || "").trim()}</div>
                </div>
              ) : null}

              <div className="tgProfileSection">
                <div className="tgProfileSectionLabel">{t("statusLabel")}</div>
                <div className="tgProfileSectionValue">{formatUserStatusLine(user, t, lang)}</div>
              </div>

              {memberSince ? (
                <div className="tgProfileSection tgProfileSection--meta">
                  <div className="tgProfileSectionLabel">{t("profileMemberSince")}</div>
                  <div className="tgProfileSectionValue muted">{memberSince}</div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {moreOpen ? (
        <div className="tgSheetBackdrop" role="presentation" onClick={() => setMoreOpen(false)}>
          <div className="tgSheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="tgSheetItem"
              onClick={() => {
                setMoreOpen(false);
                onChangeWallpaper?.();
              }}
            >
              {t("changeWallpaper")}
            </button>
            <button
              type="button"
              className="tgSheetItem"
              onClick={() => {
                setMoreOpen(false);
                onClearHistory?.();
              }}
            >
              {t("clearHistory")}
            </button>
            <button
              type="button"
              className="tgSheetItem tgSheetItem--danger"
              onClick={() => {
                setMoreOpen(false);
                onBlock?.();
              }}
            >
              {t("blockUser")}
            </button>
            <button
              type="button"
              className="tgSheetItem tgSheetItem--danger"
              onClick={() => {
                setMoreOpen(false);
                onDeleteChat?.();
              }}
            >
              {t("deleteChat")}
            </button>
            <button type="button" className="tgSheetCancel" onClick={() => setMoreOpen(false)}>
              {t("cancel") ?? "Cancel"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

