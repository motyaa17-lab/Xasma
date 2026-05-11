import React, { useEffect, useRef, useState } from "react";
import { localeForLang } from "../i18n.js";
import {
  addGroupMember,
  getGroup,
  patchGroupAvatar,
  patchGroupMeta,
  removeGroupMember,
  searchUsers,
} from "../api.js";
import ActivityBadge from "./ActivityBadge.jsx";
import UserTagBadge from "./UserTagBadge.jsx";
import { isPremiumActive } from "../premium.js";
import { avatarRingWrapClass, usernameDisplayClass } from "../userPersonalization.js";
import { formatAtUserHandle } from "../userHandleDisplay.js";
import { IconBell, IconEllipsis, IconPlus, IconSearch, IconSettings } from "./Icons.jsx";

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
  chatMuted = false,
  onToggleMute,
  onSearchInChat,
  onLeaveGroupChat,
}) {
  const fileRef = useRef(null);
  const addSectionRef = useRef(null);
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
  const [editMode, setEditMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tab, setTab] = useState("members");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setAddQuery("");
      setActionError("");
      setAddResults([]);
      setAvatarDraft(null);
      setEditMode(false);
      setMoreOpen(false);
      setTab("members");
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

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (moreOpen) setMoreOpen(false);
      else if (editMode) {
        setEditMode(false);
        setAvatarDraft(null);
        setActionError("");
      } else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, moreOpen, editMode, onClose]);

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

  function beginEdit() {
    const title = group?.title || chatTitle || "";
    setDraftTitle(String(title));
    setDraftDescription(String(group?.description ?? ""));
    setEditMode(true);
    setActionError("");
  }

  function cancelEdit() {
    setEditMode(false);
    setAvatarDraft(null);
    setActionError("");
  }

  async function saveEdit() {
    const nt = String(draftTitle || "").trim();
    if (!nt) {
      setActionError(t("groupErrorTitle"));
      return;
    }
    setSaveBusy(true);
    setActionError("");
    try {
      if (avatarDraft) {
        await applyAvatar(avatarDraft);
      }
      const g = await patchGroupMeta(chatId, {
        title: nt,
        description: String(draftDescription || "").trim(),
      });
      setGroup((prev) => ({ ...(prev || {}), ...g }));
      const data = await getGroup(chatId);
      setGroup(data.group);
      setMembers(data.members || []);
      onMetaChanged?.();
      setEditMode(false);
      setAvatarDraft(null);
    } catch (e) {
      setActionError(e.message || t("groupMetaSaveError"));
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleLeaveGroup() {
    if (typeof onLeaveGroupChat !== "function") return;
    const ok = window.confirm(t("groupLeaveConfirm"));
    if (!ok) return;
    setActionError("");
    try {
      await onLeaveGroupChat(chatId);
      onClose();
    } catch (e) {
      setActionError(e.message || t("errorGeneric"));
    }
  }

  if (!open) return null;

  const isChannelRoom = Boolean(isChannelFromList ?? group?.channel);
  const title = group?.title || chatTitle || (isChannelRoom ? t("channelInfoTitle") : t("groupChat"));
  const count = group?.memberCount ?? members.length;
  const canManage = Boolean(group?.canManage);
  const displayAvatar = avatarDraft || listGroupAvatar || group?.avatar || "";
  const hasStoredAvatar = Boolean(!avatarDraft && (listGroupAvatar || group?.avatar));
  const descriptionText = String(group?.description ?? "").trim();

  return (
    <div className="tgProfileScreen tgGroupScreen" role="dialog" aria-modal="true" aria-labelledby="groupProfileHeading">
      {!editMode ? (
        <>
          <div className="tgProfileTopbar tgGroupTopbar">
            <button type="button" className="tgProfileTopbarBtn" onClick={onClose} aria-label={t("back")}>
              ←
            </button>
            <div className="tgProfileTopbarTitle" id="groupProfileHeading">
              {isChannelRoom ? t("channelInfoTitle") : t("groupChat")}
            </div>
            <div className="tgGroupTopbarRight">
              {canManage ? (
                <>
                  <button
                    type="button"
                    className="tgGroupTopbarCircleBtn"
                    aria-label={t("groupAddMember")}
                    title={t("groupAddMember")}
                    onClick={() => addSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    <IconPlus size={20} />
                  </button>
                  <button type="button" className="tgGroupTopbarTextBtn" onClick={beginEdit}>
                    {t("editShort")}
                  </button>
                </>
              ) : (
                <span className="tgGroupTopbarSpacer" aria-hidden />
              )}
            </div>
          </div>

          <div className="tgProfileScroll">
            <div className="tgProfileHero tgProfileHero--ios tgGroupHero">
              <div className="tgProfileBgOverlay tgGroupHeroOverlay" aria-hidden />
              <div className="tgIosProfileHeader tgGroupProfileHeader">
                <div className="tgIosAvatar tgGroupHeroAvatar">
                  {displayAvatar ? <img src={displayAvatar} alt="" /> : <span>{initials(title)}</span>}
                </div>
                <div className="tgIosName tgGroupHeroTitle">{title}</div>
                <div className="tgIosSubtitle tgGroupHeroSub">{t("groupMembersSubtitle").replace("{count}", String(count))}</div>
              </div>
            </div>

            <div className="tgGroupActionsRow" role="group" aria-label={t("actions")}>
              <button
                type="button"
                className={`tgGroupActionPill${chatMuted ? " tgGroupActionPill--on" : ""}`}
                onClick={onToggleMute}
              >
                <span className="tgGroupActionPillIcon" aria-hidden>
                  <IconBell size={22} />
                </span>
                <span className="tgGroupActionPillLabel">{t("groupSoundAction")}</span>
              </button>
              <button type="button" className="tgGroupActionPill" onClick={() => onSearchInChat?.()}>
                <span className="tgGroupActionPillIcon" aria-hidden>
                  <IconSearch size={22} />
                </span>
                <span className="tgGroupActionPillLabel">{t("search")}</span>
              </button>
              <button type="button" className="tgGroupActionPill" onClick={() => setMoreOpen(true)}>
                <span className="tgGroupActionPillIcon" aria-hidden>
                  <IconEllipsis size={22} />
                </span>
                <span className="tgGroupActionPillLabel">{t("groupMore")}</span>
              </button>
            </div>

            {loading ? (
              <div className="tgGroupCard tgGroupCard--pad muted">{t("groupLoading")}</div>
            ) : error ? (
              <div className="tgGroupCard tgGroupCard--pad authError">{error}</div>
            ) : (
              <>
                {(descriptionText || canManage) && (
                  <div className="tgGroupCard tgGroupCard--pad">
                    <div className="tgGroupFieldLabel">{t("groupDescriptionLabel")}</div>
                    <div className="tgGroupDescriptionBody">
                      {descriptionText || (canManage ? "—" : "")}
                    </div>
                  </div>
                )}

                {canManage ? (
                  <button type="button" className="tgGroupCard tgGroupSettingsRow" onClick={() => addSectionRef.current?.scrollIntoView({ behavior: "smooth" })}>
                    <span className="tgGroupSettingsIcon tgGroupSettingsIcon--orange" aria-hidden>
                      <IconSettings size={18} />
                    </span>
                    <span className="tgGroupSettingsLabel">{t("groupSettingsRow")}</span>
                    <span className="tgGroupChevron" aria-hidden>
                      ›
                    </span>
                  </button>
                ) : null}

                <div className="tgGroupTabs" role="tablist" aria-label={t("groupMembers")}>
                  {[
                    { id: "members", label: t("groupMembers") },
                    { id: "media", label: t("groupTabMedia") },
                    { id: "files", label: t("groupTabFiles") },
                    { id: "music", label: t("groupTabMusic") },
                  ].map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === x.id}
                      className={`tgGroupTab${tab === x.id ? " tgGroupTab--active" : ""}`}
                      onClick={() => setTab(x.id)}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>

                {tab === "members" ? (
                  <div className="tgGroupCard tgGroupMemberCard">
                    {members.length === 0 ? (
                      <div className="tgGroupMemberRow tgGroupMemberRow--solo muted">{t("groupNoMembers")}</div>
                    ) : (
                      members.map((m, idx) => (
                        <div
                          key={m.id}
                          className={`tgGroupMemberRow${idx < members.length - 1 ? " tgGroupMemberRow--divider" : ""}`}
                        >
                          {(() => {
                            const ringC = avatarRingWrapClass(isPremiumActive(m) ? m.avatarRing : "");
                            const inner = (
                              <div className={m.isOnline ? "avatarSm presence online tgGroupMemberAvatar" : "avatarSm presence tgGroupMemberAvatar"}>
                                {m.avatar ? <img src={m.avatar} alt="" /> : <span>{initials(m.username)}</span>}
                              </div>
                            );
                            return ringC ? <span className={ringC}>{inner}</span> : inner;
                          })()}
                          <div className="tgGroupMemberMid">
                            <div className="tgGroupMemberTitleLine">
                              <span className={["tgGroupMemberName", usernameDisplayClass(m)].filter(Boolean).join(" ")}>
                                {m.username}
                              </span>
                              <ActivityBadge messageCount={m.messageCount} t={t} />
                              {m.isCreator ? <span className="tgGroupCreatorMark">{t("groupCreator")}</span> : null}
                            </div>
                            {m.userHandle ? (
                              <div className="tgGroupMemberHandle muted">{formatAtUserHandle(m.userHandle)}</div>
                            ) : null}
                            <div className={`tgGroupPresence${m.isOnline ? " tgGroupPresence--online" : ""}`}>
                              {memberPresenceLine(m, t, lang)}
                            </div>
                          </div>
                          <div className="tgGroupMemberTrail">
                            <UserTagBadge tag={m.tag} tagColor={m.tagColor} tagStyle={m.tagStyle} />
                            {canManage && !m.isCreator ? (
                              <button
                                type="button"
                                className="tgGroupMemberRemove"
                                disabled={busyId === m.id}
                                onClick={() => handleRemove(m.id)}
                              >
                                {t("groupRemoveMember")}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="tgGroupCard tgGroupCard--pad muted">{t("groupTabEmpty")}</div>
                )}

                {canManage ? (
                  <div className="tgGroupAddSection" ref={addSectionRef}>
                    <div className="tgGroupSectionHeading">{t("groupAddMember")}</div>
                    <div className="tgGroupCard tgGroupCard--pad">
                      <input
                        className="tgGroupSearchInput"
                        value={addQuery}
                        onChange={(e) => setAddQuery(e.target.value)}
                        placeholder={t("groupSearchToAdd")}
                      />
                      {addSearching ? <div className="muted small">{t("searching")}</div> : null}
                      {addResults.length > 0 ? (
                        <div className="tgGroupSearchResults">
                          {addResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              className="tgGroupSearchHit"
                              disabled={busyId === u.id}
                              onClick={() => handleAdd(u.id)}
                            >
                              {(() => {
                                const ringC = avatarRingWrapClass(isPremiumActive(u) ? u.avatarRing : "");
                                const inner = (
                                  <div className="avatarSm">
                                    {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                                  </div>
                                );
                                return ringC ? <span className={ringC}>{inner}</span> : inner;
                              })()}
                              <div className="tgGroupSearchHitText">
                                <div className="tgGroupSearchHitName">
                                  <span className={usernameDisplayClass(u) || undefined}>{u.username}</span>
                                  <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                                </div>
                                {u.userHandle ? (
                                  <div className="muted small">{formatAtUserHandle(u.userHandle)}</div>
                                ) : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="muted small tgGroupAvatarHint">{t("groupAvatarHint")}</div>
                  </div>
                ) : null}

                {actionError ? <div className="tgGroupCard tgGroupCard--pad authError">{actionError}</div> : null}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="tgGroupEditNav">
            <button type="button" className="tgIosNavPill" onClick={cancelEdit} disabled={saveBusy || avatarBusy}>
              {t("cancel")}
            </button>
            <button type="button" className="tgIosNavPill tgIosNavPill--primary" onClick={saveEdit} disabled={saveBusy || avatarBusy}>
              {saveBusy ? t("saving") : t("groupDone")}
            </button>
          </div>
          <div className="tgProfileScroll">
            <div className="tgGroupEditHero">
              <div className="tgIosAvatar tgGroupHeroAvatar">
                {displayAvatar ? <img src={displayAvatar} alt="" /> : <span>{initials(draftTitle || title)}</span>}
              </div>
              {canManage ? (
                <>
                  <input ref={fileRef} type="file" accept="image/*" className="fileInput" onChange={onPickAvatar} />
                  <button type="button" className="tgGroupSelectPhotoLink" onClick={() => fileRef.current?.click()}>
                    {t("groupSelectPhoto")}
                  </button>
                  {avatarDraft ? (
                    <div className="tgGroupEditAvatarActions">
                      <button type="button" className="tgIosNavPill tgIosNavPill--primary" disabled={avatarBusy} onClick={() => applyAvatar(avatarDraft)}>
                        {avatarBusy ? t("saving") : t("groupAvatarApply")}
                      </button>
                      <button type="button" className="tgIosNavPill" disabled={avatarBusy} onClick={() => setAvatarDraft(null)}>
                        {t("groupAvatarCancelPick")}
                      </button>
                    </div>
                  ) : null}
                  {hasStoredAvatar && !avatarDraft ? (
                    <button type="button" className="tgGroupSelectPhotoLink tgGroupSelectPhotoLink--muted" disabled={avatarBusy} onClick={clearGroupAvatar}>
                      {t("remove")}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="tgGroupCard tgGroupEditFields">
              <textarea
                className="tgGroupEditTextarea tgGroupEditTextarea--title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                rows={2}
                aria-label={t("groupTitleLabel")}
              />
              <div className="tgGroupEditSep" />
              <textarea
                className="tgGroupEditTextarea tgGroupEditTextarea--desc"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={4}
                placeholder={t("groupDescriptionLabel")}
                aria-label={t("groupDescriptionLabel")}
              />
            </div>
            {actionError ? <div className="tgGroupCard tgGroupCard--pad authError">{actionError}</div> : null}
          </div>
        </>
      )}

      {moreOpen ? (
        <div className="tgSheetBackdrop" role="presentation" onClick={() => setMoreOpen(false)}>
          <div className="tgSheet tgGroupMoreSheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="tgSheetItem"
              onClick={() => {
                setMoreOpen(false);
                onToggleMute?.();
              }}
            >
              {chatMuted ? t("unmuteChat") : t("muteChat")}
            </button>
            <button
              type="button"
              className="tgSheetItem"
              onClick={() => {
                setMoreOpen(false);
                onSearchInChat?.();
              }}
            >
              {t("searchInChat")}
            </button>
            {typeof onLeaveGroupChat === "function" ? (
              <button
                type="button"
                className="tgSheetItem tgSheetItem--danger"
                onClick={() => {
                  setMoreOpen(false);
                  void handleLeaveGroup();
                }}
              >
                {t("groupLeaveGroup")}
              </button>
            ) : null}
            <button type="button" className="tgSheetCancel" onClick={() => setMoreOpen(false)}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}
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
