import React, { useEffect, useRef, useState } from "react";
import { tf } from "../i18n.js";
import { uploadChatImage, uploadChatAudio, uploadChatVideo, getApiBase } from "../api.js";
import GroupInfoModal from "./GroupInfoModal.jsx";
import VoiceRecorderPanel from "./VoiceRecorderPanel.jsx";
import VoiceMessagePlayer from "./VoiceMessagePlayer.jsx";
import VideoNoteRecorder from "./VideoNoteRecorder.jsx";
import CircleVideoMessage from "./CircleVideoMessage.jsx";

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
  isAdmin,
  onAdminDeleteMessage,
  isBanned,
  onTyping,
  onGroupMetaChanged,
  presenceTick,
  t,
  lang,
}) {
  const [text, setText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [reactionPickerForId, setReactionPickerForId] = useState(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState(null);
  const [pendingPreviewObjectUrl, setPendingPreviewObjectUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [recordingStream, setRecordingStream] = useState(null);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [videoNoteOpen, setVideoNoteOpen] = useState(false);
  const [videoNoteUploading, setVideoNoteUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordCancelledRef = useRef(false);
  const voiceStartingRef = useRef(false);
  const typingStartTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingActiveRef = useRef(false);

  const isGroup = chat?.type === "group";

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
    setGroupInfoOpen(false);
    setPendingImageUrl(null);
    setImageUploading(false);
    setVoiceRecording(false);
    setRecordingStream(null);
    setVoiceUploading(false);
    setVideoNoteOpen(false);
    setVideoNoteUploading(false);
    setUploadError("");
    setPendingPreviewObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    return () => {
      recordCancelledRef.current = true;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordChunksRef.current = [];
    };
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

  function clearPendingImage() {
    setPendingImageUrl(null);
    setUploadError("");
    setPendingPreviewObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setUploadError(t("uploadImageTypeError"));
      return;
    }
    setUploadError("");
    setImageUploading(true);
    try {
      const url = await uploadChatImage(file);
      setPendingPreviewObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setPendingImageUrl(url);
    } catch (err) {
      const msg =
        err?.name === "ApiError" ? err.message : String(err?.message || t("uploadImageError"));
      setUploadError(msg);
    } finally {
      setImageUploading(false);
    }
  }

  async function handleVideoNoteSend(file) {
    setUploadError("");
    setVideoNoteUploading(true);
    try {
      const url = await uploadChatVideo(file);
      onSend({ text: "", videoUrl: url });
      setVideoNoteOpen(false);
    } catch (err) {
      const msg =
        err?.name === "ApiError" ? err.message : String(err?.message || t("videoNoteUploadError"));
      setUploadError(msg);
    } finally {
      setVideoNoteUploading(false);
    }
  }

  function startVoiceRecording() {
    if (typeof MediaRecorder === "undefined") {
      setUploadError(t("voiceNotSupported"));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setUploadError(t("voiceNotSupported"));
      return;
    }
    if (
      isBanned ||
      editingMessageId ||
      imageUploading ||
      voiceUploading ||
      voiceRecording ||
      pendingImageUrl ||
      voiceStartingRef.current ||
      videoNoteOpen ||
      videoNoteUploading
    ) {
      return;
    }
    setUploadError("");
    recordCancelledRef.current = false;
    recordChunksRef.current = [];
    voiceStartingRef.current = true;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaStreamRef.current = stream;
        const mime = pickRecorderMime();
        let rec;
        try {
          rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        } catch {
          try {
            rec = new MediaRecorder(stream);
          } catch {
            stream.getTracks().forEach((tr) => tr.stop());
            mediaStreamRef.current = null;
            setUploadError(t("voiceNotSupported"));
            return;
          }
        }
        mediaRecorderRef.current = rec;
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) recordChunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          setRecordingStream(null);
          mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
          mediaStreamRef.current = null;
          const cancelled = recordCancelledRef.current;
          recordCancelledRef.current = false;
          mediaRecorderRef.current = null;
          setVoiceRecording(false);
          const chunks = [...recordChunksRef.current];
          recordChunksRef.current = [];
          if (cancelled) return;
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          if (blob.size < 256) {
            setUploadError(t("voiceTooShort"));
            return;
          }
          const ext = extForRecorderMime(rec.mimeType || blob.type);
          const file = new File([blob], `voice-${Date.now()}${ext}`, {
            type: blob.type || rec.mimeType || "application/octet-stream",
          });
          setVoiceUploading(true);
          onTyping?.(false);
          (async () => {
            try {
              const url = await uploadChatAudio(file);
              onSend({ text: "", audioUrl: url });
            } catch (err) {
              const msg =
                err?.name === "ApiError" ? err.message : String(err?.message || t("uploadVoiceError"));
              setUploadError(msg);
            } finally {
              setVoiceUploading(false);
            }
          })();
        };
        rec.start(200);
        setRecordingStream(stream);
        setVoiceRecording(true);
      })
      .catch(() => {
        setUploadError(t("voiceMicDenied"));
      })
      .finally(() => {
        voiceStartingRef.current = false;
      });
  }

  function cancelVoiceRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    recordCancelledRef.current = true;
    mediaRecorderRef.current.stop();
  }

  function finishVoiceRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    recordCancelledRef.current = false;
    mediaRecorderRef.current.stop();
  }

  async function handlePrimary() {
    const trimmed = String(text).trim();
    onTyping?.(false);
    if (isBanned) return;
    if (voiceRecording) return;
    if (videoNoteOpen) return;
    if (editingMessageId) {
      if (!trimmed) return;
      try {
        await onEditMessage(editingMessageId, trimmed);
      } catch {
        return;
      }
      setEditingMessageId(null);
      setText("");
      return;
    }
    if (!pendingImageUrl && !trimmed) return;
    if (imageUploading || voiceRecording) return;
    onSend({ text: trimmed, imageUrl: pendingImageUrl || undefined });
    setText("");
    clearPendingImage();
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
            {isGroup ? (
              <button type="button" className="chatHeaderGroupTap" onClick={() => setGroupInfoOpen(true)}>
                <div className="avatarSm">
                  {chat?.avatar ? (
                    <img src={chat.avatar} alt="" />
                  ) : (
                    <span>{initials(chat?.title || "")}</span>
                  )}
                </div>
                <div className="chatHeaderInfo">
                  <div className="chatHeaderName">
                    <span className="chatHeaderTitleText">{chat?.title || t("groupChat")}</span>
                    {typeof chat?.memberCount === "number" ? (
                      <span className="chatHeaderMembersMeta">
                        {" · "}
                        {chat.memberCount === 1
                          ? t("participantCountOne")
                          : t("participantCountMany").replace("{count}", String(chat.memberCount))}
                        {typeof chat?.onlineMemberCount === "number" ? (
                          <>
                            <span className="chatHeaderOnlineSep">{t("groupOnlineSep")}</span>
                            <span className="chatHeaderOnlineCount">
                              {t("groupOnlineCount").replace("{count}", String(chat.onlineMemberCount))}
                            </span>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <div className="chatHeaderStatus">{otherTyping ? t("typing") : t("groupChat")}</div>
                </div>
              </button>
            ) : (
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
            )}
            {isGroup ? (
              <button
                type="button"
                className="chatHeaderInfoBtn"
                title={t("groupInfo")}
                aria-label={t("groupInfo")}
                onClick={() => setGroupInfoOpen(true)}
              >
                ⓘ
              </button>
            ) : null}
          </div>

          {isGroup && chatId ? (
            <GroupInfoModal
              open={groupInfoOpen}
              onClose={() => setGroupInfoOpen(false)}
              chatId={chatId}
              chatTitle={chat?.title}
              listGroupAvatar={chat?.avatar ?? ""}
              onMetaChanged={onGroupMetaChanged}
              presenceTick={presenceTick}
              t={t}
              lang={lang}
            />
          ) : null}

          <div className="messages" ref={listRef}>
            {messages.map((m) =>
              m.type === "system" ? (
                <div key={m.id} className="systemMessageRow">
                  <div className="systemMessageInner">{formatSystemLine(m, t)}</div>
                  <div className="systemMessageTime">{formatTime(m.createdAt)}</div>
                </div>
              ) : (
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
                  <div className={m.senderId === meId ? "bubble me bubbleOwn bubbleWithActions" : "bubble bubbleWithActions"}>
                    <div className={m.senderId === meId ? "reactBtnWrap right" : "reactBtnWrap left"}>
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
                              onMouseDown={(e) => e.stopPropagation()}
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
                            {!isBanned ? (
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
                            ) : null}
                            {isAdmin ? (
                              <button
                                type="button"
                                className="msgMenuItem"
                                role="menuitem"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuMessageId(null);
                                  onAdminDeleteMessage?.(m.id);
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : isAdmin ? (
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
                                setMenuMessageId(null);
                                onAdminDeleteMessage?.(m.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {isGroup ? (
                      <div className="msgSenderName">{m.sender?.username || "?"}</div>
                    ) : null}
                    {m.imageUrl ? (
                      <a
                        href={messageMediaAbsUrl(m.imageUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="msgImageLink"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <img
                          src={messageMediaAbsUrl(m.imageUrl)}
                          alt=""
                          className="msgImage"
                          loading="lazy"
                        />
                      </a>
                    ) : null}
                    {m.videoUrl ? (
                      <CircleVideoMessage
                        src={messageMediaAbsUrl(m.videoUrl)}
                        tapSoundLabel={t("videoTapSound")}
                        soundOnLabel={t("videoSoundOn")}
                      />
                    ) : null}
                    {m.audioUrl ? (
                      <VoiceMessagePlayer
                        src={messageMediaAbsUrl(m.audioUrl)}
                        messageId={m.id}
                        isOwn={m.senderId === meId}
                        playLabel={t("voicePlay")}
                        pauseLabel={t("voicePause")}
                      />
                    ) : null}
                    {String(m.text ?? "").trim() ? (
                      <div className="bubbleText">
                        {m.text}
                        {m.editedAt ? (
                          <span className="bubbleEdited"> {t("edited")}</span>
                        ) : null}
                      </div>
                    ) : m.editedAt ? (
                      <div className="bubbleText bubbleTextMetaOnly">
                        <span className="bubbleEdited">{t("edited")}</span>
                      </div>
                    ) : null}
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
                            disabled={isBanned}
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
              )
            )}
          </div>

          <div className="composer">
            {isBanned ? <div className="banBanner">{t("authBanned")}</div> : null}
            {uploadError ? <div className="uploadErrBanner">{uploadError}</div> : null}
            {videoNoteOpen ? (
              <VideoNoteRecorder
                onSend={handleVideoNoteSend}
                onClose={() => setVideoNoteOpen(false)}
                t={t}
              />
            ) : null}
            {voiceRecording && recordingStream ? (
              <VoiceRecorderPanel
                audioStream={recordingStream}
                onStopSend={finishVoiceRecording}
                onCancel={cancelVoiceRecording}
                t={t}
              />
            ) : null}
            {imageUploading ? <div className="uploadProgressHint">{t("uploadImageProgress")}</div> : null}
            {voiceUploading ? <div className="uploadProgressHint">{t("voiceSending")}</div> : null}
            {videoNoteUploading ? <div className="uploadProgressHint">{t("videoNoteUploading")}</div> : null}
            {pendingPreviewObjectUrl && !editingMessageId ? (
              <div className="pendingImageStrip">
                <img src={pendingPreviewObjectUrl} alt="" className="pendingImageThumb" />
                <button
                  type="button"
                  className="pendingImageRemove"
                  onClick={clearPendingImage}
                  disabled={imageUploading || voiceRecording || videoNoteOpen || videoNoteUploading}
                  aria-label={t("removeAttachedPhoto")}
                >
                  ×
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              className="composerFileInput"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              aria-hidden="true"
              tabIndex={-1}
              onChange={onPickImage}
            />
            <div className="composerMain">
              <button
                type="button"
                className="attachPhotoBtn"
                disabled={
                  isBanned ||
                  Boolean(editingMessageId) ||
                  imageUploading ||
                  voiceUploading ||
                  voiceRecording ||
                  videoNoteOpen ||
                  videoNoteUploading
                }
                aria-label={t("attachPhoto")}
                title={t("attachPhoto")}
                onClick={() => fileInputRef.current?.click()}
              >
                📎
              </button>
              <textarea
                className="composerInput"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  scheduleTyping();
                }}
                rows={1}
                placeholder={t("typeMessagePlaceholder")}
                disabled={isBanned || imageUploading || voiceRecording || videoNoteOpen || videoNoteUploading}
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
                type="button"
                className={`videoCamBtn${videoNoteOpen ? " videoCamBtn--active" : ""}`}
                disabled={
                  isBanned ||
                  Boolean(editingMessageId) ||
                  Boolean(pendingImageUrl) ||
                  voiceRecording ||
                  imageUploading ||
                  voiceUploading ||
                  videoNoteOpen ||
                  videoNoteUploading
                }
                aria-label={t("videoNoteOpenCamera")}
                title={t("videoNoteOpenCamera")}
                onClick={() => setVideoNoteOpen(true)}
              >
                <svg
                  className="videoCamIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="7" width="13" height="11" rx="2" />
                  <path d="M16 10l5-3v11l-5-3" />
                </svg>
              </button>
              <button
                type="button"
                className={`voiceMicBtn${voiceRecording ? " voiceMicBtn--recording" : ""}`}
                disabled={
                  isBanned ||
                  Boolean(editingMessageId) ||
                  Boolean(pendingImageUrl) ||
                  voiceRecording ||
                  imageUploading ||
                  voiceUploading ||
                  videoNoteOpen ||
                  videoNoteUploading
                }
                aria-label={t("voiceRecord")}
                title={t("voiceRecord")}
                onClick={startVoiceRecording}
              >
                <svg
                  className="voiceMicIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
                  <path d="M19 11a7 7 0 0 1-14 0" />
                  <path d="M12 18v3" />
                </svg>
              </button>
              <button
                className="sendBtn"
                type="button"
                onMouseDown={(e) => {
                  // Keep click from being lost when the textarea blurs first (browser focus order).
                  e.preventDefault();
                }}
                onClick={handlePrimary}
                disabled={
                  isBanned ||
                  imageUploading ||
                  voiceRecording ||
                  videoNoteOpen ||
                  videoNoteUploading ||
                  (editingMessageId ? !String(text).trim() : !String(text).trim() && !pendingImageUrl)
                }
              >
                {editingMessageId ? t("save") : t("send")}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function messageMediaAbsUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getApiBase().replace(/\/$/, "");
  const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${p}`;
}

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "video/webm;codecs=opus",
    "video/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const t of types) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // ignore
    }
  }
  return "";
}

function extForRecorderMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("mp4") || m.includes("m4a")) return ".m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  if (m.includes("wav")) return ".wav";
  return ".webm";
}

function formatSystemLine(m, t) {
  const p = m.systemPayload || {};
  const actor = String(p.actorUsername || m.sender?.username || "?");
  const target = String(p.targetUsername || "?");
  switch (m.systemKind) {
    case "group_created":
      return t("systemGroupCreated").replace("{actor}", actor);
    case "member_added":
      return t("systemMemberAdded").replace("{actor}", actor).replace("{target}", target);
    case "member_removed":
      return t("systemMemberRemoved").replace("{actor}", actor).replace("{target}", target);
    default:
      return m.text || "";
  }
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
