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
  onEditMessage,
  onToggleReaction,
  onTyping,
  t,
  lang,
}) {
  const [text, setText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [reactionPickerForId, setReactionPickerForId] = useState(null);
  const listRef = useRef(null);
  const typingStartTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingActiveRef = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatId, messages.length]);

  useEffect(() => {
    typingActiveRef.current = false;
    if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    onTyping?.(false);
    setEditingMessageId(null);
    setMenuMessageId(null);
    setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    if (!editingMessageId) return;
    typingActiveRef.current = false;
    if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    onTyping?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMessageId]);

  useEffect(() => {
    if (menuMessageId == null) return;
    const onDown = () => setMenuMessageId(null);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuMessageId]);

  useEffect(() => {
    if (reactionPickerForId == null) return;
    const onDown = () => setReactionPickerForId(null);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [reactionPickerForId]);

  async function handlePrimary() {
    const trimmed = String(text).trim();
    if (!trimmed) return;
    onTyping?.(false);
    if (editingMessageId) {
      try {
        await onEditMessage(editingMessageId, trimmed);
      } catch {
        return;
      }
      setEditingMessageId(null);
      setText("");
      return;
    }
    onSend(trimmed);
    setText("");
  }

  function scheduleTyping() {
    if (editingMessageId) return;
    if (!typingActiveRef.current) {
      if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
      typingStartTimerRef.current = setTimeout(() => {
        typingActiveRef.current = true;
        onTyping?.(true);
      }, 350);
    }
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
                <div className={m.senderId === meId ? "bubble me bubbleOwn" : "bubble"}>
                  <div className="reactBtnWrap">
                    <button
                      type="button"
                      className="reactBtn"
                      aria-label="React"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactionPickerForId((id) => (id === m.id ? null : m.id));
                      }}
                    >
                      +
                    </button>
                    {reactionPickerForId === m.id ? (
                      <div className="reactPicker" role="menu" onMouseDown={(e) => e.stopPropagation()}>
                        {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emo) => (
                          <button
                            key={emo}
                            type="button"
                            className="reactPick"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactionPickerForId(null);
                              onToggleReaction?.(m.id, emo);
                            }}
                          >
                            {emo}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {m.senderId === meId ? (
                    <div className="msgMenu">
                      <button
                        type="button"
                        className="msgMenuBtn"
                        aria-label={t("menu")}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuMessageId((id) => (id === m.id ? null : m.id));
                        }}
                      >
                        ⋯
                      </button>
                      {menuMessageId === m.id ? (
                        <div className="msgMenuDropdown" role="menu">
                          <button
                            type="button"
                            className="msgMenuItem"
                            role="menuitem"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMessageId(m.id);
                              setText(String(m.text ?? ""));
                              setMenuMessageId(null);
                              onTyping?.(false);
                            }}
                          >
                            {t("edit")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="bubbleText">
                    {m.text}
                    {m.editedAt ? (
                      <span className="bubbleEdited"> {t("edited")}</span>
                    ) : null}
                  </div>
                  <div className="bubbleMeta">
                    <span className="bubbleTime">{formatTime(m.createdAt)}</span>
                    {m.senderId === meId ? (
                      <span className="bubbleChecks" title={checksTitle(m, t)}>
                        {renderChecks(m)}
                      </span>
                    ) : null}
                  </div>

                  {Array.isArray(m.reactions) && m.reactions.length ? (
                    <div className="reactionsRow">
                      {m.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          className={r.reactedByMe ? "reactionPill active" : "reactionPill"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleReaction?.(m.id, r.emoji);
                          }}
                        >
                          <span className="reactionEmoji">{r.emoji}</span>
                          <span className="reactionCount">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
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
                if (e.key === "Escape" && editingMessageId) {
                  e.preventDefault();
                  setEditingMessageId(null);
                  setText("");
                  onTyping?.(false);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handlePrimary();
                }
              }}
            />
            <button
              className="sendBtn"
              type="button"
              onMouseDown={(e) => {
                // Keep click from being lost when the textarea blurs first (browser focus order).
                e.preventDefault();
              }}
              onClick={handlePrimary}
              disabled={!String(text).trim()}
            >
              {editingMessageId ? t("save") : t("send")}
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
