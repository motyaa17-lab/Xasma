import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import AvatarAura from "./AvatarAura.jsx";
import MobileChatRowSwipe, { MOBILE_CHAT_SWIPE_ENABLED } from "./MobileChatRowSwipe.jsx";
import { localeForLang } from "../i18n.js";
import { formatUserStatusLine } from "../userStatusLine.js";
import ActivityBadge from "./ActivityBadge.jsx";
import UserTagBadge from "./UserTagBadge.jsx";
import { isPremiumActive } from "../premium.js";
import { avatarRingWrapClass, usernameDisplayClass } from "../userPersonalization.js";
import { formatAtUserHandle } from "../userHandleDisplay.js";
import { IconEllipsis, IconSearch } from "./Icons.jsx";
import { XASMA_LOGO_SRC } from "../branding.js";
import { readMessageDraft } from "../messageDrafts.js";
import { compressImageFileToJpegDataUrl } from "../chatBackgroundImage.js";

function MobileChatListScroll({ className, onScroll, onDoublePullDown, children }) {
  const rootRef = useRef(null);
  const pullRef = useRef({ y0: 0, t0: 0, lastPullAt: 0, pullCount: 0, armed: false });

  const onTouchStart = useCallback((e) => {
    const el = rootRef.current;
    if (!el) return;
    if (el.scrollTop > 0) return;
    const t = e.touches?.[0];
    if (!t) return;
    pullRef.current = { y0: t.clientY, t0: Date.now(), lastPullAt: pullRef.current.lastPullAt, pullCount: pullRef.current.pullCount, armed: true };
  }, []);

  const onTouchEnd = useCallback(
    (e) => {
      const el = rootRef.current;
      const st = el ? el.scrollTop : 0;
      const t = e.changedTouches?.[0];
      const cur = pullRef.current;
      if (!cur.armed || !t) return;
      cur.armed = false;
      if (st > 0) return;
      const dy = t.clientY - cur.y0;
      if (dy < 54) return;
      // Prevent "double scroll" feeling: only count quick pulls (not slow drags / momentum).
      const dt = Date.now() - (cur.t0 || 0);
      if (dt > 420) return;
      const now = Date.now();
      if (now - cur.lastPullAt < 900) cur.pullCount += 1;
      else cur.pullCount = 1;
      cur.lastPullAt = now;
      if (cur.pullCount >= 2) {
        cur.pullCount = 0;
        onDoublePullDown?.();
      }
    },
    [onDoublePullDown]
  );

  return (
    <div ref={rootRef} className={className} onScroll={onScroll} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}

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
    typingUntil = {},
    t,
    lang,
    mobileLayout = false,
    mobileStoriesExpanded = false,
    onMobileStoriesExpandedChange,
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
  const [desktopChatMenuId, setDesktopChatMenuId] = useState(null);
  const [swipeOpenId, setSwipeOpenId] = useState(null);
  const [swipeScrollNonce, setSwipeScrollNonce] = useState(0);
  const chatListScrollCloseRaf = useRef(null);

  const [mobileFolderSelected, setMobileFolderSelected] = useState("all"); // "all" | "archive" | folderId
  const [mobileFolders, setMobileFolders] = useState([]);
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [chatActionId, setChatActionId] = useState(null);
  const [chatMoveFolderId, setChatMoveFolderId] = useState("");
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerLabel, setStoryViewerLabel] = useState("");
  const [storyViewerIndex, setStoryViewerIndex] = useState(0); // user index in storyUsers
  const [storyViewerItemIndex, setStoryViewerItemIndex] = useState(0); // item index within a user's stories
  const [storyViewerProgress, setStoryViewerProgress] = useState(0); // 0..1
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyComposerBusy, setStoryComposerBusy] = useState(false);
  const [storyComposerError, setStoryComposerError] = useState("");
  const storyFileRef = useRef(null);
  const [storiesRev, setStoriesRev] = useState(0);

  const STORIES_STORAGE_KEY = "xasma.stories.v1";

  function loadStoriesIndex() {
    try {
      const raw = localStorage.getItem(STORIES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveStoriesIndex(next) {
    try {
      localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const onStorage = (e) => {
      if (!e) return;
      if (e.key && String(e.key) !== STORIES_STORAGE_KEY) return;
      setStoriesRev((n) => n + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function getUserStories(userId) {
    const idx = loadStoriesIndex();
    const list = idx?.[String(userId)];
    const arr = Array.isArray(list) ? list : [];
    const now = Date.now();
    const TTL = 24 * 60 * 60 * 1000;
    return arr
      .filter((it) => it && typeof it === "object" && typeof it.mediaUrl === "string")
      .filter((it) => {
        const t = it.createdAt ? new Date(it.createdAt).getTime() : 0;
        return t && now - t < TTL;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  function userHasStories(userId) {
    return getUserStories(userId).length > 0;
  }

  const myStories = useMemo(() => (me?.id ? getUserStories(me.id) : []), [me?.id, storiesRev]);

  function chatHasStory(c) {
    // Backend story support may not exist yet; we only show items that explicitly claim a story.
    // This keeps the strip true to Telegram: only users who posted a story appear.
    return Boolean(
      c?.hasStory ||
        c?.story?.items?.length ||
        c?.other?.hasStory ||
        c?.other?.storyUrl ||
        c?.other?.story?.items?.length ||
        (c?.other?.id && userHasStories(c.other.id))
    );
  }

  const storyChats = useMemo(() => {
    return chats
      .filter((c) => c && typeof c === "object")
      .filter((c) => c.type === "direct") // only users (no groups/channels/official)
      .filter((c) => c.other?.id) // must be a real chatted user
      .filter(chatHasStory)
      .slice(0, 24);
  }, [chats, storiesRev]);

  const storyUsers = useMemo(() => {
    return storyChats
      .map((c) => c?.other)
      .filter(Boolean)
      .map((u) => ({
        userId: Number(u.id),
        username: String(u.username || ""),
        avatar: String(u.avatar || ""),
      }))
      .filter((u) => u.userId);
  }, [storyChats]);

  const storyViewerUserId = storyUsers[storyViewerIndex]?.userId || null;
  const storyViewerStories = useMemo(
    () => (storyViewerUserId ? getUserStories(storyViewerUserId) : []),
    [storyViewerUserId, storiesRev]
  );

  useEffect(() => {
    if (!storyViewerOpen) return undefined;
    setStoryViewerProgress(0);
    const TICK_MS = 50;
    const DURATION_MS = 5200;
    const id = window.setInterval(() => {
      setStoryViewerProgress((p) => Math.min(1, p + TICK_MS / DURATION_MS));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [storyViewerOpen, storyViewerIndex, storyViewerItemIndex]);

  const goStoryPrev = useCallback(() => {
    setStoryViewerProgress(0);
    setStoryViewerItemIndex((idx) => {
      if (idx > 0) return idx - 1;
      // prev user
      setStoryViewerIndex((u) => Math.max(0, u - 1));
      return 0;
    });
  }, []);

  const goStoryNext = useCallback(() => {
    setStoryViewerProgress(0);
    setStoryViewerItemIndex((idx) => {
      const count = storyViewerStories.length;
      if (count && idx + 1 < count) return idx + 1;
      // next user
      setStoryViewerItemIndex(0);
      setStoryViewerIndex((u) => {
        const nextU = u + 1;
        if (nextU >= storyUsers.length) {
          setStoryViewerOpen(false);
          return u;
        }
        return nextU;
      });
      return 0;
    });
  }, [storyUsers.length, storyViewerStories.length]);

  useEffect(() => {
    if (!storyViewerOpen) return;
    if (storyViewerProgress < 1) return;
    goStoryNext();
  }, [storyViewerOpen, storyViewerProgress, goStoryNext]);

  async function addMyStoryFromFile(file) {
    if (!me?.id) return;
    if (!file || !file.type?.startsWith("image/")) {
      setStoryComposerError(t("groupAvatarChooseImage"));
      return;
    }
    setStoryComposerBusy(true);
    setStoryComposerError("");
    try {
      const dataUrl = await compressImageFileToJpegDataUrl(file);
      const idx = loadStoriesIndex();
      const key = String(me.id);
      const prev = Array.isArray(idx[key]) ? idx[key] : [];
      const item = {
        id: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        mediaType: "image",
        mediaUrl: dataUrl,
      };
      idx[key] = [item, ...prev].slice(0, 40);
      saveStoriesIndex(idx);
      setStoriesRev((n) => n + 1);
      setStoryComposerOpen(false);
    } catch (e) {
      setStoryComposerError(e?.message || t("errorGeneric"));
    } finally {
      setStoryComposerBusy(false);
    }
  }

  const foldersStorageKey = "xasma.chatFolders.v1";
  const chatFolderKey = (chatId) => `xasma.chatFolder.v1.${Number(chatId)}`;
  const chatArchiveKey = (chatId) => `xasma.chatArchive.v1.${Number(chatId)}`;

  function loadFolders() {
    try {
      const raw = localStorage.getItem(foldersStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x.id === "string" && typeof x.name === "string");
      return [];
    } catch {
      return [];
    }
  }

  function saveFolders(next) {
    setMobileFolders(next);
    try {
      localStorage.setItem(foldersStorageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function getChatFolderId(chatId) {
    try {
      return localStorage.getItem(chatFolderKey(chatId)) || "";
    } catch {
      return "";
    }
  }

  function setChatFolderId(chatId, folderId) {
    try {
      if (!folderId) localStorage.removeItem(chatFolderKey(chatId));
      else localStorage.setItem(chatFolderKey(chatId), String(folderId));
    } catch {
      /* ignore */
    }
  }

  function isChatArchived(chatId) {
    try {
      return localStorage.getItem(chatArchiveKey(chatId)) === "1";
    } catch {
      return false;
    }
  }

  function setChatArchived(chatId, archived) {
    try {
      if (archived) localStorage.setItem(chatArchiveKey(chatId), "1");
      else localStorage.removeItem(chatArchiveKey(chatId));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!mobileLayout) return;
    setMobileFolders(loadFolders());
  }, [mobileLayout]);

  const handleSwipePhase = useCallback((id, phase) => {
    if (phase === "lock") setSwipeOpenId(id);
    if (phase === "end") setSwipeOpenId(null);
  }, []);

  useEffect(() => {
    if (desktopChatMenuId == null) return;
    const onDown = (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".chatListItemMenuCol")) return;
      setDesktopChatMenuId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [desktopChatMenuId]);

  const onMobileChatListScroll = useCallback(
    (e) => {
      const el = e?.currentTarget;
      const st = el && typeof el.scrollTop === "number" ? el.scrollTop : 0;
      // Telegram-like: when you start scrolling the list, stories collapse into mini avatars.
      if (mobileStoriesExpanded && st > 10) {
        onMobileStoriesExpandedChange?.(false);
      }

      if (!MOBILE_CHAT_SWIPE_ENABLED) return;
      if (chatListScrollCloseRaf.current != null) return;
      chatListScrollCloseRaf.current = requestAnimationFrame(() => {
        chatListScrollCloseRaf.current = null;
        setSwipeOpenId(null);
        setSwipeScrollNonce((n) => n + 1);
      });
    },
    [mobileStoriesExpanded, onMobileStoriesExpandedChange]
  );

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
                      <div className="searchResultTextCol">
                        <div className="searchUser">
                          {u.username}
                          <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                        </div>
                        {u.userHandle ? (
                          <div className="searchUserAt muted small">{formatAtUserHandle(u.userHandle)}</div>
                        ) : null}
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
                      <div className="searchResultTextCol">
                        <div className="searchUser">
                          {u.username}
                          <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                        </div>
                        {u.userHandle ? (
                          <div className="searchUserAt muted small">{formatAtUserHandle(u.userHandle)}</div>
                        ) : null}
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

  const deleteConfirmModal =
    deleteConfirmId != null ? (
      <div className="modalBackdrop" role="presentation" onClick={() => setDeleteConfirmId(null)}>
        <div
          className={`modalCard${mobileLayout ? " modalCard--mobileFriendly" : ""}`}
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
                className={`primaryBtn${mobileLayout ? " mobileChatDeleteConfirmBtn" : ""}`}
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

  if (mobileLayout) {
    const baseChats = query.trim() ? mobileFilteredChats : chats;
    const mobileChatsToShow = baseChats.filter((c) => {
      const archived = isChatArchived(c.id);
      const folderId = getChatFolderId(c.id);
      if (mobileFolderSelected === "archive") return archived;
      if (archived) return false;
      if (mobileFolderSelected === "all") return true;
      return folderId === mobileFolderSelected;
    });

    const mobileFolderTabs = [
      { id: "all", label: t("all") ?? "Все" },
      { id: "archive", label: t("archive") ?? "Архив" },
      ...mobileFolders.map((f) => ({ id: f.id, label: f.name })),
    ];

    const storyStrip = mobileStoriesExpanded ? (
      <div className="tgStoriesStrip tgStoriesStrip--expanded" aria-label={t("stories") ?? "Stories"}>
        <div className="tgStoriesScroll">
          <input
            ref={storyFileRef}
            type="file"
            accept="image/*"
            className="fileInput"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void addMyStoryFromFile(f);
            }}
          />
          <button
            type="button"
            className="tgStoryItem tgStoryItem--me"
            aria-label={t("myStory") ?? "My story"}
            onClick={() => {
              // If I have stories, open viewer; else open picker.
              if (myStories.length) {
                setStoryViewerLabel(t("myStory") ?? "Моя история");
                setStoryViewerIndex(0);
                setStoryViewerOpen(true);
              } else {
                setStoryComposerError("");
                setStoryComposerOpen(true);
                storyFileRef.current?.click();
              }
            }}
          >
            <span className="tgStoryAvatar">
              <span className="tgStoryPlus" aria-hidden>
                +
              </span>
            </span>
            <span className="tgStoryLabel">{t("myStory") ?? "Моя история"}</span>
          </button>
          {storyUsers.map((u, idx) => (
            <button
              key={`story-u-${u.userId}`}
              type="button"
              className="tgStoryItem"
              onClick={() => {
                setStoryViewerLabel(u.username || "");
                setStoryViewerIndex(idx);
                setStoryViewerOpen(true);
              }}
              aria-label={u.username}
            >
              <span className="tgStoryAvatar">
                {u.avatar ? <img src={u.avatar} alt="" /> : <span className="tgStoryInitials">{initials(u.username)}</span>}
              </span>
              <span className="tgStoryLabel">{u.username}</span>
            </button>
          ))}
        </div>
      </div>
    ) : null;

    return (
      <>
        {storyStrip}

        <div className="tgSearchWrap">
          <div className="tgSearchField">
            <span className="tgSearchIcon" aria-hidden>
              <IconSearch size={18} />
            </span>
            <input
              type="search"
              className="tgSearchInput"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchUnifiedPlaceholder")}
              enterKeyHint="search"
              autoComplete="off"
              aria-label={t("searchUnifiedPlaceholder")}
            />
          </div>
        </div>

        <div className="tgFolderBar" role="tablist" aria-label={t("chatFolders") ?? "Folders"}>
          <div className="tgFolderScroll">
            {mobileFolderTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === mobileFolderSelected ? "tgFolderPill tgFolderPill--active" : "tgFolderPill"}
                role="tab"
                aria-selected={tab.id === mobileFolderSelected}
                onClick={() => setMobileFolderSelected(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              className="tgFolderAddBtn"
              aria-label={t("addFolder") ?? "Add folder"}
              onClick={() => {
                setFolderCreateName("");
                setFolderCreateOpen(true);
              }}
            >
              +
            </button>
          </div>
        </div>

        <MobileChatListScroll
          className="mobileChatListScroll"
          onScroll={onMobileChatListScroll}
          onDoublePullDown={() => onMobileStoriesExpandedChange?.(!mobileStoriesExpanded)}
        >
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
            const otherIsPremium = !isRoom && !isOfficial && isPremiumActive(other);
            const label = isChannel
              ? c.title || t("channelInfoTitle")
              : isGroup
                ? c.title || t("groupChat")
                : isOfficial
                  ? c.title || t("appTitle")
                  : other?.username || "";
            const online = !isRoom && !isOfficial && Boolean(other?.isOnline);
            const draftText = readMessageDraft(c.id);
            const typing = Boolean(typingUntil && typingUntil[c.id] > Date.now());
            const preview = draftText.trim()
              ? `${t("draftLabel")}: ${String(draftText).replace(/\s+/g, " ").trim()}`
              : typing
                ? t("typing")
                : c.last?.text
                  ? String(c.last.text).replace(/\s+/g, " ").trim()
                : t("noMessages");
            const showActivity =
              Boolean(c.last?.senderId && me?.id && Number(c.last.senderId) !== Number(me.id));
            const unreadN = Math.max(0, Number(c.unreadCount) || 0);
            const unreadLabel = unreadN > 0 ? (unreadN > 99 ? "99+" : String(unreadN)) : null;
            const statusSubtitle =
              !isRoom && !isOfficial && other ? formatUserStatusLine(other, t, lang) : "";
            const rowClass = isOfficial ? "tgListRow tgChatRow tgChatRow--official" : "tgListRow tgChatRow";
            const rowBody = (
              <>
                <span className="tgRowAvatar">
                  {isRoom && c.avatar ? (
                    <img src={c.avatar} alt="" />
                  ) : !isRoom && other?.avatar ? (
                    <img src={other.avatar} alt="" />
                  ) : isOfficial ? (
                    <img src={XASMA_LOGO_SRC} alt="" className="xasmaBrandMark" decoding="async" />
                  ) : (
                    <span className="tgRowInitials">{initials(isRoom || isOfficial ? label : other?.username || "")}</span>
                  )}
                </span>
                <span className="tgRowMain">
                  <span className="tgRowTopLine">
                    <span className="tgRowTitle">
                      <span className={!isRoom && !isOfficial ? usernameDisplayClass(other) || undefined : undefined}>
                        {label}
                        {otherIsPremium ? <span className="premiumBadge">💎</span> : null}
                      </span>
                    </span>
                    <span className="tgRowMeta">
                      {c.last?.createdAt ? (
                        <time className="tgRowTime" dateTime={c.last.createdAt}>
                          {formatListTime(c.last.createdAt, lang)}
                        </time>
                      ) : null}
                    </span>
                  </span>
                  <span className="tgRowBottomLine">
                    <span
                      className={`tgRowSubtitle muted${typing ? " tgRowSubtitle--typing" : ""}`}
                      title={draftText.trim() ? draftText : preview}
                    >
                      {draftText.trim() ? (
                        <>
                          <span className="chatDraftLabel">{t("draftLabel")}:</span>{" "}
                          {String(draftText).replace(/\s+/g, " ").trim()}
                        </>
                      ) : (
                        preview
                      )}
                    </span>
                    <span className="tgRowRight">
                      {unreadLabel ? <span className="tgRowBadge">{unreadLabel}</span> : null}
                      {showActivity && !unreadLabel ? <span className="tgRowDot" aria-hidden /> : null}
                      {c.listPinned ? <span className="tgRowPin" aria-hidden>📌</span> : null}
                    </span>
                  </span>
                </span>
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
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => onSelectChat(c.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setChatActionId(c.id);
                      setChatMoveFolderId(getChatFolderId(c.id));
                    }}
                  >
                    {rowBody}
                  </button>
                </MobileChatRowSwipe>
              );
            }

            return (
              <button
                key={c.id}
                type="button"
                className={rowClass}
                onClick={() => onSelectChat(c.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setChatActionId(c.id);
                  setChatMoveFolderId(getChatFolderId(c.id));
                }}
              >
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
        </MobileChatListScroll>
        {groupModal}
        {channelModal}
        {deleteConfirmModal}
        {folderCreateOpen ? (
          <div className="modalBackdrop modalBackdrop--app" role="dialog" aria-modal="true">
            <div className="modalCard modalCard--mobileFriendly" style={{ maxWidth: 420, width: "min(420px, calc(100vw - 24px))" }}>
              <div className="modalHeader">
                <div className="modalTitle">{t("addFolder") ?? "Add folder"}</div>
                <button type="button" className="iconCloseBtn" onClick={() => setFolderCreateOpen(false)} aria-label={t("close")}>
                  ×
                </button>
              </div>
              <div className="modalBody">
                <input
                  className="searchInput"
                  value={folderCreateName}
                  onChange={(e) => setFolderCreateName(e.target.value)}
                  placeholder={t("folderName") ?? "Folder name"}
                  aria-label={t("folderName") ?? "Folder name"}
                />
                <div className="groupModalActions">
                  <button type="button" className="ghostBtn" onClick={() => setFolderCreateOpen(false)}>
                    {t("cancel") ?? t("close")}
                  </button>
                  <button
                    type="button"
                    className="primaryBtn"
                    onClick={() => {
                      const name = folderCreateName.trim();
                      if (!name) return;
                      const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
                      saveFolders([...mobileFolders, { id, name }]);
                      setMobileFolderSelected(id);
                      setFolderCreateOpen(false);
                    }}
                  >
                    {t("create") ?? "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {chatActionId != null ? (
          <div className="modalBackdrop modalBackdrop--app" role="dialog" aria-modal="true">
            <div className="modalCard modalCard--mobileFriendly" style={{ maxWidth: 420, width: "min(420px, calc(100vw - 24px))" }}>
              <div className="modalHeader">
                <div className="modalTitle">{t("chatActions") ?? "Chat actions"}</div>
                <button type="button" className="iconCloseBtn" onClick={() => setChatActionId(null)} aria-label={t("close")}>
                  ×
                </button>
              </div>
              <div className="modalBody">
                <button
                  type="button"
                  className="settingsRow"
                  onClick={() => {
                    const cid = chatActionId;
                    const next = !isChatArchived(cid);
                    setChatArchived(cid, next);
                    if (next) setMobileFolderSelected("archive");
                    setChatActionId(null);
                  }}
                >
                  <span className="settingsRowLeft">
                    <span className="settingsRowLabel">{isChatArchived(chatActionId) ? (t("unarchive") ?? "Unarchive") : (t("archive") ?? "Archive")}</span>
                  </span>
                </button>

                <div className="settingsSectionHeader">{t("moveToFolder") ?? "Move to folder"}</div>
                <div className="settingsSection">
                  <button
                    type="button"
                    className={chatMoveFolderId ? "settingsRow" : "settingsRow settingsRow--activeChoice"}
                    onClick={() => setChatMoveFolderId("")}
                  >
                    <span className="settingsRowLeft">
                      <span className="settingsRowLabel">{t("all") ?? "Все"}</span>
                    </span>
                  </button>
                  {mobileFolders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={chatMoveFolderId === f.id ? "settingsRow settingsRow--activeChoice" : "settingsRow"}
                      onClick={() => setChatMoveFolderId(f.id)}
                    >
                      <span className="settingsRowLeft">
                        <span className="settingsRowLabel">{f.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="groupModalActions">
                  <button type="button" className="ghostBtn" onClick={() => setChatActionId(null)}>
                    {t("cancel") ?? t("close")}
                  </button>
                  <button
                    type="button"
                    className="primaryBtn"
                    onClick={() => {
                      const cid = chatActionId;
                      setChatFolderId(cid, chatMoveFolderId);
                      setChatActionId(null);
                    }}
                  >
                    {t("save") ?? "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {storyViewerOpen ? (
          <div className="modalBackdrop modalBackdrop--app" role="dialog" aria-modal="true">
            <div className="tgStoryViewer" role="document" aria-label={storyViewerLabel || (t("stories") ?? "Stories")}>
              <div className="tgStoryViewerTop">
                <div className="tgStoryProgress">
                  {(storyViewerStories.length ? storyViewerStories : [null]).map((s, i) => {
                    const fill = i < storyViewerItemIndex ? 1 : i > storyViewerItemIndex ? 0 : storyViewerProgress;
                    return (
                      <div key={s?.id || `seg_${i}`} className="tgStoryProgressSeg" aria-hidden>
                        <div className="tgStoryProgressFill" style={{ transform: `scaleX(${fill})` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="tgStoryViewerHeaderRow">
                  <div className="tgStoryViewerHeaderLeft">
                    <span className="tgStoryViewerAvatar" aria-hidden>
                      {storyUsers[storyViewerIndex]?.avatar ? (
                        <img src={storyUsers[storyViewerIndex].avatar} alt="" />
                      ) : (
                        <span className="tgStoryViewerInitial">
                          {String(storyUsers[storyViewerIndex]?.username || "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <div className="tgStoryViewerTitleCol">
                      <div className="tgStoryViewerTitle">{storyUsers[storyViewerIndex]?.username || storyViewerLabel}</div>
                      <div className="tgStoryViewerSub muted">
                        {storyViewerStories[storyViewerItemIndex]?.createdAt
                          ? formatListTime(storyViewerStories[storyViewerItemIndex].createdAt, lang)
                          : (t("stories") ?? "Stories")}
                      </div>
                    </div>
                  </div>
                  <button type="button" className="tgStoryViewerClose" onClick={() => setStoryViewerOpen(false)} aria-label={t("close")}>
                    ×
                  </button>
                </div>
              </div>

              <button type="button" className="tgStoryViewerTap tgStoryViewerTap--prev" aria-label={t("back")} onClick={goStoryPrev} />
              <button type="button" className="tgStoryViewerTap tgStoryViewerTap--next" aria-label={t("next")} onClick={goStoryNext} />

              <div className="tgStoryViewerStage" aria-hidden>
                <div className="tgStoryViewerCard">
                  <div className="tgStoryViewerCardGlow" />
                  <div className="tgStoryViewerCardBody">
                    {storyViewerStories.length ? (
                      <img
                        src={storyViewerStories[storyViewerItemIndex]?.mediaUrl}
                        alt=""
                        className="tgStoryViewerMedia"
                      />
                    ) : (
                      <div className="tgStoryViewerHint">{t("storiesComingSoon") ?? t("comingSoon")}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {storyComposerOpen ? (
          <div className="modalBackdrop modalBackdrop--app" role="dialog" aria-modal="true">
            <div className="modalCard modalCard--mobileFriendly" style={{ maxWidth: 420, width: "min(420px, calc(100vw - 24px))" }}>
              <div className="modalHeader">
                <div className="modalTitle">{t("myStory") ?? "Моя история"}</div>
                <button type="button" className="iconCloseBtn" onClick={() => !storyComposerBusy && setStoryComposerOpen(false)} aria-label={t("close")}>
                  ×
                </button>
              </div>
              <div className="modalBody">
                <div className="muted">{t("stories") ?? "Stories"}</div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="primaryBtn"
                    disabled={storyComposerBusy}
                    onClick={() => storyFileRef.current?.click()}
                  >
                    {storyComposerBusy ? t("saving") : (t("groupChangeAvatar") ?? "Choose photo")}
                  </button>
                  <button
                    type="button"
                    className="ghostBtn"
                    disabled={storyComposerBusy}
                    onClick={() => setStoryComposerOpen(false)}
                  >
                    {t("close")}
                  </button>
                </div>
                {storyComposerError ? <div className="authError" style={{ marginTop: 12 }}>{storyComposerError}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="meRow">
          <AvatarAura auraColor={me?.auraColor}>
            {(() => {
              const ringC = avatarRingWrapClass(isPremiumActive(me) ? me?.avatarRing : "");
              const inner = (
                <div className={isPremiumActive(me) ? "avatarSm avatarPremium" : "avatarSm"} title={me.username}>
                  {me.avatar ? <img src={me.avatar} alt="" /> : <span>{initials(me.username)}</span>}
                </div>
              );
              return ringC ? <span className={ringC}>{inner}</span> : inner;
            })()}
          </AvatarAura>
          <div className="meName">
            <span className={usernameDisplayClass(me) || undefined}>
              {me.username}
              {isPremiumActive(me) ? <span className="premiumBadge">💎</span> : null}
            </span>
            <UserTagBadge tag={me?.tag} tagColor={me?.tagColor} tagStyle={me?.tagStyle} />
            <ActivityBadge messageCount={me?.messageCount} t={t} />
            {me?.userHandle ? (
              <div className="meAtHandle muted small">{formatAtUserHandle(me.userHandle)}</div>
            ) : null}
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
            const draftText = readMessageDraft(c.id);
            const hasDraft = Boolean(draftText.trim());
            const lastText = c.last?.text ? String(c.last.text).replace(/\s+/g, " ").trim() : "";
            const showDesktopChatMenu = Boolean(onChatDelete) && !isOfficial;
            return (
              <div
                key={c.id}
                className={`chatListItemRow${isOfficial ? " chatListItemRow--official" : ""}${
                  desktopChatMenuId === c.id ? " chatListItemRow--menuOpen" : ""
                }`}
              >
                <button
                  type="button"
                  className={isOfficial ? "chatListItem chatListItem--official" : "chatListItem"}
                  onClick={() => {
                    setDesktopChatMenuId(null);
                    onSelectChat(c.id);
                  }}
                >
                  <div className="chatItemTop">
                    <div className="chatAvatarWrap">
                      <AvatarAura skip={isRoom || isOfficial} auraColor={other?.auraColor}>
                        {(() => {
                          const ringC =
                            !isRoom && !isOfficial
                              ? avatarRingWrapClass(isPremiumActive(other) ? other?.avatarRing : "")
                              : "";
                          const inner = (
                            <div
                              className={`${!isRoom && online ? "avatarSm presence online" : "avatarSm presence"}${
                                !isRoom && !isOfficial && isPremiumActive(other) ? " avatarPremium" : ""
                              }`}
                            >
                              {isRoom && c.avatar ? (
                                <img src={c.avatar} alt="" />
                              ) : !isRoom && other?.avatar ? (
                                <img src={other.avatar} alt="" />
                              ) : isOfficial ? (
                                <img src={XASMA_LOGO_SRC} alt="" className="xasmaBrandMark" decoding="async" />
                              ) : (
                                <span>{initials(isRoom || isOfficial ? label : other?.username || "")}</span>
                              )}
                            </div>
                          );
                          return ringC ? <span className={ringC}>{inner}</span> : inner;
                        })()}
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
                          <span
                            className={
                              !isRoom && !isOfficial ? usernameDisplayClass(other) || undefined : undefined
                            }
                          >
                            {label}
                            {!isRoom && !isOfficial && isPremiumActive(other) ? (
                              <span className="premiumBadge">💎</span>
                            ) : null}
                          </span>
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
                      {/* Desktop list: keep Telegram-like density (title + single preview line). */}
                      {hasDraft ? (
                        <div className="chatLast chatLast--draft" title={draftText}>
                          <span className="chatDraftLabel">{t("draftLabel")}:</span>{" "}
                          {String(draftText).replace(/\s+/g, " ").trim()}
                        </div>
                      ) : Boolean(typingUntil && typingUntil[c.id] > Date.now()) ? (
                        <div className="chatLast chatLast--typing">{t("typing")}</div>
                      ) : c.last ? (
                        <div className="chatLast">{lastText}</div>
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
                {showDesktopChatMenu ? (
                  <div className="chatListItemMenuCol">
                    <button
                      type="button"
                      className="chatListItemMoreBtn"
                      aria-label={t("menu")}
                      aria-expanded={desktopChatMenuId === c.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDesktopChatMenuId((id) => (id === c.id ? null : c.id));
                      }}
                    >
                      <IconEllipsis size={18} />
                    </button>
                    {desktopChatMenuId === c.id ? (
                      <div className="chatListItemDropdown" role="menu">
                        <button
                          type="button"
                          className="chatListItemDropdownItem chatListItemDropdownItem--danger"
                          role="menuitem"
                          onClick={() => {
                            setDesktopChatMenuId(null);
                            setDeleteConfirmId(c.id);
                          }}
                        >
                          {t("chatListSwipeDelete")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
                  {(() => {
                    const ringC = avatarRingWrapClass(isPremiumActive(u) ? u?.avatarRing : "");
                    const inner = (
                      <div className={u?.isPremium ? "avatarSm avatarPremium" : "avatarSm"}>
                        {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                      </div>
                    );
                    return ringC ? <span className={ringC}>{inner}</span> : inner;
                  })()}
                </AvatarAura>
                <div>
                  <div className="searchUser">
                    <span className={usernameDisplayClass(u) || undefined}>
                      {u.username}
                      {isPremiumActive(u) ? <span className="premiumBadge">💎</span> : null}
                    </span>
                    <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                  </div>
                  {u.userHandle ? (
                    <div className="searchUserAt muted small">{formatAtUserHandle(u.userHandle)}</div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {groupModal}
      {channelModal}
      {deleteConfirmModal}
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
