import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

const Sidebar = forwardRef(function Sidebar(
  {
    chats,
    me,
    onSelectChat,
    onStartChat,
    onCreateGroup,
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

  const canSearch = useMemo(() => query.trim().length >= 1, [query]);
  const canGroupSearch = useMemo(() => groupQuery.trim().length >= 1, [groupQuery]);

  const mobileFilteredChats = useMemo(() => {
    if (!mobileLayout) return chats;
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const isGroup = c.type === "group";
      const label = (isGroup ? c.title : c.other?.username) || "";
      return label.toLowerCase().includes(q);
    });
  }, [chats, query, mobileLayout]);

  useImperativeHandle(
    ref,
    () => ({
      openCreateGroup: () => {
        if (onCreateGroup) setShowGroupModal(true);
      },
    }),
    [onCreateGroup]
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
        setSearchError(e.message || "Search failed");
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
      setGroupError(e.message || "Failed");
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
                    <div className="avatarSm">
                      {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                    </div>
                    <div className="searchResultMain">
                      <div className="searchUser">{u.username}</div>
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

  if (mobileLayout) {
    const mobileChatsToShow = query.trim() ? mobileFilteredChats : chats;

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
        <div className="mobileChatListScroll">
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
            const other = c.other;
            const label = isGroup ? c.title || t("groupChat") : other?.username || "";
            const online = !isGroup && Boolean(other?.isOnline);
            const preview = c.last?.text
              ? String(c.last.text).replace(/\s+/g, " ").trim()
              : t("noMessages");
            const showActivity =
              Boolean(c.last?.senderId && me?.id && Number(c.last.senderId) !== Number(me.id));
            const unreadN = Math.max(0, Number(c.unreadCount) || 0);
            const unreadLabel = unreadN > 0 ? (unreadN > 99 ? "99+" : String(unreadN)) : null;
            return (
              <button key={c.id} type="button" className="mobileChatRow" onClick={() => onSelectChat(c.id)}>
                <div className="mobileChatRowAvatarWrap">
                  <div className={online ? "mobileChatRowAvatar presence online" : "mobileChatRowAvatar presence"}>
                  {isGroup && c.avatar ? (
                    <img src={c.avatar} alt="" />
                  ) : !isGroup && other?.avatar ? (
                    <img src={other.avatar} alt="" />
                  ) : (
                    <span>{initials(isGroup ? label : other?.username || "")}</span>
                  )}
                  </div>
                  {!isGroup ? (
                    <span
                      className={online ? "avatarPresenceDot avatarPresenceDot--on" : "avatarPresenceDot"}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <div className="mobileChatRowMain">
                  <div className="mobileChatRowTop">
                    <span className="mobileChatRowName">{label}</span>
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
                    <div className="avatarSm">
                      {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                    </div>
                    <span className="mobileSearchResultName">{u.username}</span>
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
      </>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="meRow">
          <div className="avatarSm" title={me.username}>
            {me.avatar ? <img src={me.avatar} alt="" /> : <span>{initials(me.username)}</span>}
          </div>
          <div className="meName">{me.username}</div>
        </div>
      </div>

      <div className="sidebarSection">
        <div className="sidebarChatsRow">
          <div className="sectionTitle">{t("chats")}</div>
          {onCreateGroup ? (
            <button type="button" className="sidebarMiniBtn" onClick={() => setShowGroupModal(true)}>
              {t("createGroup")}
            </button>
          ) : null}
        </div>

        {chats.length === 0 ? <div className="muted">{t("noChatsYet")}</div> : null}

        <div className="chatList">
          {chats.map((c) => {
            const isGroup = c.type === "group";
            const other = c.other;
            const label = isGroup ? c.title || t("groupChat") : other?.username || "";
            const online = !isGroup && Boolean(other?.isOnline);
            const unreadN = Math.max(0, Number(c.unreadCount) || 0);
            const unreadLabel = unreadN > 0 ? (unreadN > 99 ? "99+" : String(unreadN)) : null;
            const timeLabel = c.last?.createdAt ? formatListTime(c.last.createdAt, lang) : "";
            return (
              <button
                key={c.id}
                className="chatListItem"
                onClick={() => onSelectChat(c.id)}
                type="button"
              >
                <div className="chatItemTop">
                  <div className="chatAvatarWrap">
                    <div className={!isGroup && online ? "avatarSm presence online" : "avatarSm presence"}>
                      {isGroup && c.avatar ? (
                        <img src={c.avatar} alt="" />
                      ) : !isGroup && other?.avatar ? (
                        <img src={other.avatar} alt="" />
                      ) : (
                        <span>{initials(isGroup ? label : other?.username || "")}</span>
                      )}
                    </div>
                    {!isGroup ? (
                      <span
                        className={online ? "avatarPresenceDot avatarPresenceDot--on" : "avatarPresenceDot"}
                        title={presenceText(other, t, lang)}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="chatOther">
                    <div className="chatOtherNameRow">
                      <div className="chatOtherName">{label}</div>
                    </div>
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
                <div className="avatarSm">
                  {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                </div>
                <div>
                  <div className="searchUser">{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {groupModal}
    </aside>
  );
});

export default Sidebar;

function presenceText(user, t, lang) {
  if (!user) return "";
  if (user.isOnline) return t("online");
  if (!user.lastSeenAt) return t("lastSeen");
  const d = new Date(user.lastSeenAt);
  const locale = lang === "ru" ? "ru-RU" : "en-US";
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
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
