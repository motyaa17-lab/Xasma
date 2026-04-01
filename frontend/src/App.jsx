import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import Auth from "./components/Auth.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Chat from "./components/Chat.jsx";
import UserMenu from "./components/UserMenu.jsx";
import { t as tr } from "./i18n.js";
import {
  createChat,
  getChats,
  getMe,
  getMessages,
  login,
  register,
  toggleReaction,
  updateMessage,
  updateMyAvatar,
} from "./api.js";
import { getSocketEndpoint } from "./api.js";

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
      };
    } catch {
      return { lang: "en", chatTheme: "ocean" };
    }
  });

  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [socketReady, setSocketReady] = useState(false);
  const [typingUntil, setTypingUntil] = useState({}); // chatId -> ms timestamp

  const socketRef = useRef(null);
  const selectedChatIdRef = useRef(null);
  const chatsRefreshTimer = useRef(null);
  const lastReadSentRef = useRef({}); // chatId -> messageId
  const readEmitTimerRef = useRef(null);

  const socketEndpoint = useMemo(() => getSocketEndpoint(), []);

  const t = useMemo(() => (key) => tr(settings.lang, key), [settings.lang]);

  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
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
        const isIncoming = me?.id && msg.senderId && Number(msg.senderId) !== me.id;
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

    return () => {
      socket.off("chat:message");
      socket.off("user:avatar");
      socket.off("user:presence");
      socket.off("chat:typing");
      socket.off("chat:message:status");
      socket.off("message:edited");
      socket.off("message:reactionsUpdated");
      socket.disconnect();
    };
  }, [token, socketEndpoint, me?.id]);

  async function refreshMessages(chatId) {
    const list = await getMessages(chatId, 50);
    setMessages(list);
  }

  async function selectChat(chatId) {
    setSelectedChatId(chatId);
    setMessages([]);
    const list = await getMessages(chatId, 50);
    setMessages(list);
    const lastId = list.length ? list[list.length - 1].id : 0;
    if (lastId && socketRef.current && socketReady) {
      socketRef.current.emit("chat:read", { chatId, upToMessageId: lastId });
    }
  }

  async function startChat(withUserId) {
    const chatId = await createChat(withUserId);
    await selectChat(chatId);
  }

  function handleSend(text) {
    if (!socketRef.current || !socketReady) return;
    if (!selectedChatId) return;
    // Sending implies typing stopped.
    socketRef.current.emit("chat:typing", { chatId: selectedChatId, isTyping: false });
    socketRef.current.emit("chat:send", { chatId: selectedChatId, text });
  }

  function handleTyping(isTyping) {
    if (!socketRef.current || !socketReady) return;
    if (!selectedChatId) return;
    socketRef.current.emit("chat:typing", { chatId: selectedChatId, isTyping: Boolean(isTyping) });
  }

  async function handleEditMessage(messageId, text) {
    const data = await updateMessage(messageId, text);
    const msg = data.message;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
    );
  }

  async function handleToggleReaction(messageId, emoji) {
    const mid = Number(messageId);
    const data = await toggleReaction(mid, emoji);
    const reactions = data.reactions || [];
    setMessages((prev) => prev.map((m) => (Number(m.id) === mid ? { ...m, reactions } : m)));
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
  }

  async function changeMyAvatar(dataUrl) {
    setMe((prev) => (prev ? { ...prev, avatar: dataUrl || "" } : prev));
    const updated = await updateMyAvatar(dataUrl || "");
    setMe(updated);
  }

  return (
    <div className="appRoot">
      {!me ? (
        <Auth onLogin={handleLogin} onRegister={handleRegister} error={authError} t={t} />
      ) : (
        <div className="appShell">
          <div className="topBar">
            <div className="topBarLeft">
              <div className="appTitle">{t("appTitle")}</div>
              <div className="statusTag">
                {socketReady ? t("realtimeOn") : t("realtimeReconnecting")}
              </div>
            </div>
            <UserMenu
              me={me}
              onLogout={logout}
              onChangeAvatar={changeMyAvatar}
              settings={settings}
              onChangeSettings={(next) => setSettings((prev) => ({ ...prev, ...next }))}
              t={t}
            />
          </div>

          <div className="appBody">
            <Sidebar
              chats={chats}
              me={me}
              onSelectChat={selectChat}
              onStartChat={startChat}
              t={t}
              lang={settings.lang}
            />
            <Chat
              chatId={selectedChatId}
              chat={chats.find((c) => c.id === selectedChatId) || null}
              otherTyping={Boolean(selectedChatId && typingUntil[selectedChatId] > Date.now())}
              messages={messages}
              meId={me.id}
              meAvatar={me.avatar}
              meUsername={me.username}
              chatTheme={settings.chatTheme}
              onSend={handleSend}
              onEditMessage={handleEditMessage}
              onToggleReaction={handleToggleReaction}
              onTyping={handleTyping}
              t={t}
              lang={settings.lang}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function isWindowActive() {
  // "Active enough" heuristic: visible + focused (where supported).
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  if (typeof document !== "undefined" && typeof document.hasFocus === "function") {
    return document.hasFocus();
  }
  return true;
}

