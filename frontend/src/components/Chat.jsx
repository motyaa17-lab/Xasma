import React, { useEffect, useRef, useState } from "react";
import { tf } from "../i18n.js";

export default function Chat({
  chatId,
  chat,
  otherTyping,
  messages,
  meId,
  meAvatar,
  meUsername,
  chatTheme,
  onSend,
  onTyping,
  t,
  lang,
}) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const typingStartTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingActiveRef = useRef(false);

  useEffect(() => {
    // Scroll to bottom when switching chats or new messages.
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatId, messages.length]);

  useEffect(() => {
    // Switching chats: stop typing in previous chat.
    typingActiveRef.current = false;
    if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    onTyping?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  function handleSend() {
    const t = text.trim();
    if (!t) return;
    onTyping?.(false);
    onSend(t);
    setText("");
  }

  function scheduleTyping() {
    // Start typing (debounced).
    if (!typingActiveRef.current) {
      if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
      typingStartTimerRef.current = setTimeout(() => {
        typingActiveRef.current = true;
        onTyping?.(true);
      }, 350);
    }

    // Stop typing after inactivity.
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      onTyping?.(false);
    }, 1200);
  }

  return (
    <main className={chatTheme ? `chatMain chatTheme-${chatTheme}` : "chatMain"}>
      {!chatId ? (
        <div className="emptyState">
          <div className="emptyTitle">{t("selectChatTitle")}</div>
          <div className="muted">{t("selectChatHint")}</div>
        </div>
      ) : (
        <>
          <div className="chatHeader">
            <div className="chatHeaderLeft">
              <div className="avatarSm">
                {chat?.other?.avatar ? (
                  <img src={chat.other.avatar} alt="" />
                ) : (
                  <span>{initials(chat?.other?.username || "")}</span>
                )}
              </div>
              <div className="chatHeaderInfo">
                <div className="chatHeaderName">{chat?.other?.username || ""}</div>
                <div className="chatHeaderStatus">
                  {otherTyping ? t("typing") : renderPresence(chat?.other, lang)}
                </div>
              </div>
            </div>
          </div>

          <div className="messages" ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.senderId === meId ? "bubbleRow me" : "bubbleRow"}
              >
                <div className="msgAvatar" title={m.sender?.username || ""}>
                  {getAvatarSrc(m, meId, meAvatar) ? (
                    <img src={getAvatarSrc(m, meId, meAvatar)} alt="" />
                  ) : (
                    <span>{initials(getDisplayName(m, meId, meUsername))}</span>
                  )}
                </div>
                <div className={m.senderId === meId ? "bubble me" : "bubble"}>
                  <div className="bubbleText">{m.text}</div>
                  <div className="bubbleMeta">
                    <span className="bubbleTime">{formatTime(m.createdAt)}</span>
                    {m.senderId === meId ? (
                      <span className="bubbleChecks" title={checksTitle(m, t)}>
                        {renderChecks(m)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="composer">
            <textarea
              className="composerInput"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                scheduleTyping();
              }}
              rows={1}
              placeholder={t("typeMessagePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              className="sendBtn"
              type="button"
              onClick={handleSend}
              disabled={!text.trim()}
            >
              {t("send")}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function formatTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderPresence(user, lang) {
  if (!user) return "";
  if (user.isOnline) return tf(lang, "online");
  if (!user.lastSeenAt) return tf(lang, "lastSeen");
  return tf(lang, "lastSeenAt", { time: formatLastSeen(user.lastSeenAt, lang) });
}

function formatLastSeen(v, lang) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const locale = lang === "ru" ? "ru-RU" : "en-US";
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAvatarSrc(message, meId, meAvatar) {
  if (message.senderId === meId) return meAvatar || "";
  return message.sender?.avatar || "";
}

function renderChecks(m) {
  if (m.readAt) return "✓✓";
  if (m.deliveredAt) return "✓";
  return "";
}

function checksTitle(m, t) {
  if (m.readAt) return "Read";
  if (m.deliveredAt) return "Delivered";
  return "";
}

function getDisplayName(message, meId, meUsername) {
  if (message.senderId === meId) return meUsername || "Me";
  return message.sender?.username || "User";
}

function initials(name) {
  const s = String(name || "").trim();
  return (s[0] || "?").toUpperCase();
}

