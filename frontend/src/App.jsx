import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import Auth from "./components/Auth.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Chat from "./components/Chat.jsx";
import UserMenu from "./components/UserMenu.jsx";
import InstallDownloadPanel from "./components/InstallDownloadPanel.jsx";
import { IconChats, IconPhone, IconSettings } from "./components/Icons.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { t as tr, normalizeLang } from "./i18n.js";
import {
  createChat,
  createGroup,
  createChannel,
  getChats,
  getMe,
  getMessages,
  patchChatPin,
  patchChatListPin,
  deleteChatMembership,
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
      const allowed = new Set(["darkGradient", "softBlur", "night"]);
      const legacy = {
        ocean: "darkGradient",
        midnight: "night",
        slate: "darkGradient",
        dark: "darkGradient",
        glass: "softBlur",
        noise: "darkGradient",
        night: "night",
      };
      const rawTheme = typeof parsed.chatTheme === "string" ? parsed.chatTheme : "darkGradient";
      const chatTheme = allowed.has(rawTheme) ? rawTheme : legacy[rawTheme] || "darkGradient";
      const rawBg = typeof parsed.chatBackgroundImageUrl === "string" ? parsed.chatBackgroundImageUrl : "";
      const chatBackgroundImageUrl =
        rawBg.startsWith("data:image/") && rawBg.length <= 2_200_000 ? rawBg : null;
      return {
        lang: normalizeLang(parsed.lang),
        chatTheme,
        chatBackgroundImageUrl,
        messageNotificationsEnabled: Boolean(parsed.messageNotificationsEnabled),
      };
    } catch {
      return {
        lang: "en",
        chatTheme: "darkGradient",
        chatBackgroundImageUrl: null,
        messageNotificationsEnabled: false,
      };
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
  const lastReadSentRef = useRef({}); // chatId -> messageId
  const readEmitTimerRef = useRef(null);
  const socketResyncTimerRef = useRef(null);
  const lastSocketResyncAtRef = useRef(0);
  const mobileInboxSidebarRef = useRef(null);
  const settingsRef = useRef(settings);
  const openChatFromNotificationRef = useRef(() => {});

  const socketEndpoint = useMemo(() => getSocketEndpoint(), []);
  const isMobile = useIsMobile(900);
  const [mobileTab, setMobileTab] = useState("chats");
  const [installDownloadOpen, setInstallDownloadOpen] = useState(false);
  const [sendRateLimitNotice, setSendRateLimitNotice] = useState("");
  const [realtimeSendNotice, setRealtimeSendNotice] = useState("");
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

  function debugLog(...args) {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.log("[Xasma]", ...args);
  }

  function previewTextForMessage(msg) {
    const text = String(msg?.text ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
    if (msg?.videoUrl) return t("notifyPreviewVideo");
    if (msg?.audioUrl) return t("notifyPreviewVoice");
    if (msg?.imageUrl) return t("notifyPreviewPhoto");
    if (msg?.type === "system") return "[Event]";
    return "…";
  }

  function reorderChatsByActivity(nextChats, chatIdToBump) {
    const cid = Number(chatIdToBump);
    if (!cid) return nextChats;
    const idx = nextChats.findIndex((c) => Number(c.id) === cid);
    if (idx < 0) return nextChats;
    const chat = nextChats[idx];
    const rest = nextChats.slice(0, idx).concat(nextChats.slice(idx + 1));
    const pinned = [];
    const unpinned = [];
    for (const c of rest) (c.listPinned ? pinned : unpinned).push(c);
    if (chat.listPinned) pinned.unshift(chat);
    else unpinned.unshift(chat);
    return pinned.concat(unpinned);
  }

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
        setAuthError(e.message || tr(normalizeLang(settingsRef.current?.lang), "authSessionFailed"));
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
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4_000,
    });
    socketRef.current = socket;

    function scheduleSocketResync(reason) {
      const now = Date.now();
      // Avoid thundering herds on flaky networks.
      if (now - lastSocketResyncAtRef.current < 900) return;
      if (socketResyncTimerRef.current) window.clearTimeout(socketResyncTimerRef.current);
      socketResyncTimerRef.current = window.setTimeout(async () => {
        socketResyncTimerRef.current = null;
        lastSocketResyncAtRef.current = Date.now();

        debugLog("socket resync", { reason });
        try {
          const list = await getChats();
          setChats(list);
        } catch (e) {
          debugLog("socket resync: getChats failed", e?.message || e);
        }

        const openChatId = Number(selectedChatIdRef.current || 0);
        if (!openChatId) return;
        try {
          const list = await getMessages(openChatId, 50);
          setMessages(list);
          const lastId = list.length ? Number(list[list.length - 1].id) : 0;
          if (lastId && socket.connected) {
            socket.emit("chat:read", { chatId: openChatId, upToMessageId: lastId });
          }
        } catch (e) {
          debugLog("socket resync: getMessages failed", e?.message || e);
        }
      }, 220);
    }

    socket.on("connect", () => {
      setSocketReady(true);
      setRealtimeSendNotice("");
      scheduleSocketResync("connect");
    });
    socket.on("disconnect", (reason) => {
      setSocketReady(false);
      debugLog("socket disconnect", reason);
    });
    socket.on("connect_error", (err) => {
      debugLog("socket connect_error", err?.message || err);
    });
    socket.io.on("reconnect", (attempt) => {
      debugLog("socket reconnect", attempt);
      scheduleSocketResync("reconnect");
    });
    socket.io.on("reconnect_error", (err) => {
      debugLog("socket reconnect_error", err?.message || err);
    });

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

      // Keep chat list fresh without full refresh:
      // update the affected chat row (last preview, time, unread count) and bump it to top of its section.
      setChats((prev) => {
        const cid = Number(msg?.chatId);
        if (!cid) return prev;
        const now = Date.now();
        const open = Number(openChatId || 0);
        const isIncoming =
          me?.id &&
          msg?.senderId &&
          Number(msg.senderId) !== Number(me.id) &&
          msg?.type !== "system";
        const treatAsUnread = Boolean(isIncoming && (open !== cid || !isWindowActive()));

        const next = prev.map((c) => {
          if (Number(c.id) !== cid) return c;
          const last = {
            text: previewTextForMessage(msg),
            createdAt: msg.createdAt || new Date(now).toISOString(),
            senderId: msg.senderId != null ? Number(msg.senderId) : null,
          };
          const unreadCount = treatAsUnread ? Math.max(0, Number(c.unreadCount) || 0) + 1 : c.unreadCount;
          return { ...c, last, unreadCount };
        });
        return reorderChatsByActivity(next, cid);
      });

      const lang = normalizeLang(settingsRef.current?.lang);
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
      const cid = Number(chatId);
      const mid = Number(messageId);
      if (!cid || !mid) return;
      const openChatId = selectedChatIdRef.current;
      if (openChatId && cid === openChatId) {
        setMessages((prev) => prev.filter((m) => Number(m.id) !== mid));
      }
      setChats((prev) =>
        prev.map((c) =>
          c.id === cid && Number(c.pinnedMessageId) === mid
            ? { ...c, pinnedMessageId: null, pinnedPreview: null }
            : c
        )
      );
    });

    socket.on("chat:pinnedUpdated", ({ chatId, pinnedMessageId, pinnedPreview } = {}) => {
      const cid = Number(chatId);
      if (!cid) return;
      const pid = pinnedMessageId != null ? Number(pinnedMessageId) : null;
      const pv = typeof pinnedPreview === "string" ? pinnedPreview : pinnedPreview == null ? null : String(pinnedPreview);
      setChats((prev) =>
        prev.map((c) =>
          c.id === cid ? { ...c, pinnedMessageId: pid, pinnedPreview: pv } : c
        )
      );
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
        prev.map((c) =>
          c.id === cid && (c.type === "group" || c.type === "channel") ? { ...c, avatar: av } : c
        )
      );
    });

    socket.on("user:auraColor", ({ userId, auraColor } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const ac = typeof auraColor === "string" ? auraColor : "";
      setMe((prev) => (prev && prev.id === uid ? { ...prev, auraColor: ac } : prev));
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid ? { ...c, other: { ...c.other, auraColor: ac } } : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.senderId) === uid && m.sender
            ? { ...m, sender: { ...m.sender, auraColor: ac } }
            : m
        )
      );
    });

    socket.on("user:tagUpdated", ({ userId, tag, tagColor, tagStyle } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const tg = typeof tag === "string" ? tag : "";
      const tc = typeof tagColor === "string" ? tagColor : "";
      const ts = tagStyle === "gradient" ? "gradient" : "solid";
      setMe((prev) =>
        prev && prev.id === uid ? { ...prev, tag: tg, tagColor: tc, tagStyle: ts } : prev
      );
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid
            ? { ...c, other: { ...c.other, tag: tg, tagColor: tc, tagStyle: ts } }
            : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.senderId) === uid && m.sender
            ? { ...m, sender: { ...m.sender, tag: tg, tagColor: tc, tagStyle: ts } }
            : m
        )
      );
    });

    socket.on("user:profileStatus", ({ userId, statusKind, statusText } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const sk = typeof statusKind === "string" ? statusKind : "";
      const st = typeof statusText === "string" ? statusText : "";
      setMe((prev) =>
        prev && prev.id === uid ? { ...prev, statusKind: sk, statusText: st } : prev
      );
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid ? { ...c, other: { ...c.other, statusKind: sk, statusText: st } } : c
        )
      );
    });

    socket.on("user:messageCount", ({ userId, messageCount } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const mc = Math.max(0, Number(messageCount) || 0);
      setMe((prev) => (prev && prev.id === uid ? { ...prev, messageCount: mc } : prev));
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid ? { ...c, other: { ...c.other, messageCount: mc } } : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.senderId) === uid && m.sender
            ? { ...m, sender: { ...m.sender, messageCount: mc } }
            : m
        )
      );
    });

    socket.on("chat:sendRateLimited", ({ retryAfterMs } = {}) => {
      const sec = Math.max(1, Math.ceil(Number(retryAfterMs || 10_000) / 1000));
      const lang = normalizeLang(settingsRef.current?.lang);
      setSendRateLimitNotice(tr(lang, "sendRateLimited").replace("{seconds}", String(sec)));
    });

    return () => {
      if (socketResyncTimerRef.current) {
        window.clearTimeout(socketResyncTimerRef.current);
        socketResyncTimerRef.current = null;
      }
      socket.off("connect_error");
      socket.io?.off?.("reconnect");
      socket.io?.off?.("reconnect_error");
      socket.off("chat:message");
      socket.off("user:avatar");
      socket.off("user:presence");
      socket.off("chat:typing");
      socket.off("chat:message:status");
      socket.off("message:edited");
      socket.off("message:reactionsUpdated");
      socket.off("message:deleted");
      socket.off("chat:pinnedUpdated");
      socket.off("user:roleUpdated");
      socket.off("user:banned");
      socket.off("group:avatarUpdated");
      socket.off("user:auraColor");
      socket.off("user:tagUpdated");
      socket.off("user:profileStatus");
      socket.off("user:messageCount");
      socket.off("chat:sendRateLimited");
      socket.disconnect();
    };
  }, [token, socketEndpoint, me?.id]);

  useEffect(() => {
    if (!token) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const s = socketRef.current;
      if (!s) return;
      // On Android, background/foreground can stall the WebSocket; nudging connect helps.
      if (!s.connected) {
        try {
          s.connect();
        } catch {
          // ignore
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [token]);

  useEffect(() => {
    if (!sendRateLimitNotice) return;
    const id = window.setTimeout(() => setSendRateLimitNotice(""), 12_000);
    return () => window.clearTimeout(id);
  }, [sendRateLimitNotice]);

  useEffect(() => {
    if (!realtimeSendNotice) return;
    const id = window.setTimeout(() => setRealtimeSendNotice(""), 6_000);
    return () => window.clearTimeout(id);
  }, [realtimeSendNotice]);

  async function refreshMessages(chatId) {
    const list = await getMessages(chatId, 50);
    setMessages(list);
  }

  async function handleSetChatPin(messageId) {
    const cid = selectedChatId;
    if (!cid) return;
    try {
      const data = await patchChatPin(cid, messageId);
      setChats((prev) =>
        prev.map((c) =>
          c.id === Number(cid)
            ? {
                ...c,
                pinnedMessageId: data.pinnedMessageId ?? null,
                pinnedPreview: data.pinnedPreview ?? null,
              }
            : c
        )
      );
    } catch {
      /* ignore; Chat stays consistent on next refresh */
    }
  }

  async function selectChat(chatId) {
    setSendRateLimitNotice("");
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

  async function handleCreateChannel({ title, avatar, memberUserIds }) {
    const chatId = await createChannel({ title, avatar, memberUserIds });
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

  async function handleChatListPinToggle(chatId, nextPinned) {
    await patchChatListPin(chatId, nextPinned);
    await refreshChatsList();
  }

  async function handleChatMembershipDelete(chatId) {
    await deleteChatMembership(chatId);
    setChats((prev) => prev.filter((c) => Number(c.id) !== Number(chatId)));
    if (Number(selectedChatId) === Number(chatId)) {
      setSelectedChatId(null);
      setMessages([]);
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
    if (!socketRef.current || !socketReady) {
      setRealtimeSendNotice(t("realtimeReconnecting"));
      return;
    }
    if (!selectedChatId) return;
    if (me?.banned) return;
    const activeChat = chats.find((c) => Number(c.id) === Number(selectedChatId));
    if (activeChat && activeChat.canPostMessage === false) return;
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
    const activeChat = chats.find((c) => Number(c.id) === Number(selectedChatId));
    if (activeChat && activeChat.canPostMessage === false) return;
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
    const auraColor = next?.auraColor !== undefined ? next.auraColor : undefined;
    setMe((prev) =>
      prev
        ? {
            ...prev,
            statusKind,
            statusText,
            about,
            ...(auraColor !== undefined ? { auraColor } : {}),
          }
        : prev
    );
    const updated = await updateMyProfile({
      statusKind,
      statusText,
      about,
      ...(auraColor !== undefined ? { auraColor } : {}),
    });
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
    onCreateChannel: handleCreateChannel,
    onChatListPinToggle: handleChatListPinToggle,
    onChatDelete: handleChatMembershipDelete,
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
    chatBackgroundImageUrl: settings.chatBackgroundImageUrl || null,
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
    sendRateLimitNotice,
    realtimeReady: socketReady,
    realtimeSendNotice,
    meAuraColor: me?.auraColor,
    onSetChatPin: handleSetChatPin,
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
                {sidebarProps.onCreateChannel ? (
                  <button
                    type="button"
                    className="mobileHeaderIconBtn"
                    onClick={() => mobileInboxSidebarRef.current?.openCreateChannel?.()}
                    aria-label={t("createChannel")}
                    title={t("createChannel")}
                  >
                    <span className="mobileHeaderIconChannel" aria-hidden>
                      #
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
              <IconChats size={20} />
            </span>
            <span className="mobileNavLabel">{t("navChats")}</span>
          </button>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "calls" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("calls")}
          >
            <span className="mobileNavIcon" aria-hidden>
              <IconPhone size={20} />
            </span>
            <span className="mobileNavLabel">{t("navCalls")}</span>
          </button>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "settings" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("settings")}
          >
            <span className="mobileNavIcon" aria-hidden>
              <IconSettings size={20} />
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

