import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import Auth from "./components/Auth.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Chat from "./components/Chat.jsx";
import UserMenu from "./components/UserMenu.jsx";
import InstallDownloadPanel from "./components/InstallDownloadPanel.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { t as tr } from "./i18n.js";
import {
  createChat,
  createGroup,
  getChats,
  getMe,
  getMessages,
  login,
  register,
  adminDeleteMessage,
  toggleReaction,
  updateMessage,
  updateMyAvatar,
  updateMyProfile,
} from "./api.js";
import { getSocketEndpoint } from "./api.js";
import {
  MOBILE_CHAT_OPEN_BODY_CLASS,
  syncAppRootHeight,
  syncMobileChatVisualViewport,
} from "./syncViewport.js";
import { tryShowIncomingMessageNotification } from "./messageNotifications.js";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [me, setMe] = useState(null);
  const [authError, setAuthError] = useState("");

  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem("settings");
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        lang: parsed.lang === "ru" ? "ru" : "en",
        chatTheme: ["ocean", "midnight", "slate"].includes(parsed.chatTheme)
          ? parsed.chatTheme
          : "ocean",
        messageNotificationsEnabled: Boolean(parsed.messageNotificationsEnabled),
      };
    } catch {
      return { lang: "en", chatTheme: "ocean", messageNotificationsEnabled: false };
    }
  });

  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [socketReady, setSocketReady] = useState(false);
  const [typingUntil, setTypingUntil] = useState({}); // chatId -> ms timestamp
  const [presenceTick, setPresenceTick] = useState(0);

  const socketRef = useRef(null);
  const selectedChatIdRef = useRef(null);
  const chatsRefreshTimer = useRef(null);
  const chatsPresenceRefreshTimer = useRef(null);
  const lastReadSentRef = useRef({}); // chatId -> messageId
  const readEmitTimerRef = useRef(null);
  const chatsRefreshAfterStatusTimerRef = useRef(null);
  const mobileInboxSidebarRef = useRef(null);
  const settingsRef = useRef(settings);
  const openChatFromNotificationRef = useRef(() => {});

  const socketEndpoint = useMemo(() => getSocketEndpoint(), []);
  const isMobile = useIsMobile(900);
  const [mobileTab, setMobileTab] = useState("chats");
  const [installDownloadOpen, setInstallDownloadOpen] = useState(false);
  const mobileConversationOpen = Boolean(isMobile && mobileTab === "chats" && selectedChatId);

  useEffect(() => {
    if (!mobileConversationOpen) {
      document.body.classList.remove(MOBILE_CHAT_OPEN_BODY_CLASS);
      syncAppRootHeight();
      return undefined;
    }
    document.body.classList.add(MOBILE_CHAT_OPEN_BODY_CLASS);
    syncAppRootHeight();
    syncMobileChatVisualViewport();
    const onVv = () => {
      syncMobileChatVisualViewport();
      syncAppRootHeight();
    };
    window.visualViewport?.addEventListener?.("resize", onVv);
    window.visualViewport?.addEventListener?.("scroll", onVv);
    window.addEventListener("resize", onVv);
    return () => {
      document.body.classList.remove(MOBILE_CHAT_OPEN_BODY_CLASS);
      window.visualViewport?.removeEventListener?.("resize", onVv);
      window.visualViewport?.removeEventListener?.("scroll", onVv);
      window.removeEventListener("resize", onVv);
      syncAppRootHeight();
    };
  }, [mobileConversationOpen]);

  const t = useMemo(() => (key) => tr(settings.lang, key), [settings.lang]);

  function markBanned() {
    setMe((prev) => (prev ? { ...prev, banned: true } : prev));
  }

  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setChats([]);
      setSelectedChatId(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setAuthError("");
      try {
        const meUser = await getMe();
        if (cancelled) return;
        setMe(meUser);
      } catch (e) {
        if (cancelled) return;
        setAuthError(e.message || "Authentication failed");
        localStorage.removeItem("token");
        setToken("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Fetch chat list when authenticated.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getChats();
        if (cancelled) return;
        setChats(list);
      } catch (e) {
        // Ignore at first; user can reload or interact.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  // Socket.io: connect once authenticated.
  useEffect(() => {
    if (!token) return;

    const socket = io(socketEndpoint, {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setSocketReady(true));
    socket.on("disconnect", () => setSocketReady(false));

    socket.on("chat:message", (msg) => {
      // Update open chat immediately; otherwise refresh chat list.
      const openChatId = selectedChatIdRef.current;
      if (openChatId && msg.chatId === openChatId) {
        setMessages((prev) => [...prev, msg]);

        // If I'm currently viewing this chat and the tab is active,
        // immediately mark the incoming message as read.
        const isIncoming =
          me?.id &&
          msg.senderId &&
          Number(msg.senderId) !== me.id &&
          msg.type !== "system";
        if (isIncoming && socketReady && isWindowActive()) {
          const cid = Number(openChatId);
          const mid = Number(msg.id);
          const lastSent = Number(lastReadSentRef.current[cid] || 0);
          if (mid > lastSent) {
            lastReadSentRef.current[cid] = mid;
            if (readEmitTimerRef.current) clearTimeout(readEmitTimerRef.current);
            readEmitTimerRef.current = setTimeout(() => {
              socket.emit("chat:read", { chatId: cid, upToMessageId: mid });
            }, 120);
          }
        }
      }

      if (chatsRefreshTimer.current) clearTimeout(chatsRefreshTimer.current);
      chatsRefreshTimer.current = setTimeout(async () => {
        try {
          const list = await getChats();
          setChats(list);
        } catch {
          // ignore
        }
      }, 250);

      const lang = settingsRef.current?.lang === "ru" ? "ru" : "en";
      tryShowIncomingMessageNotification(msg, {
        meId: me?.id,
        openChatId: selectedChatIdRef.current,
        settings: settingsRef.current,
        t: (key) => tr(lang, key),
        onOpenChat: (cid) => openChatFromNotificationRef.current(cid),
      });
    });

    socket.on("user:avatar", ({ userId, avatar }) => {
      const uid = Number(userId);
      const av = String(avatar || "");

      setMe((prev) => (prev && prev.id === uid ? { ...prev, avatar: av } : prev));
      setChats((prev) =>
        prev.map((c) => (c.other?.id === uid ? { ...c, other: { ...c.other, avatar: av } } : c))
      );
      setMessages((prev) =>
        prev.map((m) => (m.senderId === uid ? { ...m, sender: { ...(m.sender || {}), avatar: av } } : m))
      );
    });

    socket.on("user:presence", ({ userId, isOnline, lastSeenAt }) => {
      const uid = Number(userId);
      const online = Boolean(isOnline);
      const seen = lastSeenAt || null;

      setPresenceTick((n) => n + 1);

      setMe((prev) =>
        prev && prev.id === uid ? { ...prev, isOnline: online, lastSeenAt: seen } : prev
      );
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid
            ? { ...c, other: { ...c.other, isOnline: online, lastSeenAt: seen } }
            : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === uid
            ? { ...m, sender: { ...(m.sender || {}), isOnline: online, lastSeenAt: seen } }
            : m
        )
      );

      if (chatsPresenceRefreshTimer.current) clearTimeout(chatsPresenceRefreshTimer.current);
      chatsPresenceRefreshTimer.current = setTimeout(async () => {
        try {
          const list = await getChats();
          setChats(list);
        } catch {
          // ignore
        }
      }, 220);
    });

    socket.on("chat:typing", ({ chatId, userId, isTyping }) => {
      const cid = Number(chatId);
      if (!cid) return;

      // Only show typing for the other user.
      if (me?.id && Number(userId) === me.id) return;

      if (isTyping) {
        const until = Date.now() + 2500;
        setTypingUntil((prev) => ({ ...prev, [cid]: until }));
      } else {
        setTypingUntil((prev) => ({ ...prev, [cid]: 0 }));
      }
    });

    socket.on("chat:message:status", ({ chatId, updates }) => {
      const cid = Number(chatId);
      if (!cid || !Array.isArray(updates)) return;
      setMessages((prev) =>
        prev.map((m) => {
          const u = updates.find((x) => Number(x.id) === m.id);
          if (!u) return m;
          return {
            ...m,
            deliveredAt: u.deliveredAt ?? m.deliveredAt ?? null,
            readAt: u.readAt ?? m.readAt ?? null,
          };
        })
      );
      if (chatsRefreshAfterStatusTimerRef.current) clearTimeout(chatsRefreshAfterStatusTimerRef.current);
      chatsRefreshAfterStatusTimerRef.current = setTimeout(async () => {
        chatsRefreshAfterStatusTimerRef.current = null;
        try {
          const list = await getChats();
          setChats(list);
        } catch {
          // ignore
        }
      }, 220);
    });

    socket.on("message:edited", ({ chatId, message }) => {
      if (!message?.id) return;
      const openChatId = selectedChatIdRef.current;
      if (!openChatId || Number(chatId) !== openChatId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, ...message } : m))
      );
    });

    socket.on("message:reactionsUpdated", ({ chatId, messageId, reactions }) => {
      const openChatId = selectedChatIdRef.current;
      if (!openChatId || Number(chatId) !== openChatId) return;
      const mid = Number(messageId);
      if (!mid) return;
      const nextReactions = Array.isArray(reactions) ? reactions : [];
      setMessages((prev) => prev.map((m) => (Number(m.id) === mid ? { ...m, reactions: nextReactions } : m)));
    });

    socket.on("message:deleted", ({ chatId, messageId }) => {
      const openChatId = selectedChatIdRef.current;
      if (!openChatId || Number(chatId) !== openChatId) return;
      const mid = Number(messageId);
      if (!mid) return;
      setMessages((prev) => prev.filter((m) => Number(m.id) !== mid));
    });

    socket.on("user:roleUpdated", ({ userId, role }) => {
      const uid = Number(userId);
      if (!uid) return;
      setMe((prev) => (prev && prev.id === uid ? { ...prev, role } : prev));
    });

    socket.on("user:banned", ({ userId, banned }) => {
      const uid = Number(userId);
      if (!uid) return;
      if (me?.id && uid === me.id) {
        setMe((prev) => (prev ? { ...prev, banned: Boolean(banned) } : prev));
      }
    });

    socket.on("group:avatarUpdated", ({ chatId, avatar }) => {
      const cid = Number(chatId);
      if (!cid) return;
      const av = String(avatar || "");
      setChats((prev) =>
        prev.map((c) => (c.id === cid && c.type === "group" ? { ...c, avatar: av } : c))
      );
    });

    return () => {
      if (chatsRefreshAfterStatusTimerRef.current) {
        clearTimeout(chatsRefreshAfterStatusTimerRef.current);
        chatsRefreshAfterStatusTimerRef.current = null;
      }
      socket.off("chat:message");
      socket.off("user:avatar");
      socket.off("user:presence");
      socket.off("chat:typing");
      socket.off("chat:message:status");
      socket.off("message:edited");
      socket.off("message:reactionsUpdated");
      socket.off("message:deleted");
      socket.off("user:roleUpdated");
      socket.off("user:banned");
      socket.off("group:avatarUpdated");
      socket.disconnect();
    };
  }, [token, socketEndpoint, me?.id]);

  async function refreshMessages(chatId) {
    const list = await getMessages(chatId, 50);
    setMessages(list);
  }

  async function selectChat(chatId) {
    setSelectedChatId(chatId);
    setChats((prev) =>
      prev.map((c) => (Number(c.id) === Number(chatId) ? { ...c, unreadCount: 0 } : c))
    );
    setMessages([]);
    const list = await getMessages(chatId, 50);
    setMessages(list);
    const lastId = list.length ? list[list.length - 1].id : 0;
    if (lastId && socketRef.current && socketReady) {
      socketRef.current.emit("chat:read", { chatId, upToMessageId: lastId });
    }
  }

  openChatFromNotificationRef.current = (chatId) => {
    if (!chatId) return;
    if (isMobile) setMobileTab("chats");
    void selectChat(chatId);
  };

  async function startChat(withUserId) {
    const chatId = await createChat(withUserId);
    await selectChat(chatId);
  }

  async function handleCreateGroup({ title, memberUserIds }) {
    const chatId = await createGroup({ title, memberUserIds });
    const list = await getChats();
    setChats(list);
    await selectChat(chatId);
  }

  async function refreshChatsList() {
    try {
      const list = await getChats();
      setChats(list);
    } catch {
      // ignore
    }
  }

  function handleSend(payload) {
    const isObj = payload && typeof payload === "object" && !Array.isArray(payload);
    const text = isObj ? String(payload.text ?? "").trim() : String(payload ?? "").trim();
    const imageUrl = isObj && payload.imageUrl ? String(payload.imageUrl).trim() : "";
    const audioUrl = isObj && payload.audioUrl ? String(payload.audioUrl).trim() : "";
    const videoUrl = isObj && payload.videoUrl ? String(payload.videoUrl).trim() : "";
    const replyToMessageId = isObj && payload.replyToMessageId ? Number(payload.replyToMessageId) : 0;
    if (!text && !imageUrl && !audioUrl && !videoUrl) return;
    if (!socketRef.current || !socketReady) return;
    if (!selectedChatId) return;
    if (me?.banned) return;
    // Sending implies typing stopped.
    socketRef.current.emit("chat:typing", { chatId: selectedChatId, isTyping: false });
    socketRef.current.emit("chat:send", {
      chatId: selectedChatId,
      text,
      ...(imageUrl ? { imageUrl } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
    });
  }

  function handleTyping(isTyping) {
    if (!socketRef.current || !socketReady) return;
    if (!selectedChatId) return;
    if (me?.banned) return;
    socketRef.current.emit("chat:typing", { chatId: selectedChatId, isTyping: Boolean(isTyping) });
  }

  async function handleEditMessage(messageId, text) {
    if (me?.banned) return;
    const data = await updateMessage(messageId, text);
    const msg = data.message;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
    );
  }

  async function handleToggleReaction(messageId, emoji) {
    if (me?.banned) return;
    const mid = Number(messageId);
    const data = await toggleReaction(mid, emoji);
    const reactions = data.reactions || [];
    setMessages((prev) => prev.map((m) => (Number(m.id) === mid ? { ...m, reactions } : m)));
  }

  async function handleAdminDeleteMessage(messageId) {
    if (me?.banned) return;
    const mid = Number(messageId);
    await adminDeleteMessage(mid);
    setMessages((prev) => prev.filter((m) => Number(m.id) !== mid));
  }

  async function handleLogin(data) {
    const res = await login(data);
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setAuthError("");
  }

  async function handleRegister(data) {
    const res = await register(data);
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setAuthError("");
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setMe(null);
    setInstallDownloadOpen(false);
  }

  async function changeMyAvatar(dataUrl) {
    setMe((prev) => (prev ? { ...prev, avatar: dataUrl || "" } : prev));
    const updated = await updateMyAvatar(dataUrl || "");
    setMe(updated);
  }

  async function changeMyProfile(next) {
    const statusKind = typeof next?.statusKind === "string" ? next.statusKind : "";
    const statusText = typeof next?.statusText === "string" ? next.statusText : "";
    const about = typeof next?.about === "string" ? next.about : "";
    setMe((prev) => (prev ? { ...prev, statusKind, statusText, about } : prev));
    const updated = await updateMyProfile({ statusKind, statusText, about });
    setMe(updated);
  }

  function goMobileTab(tab) {
    setMobileTab(tab);
    setSelectedChatId(null);
    setMessages([]);
  }

  function handleMobileBackFromChat() {
    setSelectedChatId(null);
    setMessages([]);
  }

  if (!me) {
    return (
      <div className="appRoot appRoot--auth">
        <Auth onLogin={handleLogin} onRegister={handleRegister} error={authError} t={t} />
      </div>
    );
  }

  const userMenuProps = {
    me,
    onLogout: logout,
    onChangeAvatar: changeMyAvatar,
    onChangeProfile: changeMyProfile,
    settings,
    onChangeSettings: (next) => setSettings((prev) => ({ ...prev, ...next })),
    t,
  };

  const sidebarProps = {
    chats,
    me,
    onSelectChat: selectChat,
    onStartChat: startChat,
    onCreateGroup: handleCreateGroup,
    t,
    lang: settings.lang,
  };

  const chatPropsBase = {
    chatId: selectedChatId,
    chat: chats.find((c) => c.id === selectedChatId) || null,
    otherTyping: Boolean(selectedChatId && typingUntil[selectedChatId] > Date.now()),
    messages,
    meId: me.id,
    meAvatar: me.avatar,
    meUsername: me.username,
    chatTheme: settings.chatTheme,
    onSend: handleSend,
    onEditMessage: handleEditMessage,
    onToggleReaction: handleToggleReaction,
    isAdmin: me.role === "admin",
    onAdminDeleteMessage: handleAdminDeleteMessage,
    isBanned: Boolean(me.banned),
    onTyping: handleTyping,
    onGroupMetaChanged: refreshChatsList,
    presenceTick,
    t,
    lang: settings.lang,
  };

  const chatPropsDesktop = { ...chatPropsBase, onMobileBack: undefined };
  const chatPropsMobile = { ...chatPropsBase, onMobileBack: handleMobileBackFromChat };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[Xasma] shell", {
      isMobile,
      mobileTab,
      selectedChatId,
    });
  }

  const desktopShell = (
    <div className="appShell appShell--desktop">
      <div className="topBar">
        <div className="topBarLeft">
          <div className="appTitleRow">
            <span className="appTitle">{t("appTitle")}</span>
            <span className="appBetaBadge">BETA</span>
          </div>
          <div className="statusTag">
            {socketReady ? t("realtimeOn") : t("realtimeReconnecting")}
          </div>
        </div>
        <div className="topBarRight">
          <button
            type="button"
            className="topBarDownloadBtn"
            onClick={() => setInstallDownloadOpen(true)}
          >
            {t("downloadButton")}
          </button>
          <UserMenu {...userMenuProps} variant="dropdown" />
        </div>
      </div>

      <div className="appBody">
        <Sidebar {...sidebarProps} />
        <Chat {...chatPropsDesktop} />
      </div>
    </div>
  );

  const mobileShell = (
    <div className="appShell appShell--mobile">
      <div className="mobileStage">
        {mobileTab === "chats" && !selectedChatId ? (
          <div className="mobilePane mobilePane--inbox">
            <header className="mobileMainHeader">
              <div className="mobileMainHeaderText">
                <div className="mobileBrandRow">
                  <span className="mobileBrandTitle">{t("appTitle")}</span>
                  <span className="appBetaBadge">BETA</span>
                </div>
                <div className={`mobileSocketPill${socketReady ? " mobileSocketPill--on" : ""}`}>
                  {socketReady ? t("realtimeOn") : t("realtimeReconnecting")}
                </div>
              </div>
              <div className="mobileMainHeaderActions">
                <button
                  type="button"
                  className="mobileDownloadBtn"
                  onClick={() => setInstallDownloadOpen(true)}
                >
                  {t("downloadButton")}
                </button>
                {sidebarProps.onCreateGroup ? (
                  <button
                    type="button"
                    className="mobileHeaderIconBtn"
                    onClick={() => mobileInboxSidebarRef.current?.openCreateGroup?.()}
                    aria-label={t("createGroup")}
                    title={t("createGroup")}
                  >
                    <span className="mobileHeaderIconPlus" aria-hidden>
                      +
                    </span>
                  </button>
                ) : null}
                <UserMenu {...userMenuProps} variant="dropdown" />
              </div>
            </header>
            <Sidebar ref={mobileInboxSidebarRef} {...sidebarProps} mobileLayout />
          </div>
        ) : null}

        {mobileTab === "chats" && selectedChatId ? (
          <div className="mobilePane mobilePane--conversation">
            <div className="mobileChatShell">
              <Chat {...chatPropsMobile} />
            </div>
          </div>
        ) : null}

        {mobileTab === "calls" ? (
          <div className="mobilePane mobilePane--placeholder">
            <header className="mobileSubHeader">
              <h1 className="mobileSubHeaderTitle">{t("navCalls")}</h1>
            </header>
            <div className="mobilePlaceholderBody">
              <p className="muted">{t("callsComingSoon")}</p>
            </div>
          </div>
        ) : null}

        {mobileTab === "settings" ? (
          <div className="mobilePane mobilePane--settings">
            <header className="mobileSubHeader">
              <h1 className="mobileSubHeaderTitle">{t("navSettings")}</h1>
            </header>
            <div className="mobileSettingsScroll">
              <UserMenu {...userMenuProps} variant="mobilePage" />
            </div>
          </div>
        ) : null}
      </div>

      {mobileTab === "chats" && selectedChatId ? null : (
        <nav className="mobileBottomNav" aria-label={t("mobileNavLabel")}>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "chats" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("chats")}
          >
            <span className="mobileNavIcon" aria-hidden>
              💬
            </span>
            <span className="mobileNavLabel">{t("navChats")}</span>
          </button>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "calls" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("calls")}
          >
            <span className="mobileNavIcon" aria-hidden>
              📞
            </span>
            <span className="mobileNavLabel">{t("navCalls")}</span>
          </button>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "settings" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("settings")}
          >
            <span className="mobileNavIcon" aria-hidden>
              ⚙
            </span>
            <span className="mobileNavLabel">{t("navSettings")}</span>
          </button>
        </nav>
      )}
    </div>
  );

  return (
    <AppRuntimeErrorBoundary>
      <div className={`appRoot${mobileConversationOpen ? " appRoot--mobileConversationOpen" : ""}`}>
        {isMobile ? (
          <MobileLayoutErrorBoundary fallback={desktopShell}>{mobileShell}</MobileLayoutErrorBoundary>
        ) : (
          desktopShell
        )}
      </div>
      <InstallDownloadPanel open={installDownloadOpen} onClose={() => setInstallDownloadOpen(false)} t={t} />
    </AppRuntimeErrorBoundary>
  );
}

/** Catches render errors in the mobile tree and shows desktop layout (no blank frame). */
class MobileLayoutErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[Xasma] MobileLayoutErrorBoundary", error, info?.componentStack);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[Xasma] showing desktop shell fallback after mobile layout error");
    }
  }

  render() {
    if (this.state.error && this.props.fallback != null) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/** Shows a crash screen with the exact runtime error text (avoids silent blank app). */
class AppRuntimeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[Xasma] AppRuntimeErrorBoundary", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      const msg = e?.message ? String(e.message) : String(e);
      const stack = e?.stack ? String(e.stack) : "";
      return (
        <div className="appRoot appRoot--auth" style={{ padding: 16 }}>
          <div className="authCard" style={{ maxWidth: 720 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>App crashed</div>
            <div className="authError" style={{ marginBottom: 10 }}>
              {msg}
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                opacity: 0.9,
                maxHeight: "55vh",
                overflow: "auto",
                margin: 0,
              }}
            >
              {stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function isWindowActive() {
  // "Active enough" heuristic: visible + focused (where supported).
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  if (typeof document !== "undefined" && typeof document.hasFocus === "function") {
    return document.hasFocus();
  }
  return true;
}

