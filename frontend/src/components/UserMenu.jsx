import React, { useCallback, useEffect, useRef, useState } from "react";
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

function formatShortDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}.${mm}.${yy}`;
}

function AdminUserTagEditor({ user, onUpdate, t }) {
  const [tag, setTag] = useState(user.tag || "");
  const [tagColor, setTagColor] = useState(user.tagColor || "#6366f1");
  const [tagStyle, setTagStyle] = useState(user.tagStyle === "gradient" ? "gradient" : "solid");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTag(user.tag || "");
    setTagColor(user.tagColor || "#6366f1");
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

  const colorVal = /^#[0-9a-fA-F]{6}$/.test(String(tagColor || "").trim())
    ? String(tagColor).trim()
    : "#6366f1";

  return (
    <div className="adminUserTagRow">
      <input
        type="text"
        className="adminTagInput"
        placeholder={t("userTagLabel")}
        aria-label={t("userTagLabel")}
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        maxLength={40}
      />
      <input
        type="color"
        className="adminTagColor"
        aria-label={t("userTagLabel")}
        value={colorVal}
        onChange={(e) => setTagColor(e.target.value)}
      />
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
  const enabled = Boolean(settings?.messageNotificationsEnabled);
  const [working, setWorking] = useState(false);

  async function onToggle() {
    if (!supported || working) return;
    setWorking(true);
    try {
      if (enabled) {
        onChangeSettings?.({ messageNotificationsEnabled: false });
        return;
      }
      if (perm === "denied") return;
      let nextPerm = perm;
      if (nextPerm === "default") {
        nextPerm = await Notification.requestPermission();
      }
      if (nextPerm === "granted") {
        onChangeSettings?.({ messageNotificationsEnabled: true });
      }
    } finally {
      setWorking(false);
    }
  }

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
              className={enabled ? "pillBtn active" : "pillBtn"}
              onClick={onToggle}
              disabled={working || (!enabled && perm === "denied")}
              aria-pressed={enabled}
            >
              {perm === "denied" && !enabled
                ? t("notifyBlockedButton")
                : enabled
                  ? t("notifyDisableButton")
                  : t("notifyEnableButton")}
            </button>
          </div>
          <p className="muted small settingsNotifyHint">{t("notifyEnableHint")}</p>
          {perm === "denied" ? <p className="muted small settingsNotifyWarn">{t("notifyDeniedInBrowser")}</p> : null}
        </>
      )}
    </div>
  );
}

export default function UserMenu({
  me,
  onLogout,
  onChangeAvatar,
  onChangeProfile,
  settings,
  onChangeSettings,
  t,
  variant = "dropdown",
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(null); // "profile" | "settings" | "admin" | null
  const rootRef = useRef(null);
  const fileInputRef = useRef(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [profileStatusKind, setProfileStatusKind] = useState("");
  const [profileStatusText, setProfileStatusText] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profileAuraColor, setProfileAuraColor] = useState(DEFAULT_AURA_COLOR);
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
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target)) setOpen(false);
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
  }, [open, panel]);

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
    setProfileBgPreview(String(me?.profileBackground || ""));
    setProfileSaveError("");
  }, [panel, me?.statusKind, me?.statusText, me?.about, me?.auraColor]);

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
        ...(profileBgPreview ? { profileBackground: profileBgPreview } : {}),
      });
    } catch (e) {
      setProfileSaveError(e.message || t("errorGeneric"));
    } finally {
      setProfileSaving(false);
    }
  }

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

    function SettingsRow({ label, right, danger, onClick, disabled }) {
      return (
        <button
          type="button"
          className={danger ? "settingsRow settingsRow--danger" : "settingsRow"}
          onClick={onClick}
          disabled={disabled}
        >
          <span className="settingsRowLeft">{label}</span>
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
          <span className="settingsRowLeft">{label}</span>
          <span className="settingsRowRight">
            {selected ? <span className="settingsRowCheck" aria-hidden>✓</span> : <span className="settingsRowSpacer" />}
          </span>
        </button>
      );
    }

    return (
      <div className="settingsScreen settingsScreen--mobile" ref={rootRef}>
        <button type="button" className="settingsTopProfile" onClick={() => setPanel("profile")}>
          <span className="settingsTopAvatar">
            {me?.avatar ? <img src={me.avatar} alt="" /> : <span>{initials(me?.username)}</span>}
          </span>
          <span className="settingsTopMain">
            <span className="settingsTopName">
              {me?.username}
              <ActivityBadge messageCount={me?.messageCount} t={t} />
            </span>
            <span className="settingsTopStatus">{statusLine}</span>
          </span>
          <span className="settingsTopChevron" aria-hidden>
            {chevron}
          </span>
        </button>

        <div className="settingsList">
          <div className="settingsSectionHeader">{t("profile")}</div>
          <div className="settingsSection">
            <SettingsRow label={t("myProfile")} onClick={() => setPanel("profile")} />
          </div>

          <div className="settingsSectionHeader">{t("language")}</div>
          <div className="settingsSection">
            <SettingsRow
              label={t("language")}
              right={currentLanguageLabel(settings?.lang, t)}
              onClick={() => setPanel("language")}
            />
          </div>

          <div className="settingsSectionHeader">{t("notifySettingsTitle")}</div>
          <div className="settingsSection">
            <SettingsRow label={t("notifyEnableLabel")} onClick={() => setPanel("notifications")} />
          </div>

          <div className="settingsSectionHeader">{t("chatBackground")}</div>
          <div className="settingsSection">
            <SettingsRow
              label={t("settingsCurrentBackground")}
              right={chatBackgroundDisplayLabel(t, settings)}
              onClick={() => setPanel("chatBackground")}
            />
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
            <SettingsRow label={t("settingsSupportAuthors")} onClick={() => setPanel("support")} />
          </div>

          <div className="settingsSectionHeader">{t("logout")}</div>
          <div className="settingsSection">
            <SettingsRow label={t("logout")} danger onClick={onLogout} />
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
              <div className="settingsModalList">
                {avatarError ? <div className="authError">{avatarError}</div> : null}
                <div className="settingsProfileHeader">
                  <AvatarAura auraColor={profileAuraColor}>
                    <div className="settingsProfileAvatar">
                      {avatarPreview || me?.avatar ? (
                        <img src={avatarPreview || me.avatar} alt="" />
                      ) : (
                        <span>{initials(me?.username)}</span>
                      )}
                    </div>
                  </AvatarAura>
                  <div className="settingsProfileMain">
                    <div className="settingsProfileName">{me?.username}</div>
                    <div className="settingsProfileStatus muted small">{statusLine}</div>
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
                <div className="settingsSection settingsSection--padded">
                  <div className="muted small">{t("notifyEnableHint")}</div>
                </div>
                <div className="settingsSection">
                  <SettingsChoiceRow
                    label={t("notifyEnableButton")}
                    selected={!!settings?.messageNotificationsEnabled}
                    onClick={() => onChangeSettings?.({ messageNotificationsEnabled: true })}
                  />
                  <SettingsChoiceRow
                    label={t("notifyDisableButton")}
                    selected={!settings?.messageNotificationsEnabled}
                    onClick={() => onChangeSettings?.({ messageNotificationsEnabled: false })}
                  />
                </div>
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
                            <div className="adminUserName">{u.username}</div>
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

      {open ? (
        <div className="dropdown" role="menu">
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
              <div className="profilePanel">
                <AvatarAura auraColor={profileAuraColor}>
                  <div className="profileAvatar">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="" />
                    ) : (
                      <span>{initials(me.username)}</span>
                    )}
                  </div>
                </AvatarAura>

                <div className="profileInfo">
                  <div className="profileLabel">{t("username")}</div>
                  <div className="profileValue">
                    {me.username}
                    <ActivityBadge messageCount={me?.messageCount} t={t} />
                  </div>
                  <div className="profileHint muted small">
                    {me?.isOnline ? t("online") : me?.lastSeenAt ? t("lastSeenAt").replace("{time}", formatLastSeen(me.lastSeenAt, settings?.lang)) : t("lastSeen")}
                  </div>
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
                          <div className="adminUserName">{u.username}</div>
                          <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                          <div className={u.is_online ? "presenceDot online" : "presenceDot"} />
                        </div>
                        <div className="adminUserMeta muted small">
                          {t("adminRoleLabel")}: {u.role} · {u.banned ? t("adminStatusBanned") : t("adminStatusActive")}
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("fileRead"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function Modal({ title, children, onClose, t, cardClassName = "" }) {
  return (
    <div className="modalBackdrop modalBackdrop--app" role="dialog" aria-modal="true">
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

