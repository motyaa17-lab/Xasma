import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  adminBroadcastOfficial,
  adminListFlaggedMessages,
  adminListMessageReports,
  adminListUsers,
  adminPatchUserTag,
  adminSetUserBanned,
  adminSetUserRole,
  activatePremium,
  adminGrantPremium,
  adminRemovePremium,
} from "../api.js";
import { compressImageFileToJpegDataUrl } from "../chatBackgroundImage.js";
import { currentLanguageLabel, localeForLang } from "../i18n.js";
import { DONATION_ALERTS_URL } from "../config/donation.js";
import { DEFAULT_AURA_COLOR } from "../avatarAura.js";
import { USER_STATUS_TEXT_MAX } from "../userStatusLine.js";
import AvatarAura from "./AvatarAura.jsx";
import ActivityBadge from "./ActivityBadge.jsx";
import UserTagBadge from "./UserTagBadge.jsx";
import { isPremiumActive } from "../premium.js";
import {
  TAG_COLOR_PRESETS,
  USERNAME_STYLE_PRESETS,
  AVATAR_RING_PRESETS,
  avatarRingWrapClass,
  usernameStyleClass,
} from "../userPersonalization.js";
import { formatAtUserHandle } from "../userHandleDisplay.js";
import { Capacitor } from "@capacitor/core";
import {
  getNativeAndroidPostNotificationDisplay,
  openAndroidNotificationSettings,
  requestAndroidPostNotifications,
} from "../notifyPermissions.js";

function formatShortDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}.${mm}.${yy}`;
}

async function fileToJpegDataUrl(file, t, { maxSizeBytes } = {}) {
  if (!file) throw new Error(t("fileMissing"));
  if (!String(file.type || "").startsWith("image/")) throw new Error(t("fileNotImage"));
  if (maxSizeBytes && Number(file.size || 0) > Number(maxSizeBytes)) throw new Error(t("fileTooLarge"));
  // Reuse existing compression helper (keeps payload small enough for DB/HTTP).
  return compressImageFileToJpegDataUrl(file);
}

function ProfilePersonalizationFields({
  t,
  me,
  profileUserTag,
  setProfileUserTag,
  profileTagColor,
  setProfileTagColor,
  profileTagStyle,
  setProfileTagStyle,
  profileUsernameStyle,
  setProfileUsernameStyle,
  profileAvatarRing,
  setProfileAvatarRing,
}) {
  const prem = isPremiumActive(me);
  const normalizedPreview = String(profileUserTag || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  const showPreview = normalizedPreview.length >= 2;

  return (
    <div className="settingsSection settingsSection--padded profilePersonalizationSection">
      <div className="settingsTitle">{t("profileUserTagLabel")}</div>
      <input
        className="searchInput"
        value={profileUserTag}
        onChange={(e) =>
          setProfileUserTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
        }
        placeholder="TAG"
        maxLength={4}
        aria-label={t("profileUserTagLabel")}
      />
      <p className="muted small">{t("profileUserTagHint")}</p>
      {showPreview ? (
        <div className="profileTagPreviewRow">
          <span className="muted small">{t("profileTagPreviewLabel")}</span>
          <UserTagBadge
            tag={normalizedPreview}
            tagColor={prem ? profileTagColor : "#64748b"}
            tagStyle={prem ? profileTagStyle : "solid"}
          />
        </div>
      ) : null}
      {prem ? (
        <>
          <div className="settingsTitle">{t("profileTagColorLabel")}</div>
          <div className="personalizationPresetRow" role="list">
            {TAG_COLOR_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`personalizationColorSwatch${
                  profileTagColor === p.id ? " personalizationColorSwatch--active" : ""
                }`}
                style={{ background: p.id }}
                title={p.label}
                aria-label={p.label}
                onClick={() => setProfileTagColor(p.id)}
              />
            ))}
          </div>
          <div className="settingsTitle">{t("profileTagStyleLabel")}</div>
          <div className="pillRow">
            <button
              type="button"
              className={profileTagStyle === "solid" ? "pillBtn active" : "pillBtn"}
              onClick={() => setProfileTagStyle("solid")}
            >
              {t("userTagSolid")}
            </button>
            <button
              type="button"
              className={profileTagStyle === "gradient" ? "pillBtn active" : "pillBtn"}
              onClick={() => setProfileTagStyle("gradient")}
            >
              {t("userTagGradient")}
            </button>
          </div>
          <div className="settingsTitle">{t("profileUsernameStyleLabel")}</div>
          <div className="personalizationNameStyleRow">
            {USERNAME_STYLE_PRESETS.map((p) => (
              <button
                key={p.id || "default"}
                type="button"
                className={profileUsernameStyle === p.id ? "pillBtn active" : "pillBtn"}
                onClick={() => setProfileUsernameStyle(p.id)}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
          <div className="settingsTitle">{t("profileAvatarRingLabel")}</div>
          <div className="personalizationNameStyleRow">
            {AVATAR_RING_PRESETS.map((p) => (
              <button
                key={p.id || "none"}
                type="button"
                className={profileAvatarRing === p.id ? "pillBtn active" : "pillBtn"}
                onClick={() => setProfileAvatarRing(p.id)}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted small">{t("profilePersonalizationPremiumHint")}</p>
      )}
    </div>
  );
}

function AdminUserTagEditor({ user, onUpdate, t }) {
  const [tag, setTag] = useState(user.tag || "");
  const [tagColor, setTagColor] = useState(user.tagColor || "#38bdf8");
  const [tagStyle, setTagStyle] = useState(user.tagStyle === "gradient" ? "gradient" : "solid");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTag(user.tag || "");
    setTagColor(user.tagColor || "#38bdf8");
    setTagStyle(user.tagStyle === "gradient" ? "gradient" : "solid");
  }, [user.id, user.tag, user.tagColor, user.tagStyle]);

  async function save() {
    setBusy(true);
    try {
      const res = await adminPatchUserTag(user.id, { tag, tagColor, tagStyle });
      onUpdate?.(res.user);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adminUserTagRow">
      <input
        type="text"
        className="adminTagInput"
        placeholder={t("userTagLabel")}
        aria-label={t("userTagLabel")}
        value={tag}
        onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        maxLength={4}
      />
      <div className="personalizationPresetRow adminTagPresetRow" role="list">
        {TAG_COLOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`personalizationColorSwatch personalizationColorSwatch--sm${
              tagColor === p.id ? " personalizationColorSwatch--active" : ""
            }`}
            style={{ background: p.id }}
            title={p.label}
            aria-label={p.label}
            onClick={() => setTagColor(p.id)}
          />
        ))}
      </div>
      <div className="adminTagStyleToggle" role="group">
        <button
          type="button"
          className={tagStyle === "solid" ? "adminTagStyleBtn adminTagStyleBtn--on" : "adminTagStyleBtn"}
          onClick={() => setTagStyle("solid")}
        >
          {t("userTagSolid")}
        </button>
        <button
          type="button"
          className={tagStyle === "gradient" ? "adminTagStyleBtn adminTagStyleBtn--on" : "adminTagStyleBtn"}
          onClick={() => setTagStyle("gradient")}
        >
          {t("userTagGradient")}
        </button>
      </div>
      <button type="button" className="adminTagSaveBtn" onClick={save} disabled={busy}>
        {t("save")}
      </button>
    </div>
  );
}

function openDonationPage() {
  if (typeof window === "undefined") return;
  window.open(DONATION_ALERTS_URL, "_blank", "noopener,noreferrer");
}

function chatThemeLabel(t, id) {
  const key =
    {
      darkGradient: "themeDarkGradient",
      softBlur: "themeSoftBlur",
      night: "themeNight",
      dark: "themeDarkGradient",
      glass: "themeSoftBlur",
      noise: "themeDarkGradient",
    }[id] || "themeDarkGradient";
  return t(key);
}

function chatBackgroundDisplayLabel(t, settings) {
  if (settings?.chatBackgroundImageUrl) return t("chatBackgroundCustomActive");
  return chatThemeLabel(t, settings?.chatTheme || "darkGradient");
}

function AdminMessageReportsSection({ t, items, loading, onRefresh }) {
  return (
    <div className="adminMessageReportsBox">
      <div className="adminFlaggedHeader">
        <div className="settingsTitle">{t("adminMessageReportsTitle")}</div>
        <button type="button" className="ghostBtn" onClick={onRefresh} disabled={loading}>
          {t("adminFlaggedRefresh")}
        </button>
      </div>
      <p className="muted small adminFlaggedHint">{t("adminMessageReportsHint")}</p>
      {loading ? (
        <div className="muted">{t("adminFlaggedLoading")}</div>
      ) : !items.length ? (
        <div className="muted">{t("adminMessageReportsEmpty")}</div>
      ) : (
        <div className="adminFlaggedList">
          {items.map((r) => (
            <div key={r.id} className="adminFlaggedRow adminReportRow">
              <div className="adminFlaggedMeta muted small">
                <span className="adminFlaggedUser">{r.reporterUsername}</span>
                <span> · </span>
                <span>{r.chatLabel}</span>
                <span> · </span>
                <span className="adminReportReason">{r.reason}</span>
                {r.createdAt ? (
                  <>
                    <span> · </span>
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                  </>
                ) : null}
              </div>
              <div className="adminFlaggedMeta muted small">
                {t("messageFrom")}: <span className="adminFlaggedUser">{r.senderUsername}</span>
              </div>
              <div className="adminFlaggedText">{r.messageText}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminFlaggedSection({ t, items, loading, onRefresh }) {
  return (
    <div className="adminFlaggedBox">
      <div className="adminFlaggedHeader">
        <div className="settingsTitle">{t("adminFlaggedTitle")}</div>
        <button type="button" className="ghostBtn" onClick={onRefresh} disabled={loading}>
          {t("adminFlaggedRefresh")}
        </button>
      </div>
      <p className="muted small adminFlaggedHint">{t("adminFlaggedHint")}</p>
      {loading ? (
        <div className="muted">{t("adminFlaggedLoading")}</div>
      ) : !items.length ? (
        <div className="muted">{t("adminFlaggedEmpty")}</div>
      ) : (
        <div className="adminFlaggedList">
          {items.map((m) => (
            <div key={m.id} className="adminFlaggedRow">
              <div className="adminFlaggedMeta muted small">
                <span className="adminFlaggedUser">{m.senderUsername}</span>
                <span> · </span>
                <span>{m.chatLabel}</span>
                {m.flaggedAt ? (
                  <>
                    <span> · </span>
                    <span>{new Date(m.flaggedAt).toLocaleString()}</span>
                  </>
                ) : null}
              </div>
              <div className="adminFlaggedReason">
                <span className="adminFlaggedReasonLabel">{t("adminFlaggedReason")}:</span> {m.flaggedReason}
              </div>
              <div className="adminFlaggedText">{m.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminOfficialBroadcast({ t, text, setText, busy, onSend }) {
  return (
    <div className="adminBroadcastBox">
      <div className="settingsTitle">{t("adminBroadcastTitle")}</div>
      <p className="muted small adminBroadcastHint">{t("adminBroadcastHint")}</p>
      <textarea
        className="adminBroadcastTextarea"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("adminBroadcastPlaceholder")}
        maxLength={4000}
      />
      <button
        type="button"
        className="primaryBtn adminBroadcastSubmit"
        disabled={busy || !String(text || "").trim()}
        onClick={onSend}
      >
        {busy ? t("adminBroadcastSending") : t("adminBroadcastSend")}
      </button>
    </div>
  );
}

function MessageNotificationsSettings({ settings, onChangeSettings, t }) {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const perm = supported ? Notification.permission : "unsupported";
  const prefOn = Boolean(settings?.messageNotificationsEnabled);
  const isAndroid = Capacitor.getPlatform() === "android";
  const [nativeDisplay, setNativeDisplay] = useState("unsupported");
  const [working, setWorking] = useState(false);

  const refreshNative = useCallback(async () => {
    const d = await getNativeAndroidPostNotificationDisplay();
    setNativeDisplay(typeof d === "string" ? d : "unsupported");
  }, []);

  useEffect(() => {
    void refreshNative();
  }, [refreshNative]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshNative();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshNative]);

  // On Android, only "granted" counts; never treat "unsupported" as OK (avoids fake-enabled if bridge fails).
  const nativeOk = nativeDisplay === "granted" || (!isAndroid && nativeDisplay === "unsupported");
  const deliveryOn = prefOn && supported && perm === "granted" && nativeOk;

  const pillLabel = deliveryOn
    ? t("notifyDisableButton")
    : perm === "denied" && !isAndroid
      ? t("notifyBlockedButton")
      : isAndroid && nativeDisplay === "denied"
        ? t("notifyBlockedInSystem")
        : t("notifyEnableButton");

  async function onToggle() {
    if (!supported || working) return;
    setWorking(true);
    try {
      if (deliveryOn) {
        onChangeSettings?.({ messageNotificationsEnabled: false });
        return;
      }
      if (isAndroid && nativeDisplay === "denied") {
        await openAndroidNotificationSettings();
        await refreshNative();
        return;
      }
      if (perm === "denied") {
        if (isAndroid) await openAndroidNotificationSettings();
        return;
      }

      await requestAndroidPostNotifications();
      await refreshNative();
      let nd = await getNativeAndroidPostNotificationDisplay();
      if (isAndroid && (nd === "denied" || nd === "prompt")) {
        return;
      }

      let nextPerm = perm;
      if (nextPerm === "default") {
        nextPerm = await Notification.requestPermission();
      }
      if (nextPerm === "granted" && (!isAndroid || nd === "granted" || nd === "unsupported")) {
        onChangeSettings?.({ messageNotificationsEnabled: true });
      }
    } finally {
      setWorking(false);
    }
  }

  const mismatch = prefOn && !deliveryOn;
  const blockedLabel =
    perm === "denied"
      ? isAndroid
        ? t("notifyDeniedInAndroid")
        : t("notifyDeniedInBrowser")
      : isAndroid && nativeDisplay === "denied"
        ? t("notifyDeniedInAndroid")
        : null;

  return (
    <div className="settingsSection">
      <div className="settingsTitle">{t("notifySettingsTitle")}</div>
      {!supported ? (
        <p className="muted small">{t("notifyUnsupported")}</p>
      ) : (
        <>
          <div className="settingsNotifyRow">
            <span className="settingsNotifyLabel">{t("notifyEnableLabel")}</span>
            <button
              type="button"
              className={deliveryOn ? "pillBtn active" : "pillBtn"}
              onClick={onToggle}
              disabled={working || (perm === "denied" && !isAndroid)}
              aria-pressed={deliveryOn}
            >
              {pillLabel}
            </button>
          </div>
          <p className="muted small settingsNotifyHint">{t("notifyEnableHint")}</p>
          {isAndroid ? (
            <p className="muted small settingsNotifyHint">{t("notifyAndroidHint")}</p>
          ) : null}
          {blockedLabel ? <p className="muted small settingsNotifyWarn">{blockedLabel}</p> : null}
          {mismatch ? (
            <p className="muted small settingsNotifyWarn">{t("notifyMismatchOsOff")}</p>
          ) : null}
          {isAndroid && (nativeDisplay === "denied" || perm === "denied" || mismatch) ? (
            <button
              type="button"
              className="pillBtn settingsNotifyOpenOs"
              onClick={() => void openAndroidNotificationSettings()}
            >
              {t("notifyOpenSystemSettings")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

const UserMenu = forwardRef(function UserMenu(
  {
    me,
    onLogout,
    onChangeAvatar,
    onChangeProfile,
    onChangeEmail,
    settings,
    onChangeSettings,
    t,
    variant = "dropdown",
    /** When true, no built-in menu button; parent renders trigger and calls ref.toggleDropdown(). */
    hideDropdownTrigger = false,
    /** When using an external trigger, same DOM subtree as button (for outside-click + dropdown anchor). */
    menuClusterRef = null,
    /** Fires when dropdown open state changes (for external trigger aria-expanded). */
    onDropdownOpenChange,
  },
  ref
) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(null); // "profile" | "settings" | "admin" | null
  const rootRef = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      toggleDropdown: () => setOpen((v) => !v),
      openDropdown: () => setOpen(true),
      closeDropdown: () => setOpen(false),
    }),
    []
  );

  useEffect(() => {
    onDropdownOpenChange?.(open);
  }, [open, onDropdownOpenChange]);
  const fileInputRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [profileStatusKind, setProfileStatusKind] = useState("");
  const [profileStatusText, setProfileStatusText] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profileAuraColor, setProfileAuraColor] = useState(DEFAULT_AURA_COLOR);
  const [profileEmail, setProfileEmail] = useState("");
  const [profileEmailSaving, setProfileEmailSaving] = useState(false);
  const [profileEmailError, setProfileEmailError] = useState("");
  const [profileUserTag, setProfileUserTag] = useState("");
  const [profileTagColor, setProfileTagColor] = useState("#64748b");
  const [profileTagStyle, setProfileTagStyle] = useState("solid");
  const [profileUsernameStyle, setProfileUsernameStyle] = useState("");
  const [profileAvatarRing, setProfileAvatarRing] = useState("");
  const [profileBgPreview, setProfileBgPreview] = useState("");
  const [profileBgBusy, setProfileBgBusy] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [premiumBusy, setPremiumBusy] = useState(false);
  const [premiumNotice, setPremiumNotice] = useState("");
  const chatBgFileInputRef = useRef(null);
  const [chatBgError, setChatBgError] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminPremDaysById, setAdminPremDaysById] = useState({});
  const [adminPremTypeById, setAdminPremTypeById] = useState({});
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [adminBroadcastText, setAdminBroadcastText] = useState("");
  const [adminBroadcastBusy, setAdminBroadcastBusy] = useState(false);
  const [adminFlagged, setAdminFlagged] = useState([]);
  const [adminFlaggedLoading, setAdminFlaggedLoading] = useState(false);
  const [adminReports, setAdminReports] = useState([]);
  const [adminReportsLoading, setAdminReportsLoading] = useState(false);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!open) return;
      const boundary = menuClusterRef?.current || rootRef.current;
      if (!boundary) return;
      if (!boundary.contains(e.target)) setOpen(false);
    }

    function onKeyDown(e) {
      if (!open && !panel) return;
      if (e.key === "Escape") {
        setOpen(false);
        setPanel(null);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, panel, menuClusterRef]);

  useEffect(() => {
    if (panel !== "profile") return;
    setAvatarPreview(me?.avatar || "");
    setAvatarError("");
  }, [panel, me?.avatar]);

  useEffect(() => {
    if (panel !== "profile") return;
    setProfileStatusKind(String(me?.statusKind || ""));
    setProfileStatusText(String(me?.statusText || ""));
    setProfileAbout(String(me?.about || ""));
    setProfileAuraColor(String(me?.auraColor || "").trim() || DEFAULT_AURA_COLOR);
    setProfileEmail(String(me?.email || ""));
    setProfileEmailError("");
    setProfileUserTag(me?.tag ? String(me.tag) : "");
    setProfileTagColor(String(me?.tagColor || "#64748b"));
    setProfileTagStyle(me?.tagStyle === "gradient" ? "gradient" : "solid");
    setProfileUsernameStyle(String(me?.usernameStyle || ""));
    setProfileAvatarRing(String(me?.avatarRing || ""));
    setProfileBgPreview(String(me?.profileBackground || ""));
    setProfileSaveError("");
  }, [
    panel,
    me?.statusKind,
    me?.statusText,
    me?.about,
    me?.auraColor,
    me?.email,
    me?.profileBackground,
    me?.tag,
    me?.tagColor,
    me?.tagStyle,
    me?.usernameStyle,
    me?.avatarRing,
  ]);

  async function saveEmail() {
    if (!onChangeEmail) return;
    const email = String(profileEmail || "").trim();
    if (!email) return;
    setProfileEmailSaving(true);
    setProfileEmailError("");
    try {
      await onChangeEmail(email);
    } catch (e) {
      setProfileEmailError(e.message || t("errorGeneric"));
    } finally {
      setProfileEmailSaving(false);
    }
  }

  async function saveProfile() {
    if (!onChangeProfile) return;
    setProfileSaving(true);
    setProfileSaveError("");
    try {
      await onChangeProfile({
        statusKind: profileStatusKind,
        statusText:
          profileStatusKind === "custom"
            ? String(profileStatusText || "").trim().slice(0, USER_STATUS_TEXT_MAX)
            : "",
        about: profileAbout,
        auraColor: profileAuraColor,
        userTag: profileUserTag.trim(),
        tagColor: profileTagColor,
        tagStyle: profileTagStyle,
        usernameStyle: profileUsernameStyle,
        avatarRing: profileAvatarRing,
        // Allow clearing profile background (empty string) by sending it explicitly.
        ...(me?.isPremium ? { profileBackground: String(profileBgPreview || "") } : {}),
      });
    } catch (e) {
      setProfileSaveError(e.message || t("errorGeneric"));
    } finally {
      setProfileSaving(false);
    }
  }

  const profileBgInputRef = useRef(null);

  const pickProfileBackground = useCallback(
    async (file) => {
      if (!file) return;
      setProfileBgBusy(true);
      setProfileSaveError("");
      try {
        const dataUrl = await fileToJpegDataUrl(file, t, { maxSizeBytes: 6_000_000 });
        setProfileBgPreview(dataUrl);
      } catch (e) {
        setProfileSaveError(e.message || t("errorGeneric"));
      } finally {
        setProfileBgBusy(false);
      }
    },
    [t]
  );

  async function loadAdminUsers() {
    setAdminLoading(true);
    setAdminError("");
    setAdminNotice("");
    try {
      const data = await adminListUsers();
      setAdminUsers(Array.isArray(data.users) ? data.users : []);
      setAdminPremDaysById({});
      setAdminPremTypeById({});
    } catch (e) {
      setAdminError(e.message || t("adminRequestFailed"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function loadAdminFlagged() {
    setAdminFlaggedLoading(true);
    try {
      const data = await adminListFlaggedMessages();
      setAdminFlagged(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setAdminError(e.message || t("adminRequestFailed"));
    } finally {
      setAdminFlaggedLoading(false);
    }
  }

  async function loadAdminReports() {
    setAdminReportsLoading(true);
    try {
      const data = await adminListMessageReports();
      setAdminReports(Array.isArray(data.reports) ? data.reports : []);
    } catch (e) {
      setAdminError(e.message || t("adminRequestFailed"));
    } finally {
      setAdminReportsLoading(false);
    }
  }

  async function sendOfficialBroadcast() {
    const body = String(adminBroadcastText || "").trim();
    if (!body) return;
    setAdminError("");
    setAdminNotice("");
    setAdminBroadcastBusy(true);
    try {
      const res = await adminBroadcastOfficial(body);
      const n = Number(res.messageCount) || 0;
      setAdminNotice(t("adminBroadcastSent").replace("{n}", String(n)));
      setAdminBroadcastText("");
    } catch (e) {
      setAdminError(e.message || t("adminBroadcastFail"));
    } finally {
      setAdminBroadcastBusy(false);
    }
  }

  async function pickAvatarFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) return;
    if (file.size > 3 * 1024 * 1024) return; // keep it small for localStorage

    setAvatarError("");
    setAvatarBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarPreview(dataUrl);
      await onChangeAvatar?.(dataUrl);
    } catch (e) {
      setAvatarError(e.message === "fileRead" ? t("fileReadFailed") : e.message || t("avatarUpdateFailed"));
    } finally {
      setAvatarBusy(false);
    }
  }

  const pickChatBackgroundFile = useCallback(
    async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      if (!f.type.startsWith("image/")) {
        setChatBgError(t("chatBackgroundImageError"));
        return;
      }
      setChatBgError("");
      try {
        const dataUrl = await compressImageFileToJpegDataUrl(f);
        onChangeSettings?.({ chatBackgroundImageUrl: dataUrl });
      } catch {
        setChatBgError(t("chatBackgroundImageError"));
      }
    },
    [onChangeSettings, t]
  );

  const modalCardClass = variant === "mobilePage" ? "modalCard--mobileFriendly" : "";

  if (variant === "mobilePage") {
    const chevron = "›";
    const [settingsSearch, setSettingsSearch] = useState("");

    const statusLine = (() => {
      if (!me) return "";
      const kind = String(me.statusKind || "");
      const text = String(me.statusText || "").trim();
      if (kind === "online") return t("statusOnline");
      if (kind === "dnd") return t("statusDnd");
      if (kind === "away") return t("statusAway");
      if (kind === "custom" && text) return text;
      if (me?.isOnline) return t("online");
      if (me?.lastSeenAt) return t("lastSeenAt").replace("{time}", formatLastSeen(me.lastSeenAt, settings?.lang));
      return t("lastSeen");
    })();

    function SettingsRow({ label, right, icon, danger, onClick, disabled }) {
      return (
        <button
          type="button"
          className={danger ? "settingsRow settingsRow--danger" : "settingsRow"}
          onClick={onClick}
          disabled={disabled}
        >
          <span className="settingsRowLeft">
            {icon ? <span className="tgSettingsIconWrap">{icon}</span> : null}
            <span className="settingsRowLabel">{label}</span>
          </span>
          <span className="settingsRowRight">
            {right ? <span className="settingsRowValue">{right}</span> : null}
            <span className="settingsRowChevron" aria-hidden>
              {chevron}
            </span>
          </span>
        </button>
      );
    }

    function SettingsChoiceRow({ label, selected, onClick }) {
      return (
        <button type="button" className="settingsRow" onClick={onClick}>
          <span className="settingsRowLeft">
            <span className="settingsRowLabel">{label}</span>
          </span>
          <span className="settingsRowRight">
            {selected ? <span className="settingsRowCheck" aria-hidden>✓</span> : <span className="settingsRowSpacer" />}
          </span>
        </button>
      );
    }

    function openPath(p) {
      try {
        window.history.pushState({}, "", p);
        window.dispatchEvent(new PopStateEvent("popstate"));
        setPanel(null);
      } catch {
        window.location.href = p;
      }
    }

    const q = String(settingsSearch || "").trim().toLowerCase();
    const showAll = !q;
    const match = (s) => String(s || "").toLowerCase().includes(q);

    return (
      <div className="settingsScreen settingsScreen--mobile" ref={rootRef}>
        <button type="button" className="settingsTopProfile" onClick={() => setPanel("profile")}>
          <span className="settingsTopAvatar">
            <span className={isPremiumActive(me) ? "avatarPremium" : undefined}>
              {me?.avatar ? <img src={me.avatar} alt="" /> : <span>{initials(me?.username)}</span>}
            </span>
          </span>
          <span className="settingsTopMain">
            <span className="settingsTopName">
              <span className={isPremiumActive(me) ? "premiumName" : undefined}>
                {me?.username}
                {isPremiumActive(me) ? <span className="premiumBadge">💎</span> : null}
              </span>
              <ActivityBadge messageCount={me?.messageCount} t={t} />
            </span>
            <span className="settingsTopStatus">{statusLine}</span>
          </span>
          <span className="settingsTopChevron" aria-hidden>
            {chevron}
          </span>
        </button>

        <div className="settingsList">
          <div className="tgSettingsSearchWrap">
            <input
              className="tgSettingsSearchInput"
              value={settingsSearch}
              onChange={(e) => setSettingsSearch(e.target.value)}
              placeholder={t("settingsSearchPlaceholder") ?? "Search Settings and FAQ"}
              aria-label={t("settingsSearchPlaceholder") ?? "Search Settings and FAQ"}
            />
          </div>

          {(showAll || match(t("editProfileTitle") ?? "Edit Profile") || match(t("myProfile"))) ? (
            <div className="settingsSection">
              <SettingsRow
                label={t("editProfileTitle") ?? "Edit Profile"}
                icon={<span className="tgSettingsIcon tgSettingsIcon--blue" aria-hidden>👤</span>}
                onClick={() => setPanel("profile")}
              />
            </div>
          ) : null}

          <div className="settingsSection">
            {(showAll || match(t("appearanceTitle") ?? "Appearance") || match(t("chatBackground"))) ? (
              <SettingsRow
                label={t("appearanceTitle") ?? "Appearance"}
                right={chatBackgroundDisplayLabel(t, settings)}
                icon={<span className="tgSettingsIcon tgSettingsIcon--purple" aria-hidden>🎨</span>}
                onClick={() => setPanel("chatBackground")}
              />
            ) : null}

            {(showAll || match(t("privacyAndSecurityTitle") ?? "Privacy and Security")) ? (
              <SettingsRow
                label={t("privacyAndSecurityTitle") ?? "Privacy and Security"}
                icon={<span className="tgSettingsIcon tgSettingsIcon--red" aria-hidden>🔒</span>}
                onClick={() => setPanel("privacySecurity")}
              />
            ) : null}

            {(showAll || match(t("notifySettingsTitle")) || match(t("notificationsAndSoundsTitle") ?? "Notifications and Sounds")) ? (
              <SettingsRow
                label={t("notificationsAndSoundsTitle") ?? "Notifications and Sounds"}
                right={settings?.messageNotificationsEnabled ? (t("on") ?? "On") : (t("off") ?? "Off")}
                icon={<span className="tgSettingsIcon tgSettingsIcon--red" aria-hidden>🔔</span>}
                onClick={() => setPanel("notifications")}
              />
            ) : null}

            {(showAll || match(t("dataAndStorageTitle") ?? "Data and Storage")) ? (
              <SettingsRow
                label={t("dataAndStorageTitle") ?? "Data and Storage"}
                icon={<span className="tgSettingsIcon tgSettingsIcon--blue" aria-hidden>💾</span>}
                onClick={() => setPanel("dataStorage")}
              />
            ) : null}

            {(showAll || match(t("powerSavingTitle") ?? "Power Saving")) ? (
              <SettingsRow
                label={t("powerSavingTitle") ?? "Power Saving"}
                right={settings?.powerSavingEnabled ? (t("on") ?? "On") : (t("off") ?? "Off")}
                icon={<span className="tgSettingsIcon tgSettingsIcon--purple" aria-hidden>🔋</span>}
                onClick={() => setPanel("powerSaving")}
              />
            ) : null}

            {(showAll || match(t("devicesTitle") ?? "Devices")) ? (
              <SettingsRow
                label={t("devicesTitle") ?? "Devices"}
                icon={<span className="tgSettingsIcon tgSettingsIcon--blue" aria-hidden>💻</span>}
                onClick={() => setPanel("devices")}
              />
            ) : null}

            {(showAll || match(t("language")) || match(t("languageTitle") ?? "Language")) ? (
              <SettingsRow
                label={t("languageTitle") ?? t("language")}
                right={currentLanguageLabel(settings?.lang, t)}
                icon={<span className="tgSettingsIcon tgSettingsIcon--purple" aria-hidden>🌐</span>}
                onClick={() => setPanel("language")}
              />
            ) : null}

            {(showAll || match(t("advancedTitle") ?? "Advanced")) ? (
              <SettingsRow
                label={t("advancedTitle") ?? "Advanced"}
                icon={<span className="tgSettingsIcon tgSettingsIcon--blue" aria-hidden>⚙️</span>}
                onClick={() => setPanel("advanced")}
              />
            ) : null}
          </div>

          <div className="settingsSectionHeader">{t("inviteFriendsTitle")}</div>
          <div className="settingsSection settingsSection--padded">
            {me?.referralCode ? (
              (() => {
                const link =
                  typeof window !== "undefined"
                    ? `${window.location.origin}/invite/${String(me.referralCode)}`
                    : `/invite/${String(me.referralCode)}`;
                const count = Math.max(0, Number(me?.referralsCount) || 0);
                return (
                  <>
                    <div className="settingsTitle">{t("inviteFriendsCount").replace("{count}", String(count))}</div>
                    <div className="inviteLinkRow">
                      <div className="inviteLinkText" title={link}>
                        {link}
                      </div>
                      <button
                        type="button"
                        className="ghostBtn"
                        onClick={async () => {
                          try {
                            await navigator.clipboard?.writeText?.(link);
                            setInviteCopied(true);
                            window.setTimeout(() => setInviteCopied(false), 1200);
                          } catch {
                            try {
                              const el = document.createElement("textarea");
                              el.value = link;
                              el.style.position = "fixed";
                              el.style.left = "-9999px";
                              document.body.appendChild(el);
                              el.focus();
                              el.select();
                              document.execCommand("copy");
                              document.body.removeChild(el);
                              setInviteCopied(true);
                              window.setTimeout(() => setInviteCopied(false), 1200);
                            } catch {
                              // ignore
                            }
                          }
                        }}
                      >
                        {inviteCopied ? t("inviteFriendsCopied") : t("inviteFriendsCopy")}
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="muted small">{t("errorGeneric")}</div>
            )}
          </div>

          <div className="settingsSectionHeader">{t("premiumTitleShort")}</div>
          <div className="settingsSection">
            <SettingsRow
              label={t("premiumButton")}
              right={me?.isPremium ? t("premiumActive") : t("premiumInactive")}
              onClick={() => {
                setPremiumNotice("");
                setPanel("premium");
              }}
            />
          </div>

          {me?.role === "admin" ? (
            <>
              <div className="settingsSectionHeader">{t("adminPanelTitle")}</div>
              <div className="settingsSection">
                <SettingsRow
                  label={t("adminPanelTitle")}
                  onClick={() => {
                    setPanel("admin");
                    loadAdminUsers();
                    loadAdminFlagged();
                    loadAdminReports();
                  }}
                />
              </div>
            </>
          ) : null}

          <div className="settingsSectionHeader">{t("settingsSupport")}</div>
          <div className="settingsSection">
            {(showAll || match(t("askAQuestionTitle") ?? "Ask a Question") || match(t("settingsSupportAuthors"))) ? (
              <SettingsRow
                label={t("askAQuestionTitle") ?? "Ask a Question"}
                icon={<span className="tgSettingsIcon tgSettingsIcon--blue" aria-hidden>❓</span>}
                onClick={() => setPanel("support")}
              />
            ) : null}
            {(showAll || match(t("telegramFaqTitle") ?? "Telegram FAQ")) ? (
              <SettingsRow
                label={t("telegramFaqTitle") ?? "Telegram FAQ"}
                icon={<span className="tgSettingsIcon tgSettingsIcon--purple" aria-hidden>📖</span>}
                onClick={() => {
                  try {
                    window.open("https://telegram.org/faq", "_blank", "noopener,noreferrer");
                  } catch {
                    // ignore
                  }
                }}
              />
            ) : null}
          </div>

          <div className="settingsSection">
            {(showAll || match(t("privacyPolicyTitle")) || match(t("privacyPolicyShort") ?? "Privacy Policy")) ? (
              <SettingsRow
                label={t("privacyPolicyShort") ?? t("privacyPolicyTitle")}
                icon={<span className="tgSettingsIcon tgSettingsIcon--blue" aria-hidden>🛡️</span>}
                onClick={() => openPath("/privacy")}
              />
            ) : null}
            {(showAll || match(t("aboutAppTitle")) || match(t("aboutTitleShort") ?? "About")) ? (
              <SettingsRow
                label={t("aboutTitleShort") ?? t("aboutAppTitle")}
                icon={<span className="tgSettingsIcon tgSettingsIcon--purple" aria-hidden>ℹ️</span>}
                onClick={() => setPanel("aboutApp")}
              />
            ) : null}
          </div>

          <div className="settingsSection">
            {(showAll || match(t("logout"))) ? (
              <SettingsRow label={t("logout")} danger icon={<span className="tgSettingsIcon tgSettingsIcon--red" aria-hidden>⎋</span>} onClick={onLogout} />
            ) : null}
          </div>
        </div>

        {panel ? (
          <Modal
            title={
              panel === "profile"
                ? t("myProfile")
                : panel === "language"
                  ? t("language")
                  : panel === "notifications"
                    ? t("notifySettingsTitle")
                    : panel === "chatBackground"
                      ? t("chatBackground")
                      : panel === "privacySecurity"
                        ? (t("privacyAndSecurityTitle") ?? "Privacy and Security")
                        : panel === "dataStorage"
                          ? (t("dataAndStorageTitle") ?? "Data and Storage")
                          : panel === "powerSaving"
                            ? (t("powerSavingTitle") ?? "Power Saving")
                            : panel === "devices"
                              ? (t("devicesTitle") ?? "Devices")
                              : panel === "advanced"
                                ? (t("advancedTitle") ?? "Advanced")
                      : panel === "premium"
                        ? t("premiumTitle")
                      : panel === "support"
                        ? t("settingsSupportAuthors")
                        : t("adminPanelTitle")
            }
            onClose={() => setPanel(null)}
            t={t}
            cardClassName={modalCardClass}
            usePortal
          >
            {panel === "profile" ? (
              <div className="settingsModalList">
                {avatarError ? <div className="authError">{avatarError}</div> : null}
                {profileEmailError ? <div className="authError">{profileEmailError}</div> : null}
                <div className="settingsProfileHeader">
                  <AvatarAura auraColor={profileAuraColor}>
                    {(() => {
                      const ringC = avatarRingWrapClass(isPremiumActive(me) ? profileAvatarRing : "");
                      const inner = (
                        <div className="settingsProfileAvatar">
                          {avatarPreview || me?.avatar ? (
                            <img src={avatarPreview || me.avatar} alt="" />
                          ) : (
                            <span>{initials(me?.username)}</span>
                          )}
                        </div>
                      );
                      return ringC ? <span className={ringC}>{inner}</span> : inner;
                    })()}
                  </AvatarAura>
                  <div className="settingsProfileMain">
                    <div
                      className={`settingsProfileName ${
                        usernameStyleClass(profileUsernameStyle) ||
                        (isPremiumActive(me) ? "premiumName" : "")
                      }`.trim()}
                    >
                      {me?.username}
                      {isPremiumActive(me) ? <span className="premiumBadge">💎</span> : null}
                    </div>
                    <div className="settingsProfileNameRow">
                      <UserTagBadge
                        tag={profileUserTag.trim().length >= 2 ? profileUserTag : null}
                        tagColor={isPremiumActive(me) ? profileTagColor : "#64748b"}
                        tagStyle={isPremiumActive(me) ? profileTagStyle : "solid"}
                      />
                      <ActivityBadge messageCount={me?.messageCount} t={t} />
                    </div>
                    {me?.userHandle ? (
                      <div className="settingsProfileAt muted small">{formatAtUserHandle(me.userHandle)}</div>
                    ) : null}
                    <div className="settingsProfileStatus muted small">{statusLine}</div>
                  </div>
                </div>

                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("authEmailLabel")}</div>
                  <input
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="name@example.com"
                  />
                  <div className="profileActions" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="primaryBtn"
                      onClick={saveEmail}
                      disabled={profileEmailSaving || !String(profileEmail || "").trim()}
                    >
                      {profileEmailSaving ? t("saving") : t("save")}
                    </button>
                  </div>
                </div>

                <div className="settingsSection">
                  <SettingsRow
                    label={t("changeAvatar")}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarBusy}
                  />
                  <input
                    ref={fileInputRef}
                    className="fileInput"
                    type="file"
                    accept="image/*"
                    onChange={(e) => pickAvatarFile(e.target.files?.[0])}
                  />
                  <SettingsRow
                    label={t("remove")}
                    onClick={() => {
                      setAvatarPreview("");
                      setAvatarBusy(true);
                      setAvatarError("");
                      Promise.resolve(onChangeAvatar?.(""))
                        .catch((e) =>
                          setAvatarError(
                            e.message === "fileRead" ? t("fileReadFailed") : e.message || t("avatarUpdateFailed")
                          )
                        )
                        .finally(() => setAvatarBusy(false));
                    }}
                    disabled={avatarBusy}
                  />
                </div>

                <div className="settingsSection settingsSection--padded profileAuraSection">
                  <div className="settingsTitle">{t("profileAuraLabel")}</div>
                  <p className="muted small profileAuraHint">{t("profileAuraHint")}</p>
                  <div className="profileAuraControls">
                    <label className="profileAuraColorLabel">
                      <span className="srOnly">{t("profileAuraLabel")}</span>
                      <input
                        type="color"
                        className="profileAuraColorInput"
                        value={profileAuraColor}
                        onChange={(e) => setProfileAuraColor(e.target.value)}
                      />
                    </label>
                    <div className="profileAuraPresets" role="list">
                      {["#0096ff", "#a855f7", "#22c55e", "#f97316", "#ec4899", "#06b6d4"].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className={`profileAuraPreset${profileAuraColor === hex ? " profileAuraPreset--active" : ""}`}
                          style={{ background: hex }}
                          onClick={() => setProfileAuraColor(hex)}
                          title={hex}
                          aria-label={hex}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <ProfilePersonalizationFields
                  t={t}
                  me={me}
                  profileUserTag={profileUserTag}
                  setProfileUserTag={setProfileUserTag}
                  profileTagColor={profileTagColor}
                  setProfileTagColor={setProfileTagColor}
                  profileTagStyle={profileTagStyle}
                  setProfileTagStyle={setProfileTagStyle}
                  profileUsernameStyle={profileUsernameStyle}
                  setProfileUsernameStyle={setProfileUsernameStyle}
                  profileAvatarRing={profileAvatarRing}
                  setProfileAvatarRing={setProfileAvatarRing}
                />

                <div className="settingsSection">
                  <div className="settingsTitle">{t("profileBgTitle")}</div>
                  {isPremiumActive(me) ? (
                    <div className="profileBgPreviewRow">
                      <div
                        className="profileBgPreview"
                        style={{
                          backgroundImage: profileBgPreview ? `url(${profileBgPreview})` : "none",
                        }}
                        aria-label={t("profileBgTitle")}
                      />
                      <div className="profileBgPreviewMeta">
                        <div className="muted small">
                          {profileBgPreview ? t("profileBgActive") : t("profileBgNone")}
                        </div>
                        <div className="profileBgActions">
                          <input
                            ref={profileBgInputRef}
                            className="fileInput"
                            type="file"
                            accept="image/*"
                            onChange={(e) => pickProfileBackground(e.target.files?.[0])}
                          />
                          <button
                            type="button"
                            className="primaryBtn"
                            onClick={() => profileBgInputRef.current?.click()}
                            disabled={profileBgBusy}
                          >
                            {profileBgBusy ? t("saving") : t("profileBgChoose")}
                          </button>
                          <button
                            type="button"
                            className="ghostBtn"
                            onClick={() => setProfileBgPreview("")}
                            disabled={profileBgBusy}
                          >
                            {t("profileBgRemove")}
                          </button>
                        </div>
                        <div className="muted small">{t("profileBgHint")}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="muted small">{t("profileBgPremiumOnly")}</div>
                  )}
                </div>

                <div className="settingsSection">
                  <SettingsRow
                    label={t("statusLabel")}
                    right={(() => {
                      const k = String(profileStatusKind || "");
                      const st = String(profileStatusText || "").trim();
                      if (k === "online") return t("statusOnline");
                      if (k === "dnd") return t("statusDnd");
                      if (k === "away") return t("statusAway");
                      if (k === "custom" && st) return st;
                      return t("lastSeen");
                    })()}
                    onClick={() => setPanel("statusPick")}
                  />
                  <SettingsRow
                    label={t("aboutLabel")}
                    right={String(profileAbout || "").trim() ? t("settingsFilled") : t("settingsEmpty")}
                    onClick={() => setPanel("aboutEdit")}
                  />
                </div>

                {profileSaveError ? <div className="authError">{profileSaveError}</div> : null}
                <div className="settingsFooter">
                  <button
                    className="primaryBtn"
                    type="button"
                    onClick={saveProfile}
                    disabled={profileSaving || !onChangeProfile}
                  >
                    {profileSaving ? t("saving") : t("save")}
                  </button>
                </div>
              </div>
            ) : panel === "statusPick" ? (
              <div className="settingsModalList">
                <div className="settingsSection">
                  {[
                    { id: "online", label: t("statusOnline") },
                    { id: "dnd", label: t("statusDnd") },
                    { id: "away", label: t("statusAway") },
                    { id: "custom", label: t("statusCustom") },
                    { id: "", label: t("lastSeen") },
                  ].map((o) => (
                    <SettingsChoiceRow
                      key={o.id || "default"}
                      label={o.label}
                      selected={String(profileStatusKind || "") === String(o.id || "")}
                      onClick={() => {
                        setProfileStatusKind(o.id);
                        if (o.id !== "custom") setProfileStatusText("");
                        if (o.id === "custom") {
                          setPanel("statusCustomEdit");
                        } else {
                          setPanel("profile");
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : panel === "statusCustomEdit" ? (
              <div className="settingsModalList">
                <div className="settingsSectionHeader">{t("statusCustom")}</div>
                <div className="settingsSection settingsSection--padded">
                  <input
                    className="settingsTextInput"
                    value={profileStatusText}
                    onChange={(e) => setProfileStatusText(e.target.value.slice(0, USER_STATUS_TEXT_MAX))}
                    placeholder={t("statusCustom")}
                    maxLength={USER_STATUS_TEXT_MAX}
                  />
                </div>
                <div className="settingsFooter">
                  <button className="primaryBtn" type="button" onClick={() => setPanel("profile")}>
                    {t("save")}
                  </button>
                </div>
              </div>
            ) : panel === "aboutEdit" ? (
              <div className="settingsModalList">
                <div className="settingsSectionHeader">{t("aboutLabel")}</div>
                <div className="settingsSection settingsSection--padded">
                  <textarea
                    className="settingsTextArea"
                    value={profileAbout}
                    onChange={(e) => setProfileAbout(e.target.value)}
                    placeholder={t("aboutLabel")}
                    rows={5}
                    maxLength={600}
                  />
                </div>
                <div className="settingsFooter">
                  <button className="primaryBtn" type="button" onClick={() => setPanel("profile")}>
                    {t("save")}
                  </button>
                </div>
              </div>
            ) : panel === "language" ? (
              <div className="settingsModalList">
                <div className="settingsSection">
                  <SettingsChoiceRow
                    label={t("langOptionEnglish")}
                    selected={settings?.lang === "en"}
                    onClick={() => {
                      onChangeSettings?.({ lang: "en" });
                      setPanel(null);
                    }}
                  />
                  <SettingsChoiceRow
                    label={t("langOptionRussian")}
                    selected={settings?.lang === "ru"}
                    onClick={() => {
                      onChangeSettings?.({ lang: "ru" });
                      setPanel(null);
                    }}
                  />
                  <SettingsChoiceRow
                    label={t("langOptionUkrainian")}
                    selected={settings?.lang === "uk"}
                    onClick={() => {
                      onChangeSettings?.({ lang: "uk" });
                      setPanel(null);
                    }}
                  />
                </div>
              </div>
            ) : panel === "notifications" ? (
              <div className="settingsModalList">
                <MessageNotificationsSettings settings={settings} onChangeSettings={onChangeSettings} t={t} />
              </div>
            ) : panel === "chatBackground" ? (
              <div className="settingsModalList">
                <div className="settingsSection settingsSection--padded">
                  <p className="muted small">{t("chatBackgroundGalleryHint")}</p>
                </div>
                <div className="settingsSection">
                  {[
                    { id: "darkGradient", label: t("themeDarkGradient") },
                    { id: "softBlur", label: t("themeSoftBlur") },
                    { id: "night", label: t("themeNight") },
                  ].map((theme) => (
                    <SettingsChoiceRow
                      key={theme.id}
                      label={theme.label}
                      selected={!settings?.chatBackgroundImageUrl && settings?.chatTheme === theme.id}
                      onClick={() => {
                        onChangeSettings?.({ chatTheme: theme.id, chatBackgroundImageUrl: null });
                        setChatBgError("");
                        setPanel(null);
                      }}
                    />
                  ))}
                </div>
                <div className="settingsSection settingsSection--padded settingsChatBgUpload">
                  <input
                    ref={chatBgFileInputRef}
                    type="file"
                    accept="image/*"
                    className="fileInput"
                    onChange={pickChatBackgroundFile}
                  />
                  <button
                    type="button"
                    className="primaryBtn settingsChatBgUploadBtn"
                    onClick={() => chatBgFileInputRef.current?.click()}
                  >
                    {t("chatBackgroundChooseGallery")}
                  </button>
                  {settings?.chatBackgroundImageUrl ? (
                    <button
                      type="button"
                      className="ghostBtn"
                      onClick={() => {
                        setChatBgError("");
                        onChangeSettings?.({ chatBackgroundImageUrl: null });
                      }}
                    >
                      {t("chatBackgroundRemoveCustom")}
                    </button>
                  ) : null}
                  {chatBgError ? <div className="authError settingsChatBgErr">{chatBgError}</div> : null}
                </div>
              </div>
            ) : panel === "premium" ? (
              <div className="settingsModalList">
                <div className="premiumHero">
                  <div className="premiumTitleRow">{t("premiumTitle")}</div>
                  <p className="muted small premiumOfferText">{t("premiumOfferText")}</p>
                </div>

                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("premiumStatusTitle")}</div>
                  <div className="muted small">
                    {t("premiumStatusLabel")}: {me?.isPremium ? t("premiumActive") : t("premiumInactive")}
                    <br />
                    {t("premiumTypeLabel")}:{" "}
                    {me?.isPremium && me?.premiumType ? t(`premiumType_${me.premiumType}`) : t("premiumTypeNone")}
                    <br />
                    {t("premiumUntil")}: {me?.isPremium && me?.premiumExpiresAt ? formatShortDate(me.premiumExpiresAt) : "—"}
                    <br />
                    {t("premiumDaysLeft", { days: me?.isPremium ? me?.premiumDaysLeft || 0 : 0 })}
                  </div>
                </div>

                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("premiumPerksTitle")}</div>
                  <ul className="premiumPerks">
                    <li>{t("premiumPerkBg")}</li>
                    <li>{t("premiumPerkName")}</li>
                    <li>{t("premiumPerkMessages")}</li>
                    <li>{t("premiumPerkFuture")}</li>
                  </ul>
                </div>

                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("premiumPricingTitle")}</div>
                  <div className="muted small">{t("premiumPricingMvp")}</div>
                </div>

                {premiumNotice ? <div className="realtimeBanner">{premiumNotice}</div> : null}

                <button
                  type="button"
                  className="primaryBtn premiumCtaBtn"
                  disabled={premiumBusy}
                  onClick={async () => {
                    setPremiumBusy(true);
                    setPremiumNotice("");
                    try {
                      const u = await activatePremium();
                      onUpdateMe?.(u);
                      setPremiumNotice(t("premiumActivated"));
                    } catch (e) {
                      setPremiumNotice(e.message || t("errorGeneric"));
                    } finally {
                      setPremiumBusy(false);
                    }
                  }}
                >
                  {t("premiumCta")}
                </button>
              </div>
            ) : panel === "support" ? (
              <div className="settingsModalList donateSupportModal">
                <p className="donateSupportIntro">{t("donateSupportBody")}</p>
                <button type="button" className="primaryBtn donateSupportMainBtn" onClick={openDonationPage}>
                  {t("donateSupportCta")}
                </button>
                <div className="donateSupportFooter">
                  <button type="button" className="ghostBtn donateSupportCloseBtn" onClick={() => setPanel(null)}>
                    {t("close")}
                  </button>
                </div>
              </div>
            ) : panel === "aboutApp" ? (
              <div className="settingsModalList">
                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("aboutAppTitle")}</div>
                  <div className="muted small" style={{ lineHeight: 1.5 }}>
                    <div>
                      <strong>{t("aboutDeveloper")}</strong>: Xasma Labs
                    </div>
                    <div>
                      <strong>{t("aboutSupportEmail")}</strong>: xasma.support@gmail.com
                    </div>
                    <div>
                      <strong>{t("aboutBuild")}</strong>: {String(import.meta.env.VITE_APP_BUILD || "web")}
                    </div>
                  </div>
                </div>

                <div className="settingsSection">
                  <SettingsRow
                    label={t("privacyPolicyTitle")}
                    onClick={() => {
                      try {
                        window.history.pushState({}, "", "/privacy");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                        setPanel(null);
                      } catch {
                        window.location.href = "/privacy";
                      }
                    }}
                  />
                  <SettingsRow
                    label={t("termsTitle")}
                    onClick={() => {
                      try {
                        window.history.pushState({}, "", "/terms");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                        setPanel(null);
                      } catch {
                        window.location.href = "/terms";
                      }
                    }}
                  />
                  <SettingsRow
                    label={t("dataDeletionTitle")}
                    onClick={() => {
                      try {
                        window.history.pushState({}, "", "/data-deletion");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                        setPanel(null);
                      } catch {
                        window.location.href = "/data-deletion";
                      }
                    }}
                  />
                  <SettingsRow
                    label={t("dataSafetyTitle")}
                    onClick={() => {
                      try {
                        window.history.pushState({}, "", "/data-safety");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                        setPanel(null);
                      } catch {
                        window.location.href = "/data-safety";
                      }
                    }}
                  />
                </div>
              </div>
            ) : panel === "privacySecurity" ? (
              <div className="settingsModalList">
                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("privacyAndSecurityTitle") ?? "Privacy and Security"}</div>
                  <div className="muted small">{t("privacyAndSecurityHint") ?? "Controls that affect privacy in this client."}</div>
                </div>
                <div className="settingsSection">
                  <SettingsChoiceRow
                    label={t("privacyPolicyShort") ?? t("privacyPolicyTitle")}
                    selected={false}
                    onClick={() => openPath("/privacy")}
                  />
                  <SettingsChoiceRow
                    label={t("permissionsTitle")}
                    selected={false}
                    onClick={() => openPath("/permissions")}
                  />
                  <SettingsChoiceRow
                    label={t("dataSafetyTitle")}
                    selected={false}
                    onClick={() => openPath("/data-safety")}
                  />
                </div>
              </div>
            ) : panel === "dataStorage" ? (
              <div className="settingsModalList">
                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("dataAndStorageTitle") ?? "Data and Storage"}</div>
                  <div className="muted small">{t("dataAndStorageHint") ?? "Media download and storage preferences for this client."}</div>
                </div>
                <div className="settingsSection">
                  <SettingsChoiceRow
                    label={t("autoDownloadMediaLabel") ?? "Auto-download media"}
                    selected={Boolean(settings?.autoDownloadMedia)}
                    onClick={() => onChangeSettings?.({ autoDownloadMedia: !settings?.autoDownloadMedia })}
                  />
                  <SettingsChoiceRow
                    label={t("saveToGalleryLabel") ?? "Save to Gallery"}
                    selected={Boolean(settings?.saveToGallery)}
                    onClick={() => onChangeSettings?.({ saveToGallery: !settings?.saveToGallery })}
                  />
                </div>
              </div>
            ) : panel === "powerSaving" ? (
              <div className="settingsModalList">
                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("powerSavingTitle") ?? "Power Saving"}</div>
                  <div className="muted small">{t("powerSavingHint") ?? "Reduce visual effects to save battery."}</div>
                </div>
                <div className="settingsSection">
                  <SettingsChoiceRow
                    label={t("powerSavingEnableLabel") ?? "Enable Power Saving"}
                    selected={Boolean(settings?.powerSavingEnabled)}
                    onClick={() => onChangeSettings?.({ powerSavingEnabled: !settings?.powerSavingEnabled })}
                  />
                  <SettingsChoiceRow
                    label={t("reduceMotionLabel") ?? "Reduce motion"}
                    selected={Boolean(settings?.reduceMotion)}
                    onClick={() => onChangeSettings?.({ reduceMotion: !settings?.reduceMotion })}
                  />
                </div>
              </div>
            ) : panel === "devices" ? (
              <div className="settingsModalList">
                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("devicesTitle") ?? "Devices"}</div>
                  <div className="muted small">{t("devicesHint") ?? "Active sessions are managed by the server. This client shows basic info."}</div>
                </div>
                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("thisDeviceTitle") ?? "This device"}</div>
                  <div className="muted small">{navigator.userAgent}</div>
                </div>
              </div>
            ) : panel === "advanced" ? (
              <div className="settingsModalList">
                <div className="settingsSection settingsSection--padded">
                  <div className="settingsTitle">{t("advancedTitle") ?? "Advanced"}</div>
                  <div className="muted small">{t("advancedHint") ?? "Extra options for this client."}</div>
                </div>
                <div className="settingsSection">
                  <SettingsChoiceRow
                    label={t("reduceMotionLabel") ?? "Reduce motion"}
                    selected={Boolean(settings?.reduceMotion)}
                    onClick={() => onChangeSettings?.({ reduceMotion: !settings?.reduceMotion })}
                  />
                </div>
              </div>
            ) : (
              <div className="adminPanel">
                {adminError ? <div className="authError">{adminError}</div> : null}
                {adminNotice ? <div className="muted">{adminNotice}</div> : null}
                <div className="adminTopRow">
                  <button className="ghostBtn" type="button" onClick={loadAdminUsers} disabled={adminLoading}>
                    {t("adminRefresh")}
                  </button>
                </div>

                <AdminOfficialBroadcast
                  t={t}
                  text={adminBroadcastText}
                  setText={setAdminBroadcastText}
                  busy={adminBroadcastBusy}
                  onSend={sendOfficialBroadcast}
                />

                <AdminFlaggedSection
                  t={t}
                  items={adminFlagged}
                  loading={adminFlaggedLoading}
                  onRefresh={loadAdminFlagged}
                />

                <AdminMessageReportsSection
                  t={t}
                  items={adminReports}
                  loading={adminReportsLoading}
                  onRefresh={loadAdminReports}
                />

                {adminLoading ? (
                  <div className="muted">{t("adminLoadingUsers")}</div>
                ) : (
                  <div className="adminUserList">
                    {adminUsers.map((u) => (
                      <div key={u.id} className="adminUserRow">
                        <div className="adminUserMain">
                          <div className="adminUserNameRow">
                            <div className="adminUserNameCol">
                              <div className="adminUserName">{u.username}</div>
                              {u.userHandle ? (
                                <div className="adminUserAt muted small">{formatAtUserHandle(u.userHandle)}</div>
                              ) : null}
                            </div>
                            <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                            <div className={u.is_online ? "presenceDot online" : "presenceDot"} />
                          </div>
                          <div className="adminUserMeta muted small">
                            {t("adminRoleLabel")}: {u.role} · {u.banned ? t("adminStatusBanned") : t("adminStatusActive")}
                          </div>
                          <div className="adminUserMeta muted small">
                            {t("premiumTitleShort")}: {u.isPremium ? t("premiumActive") : t("premiumInactive")}
                            {u.isPremium && u.premiumType ? ` · ${t("premiumTypeLabel")}: ${t(`premiumType_${u.premiumType}`)}` : ""}
                            {u.premiumExpiresAt ? ` · ${t("premiumUntil")} ${formatShortDate(u.premiumExpiresAt)}` : ""}
                            {u.isPremium && typeof u.premiumDaysLeft === "number"
                              ? ` · ${t("premiumDaysLeft", { days: u.premiumDaysLeft })}`
                              : ""}
                          </div>
                        </div>

                        <div className="adminActions">
                          <button
                            type="button"
                            className="ghostBtn"
                            onClick={async () => {
                              const nextRole = u.role === "admin" ? "user" : "admin";
                              setAdminUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x))
                              );
                              try {
                                const res = await adminSetUserRole(u.id, nextRole);
                                const updated = res.user;
                                setAdminUsers((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                                );
                                setAdminNotice(
                                  u.id === me.id ? t("adminRoleUpdated") : t("adminRoleUpdatedRelogin")
                                );
                              } catch (e) {
                                setAdminError(e.message || t("adminRequestFailed"));
                                loadAdminUsers();
                              }
                            }}
                          >
                            {u.role === "admin" ? t("adminRemoveAdmin") : t("adminMakeAdmin")}
                          </button>
                          <button
                            type="button"
                            className={u.banned ? "primaryBtn" : "ghostBtn"}
                            onClick={async () => {
                              const next = !u.banned;
                              setAdminUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, banned: next } : x))
                              );
                              try {
                                const res = await adminSetUserBanned(u.id, next);
                                const updated = res.user;
                                setAdminUsers((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                                );
                                setAdminNotice(next ? t("adminUserBanned") : t("adminUserUnbanned"));
                              } catch (e) {
                                setAdminError(e.message || t("adminRequestFailed"));
                                loadAdminUsers();
                              }
                            }}
                          >
                            {u.banned ? t("adminUnban") : t("adminBan")}
                          </button>
                        </div>
                        <div className="adminPremiumControls">
                          <select
                            className="input adminPremSelect"
                            value={adminPremTypeById[u.id] || "admin"}
                            onChange={(e) =>
                              setAdminPremTypeById((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                          >
                            <option value="admin">{t("premiumType_admin")}</option>
                            <option value="paid">{t("premiumType_paid")}</option>
                            <option value="invite">{t("premiumType_invite")}</option>
                          </select>
                          <input
                            className="input adminPremDays"
                            inputMode="numeric"
                            placeholder="30"
                            value={adminPremDaysById[u.id] ?? ""}
                            onChange={(e) =>
                              setAdminPremDaysById((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="ghostBtn"
                            onClick={async () => {
                              const type = adminPremTypeById[u.id] || "admin";
                              const daysRaw = adminPremDaysById[u.id];
                              const days = Math.max(1, Math.min(3650, parseInt(String(daysRaw || "30"), 10) || 30));
                              try {
                                const res = await adminGrantPremium(u.id, { type, days });
                                const updated = res.user;
                                setAdminUsers((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                                );
                                setAdminNotice(t("adminPremiumGranted"));
                              } catch (e) {
                                setAdminError(e.message || t("adminRequestFailed"));
                                loadAdminUsers();
                              }
                            }}
                          >
                            {t("adminPremiumGrant")}
                          </button>
                          <button
                            type="button"
                            className="ghostBtn"
                            onClick={async () => {
                              try {
                                const res = await adminRemovePremium(u.id);
                                const updated = res.user;
                                setAdminUsers((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                                );
                                setAdminNotice(t("adminPremiumRemoved"));
                              } catch (e) {
                                setAdminError(e.message || t("adminRequestFailed"));
                                loadAdminUsers();
                              }
                            }}
                          >
                            {t("adminPremiumRemove")}
                          </button>
                          <div className="adminPremPresets">
                            {[14, 30, 90].map((d) => (
                              <button
                                key={d}
                                type="button"
                                className="ghostBtn adminPremPresetBtn"
                                onClick={() =>
                                  setAdminPremDaysById((prev) => ({ ...prev, [u.id]: String(d) }))
                                }
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                        <AdminUserTagEditor
                          user={u}
                          t={t}
                          onUpdate={(updated) => {
                            setAdminUsers((prev) =>
                              prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Modal>
        ) : null}
      </div>
    );
  }

  return (
    <div className="userMenu" ref={rootRef}>
      {hideDropdownTrigger ? null : (
        <button
          className={open ? "menuBtn active" : "menuBtn"}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title={t("menu")}
        >
          <span className="hamburger" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      )}

      {open ? (
        <div
          className={hideDropdownTrigger ? "dropdown dropdown--topBarCluster" : "dropdown"}
          role="menu"
        >
          <button
            className="dropdownItem"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPanel("settings");
            }}
          >
            {t("settings")}
          </button>
          {me?.role === "admin" ? (
            <button
              className="dropdownItem"
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPanel("admin");
                loadAdminUsers();
                loadAdminFlagged();
                loadAdminReports();
              }}
            >
              {t("adminPanelTitle")}
            </button>
          ) : null}
          <div className="dropdownSep" />
          <button
            className="dropdownItem danger"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPanel(null);
              onLogout();
            }}
          >
            {t("logout")}
          </button>
        </div>
      ) : null}

      {panel ? (
        <Modal
          title={
            panel === "profile"
              ? t("myProfile")
              : panel === "settings"
                ? t("settings")
                : panel === "premium"
                  ? t("premiumTitle")
                : panel === "support"
                  ? t("settingsSupportAuthors")
                  : t("adminPanelTitle")
          }
          onClose={() => setPanel(null)}
          t={t}
          cardClassName={modalCardClass}
        >
          {panel === "profile" ? (
            <div>
              {avatarError ? <div className="authError">{avatarError}</div> : null}
              {profileEmailError ? <div className="authError">{profileEmailError}</div> : null}
              <div className="profilePanel">
                <AvatarAura auraColor={profileAuraColor}>
                  {(() => {
                    const ringC = avatarRingWrapClass(isPremiumActive(me) ? profileAvatarRing : "");
                    const inner = (
                      <div className="profileAvatar">
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="" />
                        ) : (
                          <span>{initials(me.username)}</span>
                        )}
                      </div>
                    );
                    return ringC ? <span className={ringC}>{inner}</span> : inner;
                  })()}
                </AvatarAura>

                <div className="profileInfo">
                  <div className="profileLabel">{t("profileDisplayNameLabel")}</div>
                  <div
                    className={`profileValue ${
                      usernameStyleClass(profileUsernameStyle) ||
                      (isPremiumActive(me) ? "premiumName" : "")
                    }`.trim()}
                  >
                    {me.username}
                    {isPremiumActive(me) ? <span className="premiumBadge">💎</span> : null}
                  </div>
                  {me?.userHandle ? (
                    <div className="profileHandleRow muted small">
                      <span className="profileHandleLabel">{t("profileUserHandleLabel")}</span>
                      <span className="userAtHandle">{formatAtUserHandle(me.userHandle)}</span>
                    </div>
                  ) : null}
                  <div className="profileValue profileValue--badges">
                    <UserTagBadge
                      tag={profileUserTag.trim().length >= 2 ? profileUserTag : null}
                      tagColor={isPremiumActive(me) ? profileTagColor : "#64748b"}
                      tagStyle={isPremiumActive(me) ? profileTagStyle : "solid"}
                    />
                    <ActivityBadge messageCount={me?.messageCount} t={t} />
                  </div>
                  <div className="profileHint muted small">
                    {me?.isOnline ? t("online") : me?.lastSeenAt ? t("lastSeenAt").replace("{time}", formatLastSeen(me.lastSeenAt, settings?.lang)) : t("lastSeen")}
                  </div>
                </div>
              </div>

              <div className="settingsSection settingsSection--padded">
                <div className="settingsTitle">{t("authEmailLabel")}</div>
                <input
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="name@example.com"
                />
                <div className="profileActions" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="primaryBtn"
                    onClick={saveEmail}
                    disabled={profileEmailSaving || !String(profileEmail || "").trim()}
                  >
                    {profileEmailSaving ? t("saving") : t("save")}
                  </button>
                </div>
              </div>

              <div className="profileActions">
                <input
                  ref={fileInputRef}
                  className="fileInput"
                  type="file"
                  accept="image/*"
                  onChange={(e) => pickAvatarFile(e.target.files?.[0])}
                />
                <button
                  className="primaryBtn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {avatarBusy ? t("saving") : t("changeAvatar")}
                </button>
                <button
                  className="ghostBtn"
                  type="button"
                  onClick={() => {
                    setAvatarPreview("");
                    setAvatarBusy(true);
                    setAvatarError("");
                    Promise.resolve(onChangeAvatar?.(""))
                      .catch((e) =>
                        setAvatarError(
                          e.message === "fileRead" ? t("fileReadFailed") : e.message || t("avatarUpdateFailed")
                        )
                      )
                      .finally(() => setAvatarBusy(false));
                  }}
                  disabled={avatarBusy}
                >
                  {t("remove")}
                </button>
                <div className="muted small profileLimitHint">
                  {t("maxAvatarHint")}
                </div>
              </div>

              <div className="settingsSection">
                <div className="settingsTitle">{t("profileBgTitle")}</div>
                {me?.isPremium ? (
                  <>
                    <div className="profileBgPreviewRow">
                      <div
                        className="profileBgPreview"
                        style={{
                          backgroundImage: profileBgPreview ? `url(${profileBgPreview})` : "none",
                        }}
                        aria-label={t("profileBgTitle")}
                      />
                      <div className="profileBgPreviewMeta">
                        <div className="muted small">
                          {profileBgPreview ? t("profileBgActive") : t("profileBgNone")}
                        </div>
                        <div className="profileBgActions">
                          <input
                            ref={profileBgInputRef}
                            className="fileInput"
                            type="file"
                            accept="image/*"
                            onChange={(e) => pickProfileBackground(e.target.files?.[0])}
                          />
                          <button
                            type="button"
                            className="primaryBtn"
                            onClick={() => profileBgInputRef.current?.click()}
                            disabled={profileBgBusy}
                          >
                            {profileBgBusy ? t("saving") : t("profileBgChoose")}
                          </button>
                          <button
                            type="button"
                            className="ghostBtn"
                            onClick={() => setProfileBgPreview("")}
                            disabled={profileBgBusy}
                          >
                            {t("profileBgRemove")}
                          </button>
                        </div>
                        <div className="muted small">{t("profileBgHint")}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="muted small">{t("profileBgPremiumOnly")}</div>
                )}
              </div>

              <div className="settingsSection profileAuraSection">
                <div className="settingsTitle">{t("profileAuraLabel")}</div>
                <p className="muted small profileAuraHint">{t("profileAuraHint")}</p>
                <div className="profileAuraControls">
                  <label className="profileAuraColorLabel">
                    <span className="srOnly">{t("profileAuraLabel")}</span>
                    <input
                      type="color"
                      className="profileAuraColorInput"
                      value={profileAuraColor}
                      onChange={(e) => setProfileAuraColor(e.target.value)}
                    />
                  </label>
                  <div className="profileAuraPresets" role="list">
                    {["#0096ff", "#a855f7", "#22c55e", "#f97316", "#ec4899", "#06b6d4"].map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className={`profileAuraPreset${profileAuraColor === hex ? " profileAuraPreset--active" : ""}`}
                        style={{ background: hex }}
                        onClick={() => setProfileAuraColor(hex)}
                        title={hex}
                        aria-label={hex}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <ProfilePersonalizationFields
                t={t}
                me={me}
                profileUserTag={profileUserTag}
                setProfileUserTag={setProfileUserTag}
                profileTagColor={profileTagColor}
                setProfileTagColor={setProfileTagColor}
                profileTagStyle={profileTagStyle}
                setProfileTagStyle={setProfileTagStyle}
                profileUsernameStyle={profileUsernameStyle}
                setProfileUsernameStyle={setProfileUsernameStyle}
                profileAvatarRing={profileAvatarRing}
                setProfileAvatarRing={setProfileAvatarRing}
              />

              <div className="settingsSection">
                <div className="settingsTitle">{t("statusLabel")}</div>
                <div className="pillRow">
                  {[
                    { id: "online", label: t("statusOnline") },
                    { id: "dnd", label: t("statusDnd") },
                    { id: "away", label: t("statusAway") },
                    { id: "custom", label: t("statusCustom") },
                    { id: "", label: t("lastSeen") },
                  ].map((o) => (
                    <button
                      key={o.id || "default"}
                      type="button"
                      className={profileStatusKind === o.id ? "pillBtn active" : "pillBtn"}
                      onClick={() => setProfileStatusKind(o.id)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {profileStatusKind === "custom" ? (
                  <input
                    className="searchInput"
                    value={profileStatusText}
                    onChange={(e) => setProfileStatusText(e.target.value.slice(0, USER_STATUS_TEXT_MAX))}
                    placeholder={t("statusCustom")}
                    maxLength={USER_STATUS_TEXT_MAX}
                  />
                ) : null}
              </div>

              <div className="settingsSection">
                <div className="settingsTitle">{t("aboutLabel")}</div>
                <textarea
                  className="searchInput"
                  value={profileAbout}
                  onChange={(e) => setProfileAbout(e.target.value)}
                  placeholder={t("aboutLabel")}
                  rows={4}
                  maxLength={600}
                />
              </div>

              {profileSaveError ? <div className="authError">{profileSaveError}</div> : null}
              <div className="profileActions">
                <button
                  className="primaryBtn"
                  type="button"
                  onClick={saveProfile}
                  disabled={profileSaving || !onChangeProfile}
                >
                  {profileSaving ? t("saving") : t("save")}
                </button>
              </div>
            </div>
          ) : panel === "settings" ? (
            <div className="settingsPanel">
              <div className="settingsSection">
                <div className="settingsTitle">{t("profile")}</div>
                <button type="button" className="dropdownItem" onClick={() => setPanel("profile")}>
                  {t("myProfile")}
                </button>
              </div>
              <div className="settingsSection">
                <div className="settingsTitle">{t("language")}</div>
                <div className="pillRow">
                  <button
                    type="button"
                    className={settings?.lang === "en" ? "pillBtn active" : "pillBtn"}
                    onClick={() => onChangeSettings?.({ lang: "en" })}
                  >
                    {t("langOptionEnglish")}
                  </button>
                  <button
                    type="button"
                    className={settings?.lang === "ru" ? "pillBtn active" : "pillBtn"}
                    onClick={() => onChangeSettings?.({ lang: "ru" })}
                  >
                    {t("langOptionRussian")}
                  </button>
                  <button
                    type="button"
                    className={settings?.lang === "uk" ? "pillBtn active" : "pillBtn"}
                    onClick={() => onChangeSettings?.({ lang: "uk" })}
                  >
                    {t("langOptionUkrainian")}
                  </button>
                </div>
              </div>

              <MessageNotificationsSettings settings={settings} onChangeSettings={onChangeSettings} t={t} />

              <div className="settingsSection">
                <div className="settingsTitle">{t("chatBackground")}</div>
                <p className="muted small settingsChatBgHint">{t("chatBackgroundGalleryHint")}</p>
                <div className="themeGrid">
                  {[
                    { id: "darkGradient", label: t("themeDarkGradient") },
                    { id: "softBlur", label: t("themeSoftBlur") },
                    { id: "night", label: t("themeNight") },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={
                        !settings?.chatBackgroundImageUrl && settings?.chatTheme === theme.id
                          ? "themeCard active"
                          : "themeCard"
                      }
                      onClick={() => {
                        setChatBgError("");
                        onChangeSettings?.({ chatTheme: theme.id, chatBackgroundImageUrl: null });
                      }}
                      title={theme.label}
                    >
                      <div
                        className={`themePreview theme-${theme.id} ${
                          theme.id === "darkGradient"
                            ? "theme-dark-animated"
                            : theme.id === "night"
                              ? "theme-night-animated"
                              : theme.id === "softBlur"
                                ? "theme-soft-animated"
                                : ""
                        }`}
                      />
                      <div className="themeLabel">{theme.label}</div>
                    </button>
                  ))}
                </div>
                <div className="settingsChatBgActions">
                  <input
                    ref={chatBgFileInputRef}
                    type="file"
                    accept="image/*"
                    className="fileInput"
                    onChange={pickChatBackgroundFile}
                  />
                  <button
                    type="button"
                    className="primaryBtn"
                    onClick={() => chatBgFileInputRef.current?.click()}
                  >
                    {t("chatBackgroundChooseGallery")}
                  </button>
                  {settings?.chatBackgroundImageUrl ? (
                    <button
                      type="button"
                      className="ghostBtn"
                      onClick={() => {
                        setChatBgError("");
                        onChangeSettings?.({ chatBackgroundImageUrl: null });
                      }}
                    >
                      {t("chatBackgroundRemoveCustom")}
                    </button>
                  ) : null}
                </div>
                {chatBgError ? <div className="authError settingsChatBgErr">{chatBgError}</div> : null}
              </div>

              <div className="settingsSection">
                <div className="settingsTitle">{t("inviteFriendsTitle")}</div>
                {me?.referralCode ? (
                  (() => {
                    const link =
                      typeof window !== "undefined"
                        ? `${window.location.origin}/invite/${String(me.referralCode)}`
                        : `/invite/${String(me.referralCode)}`;
                    const count = Math.max(0, Number(me?.referralsCount) || 0);
                    return (
                      <>
                        <div className="muted small">
                          {t("inviteFriendsCount").replace("{count}", String(count))}
                        </div>
                        <div className="inviteLinkRow">
                          <div className="inviteLinkText" title={link}>
                            {link}
                          </div>
                          <button
                            type="button"
                            className="ghostBtn"
                            onClick={async () => {
                              try {
                                await navigator.clipboard?.writeText?.(link);
                                setInviteCopied(true);
                                window.setTimeout(() => setInviteCopied(false), 1200);
                              } catch {
                                try {
                                  const el = document.createElement("textarea");
                                  el.value = link;
                                  el.style.position = "fixed";
                                  el.style.left = "-9999px";
                                  document.body.appendChild(el);
                                  el.focus();
                                  el.select();
                                  document.execCommand("copy");
                                  document.body.removeChild(el);
                                  setInviteCopied(true);
                                  window.setTimeout(() => setInviteCopied(false), 1200);
                                } catch {
                                  // ignore
                                }
                              }
                            }}
                          >
                            {inviteCopied ? t("inviteFriendsCopied") : t("inviteFriendsCopy")}
                          </button>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <div className="muted small">{t("errorGeneric")}</div>
                )}
              </div>

              <div className="settingsSection">
                <div className="settingsTitle">{t("premiumTitleShort")}</div>
                <button
                  type="button"
                  className="dropdownItem"
                  onClick={() => {
                    setPremiumNotice("");
                    setPanel("premium");
                  }}
                >
                  {t("premiumButton")} · {me?.isPremium ? t("premiumActive") : t("premiumInactive")}
                </button>
                <div className="muted small">
                  {t("premiumTypeLabel")}:{" "}
                  {me?.isPremium && me?.premiumType ? t(`premiumType_${me.premiumType}`) : t("premiumTypeNone")}
                  <br />
                  {t("premiumUntil")}: {me?.isPremium && me?.premiumExpiresAt ? formatShortDate(me.premiumExpiresAt) : "—"}
                  <br />
                  {t("premiumDaysLeft", { days: me?.isPremium ? me?.premiumDaysLeft || 0 : 0 })}
                </div>
              </div>

              <div className="settingsSection">
                <div className="settingsTitle">{t("settingsSupport")}</div>
                <button type="button" className="dropdownItem" onClick={() => setPanel("support")}>
                  {t("settingsSupportAuthors")}
                </button>
              </div>
            </div>
          ) : panel === "premium" ? (
            <div className="settingsModalList">
              <div className="premiumHero">
                <div className="premiumTitleRow">{t("premiumTitle")}</div>
                <p className="muted small premiumOfferText">{t("premiumOfferText")}</p>
              </div>

              <div className="settingsSection settingsSection--padded">
                <div className="settingsTitle">{t("premiumStatusTitle")}</div>
                <div className="muted small">
                  {t("premiumStatusLabel")}: {me?.isPremium ? t("premiumActive") : t("premiumInactive")}
                  <br />
                  {t("premiumTypeLabel")}:{" "}
                  {me?.isPremium && me?.premiumType ? t(`premiumType_${me.premiumType}`) : t("premiumTypeNone")}
                  <br />
                  {t("premiumUntil")}: {me?.isPremium && me?.premiumExpiresAt ? formatShortDate(me.premiumExpiresAt) : "—"}
                  <br />
                  {t("premiumDaysLeft", { days: me?.isPremium ? me?.premiumDaysLeft || 0 : 0 })}
                </div>
              </div>

              <div className="settingsSection settingsSection--padded">
                <div className="settingsTitle">{t("premiumPerksTitle")}</div>
                <ul className="premiumPerks">
                  <li>{t("premiumPerkBg")}</li>
                  <li>{t("premiumPerkName")}</li>
                  <li>{t("premiumPerkMessages")}</li>
                  <li>{t("premiumPerkFuture")}</li>
                </ul>
              </div>

              <div className="settingsSection settingsSection--padded">
                <div className="settingsTitle">{t("premiumPricingTitle")}</div>
                <div className="muted small">{t("premiumPricingMvp")}</div>
              </div>

              {premiumNotice ? <div className="realtimeBanner">{premiumNotice}</div> : null}

              <button
                type="button"
                className="primaryBtn premiumCtaBtn"
                disabled={premiumBusy}
                onClick={async () => {
                  setPremiumBusy(true);
                  setPremiumNotice("");
                  try {
                    const u = await activatePremium();
                    onUpdateMe?.(u);
                    setPremiumNotice(t("premiumActivated"));
                  } catch (e) {
                    setPremiumNotice(e.message || t("errorGeneric"));
                  } finally {
                    setPremiumBusy(false);
                  }
                }}
              >
                {t("premiumCta")}
              </button>
            </div>
          ) : panel === "support" ? (
            <div className="donateSupportModal donateSupportModal--desktop">
              <p className="donateSupportIntro">{t("donateSupportBody")}</p>
              <button type="button" className="primaryBtn donateSupportMainBtn" onClick={openDonationPage}>
                {t("donateSupportCta")}
              </button>
            </div>
          ) : (
            <div className="adminPanel">
              {adminError ? <div className="authError">{adminError}</div> : null}
              {adminNotice ? <div className="muted">{adminNotice}</div> : null}
              <div className="adminTopRow">
                <button className="ghostBtn" type="button" onClick={loadAdminUsers} disabled={adminLoading}>
                  {t("adminRefresh")}
                </button>
              </div>

              <AdminOfficialBroadcast
                t={t}
                text={adminBroadcastText}
                setText={setAdminBroadcastText}
                busy={adminBroadcastBusy}
                onSend={sendOfficialBroadcast}
              />

              <AdminFlaggedSection
                t={t}
                items={adminFlagged}
                loading={adminFlaggedLoading}
                onRefresh={loadAdminFlagged}
              />

              <AdminMessageReportsSection
                t={t}
                items={adminReports}
                loading={adminReportsLoading}
                onRefresh={loadAdminReports}
              />

              {adminLoading ? (
                <div className="muted">{t("adminLoadingUsers")}</div>
              ) : (
                <div className="adminUserList">
                  {adminUsers.map((u) => (
                    <div key={u.id} className="adminUserRow">
                      <div className="adminUserMain">
                        <div className="adminUserNameRow">
                          <div className="adminUserNameCol">
                            <div className="adminUserName">{u.username}</div>
                            {u.userHandle ? (
                              <div className="adminUserAt muted small">{formatAtUserHandle(u.userHandle)}</div>
                            ) : null}
                          </div>
                          <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                          <div className={u.is_online ? "presenceDot online" : "presenceDot"} />
                        </div>
                        <div className="adminUserMeta muted small">
                          {t("adminRoleLabel")}: {u.role} · {u.banned ? t("adminStatusBanned") : t("adminStatusActive")}
                        </div>
                        <div className="adminUserMeta muted small">
                          {t("premiumTitleShort")}: {u.isPremium ? t("premiumActive") : t("premiumInactive")}
                          {u.isPremium && u.premiumType ? ` · ${t("premiumTypeLabel")}: ${t(`premiumType_${u.premiumType}`)}` : ""}
                          {u.premiumExpiresAt ? ` · ${t("premiumUntil")} ${formatShortDate(u.premiumExpiresAt)}` : ""}
                          {u.isPremium && typeof u.premiumDaysLeft === "number"
                            ? ` · ${t("premiumDaysLeft", { days: u.premiumDaysLeft })}`
                            : ""}
                        </div>
                      </div>

                      <div className="adminActions">
                        <button
                          type="button"
                          className="ghostBtn"
                          onClick={async () => {
                            const nextRole = u.role === "admin" ? "user" : "admin";
                            setAdminUsers((prev) =>
                              prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x))
                            );
                            try {
                              const res = await adminSetUserRole(u.id, nextRole);
                              const updated = res.user;
                              setAdminUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                              );
                              setAdminNotice(
                                u.id === me.id ? t("adminRoleUpdated") : t("adminRoleUpdatedRelogin")
                              );
                            } catch (e) {
                              setAdminError(e.message || t("adminRequestFailed"));
                              loadAdminUsers();
                            }
                          }}
                        >
                          {u.role === "admin" ? t("adminRemoveAdmin") : t("adminMakeAdmin")}
                        </button>
                        <button
                          type="button"
                          className={u.banned ? "primaryBtn" : "ghostBtn"}
                          onClick={async () => {
                            const next = !u.banned;
                            setAdminUsers((prev) =>
                              prev.map((x) => (x.id === u.id ? { ...x, banned: next } : x))
                            );
                            try {
                              const res = await adminSetUserBanned(u.id, next);
                              const updated = res.user;
                              setAdminUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                              );
                              setAdminNotice(next ? t("adminUserBanned") : t("adminUserUnbanned"));
                            } catch (e) {
                              setAdminError(e.message || t("adminRequestFailed"));
                              loadAdminUsers();
                            }
                          }}
                        >
                          {u.banned ? t("adminUnban") : t("adminBan")}
                        </button>
                      </div>
                      <div className="adminPremiumControls">
                        <select
                          className="input adminPremSelect"
                          value={adminPremTypeById[u.id] || "admin"}
                          onChange={(e) =>
                            setAdminPremTypeById((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                        >
                          <option value="admin">{t("premiumType_admin")}</option>
                          <option value="paid">{t("premiumType_paid")}</option>
                          <option value="invite">{t("premiumType_invite")}</option>
                        </select>
                        <input
                          className="input adminPremDays"
                          inputMode="numeric"
                          placeholder="30"
                          value={adminPremDaysById[u.id] ?? ""}
                          onChange={(e) =>
                            setAdminPremDaysById((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="ghostBtn"
                          onClick={async () => {
                            const type = adminPremTypeById[u.id] || "admin";
                            const daysRaw = adminPremDaysById[u.id];
                            const days = Math.max(1, Math.min(3650, parseInt(String(daysRaw || "30"), 10) || 30));
                            try {
                              const res = await adminGrantPremium(u.id, { type, days });
                              const updated = res.user;
                              setAdminUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                              );
                              setAdminNotice(t("adminPremiumGranted"));
                            } catch (e) {
                              setAdminError(e.message || t("adminRequestFailed"));
                              loadAdminUsers();
                            }
                          }}
                        >
                          {t("adminPremiumGrant")}
                        </button>
                        <button
                          type="button"
                          className="ghostBtn"
                          onClick={async () => {
                            try {
                              const res = await adminRemovePremium(u.id);
                              const updated = res.user;
                              setAdminUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
                              );
                              setAdminNotice(t("adminPremiumRemoved"));
                            } catch (e) {
                              setAdminError(e.message || t("adminRequestFailed"));
                              loadAdminUsers();
                            }
                          }}
                        >
                          {t("adminPremiumRemove")}
                        </button>
                        <div className="adminPremPresets">
                          {[14, 30, 90].map((d) => (
                            <button
                              key={d}
                              type="button"
                              className="ghostBtn adminPremPresetBtn"
                              onClick={() =>
                                setAdminPremDaysById((prev) => ({ ...prev, [u.id]: String(d) }))
                              }
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <AdminUserTagEditor
                        user={u}
                        t={t}
                        onUpdate={(updated) => {
                          setAdminUsers((prev) =>
                            prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
});

UserMenu.displayName = "UserMenu";
export default UserMenu;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("fileRead"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function Modal({ title, children, onClose, t, cardClassName = "", usePortal = false }) {
  const node = (
    <div
      className={`modalBackdrop modalBackdrop--app${usePortal ? " modalBackdrop--teleported" : ""}`.trim()}
      role="dialog"
      aria-modal="true"
    >
      <div className={`modalCard ${cardClassName}`.trim()}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="ghostBtn" type="button" onClick={onClose}>
            {t("close")}
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
  if (usePortal && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || "?";
}

function formatLastSeen(v, lang) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const locale = localeForLang(lang);
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

