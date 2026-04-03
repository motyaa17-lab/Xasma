import React, { useEffect, useRef, useState } from "react";
import { adminListUsers, adminSetUserBanned, adminSetUserRole } from "../api.js";

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
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");

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
    setProfileSaveError("");
  }, [panel, me?.statusKind, me?.statusText, me?.about]);

  async function saveProfile() {
    if (!onChangeProfile) return;
    setProfileSaving(true);
    setProfileSaveError("");
    try {
      await onChangeProfile({
        statusKind: profileStatusKind,
        statusText: profileStatusKind === "custom" ? profileStatusText : "",
        about: profileAbout,
      });
    } catch (e) {
      setProfileSaveError(e.message || "Failed");
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
    } catch (e) {
      setAdminError(e.message || "Request failed");
    } finally {
      setAdminLoading(false);
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
      setAvatarError(e.message || "Failed to update avatar");
    } finally {
      setAvatarBusy(false);
    }
  }

  const modalCardClass = variant === "mobilePage" ? "modalCard--mobileFriendly" : "";

  if (variant === "mobilePage") {
    return (
      <div className="userMenu userMenu--mobilePage" ref={rootRef}>
        <div className="userMenuMobileHero">
          <div className="userMenuMobileAvatar">
            {me?.avatar ? <img src={me.avatar} alt="" /> : <span>{initials(me?.username)}</span>}
          </div>
          <div className="userMenuMobileName">{me?.username}</div>
          <div className="userMenuMobileMeta muted small">
            {me?.isOnline ? t("online") : me?.lastSeenAt ? t("lastSeen") : ""}
          </div>
        </div>
        <div className="userMenuMobileList" role="menu">
          <button
            type="button"
            className="userMenuMobileItem"
            role="menuitem"
            onClick={() => setPanel("settings")}
          >
            {t("settings")}
          </button>
          {me?.role === "admin" ? (
            <button
              type="button"
              className="userMenuMobileItem"
              role="menuitem"
              onClick={() => {
                setPanel("admin");
                loadAdminUsers();
              }}
            >
              Admin
            </button>
          ) : null}
          <button type="button" className="userMenuMobileItem userMenuMobileItem--danger" role="menuitem" onClick={onLogout}>
            {t("logout")}
          </button>
        </div>

        {panel ? (
          <Modal
            title={
              panel === "profile" ? t("myProfile") : panel === "settings" ? t("settings") : "Admin"
            }
            onClose={() => setPanel(null)}
            t={t}
            cardClassName={modalCardClass}
          >
            {/* same panel bodies as below — duplicate structure minimal by extracting */}
            {panel === "profile" ? (
              <div>
                {avatarError ? <div className="authError">{avatarError}</div> : null}
                <div className="profilePanel">
                  <div className="profileAvatar">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="" />
                    ) : (
                      <span>{initials(me.username)}</span>
                    )}
                  </div>

                  <div className="profileInfo">
                    <div className="profileLabel">{t("username")}</div>
                    <div className="profileValue">{me.username}</div>
                    <div className="profileHint muted small">
                      {me?.isOnline
                        ? t("online")
                        : me?.lastSeenAt
                          ? t("lastSeenAt").replace("{time}", formatLastSeen(me.lastSeenAt, settings?.lang))
                          : t("lastSeen")}
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
                        .catch((e) => setAvatarError(e.message || "Failed to update avatar"))
                        .finally(() => setAvatarBusy(false));
                    }}
                    disabled={avatarBusy}
                  >
                    {t("remove")}
                  </button>
                  <div className="muted small profileLimitHint">{t("maxAvatarHint")}</div>
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
                      onChange={(e) => setProfileStatusText(e.target.value)}
                      placeholder={t("statusCustom")}
                      maxLength={140}
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
                  <button type="button" className="userMenuMobileItem" onClick={() => setPanel("profile")}>
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
                      English
                    </button>
                    <button
                      type="button"
                      className={settings?.lang === "ru" ? "pillBtn active" : "pillBtn"}
                      onClick={() => onChangeSettings?.({ lang: "ru" })}
                    >
                      Русский
                    </button>
                  </div>
                </div>

                <MessageNotificationsSettings settings={settings} onChangeSettings={onChangeSettings} t={t} />

                <div className="settingsSection">
                  <div className="settingsTitle">{t("chatBackground")}</div>
                  <div className="themeGrid">
                    {[
                      { id: "ocean", label: t("ocean") },
                      { id: "midnight", label: t("midnight") },
                      { id: "slate", label: t("slate") },
                    ].map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        className={settings?.chatTheme === theme.id ? "themeCard active" : "themeCard"}
                        onClick={() => onChangeSettings?.({ chatTheme: theme.id })}
                        title={theme.label}
                      >
                        <div className={`themePreview theme-${theme.id}`} />
                        <div className="themeLabel">{theme.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="adminPanel">
                {adminError ? <div className="authError">{adminError}</div> : null}
                {adminNotice ? <div className="muted">{adminNotice}</div> : null}
                <div className="adminTopRow">
                  <button className="ghostBtn" type="button" onClick={loadAdminUsers} disabled={adminLoading}>
                    Refresh
                  </button>
                </div>

                {adminLoading ? (
                  <div className="muted">Loading...</div>
                ) : (
                  <div className="adminUserList">
                    {adminUsers.map((u) => (
                      <div key={u.id} className="adminUserRow">
                        <div className="adminUserMain">
                          <div className="adminUserNameRow">
                            <div className="adminUserName">{u.username}</div>
                            <div className={u.is_online ? "presenceDot online" : "presenceDot"} />
                          </div>
                          <div className="adminUserMeta muted small">
                            role: {u.role} · {u.banned ? "banned" : "active"}
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
                                  u.id === me.id
                                    ? "Role updated."
                                    : "Role updated. The user may need to relogin to refresh permissions."
                                );
                              } catch (e) {
                                setAdminError(e.message || "Request failed");
                                loadAdminUsers();
                              }
                            }}
                          >
                            {u.role === "admin" ? "Remove admin" : "Make admin"}
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
                                setAdminNotice(next ? "User banned." : "User unbanned.");
                              } catch (e) {
                                setAdminError(e.message || "Request failed");
                                loadAdminUsers();
                              }
                            }}
                          >
                            {u.banned ? "Unban" : "Ban"}
                          </button>
                        </div>
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
              }}
            >
              Admin
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
            panel === "profile" ? t("myProfile") : panel === "settings" ? t("settings") : "Admin"
          }
          onClose={() => setPanel(null)}
          t={t}
        >
          {panel === "profile" ? (
            <div>
              {avatarError ? <div className="authError">{avatarError}</div> : null}
              <div className="profilePanel">
                <div className="profileAvatar">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" />
                  ) : (
                    <span>{initials(me.username)}</span>
                  )}
                </div>

                <div className="profileInfo">
                  <div className="profileLabel">{t("username")}</div>
                  <div className="profileValue">{me.username}</div>
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
                      .catch((e) => setAvatarError(e.message || "Failed to update avatar"))
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
                    onChange={(e) => setProfileStatusText(e.target.value)}
                    placeholder={t("statusCustom")}
                    maxLength={140}
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
                    English
                  </button>
                  <button
                    type="button"
                    className={settings?.lang === "ru" ? "pillBtn active" : "pillBtn"}
                    onClick={() => onChangeSettings?.({ lang: "ru" })}
                  >
                    Русский
                  </button>
                </div>
              </div>

              <MessageNotificationsSettings settings={settings} onChangeSettings={onChangeSettings} t={t} />

              <div className="settingsSection">
                <div className="settingsTitle">{t("chatBackground")}</div>
                <div className="themeGrid">
                  {[
                    { id: "ocean", label: t("ocean") },
                    { id: "midnight", label: t("midnight") },
                    { id: "slate", label: t("slate") },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={
                        settings?.chatTheme === theme.id ? "themeCard active" : "themeCard"
                      }
                      onClick={() => onChangeSettings?.({ chatTheme: theme.id })}
                      title={theme.label}
                    >
                      <div className={`themePreview theme-${theme.id}`} />
                      <div className="themeLabel">{theme.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="adminPanel">
              {adminError ? <div className="authError">{adminError}</div> : null}
              {adminNotice ? <div className="muted">{adminNotice}</div> : null}
              <div className="adminTopRow">
                <button className="ghostBtn" type="button" onClick={loadAdminUsers} disabled={adminLoading}>
                  Refresh
                </button>
              </div>

              {adminLoading ? (
                <div className="muted">Loading...</div>
              ) : (
                <div className="adminUserList">
                  {adminUsers.map((u) => (
                    <div key={u.id} className="adminUserRow">
                      <div className="adminUserMain">
                        <div className="adminUserNameRow">
                          <div className="adminUserName">{u.username}</div>
                          <div className={u.is_online ? "presenceDot online" : "presenceDot"} />
                        </div>
                        <div className="adminUserMeta muted small">
                          role: {u.role} · {u.banned ? "banned" : "active"}
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
                                u.id === me.id
                                  ? "Role updated."
                                  : "Role updated. The user may need to relogin to refresh permissions."
                              );
                            } catch (e) {
                              setAdminError(e.message || "Request failed");
                              loadAdminUsers();
                            }
                          }}
                        >
                          {u.role === "admin" ? "Remove admin" : "Make admin"}
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
                              setAdminNotice(next ? "User banned." : "User unbanned.");
                            } catch (e) {
                              setAdminError(e.message || "Request failed");
                              loadAdminUsers();
                            }
                          }}
                        >
                          {u.banned ? "Unban" : "Ban"}
                        </button>
                      </div>
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
    reader.onerror = () => reject(new Error("Failed to read file"));
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
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

