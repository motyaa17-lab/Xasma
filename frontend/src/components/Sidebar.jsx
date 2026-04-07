import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import AvatarAura from "./AvatarAura.jsx";
import MobileChatRowSwipe, { MOBILE_CHAT_SWIPE_ENABLED } from "./MobileChatRowSwipe.jsx";
import { localeForLang } from "../i18n.js";
import { formatUserStatusLine } from "../userStatusLine.js";
import ActivityBadge from "./ActivityBadge.jsx";
import UserTagBadge from "./UserTagBadge.jsx";

const Sidebar = forwardRef(function Sidebar(
  {
    chats,
    me,
    onSelectChat,
    onStartChat,
    onCreateGroup,
    onCreateChannel,
    onChatListPinToggle,
    onChatDelete,
    t,
    lang,
    mobileLayout = false,
  },
  ref
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [groupResults, setGroupResults] = useState([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupError, setGroupError] = useState("");
  const [groupSubmitting, setGroupSubmitting] = useState(false);

  const channelFileRef = useRef(null);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelTitle, setChannelTitle] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [channelResults, setChannelResults] = useState([]);
  const [channelSearching, setChannelSearching] = useState(false);
  const [channelSelectedMembers, setChannelSelectedMembers] = useState([]);
  const [channelError, setChannelError] = useState("");
  const [channelSubmitting, setChannelSubmitting] = useState(false);
  const [channelAvatarDraft, setChannelAvatarDraft] = useState(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [swipeOpenId, setSwipeOpenId] = useState(null);
  const [swipeScrollNonce, setSwipeScrollNonce] = useState(0);
  const chatListScrollCloseRaf = useRef(null);

  const handleSwipePhase = useCallback((id, phase) => {
    if (phase === "lock") setSwipeOpenId(id);
    if (phase === "end") setSwipeOpenId(null);
  }, []);

  const onMobileChatListScroll = useCallback(() => {
    if (!MOBILE_CHAT_SWIPE_ENABLED) return;
    if (chatListScrollCloseRaf.current != null) return;
    chatListScrollCloseRaf.current = requestAnimationFrame(() => {
      chatListScrollCloseRaf.current = null;
      setSwipeOpenId(null);
      setSwipeScrollNonce((n) => n + 1);
    });
  }, []);

  const canSearch = useMemo(() => query.trim().length >= 1, [query]);
  const canGroupSearch = useMemo(() => groupQuery.trim().length >= 1, [groupQuery]);
  const canChannelSearch = useMemo(() => channelQuery.trim().length >= 1, [channelQuery]);

  const mobileFilteredChats = useMemo(() => {
    if (!mobileLayout) return chats;
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const isGroup = c.type === "group";
      const isChannel = c.type === "channel";
      const isOfficial = c.type === "official";
      const label =
        (isGroup || isChannel
          ? c.title
          : isOfficial
            ? c.title || c.other?.username
            : c.other?.username) || "";
      return label.toLowerCase().includes(q);
    });
  }, [chats, query, mobileLayout]);

  useImperativeHandle(
    ref,
    () => ({
      openCreateGroup: () => {
        if (onCreateGroup) setShowGroupModal(true);
      },
      openCreateChannel: () => {
        if (onCreateChannel) setShowChannelModal(true);
      },
    }),
    [onCreateGroup, onCreateChannel]
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.log("[Xasma] Sidebar", { mobileLayout, chatCount: chats?.length ?? 0 });
  }, [mobileLayout, chats?.length]);

  useEffect(() => {
    let timer = null;
    async function run() {
      if (!canSearch) {
        setResults([]);
        setSearchError("");
        return;
      }
      setSearching(true);
      setSearchError("");
      try {
        const mod = await import("../api.js");
        const users = await mod.searchUsers(query.trim());
        setResults(users);
      } catch (e) {
        setSearchError(e.message || t("searchFailed"));
      } finally {
        setSearching(false);
      }
    }

    timer = setTimeout(run, 250);
    return () => clearTimeout(timer);
  }, [query, canSearch]);

  useEffect(() => {
    let timer = null;
    async function run() {
      if (!canGroupSearch) {
        setGroupResults([]);
        return;
      }
      setGroupSearching(true);
      try {
        const mod = await import("../api.js");
        const users = await mod.searchUsers(groupQuery.trim());
        setGroupResults(users);
      } catch {
        setGroupResults([]);
      } finally {
        setGroupSearching(false);
      }
    }
    timer = setTimeout(run, 250);
    return () => clearTimeout(timer);
  }, [groupQuery, canGroupSearch]);

  useEffect(() => {
    let timer = null;
    async function run() {
      if (!canChannelSearch) {
        setChannelResults([]);
        return;
      }
      setChannelSearching(true);
      try {
        const mod = await import("../api.js");
        const users = await mod.searchUsers(channelQuery.trim());
        setChannelResults(users);
      } catch {
        setChannelResults([]);
      } finally {
        setChannelSearching(false);
      }
    }
    timer = setTimeout(run, 250);
    return () => clearTimeout(timer);
  }, [channelQuery, canChannelSearch]);

  function toggleMember(user) {
    setSelectedMembers((prev) => {
      const exists = prev.find((x) => x.id === user.id);
      if (exists) return prev.filter((x) => x.id !== user.id);
      return [...prev, user];
    });
  }

  function memberSelected(id) {
    return selectedMembers.some((x) => x.id === id);
  }

  function toggleChannelMember(user) {
    setChannelSelectedMembers((prev) => {
      const exists = prev.find((x) => x.id === user.id);
      if (exists) return prev.filter((x) => x.id !== user.id);
      return [...prev, user];
    });
  }

  function channelMemberSelected(id) {
    return channelSelectedMembers.some((x) => x.id === id);
  }

  function onPickChannelAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setChannelError(t("groupAvatarChooseImage"));
      return;
    }
    if (file.size > 380 * 1024) {
      setChannelError(t("groupAvatarFileTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl.startsWith("data:image/")) {
        setChannelAvatarDraft(dataUrl);
        setChannelError("");
      }
    };
    reader.readAsDataURL(file);
  }

  async function submitChannel() {
    setChannelError("");
    const title = channelTitle.trim();
    if (!title) {
      setChannelError(t("channelErrorTitle"));
      return;
    }
    if (!onCreateChannel) return;
    setChannelSubmitting(true);
    try {
      await onCreateChannel({
        title,
        avatar: channelAvatarDraft || undefined,
        memberUserIds: channelSelectedMembers.map((u) => u.id),
      });
      setShowChannelModal(false);
      setChannelTitle("");
      setChannelQuery("");
      setChannelResults([]);
      setChannelSelectedMembers([]);
      setChannelAvatarDraft(null);
    } catch (e) {
      setChannelError(e.message || t("errorGeneric"));
    } finally {
      setChannelSubmitting(false);
    }
  }

  async function submitGroup() {
    setGroupError("");
    const title = groupTitle.trim();
    if (!title) {
      setGroupError(t("groupErrorTitle"));
      return;
    }
    if (selectedMembers.length < 1) {
      setGroupError(t("groupErrorMembers"));
      return;
    }
    if (!onCreateGroup) return;
    setGroupSubmitting(true);
    try {
      await onCreateGroup({
        title,
        memberUserIds: selectedMembers.map((u) => u.id),
      });
      setShowGroupModal(false);
      setGroupTitle("");
      setGroupQuery("");
      setGroupResults([]);
      setSelectedMembers([]);
    } catch (e) {
      setGroupError(e.message || t("errorGeneric"));
    } finally {
      setGroupSubmitting(false);
    }
  }

  const groupModal =
    showGroupModal ? (
      <div className="modalBackdrop" role="presentation" onClick={() => !groupSubmitting && setShowGroupModal(false)}>
        <div
          className="modalCard groupModalCard modalCard--mobileFriendly"
          role="dialog"
          aria-labelledby="groupModalTitle"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modalHeader">
            <div className="modalTitle" id="groupModalTitle">
              {t("createGroup")}
            </div>
            <button
              type="button"
              className="iconCloseBtn"
              onClick={() => !groupSubmitting && setShowGroupModal(false)}
              aria-label={t("close")}
            >
              ×
            </button>
          </div>
          <div className="modalBody groupModalBody">
            <label className="groupFieldLabel">{t("groupTitleLabel")}</label>
            <input
              className="searchInput"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder={t("groupTitleLabel")}
            />
            <div className="muted small groupHint">{t("groupPickMembers")}</div>
            <input
              className="searchInput"
              value={groupQuery}
              onChange={(e) => setGroupQuery(e.target.value)}
              placeholder={t("searchUsernamePlaceholder")}
            />
            {groupSearching ? <div className="muted small">{t("searching")}</div> : null}

            {groupResults.length > 0 ? (
              <div className="searchResults groupSearchResults">
                {groupResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={memberSelected(u.id) ? "searchResult selectedPick" : "searchResult"}
                    onClick={() => toggleMember(u)}
                  >
                    <AvatarAura auraColor={u.auraColor}>
                      <div className="avatarSm">
                        {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                      </div>
                    </AvatarAura>
                    <div className="searchResultMain">
                      <div className="searchUser">
                        {u.username}
                        <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                      </div>
                      <div className="muted small">{memberSelected(u.id) ? "✓" : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {selectedMembers.length > 0 ? (
              <div className="selectedChips">
                {selectedMembers.map((u) => (
                  <span key={u.id} className="memberChip">
                    {u.username}
                    <button type="button" className="chipRemove" onClick={() => toggleMember(u)} aria-label={t("remove")}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {groupError ? <div className="authError">{groupError}</div> : null}

            <div className="groupModalActions">
              <button
                type="button"
                className="ghostBtn"
                disabled={groupSubmitting}
                onClick={() => setShowGroupModal(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="primaryBtn"
                disabled={groupSubmitting || !groupTitle.trim() || selectedMembers.length < 1}
                onClick={submitGroup}
              >
                {groupSubmitting ? t("saving") : t("groupCreateSubmit")}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const channelModal =
    showChannelModal ? (
      <div
        className="modalBackdrop"
        role="presentation"
        onClick={() => !channelSubmitting && setShowChannelModal(false)}
      >
        <div
          className="modalCard groupModalCard modalCard--mobileFriendly"
          role="dialog"
          aria-labelledby="channelModalTitle"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modalHeader">
            <div className="modalTitle" id="channelModalTitle">
              {t("createChannel")}
            </div>
            <button
              type="button"
              className="iconCloseBtn"
              onClick={() => !channelSubmitting && setShowChannelModal(false)}
              aria-label={t("close")}
            >
              ×
            </button>
          </div>
          <div className="modalBody groupModalBody">
            <label className="groupFieldLabel">{t("channelTitleLabel")}</label>
            <input
              className="searchInput"
              value={channelTitle}
              onChange={(e) => setChannelTitle(e.target.value)}
              placeholder={t("channelTitleLabel")}
            />
            <div className="muted small groupHint">{t("channelPickMembersOptional")}</div>
            <div className="channelAvatarRow">
              <input
                ref={channelFileRef}
                type="file"
                accept="image/*"
                className="fileInput"
                onChange={onPickChannelAvatar}
              />
              <button type="button" className="ghostBtn" onClick={() => channelFileRef.current?.click()}>
                {t("groupChangeAvatar")}
              </button>
              {channelAvatarDraft ? (
                <button type="button" className="ghostBtn" onClick={() => setChannelAvatarDraft(null)}>
                  {t("remove")}
                </button>
              ) : null}
            </div>
            {channelAvatarDraft ? (
              <div className="channelAvatarPreview">
                <img src={channelAvatarDraft} alt="" />
              </div>
            ) : null}
            <div className="muted small">{t("groupAvatarHint")}</div>
            <input
              className="searchInput"
              value={channelQuery}
              onChange={(e) => setChannelQuery(e.target.value)}
              placeholder={t("searchUsernamePlaceholder")}
            />
            {channelSearching ? <div className="muted small">{t("searching")}</div> : null}

            {channelResults.length > 0 ? (
              <div className="searchResults groupSearchResults">
                {channelResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={channelMemberSelected(u.id) ? "searchResult selectedPick" : "searchResult"}
                    onClick={() => toggleChannelMember(u)}
                  >
                    <AvatarAura auraColor={u.auraColor}>
                      <div className="avatarSm">
                        {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                      </div>
                    </AvatarAura>
                    <div className="searchResultMain">
                      <div className="searchUser">
                        {u.username}
                        <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                      </div>
                      <div className="muted small">{channelMemberSelected(u.id) ? "✓" : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {channelSelectedMembers.length > 0 ? (
              <div className="selectedChips">
                {channelSelectedMembers.map((u) => (
                  <span key={u.id} className="memberChip">
                    {u.username}
                    <button
                      type="button"
                      className="chipRemove"
                      onClick={() => toggleChannelMember(u)}
                      aria-label={t("remove")}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {channelError ? <div className="authError">{channelError}</div> : null}

            <div className="groupModalActions">
              <button
                type="button"
                className="ghostBtn"
                disabled={channelSubmitting}
                onClick={() => setShowChannelModal(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="primaryBtn"
                disabled={channelSubmitting || !channelTitle.trim()}
                onClick={submitChannel}
              >
                {channelSubmitting ? t("saving") : t("channelCreateSubmit")}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  if (mobileLayout) {
    const mobileChatsToShow = query.trim() ? mobileFilteredChats : chats;

    const deleteConfirmModal =
      deleteConfirmId != null ? (
        <div className="modalBackdrop" role="presentation" onClick={() => setDeleteConfirmId(null)}>
          <div
            className="modalCard modalCard--mobileFriendly"
            role="alertdialog"
            aria-labelledby="chatDeleteConfirmHeading"
            aria-describedby="chatDeleteConfirmDesc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modalHeader">
              <div className="modalTitle" id="chatDeleteConfirmHeading">
                {t("chatDeleteConfirmTitle")}
              </div>
              <button
                type="button"
                className="iconCloseBtn"
                onClick={() => setDeleteConfirmId(null)}
                aria-label={t("close")}
              >
                ×
              </button>
            </div>
            <div className="modalBody">
              <p id="chatDeleteConfirmDesc" className="muted">
                {t("chatDeleteConfirmBody")}
              </p>
              <div className="groupModalActions">
                <button type="button" className="ghostBtn" onClick={() => setDeleteConfirmId(null)}>
                  {t("chatDeleteCancelButton")}
                </button>
                <button
                  type="button"
                  className="primaryBtn mobileChatDeleteConfirmBtn"
                  onClick={() => {
                    const id = deleteConfirmId;
                    setDeleteConfirmId(null);
                    if (id != null && onChatDelete) void onChatDelete(id);
                  }}
                >
                  {t("chatDeleteConfirmButton")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null;

    return (
      <>
        <div className="mobileChatSearchWrap">
          <input
            type="search"
            className="mobileChatSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchUnifiedPlaceholder")}
            enterKeyHint="search"
            autoComplete="off"
            aria-label={t("searchUnifiedPlaceholder")}
          />
        </div>
        <div className="mobileChatListScroll" onScroll={MOBILE_CHAT_SWIPE_ENABLED ? onMobileChatListScroll : undefined}>
          {canSearch && searching ? (
            <div className="mobileSearchStatus muted" role="status">
              {t("searching")}
            </div>
          ) : null}
          {canSearch && searchError ? (
            <div className="authError mobileSearchInlineErr" role="alert">
              {searchError}
            </div>
          ) : null}

          {!query.trim() && chats.length === 0 ? (
            <div className="mobileChatListEmpty muted">{t("noChatsYet")}</div>
          ) : null}

          {mobileChatsToShow.map((c) => {
            const isGroup = c.type === "group";
            const isChannel = c.type === "channel";
            const isRoom = isGroup || isChannel;
            const isOfficial = c.type === "official";
            const other = c.other;
            const label = isChannel
              ? c.title || t("channelInfoTitle")
              : isGroup
                ? c.title || t("groupChat")
                : isOfficial
                  ? c.title || t("appTitle")
                  : other?.username || "";
            const online = !isRoom && !isOfficial && Boolean(other?.isOnline);
            const preview = c.last?.text
              ? String(c.last.text).replace(/\s+/g, " ").trim()
              : t("noMessages");
            const showActivity =
              Boolean(c.last?.senderId && me?.id && Number(c.last.senderId) !== Number(me.id));
            const unreadN = Math.max(0, Number(c.unreadCount) || 0);
            const unreadLabel = unreadN > 0 ? (unreadN > 99 ? "99+" : String(unreadN)) : null;
            const statusSubtitle =
              !isRoom && !isOfficial && other ? formatUserStatusLine(other, t, lang) : "";
            const rowClass = isOfficial ? "mobileChatRow mobileChatRow--official" : "mobileChatRow";
            const rowBody = (
              <>
                <div className="mobileChatRowAvatarWrap">
                  <AvatarAura skip={isRoom || isOfficial} auraColor={other?.auraColor}>
                    <div className={online ? "mobileChatRowAvatar presence online" : "mobileChatRowAvatar presence"}>
                      {isRoom && c.avatar ? (
                        <img src={c.avatar} alt="" />
                      ) : !isRoom && other?.avatar ? (
                        <img src={other.avatar} alt="" />
                      ) : (
                        <span>{initials(isRoom || isOfficial ? label : other?.username || "")}</span>
                      )}
                    </div>
                  </AvatarAura>
                  {!isRoom && !isOfficial ? (
                    <span
                      className={online ? "avatarPresenceDot avatarPresenceDot--on" : "avatarPresenceDot"}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <div className="mobileChatRowMain">
                  <div className="mobileChatRowTop">
                    <div className="mobileChatRowTitleBlock">
                      <span className="mobileChatRowName">
                        {label}
                        {isOfficial ? (
                          <span className="officialChatListBadge">{t("officialChatBadge")}</span>
                        ) : null}
                        {isChannel ? <span className="channelChatListBadge">{t("channelBadge")}</span> : null}
                        {!isRoom && !isOfficial ? (
                          <UserTagBadge
                            tag={other?.tag}
                            tagColor={other?.tagColor}
                            tagStyle={other?.tagStyle}
                          />
                        ) : null}
                        {!isRoom && !isOfficial ? (
                          <ActivityBadge messageCount={other?.messageCount} t={t} />
                        ) : null}
                      </span>
                      {!isRoom && !isOfficial && statusSubtitle ? (
                        <span className="mobileChatRowStatus muted" title={statusSubtitle}>
                          {statusSubtitle}
                        </span>
                      ) : null}
                    </div>
                    <div className="mobileChatRowRight" aria-label={unreadLabel ? t("unreadBadgeAria").replace("{count}", unreadLabel) : undefined}>
                      {c.last?.createdAt ? (
                        <time className="mobileChatRowTime" dateTime={c.last.createdAt}>
                          {formatListTime(c.last.createdAt, lang)}
                        </time>
                      ) : (
                        <span className="mobileChatRowTime" aria-hidden />
                      )}
                      {unreadLabel ? <span className="chatUnreadBadge">{unreadLabel}</span> : null}
                    </div>
                  </div>
                  <div className="mobileChatRowBottom">
                    <span className="mobileChatRowPreview muted">{preview}</span>
                    {showActivity && !unreadLabel ? (
                      <span className="mobileChatRowUnread" title={t("newActivity")} />
                    ) : null}
                  </div>
                </div>
              </>
            );

            if (onChatListPinToggle && onChatDelete) {
              return (
                <MobileChatRowSwipe
                  key={c.id}
                  chatId={c.id}
                  rowClassName={rowClass}
                  canDelete={!isOfficial}
                  listPinned={Boolean(c.listPinned)}
                  onOpenChat={() => onSelectChat(c.id)}
                  onRequestDelete={() => setDeleteConfirmId(c.id)}
                  onToggleListPin={() => onChatListPinToggle(c.id, !c.listPinned)}
                  shouldCollapse={MOBILE_CHAT_SWIPE_ENABLED && swipeOpenId !== null && swipeOpenId !== c.id}
                  scrollCloseNonce={MOBILE_CHAT_SWIPE_ENABLED ? swipeScrollNonce : 0}
                  onSwipeActiveChange={handleSwipePhase}
                  t={t}
                >
                  {rowBody}
                </MobileChatRowSwipe>
              );
            }

            return (
              <button key={c.id} type="button" className={rowClass} onClick={() => onSelectChat(c.id)}>
                {rowBody}
              </button>
            );
          })}

          {canSearch && results.length > 0 ? (
            <>
              <div className="mobileSearchSectionLabel">{t("searchUsersHeading")}</div>
              <div className="mobileSearchResults mobileSearchResults--inList">
                {results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="mobileSearchResultBtn"
                    onClick={() => onStartChat(u.id)}
                  >
                    <AvatarAura auraColor={u.auraColor}>
                      <div className="avatarSm">
                        {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                      </div>
                    </AvatarAura>
                    <span className="mobileSearchResultName">
                      {u.username}
                      <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {canSearch && !searching && mobileFilteredChats.length === 0 && results.length === 0 ? (
            <div className="mobileChatListEmpty muted">{t("searchNoResults")}</div>
          ) : null}
        </div>
        {groupModal}
        {channelModal}
        {deleteConfirmModal}
      </>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="meRow">
          <AvatarAura auraColor={me?.auraColor}>
            <div className="avatarSm" title={me.username}>
              {me.avatar ? <img src={me.avatar} alt="" /> : <span>{initials(me.username)}</span>}
            </div>
          </AvatarAura>
          <div className="meName">
            {me.username}
            <UserTagBadge tag={me?.tag} tagColor={me?.tagColor} tagStyle={me?.tagStyle} />
            <ActivityBadge messageCount={me?.messageCount} t={t} />
          </div>
        </div>
      </div>

      <div className="sidebarSection">
        <div className="sidebarChatsRow">
          <div className="sectionTitle">{t("chats")}</div>
          <div className="sidebarChatsRowActions">
            {onCreateGroup ? (
              <button type="button" className="sidebarMiniBtn" onClick={() => setShowGroupModal(true)}>
                {t("createGroup")}
              </button>
            ) : null}
            {onCreateChannel ? (
              <button type="button" className="sidebarMiniBtn" onClick={() => setShowChannelModal(true)}>
                {t("createChannel")}
              </button>
            ) : null}
          </div>
        </div>

        {chats.length === 0 ? <div className="muted">{t("noChatsYet")}</div> : null}

        <div className="chatList">
          {chats.map((c) => {
            const isGroup = c.type === "group";
            const isChannel = c.type === "channel";
            const isRoom = isGroup || isChannel;
            const isOfficial = c.type === "official";
            const other = c.other;
            const label = isChannel
              ? c.title || t("channelInfoTitle")
              : isGroup
                ? c.title || t("groupChat")
                : isOfficial
                  ? c.title || t("appTitle")
                  : other?.username || "";
            const online = !isRoom && !isOfficial && Boolean(other?.isOnline);
            const unreadN = Math.max(0, Number(c.unreadCount) || 0);
            const unreadLabel = unreadN > 0 ? (unreadN > 99 ? "99+" : String(unreadN)) : null;
            const timeLabel = c.last?.createdAt ? formatListTime(c.last.createdAt, lang) : "";
            const statusSubtitle =
              !isRoom && !isOfficial && other ? formatUserStatusLine(other, t, lang) : "";
            return (
              <button
                key={c.id}
                className={isOfficial ? "chatListItem chatListItem--official" : "chatListItem"}
                onClick={() => onSelectChat(c.id)}
                type="button"
              >
                <div className="chatItemTop">
                  <div className="chatAvatarWrap">
                    <AvatarAura skip={isRoom || isOfficial} auraColor={other?.auraColor}>
                      <div className={!isRoom && online ? "avatarSm presence online" : "avatarSm presence"}>
                        {isRoom && c.avatar ? (
                          <img src={c.avatar} alt="" />
                        ) : !isRoom && other?.avatar ? (
                          <img src={other.avatar} alt="" />
                        ) : (
                          <span>{initials(isRoom || isOfficial ? label : other?.username || "")}</span>
                        )}
                      </div>
                    </AvatarAura>
                    {!isRoom && !isOfficial ? (
                      <span
                        className={online ? "avatarPresenceDot avatarPresenceDot--on" : "avatarPresenceDot"}
                        title={presenceText(other, t, lang)}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="chatOther">
                    <div className="chatOtherNameRow">
                      <div className="chatOtherName">
                        {label}
                        {isOfficial ? (
                          <span className="officialChatListBadge">{t("officialChatBadge")}</span>
                        ) : null}
                        {isChannel ? <span className="channelChatListBadge">{t("channelBadge")}</span> : null}
                        {!isRoom && !isOfficial ? (
                          <UserTagBadge
                            tag={other?.tag}
                            tagColor={other?.tagColor}
                            tagStyle={other?.tagStyle}
                          />
                        ) : null}
                        {!isRoom && !isOfficial ? (
                          <ActivityBadge messageCount={other?.messageCount} t={t} />
                        ) : null}
                      </div>
                    </div>
                    {!isRoom && !isOfficial && statusSubtitle ? (
                      <div className="chatOtherStatus muted" title={statusSubtitle}>
                        {statusSubtitle}
                      </div>
                    ) : null}
                    {c.last ? (
                      <div className="chatLast">{c.last.text}</div>
                    ) : (
                      <div className="chatLast muted">{t("noMessages")}</div>
                    )}
                  </div>
                  <div className="chatItemRight">
                    <div className="chatItemTime" aria-hidden={!timeLabel}>
                      {timeLabel}
                    </div>
                    {unreadLabel ? (
                      <div className="chatItemBadgeRow">
                        <span className="chatUnreadBadge" aria-label={t("unreadBadgeAria").replace("{count}", unreadLabel)}>
                          {unreadLabel}
                        </span>
                      </div>
                    ) : (
                      <div className="chatItemBadgeRow" aria-hidden />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebarSection sidebarNewChat">
        <div className="sectionTitle">{t("newChat")}</div>
        <input
          className="searchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchUsernamePlaceholder")}
        />
        {searching ? <div className="muted small">{t("searching")}</div> : null}
        {searchError ? <div className="authError">{searchError}</div> : null}

        {results.length > 0 ? (
          <div className="searchResults">
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="searchResult"
                onClick={() => onStartChat(u.id)}
              >
                <AvatarAura auraColor={u.auraColor}>
                  <div className="avatarSm">
                    {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                  </div>
                </AvatarAura>
                <div>
                  <div className="searchUser">
                    {u.username}
                    <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {groupModal}
      {channelModal}
    </aside>
  );
});

export default Sidebar;

function presenceText(user, t, lang) {
  if (!user) return "";
  if (user.isOnline) return t("online");
  if (!user.lastSeenAt) return t("lastSeen");
  const d = new Date(user.lastSeenAt);
  const locale = localeForLang(lang);
  const s = Number.isNaN(d.getTime())
    ? String(user.lastSeenAt)
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

function formatListTime(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const locale = localeForLang(lang);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
