import React, { useEffect, useRef, useState } from "react";
import { localeForLang } from "../i18n.js";
import { addGroupMember, getGroup, patchGroupAvatar, removeGroupMember, searchUsers } from "../api.js";
import ActivityBadge from "./ActivityBadge.jsx";
import UserTagBadge from "./UserTagBadge.jsx";

export default function GroupInfoModal({
  open,
  onClose,
  chatId,
  chatTitle,
  listGroupAvatar,
  isChannel: isChannelFromList,
  onMetaChanged,
  presenceTick,
  t,
  lang,
}) {
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [avatarDraft, setAvatarDraft] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setAddQuery("");
      setActionError("");
      setAddResults([]);
      setAvatarDraft(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !chatId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getGroup(chatId);
        if (cancelled) return;
        setGroup(data.group);
        setMembers(data.members || []);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || t("groupLoadError"));
        setGroup(null);
        setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chatId, presenceTick, t]);

  useEffect(() => {
    if (!open || !group?.canManage) return;
    const q = addQuery.trim();
    if (q.length < 1) {
      setAddResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setAddSearching(true);
      try {
        const users = await searchUsers(q);
        const memberIds = new Set(members.map((m) => m.id));
        setAddResults(users.filter((u) => !memberIds.has(u.id)));
      } catch {
        setAddResults([]);
      } finally {
        setAddSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [addQuery, open, group?.canManage, members]);

  async function handleAdd(userId) {
    setActionError("");
    setBusyId(userId);
    try {
      await addGroupMember(chatId, userId);
      const data = await getGroup(chatId);
      setGroup(data.group);
      setMembers(data.members || []);
      setAddQuery("");
      setAddResults([]);
      onMetaChanged?.();
    } catch (e) {
      setActionError(e.message || t("errorGeneric"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(userId) {
    const ok = window.confirm(t("groupRemoveMemberConfirm"));
    if (!ok) return;
    setActionError("");
    setBusyId(userId);
    try {
      await removeGroupMember(chatId, userId);
      const data = await getGroup(chatId);
      setGroup(data.group);
      setMembers(data.members || []);
      onMetaChanged?.();
    } catch (e) {
      setActionError(e.message || t("errorGeneric"));
    } finally {
      setBusyId(null);
    }
  }

  function onPickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setActionError(t("groupAvatarChooseImage"));
      return;
    }
    if (file.size > 380 * 1024) {
      setActionError(t("groupAvatarFileTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl.startsWith("data:image/")) {
        setAvatarDraft(dataUrl);
        setActionError("");
      }
    };
    reader.readAsDataURL(file);
  }

  async function applyAvatar(dataUrl) {
    setActionError("");
    setAvatarBusy(true);
    try {
      const g = await patchGroupAvatar(chatId, dataUrl);
      setGroup((prev) => ({ ...(prev || {}), ...g }));
      setAvatarDraft(null);
      onMetaChanged?.();
    } catch (e) {
      setActionError(e.message || t("errorGeneric"));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function clearGroupAvatar() {
    setActionError("");
    setAvatarBusy(true);
    try {
      const g = await patchGroupAvatar(chatId, "");
      setGroup((prev) => ({ ...(prev || {}), ...g }));
      setAvatarDraft(null);
      onMetaChanged?.();
    } catch (e) {
      setActionError(e.message || t("errorGeneric"));
    } finally {
      setAvatarBusy(false);
    }
  }

  if (!open) return null;

  const isChannelRoom = Boolean(isChannelFromList ?? group?.channel);
  const title = group?.title || chatTitle || (isChannelRoom ? t("channelInfoTitle") : t("groupChat"));
  const count = group?.memberCount ?? members.length;
  const canManage = Boolean(group?.canManage);
  const displayAvatar = avatarDraft || listGroupAvatar || group?.avatar || "";
  const hasStoredAvatar = Boolean(!avatarDraft && (listGroupAvatar || group?.avatar));

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <div
        className="modalCard groupInfoModal modalCard--mobileFriendly"
        role="dialog"
        aria-labelledby="groupInfoHeading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitle" id="groupInfoHeading">
            {isChannelRoom ? t("channelInfoTitle") : t("groupInfoTitle")}
          </div>
          <button type="button" className="iconCloseBtn" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="modalBody groupInfoBody">
          {loading ? (
            <div className="muted">{t("groupLoading")}</div>
          ) : error ? (
            <div className="authError">{error}</div>
          ) : (
            <>
              <div className="groupInfoHead groupInfoHeadWithAvatar">
                <div className="groupInfoAvatarBlock">
                  <div className="groupInfoAvatarLg">
                    {displayAvatar ? <img src={displayAvatar} alt="" /> : <span>{initials(title)}</span>}
                  </div>
                  {canManage ? (
                    <div className="groupAvatarActions">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="fileInput"
                        onChange={onPickAvatar}
                      />
                      <button
                        type="button"
                        className="ghostBtn"
                        disabled={avatarBusy}
                        onClick={() => fileRef.current?.click()}
                      >
                        {t("groupChangeAvatar")}
                      </button>
                      {avatarDraft ? (
                        <>
                          <button
                            type="button"
                            className="primaryBtn"
                            disabled={avatarBusy}
                            onClick={() => applyAvatar(avatarDraft)}
                          >
                            {avatarBusy ? t("saving") : t("groupAvatarApply")}
                          </button>
                          <button
                            type="button"
                            className="ghostBtn"
                            disabled={avatarBusy}
                            onClick={() => setAvatarDraft(null)}
                          >
                            {t("groupAvatarCancelPick")}
                          </button>
                        </>
                      ) : null}
                      {hasStoredAvatar && !avatarDraft ? (
                        <button type="button" className="ghostBtn" disabled={avatarBusy} onClick={clearGroupAvatar}>
                          {t("remove")}
                        </button>
                      ) : null}
                      <div className="muted small groupAvatarHint">{t("groupAvatarHint")}</div>
                    </div>
                  ) : null}
                </div>
                <div className="groupInfoTitleRow">{title}</div>
                <div className="muted small">{t("groupParticipantCount").replace("{count}", String(count))}</div>
              </div>

              <div className="groupInfoSectionLabel">{t("groupMembers")}</div>
              <div className="groupMemberList">
                {members.length === 0 ? (
                  <div className="muted">{t("groupNoMembers")}</div>
                ) : (
                  members.map((m) => (
                    <div key={m.id} className="groupMemberRow">
                      <div className={m.isOnline ? "avatarSm presence online" : "avatarSm presence"}>
                        {m.avatar ? <img src={m.avatar} alt="" /> : <span>{initials(m.username)}</span>}
                      </div>
                      <div className="groupMemberMain">
                        <div className="groupMemberNameRow">
                          <span className="groupMemberName">
                            {m.username}
                            <UserTagBadge tag={m.tag} tagColor={m.tagColor} tagStyle={m.tagStyle} />
                            <ActivityBadge messageCount={m.messageCount} t={t} />
                          </span>
                          {m.isCreator ? <span className="creatorBadge">{t("groupCreator")}</span> : null}
                        </div>
                        <div className="muted small">{memberPresenceLine(m, t, lang)}</div>
                      </div>
                      {canManage && !m.isCreator ? (
                        <button
                          type="button"
                          className="ghostBtn dangerGhost"
                          disabled={busyId === m.id}
                          onClick={() => handleRemove(m.id)}
                        >
                          {t("groupRemoveMember")}
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              {canManage ? (
                <div className="groupAddBlock">
                  <div className="groupInfoSectionLabel">{t("groupAddMember")}</div>
                  <input
                    className="searchInput"
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder={t("groupSearchToAdd")}
                  />
                  {addSearching ? <div className="muted small">{t("searching")}</div> : null}
                  {addResults.length > 0 ? (
                    <div className="searchResults groupInfoSearchResults">
                      {addResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="searchResult"
                          disabled={busyId === u.id}
                          onClick={() => handleAdd(u.id)}
                        >
                          <div className="avatarSm">
                            {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                          </div>
                          <div className="searchUser">
                            {u.username}
                            <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {actionError ? <div className="authError">{actionError}</div> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function memberPresenceLine(m, t, lang) {
  if (m.isOnline) return t("online");
  if (!m.lastSeenAt) return t("lastSeen");
  const d = new Date(m.lastSeenAt);
  const locale = localeForLang(lang);
  const s = Number.isNaN(d.getTime())
    ? String(m.lastSeenAt)
    : d.toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return t("lastSeenAt").replace("{time}", s);
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
