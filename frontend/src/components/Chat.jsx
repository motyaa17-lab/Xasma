import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tf } from "../i18n.js";
import { uploadChatImage, uploadChatAudio, uploadChatVideo, getApiBase } from "../api.js";
import GroupInfoModal from "./GroupInfoModal.jsx";
import VoiceMessagePlayer from "./VoiceMessagePlayer.jsx";
import CircleVideoMessage from "./CircleVideoMessage.jsx";

const MAX_VIDEO_NOTE_SEC = 60;
const QUICK_REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
/** Distance from bottom (px) to treat as "following" the chat for auto-scroll on new messages. */
const SCROLL_NEAR_BOTTOM_PX = 100;

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
  onMobileBack,
}) {
  const [text, setText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [enteringMessageIds, setEnteringMessageIds] = useState(() => new Set());
  const [chatOpening, setChatOpening] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState(null);
  const [pendingPreviewObjectUrl, setPendingPreviewObjectUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceArming, setVoiceArming] = useState(false);
  const [voiceRecMs, setVoiceRecMs] = useState(0);
  const [voicePressing, setVoicePressing] = useState(false);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoArming, setVideoArming] = useState(false);
  const [videoRecSec, setVideoRecSec] = useState(0);
  const [videoPressing, setVideoPressing] = useState(false);
  const [videoLocked, setVideoLocked] = useState(false);
  const [videoNoteUploading, setVideoNoteUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [videoNoteDraft, setVideoNoteDraft] = useState(null); // { blob, mimeHint, url }
  const listRef = useRef(null);
  const nearBottomRef = useRef(true);
  const scrollAfterSendRef = useRef(false);
  const scrollAfterSendClearTimerRef = useRef(null);
  const prevMessagesScrollMetaRef = useRef({ chatId: null, len: 0, tailId: null });
  const fileInputRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordCancelledRef = useRef(false);
  const voiceStartingRef = useRef(false);
  const abortPendingVoiceRef = useRef(false);
  const voiceRecTimerRef = useRef(null);
  const voiceHoldCleanupRef = useRef(null);
  const voiceHoldDoneRef = useRef(null);
  const voiceLockActivatedRef = useRef(false);
  const videoStreamRef = useRef(null);
  const videoMediaRecorderRef = useRef(null);
  const videoRecordChunksRef = useRef([]);
  const videoRecordCancelledRef = useRef(false);
  const videoStartingRef = useRef(false);
  const abortPendingVideoRef = useRef(false);
  const videoTickRef = useRef(null);
  const videoHoldCleanupRef = useRef(null);
  const videoHoldDoneRef = useRef(null);
  const videoLockActivatedRef = useRef(false);
  const inlineVideoRef = useRef(null);
  const typingStartTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const swipeBackRef = useRef({ active: false, startX: 0, startY: 0, handled: false });

  const isGroup = chat?.type === "group";
  const isMobileChat = Boolean(onMobileBack);
  const showVideoNoteOverlay = isMobileChat && (videoArming || videoRecording || Boolean(videoNoteDraft));
  function onChatTouchStart(e) {
    if (!isMobileChat || !onMobileBack) return;
    if (showVideoNoteOverlay) return;
    const t0 = e.touches?.[0];
    if (!t0) return;
    // iOS-style: only edge swipe from the left.
    if (t0.clientX > 22) return;
    swipeBackRef.current = { active: true, startX: t0.clientX, startY: t0.clientY, handled: false };
  }

  function onChatTouchMove(e) {
    if (!isMobileChat || !onMobileBack) return;
    const s = swipeBackRef.current;
    if (!s.active || s.handled) return;
    const t0 = e.touches?.[0];
    if (!t0) return;
    const dx = t0.clientX - s.startX;
    const dy = t0.clientY - s.startY;
    // Avoid interfering with vertical scrolling.
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
      swipeBackRef.current.active = false;
      return;
    }
    // Trigger on a clear horizontal swipe.
    if (dx > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      swipeBackRef.current.handled = true;
      swipeBackRef.current.active = false;
      e.preventDefault?.();
      onMobileBack();
    }
  }

  function onChatTouchEnd() {
    swipeBackRef.current.active = false;
  }

  function clearVideoNoteDraft() {
    setVideoNoteDraft((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.log("[Xasma] Chat", { chatId, hasChat: Boolean(chat), mobileBack: Boolean(onMobileBack) });
  }, [chatId, chat?.id, onMobileBack]);

  function scrollMessagesListToEnd(behavior) {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
  }

  function requestScrollAfterSend() {
    scrollAfterSendRef.current = true;
    if (scrollAfterSendClearTimerRef.current) {
      window.clearTimeout(scrollAfterSendClearTimerRef.current);
    }
    scrollAfterSendClearTimerRef.current = window.setTimeout(() => {
      scrollAfterSendRef.current = false;
      scrollAfterSendClearTimerRef.current = null;
    }, 12000);
  }

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    function onScroll() {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      nearBottomRef.current = distance <= SCROLL_NEAR_BOTTOM_PX;
    }
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [chatId]);

  useEffect(() => {
    if (!chatId) {
      prevMessagesScrollMetaRef.current = { chatId: null, len: 0, tailId: null };
      nearBottomRef.current = true;
      scrollAfterSendRef.current = false;
      if (scrollAfterSendClearTimerRef.current) {
        window.clearTimeout(scrollAfterSendClearTimerRef.current);
        scrollAfterSendClearTimerRef.current = null;
      }
      return;
    }

    const el = listRef.current;
    if (!el) return;

    const tailId = messages.length ? messages[messages.length - 1]?.id : null;
    const meta = prevMessagesScrollMetaRef.current;

    if (chatId !== meta.chatId) {
      meta.chatId = chatId;
      meta.len = messages.length;
      meta.tailId = tailId;
      nearBottomRef.current = true;
      scrollAfterSendRef.current = false;
      if (scrollAfterSendClearTimerRef.current) {
        window.clearTimeout(scrollAfterSendClearTimerRef.current);
        scrollAfterSendClearTimerRef.current = null;
      }
      scrollMessagesListToEnd("auto");
      return;
    }

    const lenGrew = messages.length > meta.len;
    const tailChanged = tailId !== meta.tailId;
    if (!lenGrew && !tailChanged) {
      return;
    }

    if (scrollAfterSendRef.current && lenGrew) {
      const last = messages[messages.length - 1];
      if (last && last.senderId === meId) {
        scrollAfterSendRef.current = false;
        if (scrollAfterSendClearTimerRef.current) {
          window.clearTimeout(scrollAfterSendClearTimerRef.current);
          scrollAfterSendClearTimerRef.current = null;
        }
        nearBottomRef.current = true;
        meta.len = messages.length;
        meta.tailId = tailId;
        scrollMessagesListToEnd("smooth");
        return;
      }
    }

    if (lenGrew && nearBottomRef.current) {
      meta.len = messages.length;
      meta.tailId = tailId;
      scrollMessagesListToEnd("smooth");
      return;
    }

    meta.len = messages.length;
    meta.tailId = tailId;
  }, [chatId, messages, meId]);

  useEffect(() => {
    return () => {
      if (scrollAfterSendClearTimerRef.current) {
        window.clearTimeout(scrollAfterSendClearTimerRef.current);
        scrollAfterSendClearTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    detachVoiceHoldEnd();
    detachVideoHoldEnd();
    abortPendingVoiceRef.current = false;
    abortPendingVideoRef.current = false;
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
    setVoiceArming(false);
    setVoiceRecMs(0);
    setVoicePressing(false);
    setVoiceLocked(false);
    setVoiceUploading(false);
    setVideoRecording(false);
    setVideoArming(false);
    setVideoRecSec(0);
    setVideoPressing(false);
    setVideoLocked(false);
    setVideoNoteUploading(false);
    setUploadError("");
    clearVideoNoteDraft();
    setPendingPreviewObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    return () => {
      detachVoiceHoldEnd();
      detachVideoHoldEnd();
      recordCancelledRef.current = true;
      videoRecordCancelledRef.current = true;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      try {
        if (videoMediaRecorderRef.current && videoMediaRecorderRef.current.state !== "inactive") {
          videoMediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordChunksRef.current = [];
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
      videoMediaRecorderRef.current = null;
      videoRecordChunksRef.current = [];
      if (videoTickRef.current) {
        clearInterval(videoTickRef.current);
        videoTickRef.current = null;
      }
      const vel = inlineVideoRef.current;
      if (vel) vel.srcObject = null;
    };
  }, [chatId]);

  useEffect(() => {
    if (!voiceRecording) {
      setVoiceRecMs(0);
      if (voiceRecTimerRef.current) {
        clearInterval(voiceRecTimerRef.current);
        voiceRecTimerRef.current = null;
      }
      return undefined;
    }
    const t0 = performance.now();
    voiceRecTimerRef.current = window.setInterval(() => {
      setVoiceRecMs(Math.floor(performance.now() - t0));
    }, 100);
    return () => {
      if (voiceRecTimerRef.current) {
        clearInterval(voiceRecTimerRef.current);
        voiceRecTimerRef.current = null;
      }
    };
  }, [voiceRecording]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (voiceRecording || voiceArming) {
        e.preventDefault();
        cancelVoiceRecording();
      }
      if (videoRecording || videoArming) {
        e.preventDefault();
        cancelVideoRecording();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voiceRecording, voiceArming, videoRecording, videoArming]);

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
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [menuMessageId]);

  const lastAnimChatIdRef = useRef(null);
  const skipMessageEnterRef = useRef(false);
  const lastMessageIdsRef = useRef(new Set());

  useLayoutEffect(() => {
    if (!chatId) {
      setChatOpening(false);
      return;
    }
    if (isMobileChat) {
      setChatOpening(false);
      return;
    }
    setChatOpening(true);
    const t = window.setTimeout(() => setChatOpening(false), 420);
    return () => window.clearTimeout(t);
  }, [chatId, isMobileChat]);

  useEffect(() => {
    if (!chatId) {
      lastAnimChatIdRef.current = null;
      lastMessageIdsRef.current = new Set();
      skipMessageEnterRef.current = false;
      setEnteringMessageIds(new Set());
      return;
    }

    if (chatId !== lastAnimChatIdRef.current) {
      lastAnimChatIdRef.current = chatId;
      setEnteringMessageIds(new Set());
      if (messages.length > 0) {
        lastMessageIdsRef.current = new Set(messages.map((m) => String(m.id)));
        skipMessageEnterRef.current = false;
      } else {
        lastMessageIdsRef.current = new Set();
        skipMessageEnterRef.current = true;
      }
      return;
    }

    const nextIds = new Set(messages.map((m) => String(m.id)));
    if (skipMessageEnterRef.current) {
      lastMessageIdsRef.current = nextIds;
      skipMessageEnterRef.current = false;
      return;
    }

    const added = [];
    for (const id of nextIds) {
      if (!lastMessageIdsRef.current.has(id)) added.push(id);
    }
    lastMessageIdsRef.current = new Set(nextIds);
    if (!added.length) return;

    setEnteringMessageIds(new Set(added));
    const t = window.setTimeout(() => setEnteringMessageIds(new Set()), 260);
    return () => window.clearTimeout(t);
  }, [chatId, messages]);

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

  async function uploadVideoBlob(blob, mimeHint) {
    setUploadError("");
    setVideoNoteUploading(true);
    try {
      const detectedMimeRaw = (await detectVideoMime(blob, mimeHint)) || "video/webm";
      const detectedMime = normalizeMime(detectedMimeRaw) || "video/webm";
      const ext = extFromVideoMime(detectedMime);
      const filename = `videonote-${Date.now()}${ext}`;
      const file = new File([blob], filename, { type: detectedMime });

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[Xasma] video upload", {
          mimeHint: String(mimeHint || ""),
          blobType: String(blob?.type || ""),
          detectedMimeRaw,
          detectedMime,
          ext,
          fileType: String(file.type || ""),
          fileName: file.name,
          size: blob?.size ?? 0,
        });
      }
      const url = await uploadChatVideo(file);
      requestScrollAfterSend();
      onSend({ text: "", videoUrl: url });
    } catch (err) {
      const baseMsg =
        err?.name === "ApiError" ? err.message : String(err?.message || t("videoNoteUploadError"));
      // Temporary extra context for debugging iPhone Safari upload validation.
      const debug =
        import.meta.env.DEV || /Unsupported video format/i.test(baseMsg)
          ? ` [debug: blob.type="${String(blob?.type || "")}" size=${Number(blob?.size || 0)} mimeHint="${String(
              mimeHint || ""
            )}"]`
          : "";
      setUploadError(`${baseMsg}${debug}`);
    } finally {
      setVideoNoteUploading(false);
    }
  }

  async function sendVideoNoteDraft() {
    if (!videoNoteDraft) return;
    await uploadVideoBlob(videoNoteDraft.blob, videoNoteDraft.mimeHint);
    clearVideoNoteDraft();
  }

  function retakeVideoNote() {
    clearVideoNoteDraft();
    detachVideoHoldEnd();
    setVideoPressing(false);
    void startVideoHoldRecording();
  }

  function cleanupVideoStream() {
    if (videoTickRef.current) {
      clearInterval(videoTickRef.current);
      videoTickRef.current = null;
    }
    videoStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    videoStreamRef.current = null;
    const vel = inlineVideoRef.current;
    if (vel) vel.srcObject = null;
  }

  function detachVoiceHoldEnd() {
    voiceHoldDoneRef.current = null;
    const fn = voiceHoldCleanupRef.current;
    voiceHoldCleanupRef.current = null;
    voiceLockActivatedRef.current = false;
    if (fn) fn();
  }

  function detachVideoHoldEnd() {
    videoHoldDoneRef.current = null;
    const fn = videoHoldCleanupRef.current;
    videoHoldCleanupRef.current = null;
    videoLockActivatedRef.current = false;
    if (fn) fn();
  }

  function cancelVoiceRecording() {
    detachVoiceHoldEnd();
    setVoicePressing(false);
    setVoiceLocked(false);
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      abortPendingVoiceRef.current = true;
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordChunksRef.current = [];
      setVoiceRecording(false);
      setVoiceArming(false);
      return;
    }
    abortPendingVoiceRef.current = false;
    recordCancelledRef.current = true;
    try {
      rec.stop();
    } catch {
      // ignore
    }
  }

  function finishVoiceRecording() {
    abortPendingVoiceRef.current = false;
    setVoiceLocked(false);
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordChunksRef.current = [];
      setVoiceRecording(false);
      setVoiceArming(false);
      return;
    }
    recordCancelledRef.current = false;
    try {
      mediaRecorderRef.current.stop();
    } catch {
      // ignore
    }
  }

  function onVoiceFallbackSend() {
    detachVoiceHoldEnd();
    setVoicePressing(false);
    abortPendingVoiceRef.current = false;
    finishVoiceRecording();
  }

  function onVoiceFallbackCancel() {
    cancelVoiceRecording();
  }

  function cancelVideoRecording() {
    detachVideoHoldEnd();
    setVideoPressing(false);
    setVideoLocked(false);
    clearVideoNoteDraft();
    const rec = videoMediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      abortPendingVideoRef.current = true;
      cleanupVideoStream();
      videoMediaRecorderRef.current = null;
      videoRecordChunksRef.current = [];
      setVideoRecording(false);
      setVideoArming(false);
      setVideoRecSec(0);
      return;
    }
    abortPendingVideoRef.current = false;
    videoRecordCancelledRef.current = true;
    try {
      rec.stop();
    } catch {
      // ignore
    }
  }

  function finishVideoRecording() {
    abortPendingVideoRef.current = false;
    setVideoLocked(false);
    if (!videoMediaRecorderRef.current || videoMediaRecorderRef.current.state === "inactive") {
      cleanupVideoStream();
      setVideoRecording(false);
      setVideoArming(false);
      setVideoRecSec(0);
      return;
    }
    videoRecordCancelledRef.current = false;
    try {
      videoMediaRecorderRef.current.stop();
    } catch {
      // ignore
    }
  }

  /**
   * End-of-hold uses MediaRecorder state (refs), not React state, so we never read a stale
   * voiceRecording flag from the render when the gesture began.
   */
  function attachVoiceHoldEndListeners(activePointerId) {
    detachVoiceHoldEnd();
    let handled = false;
    let startY = null;
    const runRelease = () => {
      if (handled) return;
      handled = true;
      voiceHoldDoneRef.current = null;
      const rm = voiceHoldCleanupRef.current;
      voiceHoldCleanupRef.current = null;
      if (rm) rm();
      setVoicePressing(false);
      if (abortPendingVoiceRef.current) return;
      if (voiceLockActivatedRef.current || voiceLocked) {
        // Locked: finger release should NOT stop recording.
        return;
      }
      const rec = mediaRecorderRef.current;
      if (rec && (rec.state === "recording" || rec.state === "paused")) {
        abortPendingVoiceRef.current = false;
        recordCancelledRef.current = false;
        try {
          rec.stop();
        } catch {
          // ignore
        }
        return;
      }
      if (voiceStartingRef.current) {
        abortPendingVoiceRef.current = true;
        return;
      }
      abortPendingVoiceRef.current = true;
    };
    voiceHoldDoneRef.current = runRelease;

    const onMove = (clientY) => {
      if (handled) return;
      if (startY == null) startY = clientY;
      const dy = clientY - startY;
      // Swipe up to lock.
      if (!voiceLockActivatedRef.current && dy < -52) {
        voiceLockActivatedRef.current = true;
        setVoiceLocked(true);
      }
    };

    const onPointerUp = (ev) => {
      if (activePointerId != null && ev.pointerId !== activePointerId) return;
      runRelease();
    };
    const onPointerMove = (ev) => {
      if (activePointerId != null && ev.pointerId !== activePointerId) return;
      onMove(ev.clientY);
    };
    const onTouchEnd = () => runRelease();
    const onTouchMove = (ev) => {
      const t0 = ev.touches?.[0];
      if (!t0) return;
      onMove(t0.clientY);
    };
    const onMouseUp = () => runRelease();
    const onMouseMove = (ev) => onMove(ev.clientY);

    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("mousemove", onMouseMove, true);

    voiceHoldCleanupRef.current = () => {
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("mousemove", onMouseMove, true);
    };
  }

  function attachVideoHoldEndListeners(activePointerId) {
    detachVideoHoldEnd();
    let handled = false;
    let startY = null;
    const runRelease = () => {
      if (handled) return;
      handled = true;
      videoHoldDoneRef.current = null;
      const rm = videoHoldCleanupRef.current;
      videoHoldCleanupRef.current = null;
      if (rm) rm();
      setVideoPressing(false);
      if (abortPendingVideoRef.current) return;
      if (videoLockActivatedRef.current || videoLocked) {
        // Locked: finger release should NOT stop recording.
        return;
      }
      const rec = videoMediaRecorderRef.current;
      if (rec && (rec.state === "recording" || rec.state === "paused")) {
        abortPendingVideoRef.current = false;
        videoRecordCancelledRef.current = false;
        try {
          rec.stop();
        } catch {
          // ignore
        }
        return;
      }
      if (videoStartingRef.current) {
        abortPendingVideoRef.current = true;
        return;
      }
      abortPendingVideoRef.current = true;
    };
    videoHoldDoneRef.current = runRelease;

    const onMove = (clientY) => {
      if (handled) return;
      if (startY == null) startY = clientY;
      const dy = clientY - startY;
      if (!videoLockActivatedRef.current && dy < -52) {
        videoLockActivatedRef.current = true;
        setVideoLocked(true);
      }
    };

    const onPointerUp = (ev) => {
      if (activePointerId != null && ev.pointerId !== activePointerId) return;
      runRelease();
    };
    const onPointerMove = (ev) => {
      if (activePointerId != null && ev.pointerId !== activePointerId) return;
      onMove(ev.clientY);
    };
    const onTouchEnd = () => runRelease();
    const onTouchMove = (ev) => {
      const t0 = ev.touches?.[0];
      if (!t0) return;
      onMove(t0.clientY);
    };
    const onMouseUp = () => runRelease();
    const onMouseMove = (ev) => onMove(ev.clientY);

    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("mousemove", onMouseMove, true);

    videoHoldCleanupRef.current = () => {
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("mousemove", onMouseMove, true);
    };
  }

  async function startVoiceHoldRecording() {
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
      voiceArming ||
      pendingImageUrl ||
      voiceStartingRef.current ||
      videoRecording ||
      videoArming ||
      videoNoteUploading
    ) {
      return;
    }
    const existing = mediaRecorderRef.current;
    if (existing && existing.state !== "inactive") {
      return;
    }
    setUploadError("");
    abortPendingVoiceRef.current = false;
    recordCancelledRef.current = false;
    recordChunksRef.current = [];
    setVoiceArming(true);
    voiceStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (abortPendingVoiceRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        setVoiceArming(false);
        voiceStartingRef.current = false;
        return;
      }
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
          setVoiceArming(false);
          voiceStartingRef.current = false;
          return;
        }
      }
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
        mediaStreamRef.current = null;
        const cancelled = recordCancelledRef.current;
        recordCancelledRef.current = false;
        mediaRecorderRef.current = null;
        setVoiceRecording(false);
        setVoiceArming(false);
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
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log("[Xasma] voice recorded", {
                recorderMime: String(rec.mimeType || ""),
                blobType: String(blob.type || ""),
                fileType: String(file.type || ""),
                fileName: file.name,
                size: blob.size,
              });
            }
            const url = await uploadChatAudio(file);
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log("[Xasma] voice uploaded", { url });
            }
            requestScrollAfterSend();
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
      if (abortPendingVoiceRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setVoiceArming(false);
        voiceStartingRef.current = false;
        return;
      }
      rec.start(200);
      setVoiceRecording(true);
      setVoiceArming(false);
    } catch {
      setUploadError(t("voiceMicDenied"));
      setVoiceArming(false);
    } finally {
      voiceStartingRef.current = false;
    }
  }

  async function startVideoHoldRecording() {
    if (typeof MediaRecorder === "undefined") {
      setUploadError(t("videoNoteNotSupported"));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setUploadError(t("videoNoteNotSupported"));
      return;
    }
    if (
      isBanned ||
      editingMessageId ||
      imageUploading ||
      voiceUploading ||
      voiceRecording ||
      voiceArming ||
      pendingImageUrl ||
      videoRecording ||
      videoArming ||
      videoStartingRef.current ||
      videoNoteUploading
    ) {
      return;
    }
    const existingV = videoMediaRecorderRef.current;
    if (existingV && existingV.state !== "inactive") {
      return;
    }
    setUploadError("");
    clearVideoNoteDraft();
    abortPendingVideoRef.current = false;
    videoRecordCancelledRef.current = false;
    videoRecordChunksRef.current = [];
    setVideoArming(true);
    videoStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      if (abortPendingVideoRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        setVideoArming(false);
        videoStartingRef.current = false;
        return;
      }
      videoStreamRef.current = stream;
      const vel = inlineVideoRef.current;
      if (vel) {
        vel.srcObject = stream;
        vel.muted = true;
        vel.playsInline = true;
        void vel.play().catch(() => {});
      }
      const mime = pickVideoMime();
      let rec;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        try {
          rec = new MediaRecorder(stream);
        } catch {
          cleanupVideoStream();
          setUploadError(t("videoNoteNotSupported"));
          setVideoArming(false);
          videoStartingRef.current = false;
          return;
        }
      }
      videoMediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) videoRecordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        if (videoTickRef.current) {
          clearInterval(videoTickRef.current);
          videoTickRef.current = null;
        }
        cleanupVideoStream();
        videoMediaRecorderRef.current = null;
        const cancelled = videoRecordCancelledRef.current;
        videoRecordCancelledRef.current = false;
        setVideoRecording(false);
        setVideoArming(false);
        setVideoRecSec(0);
        const chunks = [...videoRecordChunksRef.current];
        videoRecordChunksRef.current = [];
        if (cancelled) return;
        const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
        const mimeHint = rec.mimeType || blob.type;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[Xasma] video recorded", {
            recorderMime: String(rec.mimeType || ""),
            blobType: String(blob.type || ""),
            size: blob.size,
          });
        }

        void (async () => {
          // Some browsers (esp. iOS Safari) report duration as 0 until metadata is parsed.
          const durationSec = await getVideoDurationSeconds(blob);
          if (!Number.isFinite(durationSec) || durationSec <= 0.25) {
            // Keep a small size-based escape hatch (Safari can still fail to parse duration).
            if (blob.size < 2 * 1024) {
              setUploadError(t("videoNoteTooShort"));
              return;
            }
          }
          setVideoNoteDraft((prev) => {
            if (prev?.url) URL.revokeObjectURL(prev.url);
            return { blob, mimeHint, url: URL.createObjectURL(blob) };
          });
        })();
      };
      if (abortPendingVideoRef.current) {
        cleanupVideoStream();
        videoMediaRecorderRef.current = null;
        setVideoArming(false);
        videoStartingRef.current = false;
        return;
      }
      rec.start(250);
      setVideoRecording(true);
      setVideoArming(false);
      setVideoRecSec(0);
      if (videoTickRef.current) clearInterval(videoTickRef.current);
      videoTickRef.current = window.setInterval(() => {
        setVideoRecSec((s) => {
          if (s + 1 >= MAX_VIDEO_NOTE_SEC) {
            finishVideoRecording();
            return MAX_VIDEO_NOTE_SEC;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setUploadError(t("videoNoteCameraDenied"));
      setVideoArming(false);
      cleanupVideoStream();
    } finally {
      videoStartingRef.current = false;
    }
  }

  function beginMicHoldFromUser(e) {
    if (e.button != null && e.button !== 0) return;
    const vrec = mediaRecorderRef.current;
    if (vrec && (vrec.state === "recording" || vrec.state === "paused")) {
      e.preventDefault?.();
      detachVoiceHoldEnd();
      setVoicePressing(false);
      abortPendingVoiceRef.current = false;
      finishVoiceRecording();
      return;
    }
    if (
      isBanned ||
      editingMessageId ||
      Boolean(pendingImageUrl) ||
      imageUploading ||
      voiceUploading ||
      voiceRecording ||
      voiceArming ||
      videoRecording ||
      videoArming ||
      videoNoteUploading
    ) {
      return;
    }
    e.preventDefault?.();
    setVoicePressing(true);
    setVoiceLocked(false);
    voiceLockActivatedRef.current = false;
    const pid = typeof e.pointerId === "number" ? e.pointerId : null;
    attachVoiceHoldEndListeners(pid);
    void startVoiceHoldRecording();
  }

  function onMicPointerDown(e) {
    beginMicHoldFromUser(e);
  }

  function onMicMouseDown(e) {
    if (typeof window !== "undefined" && "PointerEvent" in window) return;
    beginMicHoldFromUser(e);
  }

  function onMicMouseUp() {
    voiceHoldDoneRef.current?.();
  }

  function onMicTouchEnd() {
    voiceHoldDoneRef.current?.();
  }

  function beginVideoHoldFromUser(e) {
    if (e.button != null && e.button !== 0) return;
    const vrec = videoMediaRecorderRef.current;
    if (vrec && (vrec.state === "recording" || vrec.state === "paused")) {
      e.preventDefault?.();
      detachVideoHoldEnd();
      setVideoPressing(false);
      abortPendingVideoRef.current = false;
      finishVideoRecording();
      return;
    }
    if (
      isBanned ||
      editingMessageId ||
      Boolean(pendingImageUrl) ||
      imageUploading ||
      voiceUploading ||
      voiceRecording ||
      voiceArming ||
      videoRecording ||
      videoArming ||
      videoNoteUploading
    ) {
      return;
    }
    e.preventDefault?.();
    setVideoPressing(true);
    setVideoLocked(false);
    videoLockActivatedRef.current = false;
    const pid = typeof e.pointerId === "number" ? e.pointerId : null;
    attachVideoHoldEndListeners(pid);
    void startVideoHoldRecording();
  }

  function onVideoCamPointerDown(e) {
    beginVideoHoldFromUser(e);
  }

  function onVideoCamMouseDown(e) {
    if (typeof window !== "undefined" && "PointerEvent" in window) return;
    beginVideoHoldFromUser(e);
  }

  function onVideoCamMouseUp() {
    videoHoldDoneRef.current?.();
  }

  function onVideoCamTouchEnd() {
    videoHoldDoneRef.current?.();
  }

  async function handlePrimary() {
    const trimmed = String(text).trim();
    onTyping?.(false);
    if (isBanned) return;
    if (voiceRecording || voiceArming) return;
    if (videoRecording || videoArming) return;
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
    if (imageUploading || voiceRecording || voiceArming) return;
    requestScrollAfterSend();
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

  const trimmedComposerText = String(text ?? "").trim();
  const composerHasText = trimmedComposerText.length > 0;
  const composerHasMedia = Boolean(pendingImageUrl) && !editingMessageId;
  const composerCanSend = editingMessageId ? composerHasText : composerHasText || composerHasMedia;
  const showSendAction = composerCanSend && !(voiceRecording || voiceArming || videoRecording || videoArming);

  const chatMainClass = [
    "chatMain",
    chatTheme && `chatTheme-${chatTheme}`,
    /* Desktop: full chat enter. Mobile: shell slide is on .mobileChatShell (avoids double motion). */
    chatId && chatOpening && !isMobileChat ? "chatMain--opening" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main
      className={chatMainClass}
      onTouchStart={onChatTouchStart}
      onTouchMove={onChatTouchMove}
      onTouchEnd={onChatTouchEnd}
      onTouchCancel={onChatTouchEnd}
    >
      {!chatId ? (
        <div className="emptyState">
          <div className="emptyTitle">{t("selectChatTitle")}</div>
          <div className="muted">{t("selectChatHint")}</div>
        </div>
      ) : (
        <>
          {showVideoNoteOverlay ? (
            <div
              className="videoNoteOverlay"
              role="dialog"
              aria-label={t("videoNoteTitle")}
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.preventDefault()}
            >
              <div className="videoNoteOverlayBackdrop" onClick={cancelVideoRecording} />
              <div className="videoNoteOverlayCard">
                <div className="videoNoteOverlayTop">
                  <div className="videoNoteOverlayTitle">{t("videoNoteTitle")}</div>
                  <div className="videoNoteOverlayTimer" aria-live="polite">
                    {videoArming || videoRecording ? formatRecordingClock(videoRecSec * 1000) : ""}
                  </div>
                </div>

                <div className="videoNoteOverlayPreviewWrap">
                  {videoNoteDraft ? (
                    <video
                      className="videoNoteOverlayPreview"
                      src={videoNoteDraft.url}
                      playsInline
                      loop
                      autoPlay
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <video
                      ref={inlineVideoRef}
                      className={`videoNoteOverlayPreview${videoRecording ? " videoNoteOverlayPreview--rec" : ""}`}
                      playsInline
                      muted
                      autoPlay
                      aria-hidden="true"
                    />
                  )}
                  {videoRecording && !videoNoteDraft ? <div className="videoNoteOverlayRecDot" aria-hidden /> : null}
                </div>

                <div className="videoNoteOverlayActions">
                  {videoNoteDraft ? (
                    <>
                      <button type="button" className="videoNoteBtn videoNoteBtn--ghost" onClick={cancelVideoRecording}>
                        {t("videoNoteCancel")}
                      </button>
                      <button type="button" className="videoNoteBtn videoNoteBtn--ghost" onClick={retakeVideoNote}>
                        {t("videoNoteRetake")}
                      </button>
                      <button type="button" className="videoNoteBtn videoNoteBtn--primary" onClick={sendVideoNoteDraft}>
                        {t("videoNoteSend")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="videoNoteBtn videoNoteBtn--ghost" onClick={cancelVideoRecording}>
                        {t("videoNoteCancel")}
                      </button>
                      {videoLocked ? <div className="videoNoteLockPill" aria-label="Locked">🔒</div> : null}
                      <button type="button" className="videoNoteBtn videoNoteBtn--primary" onClick={finishVideoRecording}>
                        {t("videoNoteStop")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <div className="chatHeader">
            <div className="chatHeaderLead">
              {onMobileBack ? (
                <button
                  type="button"
                  className="mobileChatBackBtn"
                  onClick={onMobileBack}
                  aria-label={t("back")}
                >
                  <span className="mobileChatBackGlyph" aria-hidden>
                    ←
                  </span>
                </button>
              ) : null}
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
            </div>
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
                <div
                  key={m.id}
                  className={`systemMessageRow${
                    enteringMessageIds.has(String(m.id)) ? " systemMessageRow--enter" : ""
                  }`}
                >
                  <div className="systemMessageInner">{formatSystemLine(m, t)}</div>
                  <div className="systemMessageTime">{formatTime(m.createdAt)}</div>
                </div>
              ) : (
                (() => {
                  const textTrim = String(m.text ?? "").trim();
                  const isCircleVideoOnly =
                    Boolean(m.videoUrl) && !m.imageUrl && !m.audioUrl && !textTrim && !m.editedAt;
                  const isVoiceOnly =
                    Boolean(m.audioUrl) && !m.imageUrl && !m.videoUrl && !textTrim && !m.editedAt;
                  const bubbleMediaBare = isCircleVideoOnly || isVoiceOnly ? " bubbleMediaBare" : "";
                  const showMessageMenu =
                    (m.senderId === meId && (!isBanned || isAdmin)) ||
                    (m.senderId !== meId && (isAdmin || !isBanned));
                  const canQuickReact = !isBanned;
                  const canEditOwn = m.senderId === meId && !isBanned;
                  const canAdminDelete = Boolean(isAdmin);
                  const hasSecondaryActions = canEditOwn || canAdminDelete;

                  return (
                <div
                  key={m.id}
                  className={`bubbleRow${m.senderId === meId ? " me" : ""}${
                    enteringMessageIds.has(String(m.id))
                      ? m.senderId === meId
                        ? " bubbleRow--enter bubbleRow--enterOwn"
                        : " bubbleRow--enter"
                      : ""
                  }`}
                >
                  <div className="msgAvatar" title={m.sender?.username || ""}>
                    {getAvatarSrc(m, meId, meAvatar) ? (
                      <img src={getAvatarSrc(m, meId, meAvatar)} alt="" />
                    ) : (
                      <span>{initials(getDisplayName(m, meId, meUsername))}</span>
                    )}
                  </div>
                  <div
                    className={
                      m.senderId === meId
                        ? `bubble me bubbleOwn bubbleWithActions${bubbleMediaBare}`
                        : `bubble bubbleWithActions${bubbleMediaBare}`
                    }
                  >
                    {showMessageMenu ? (
                      <div className="msgMenu">
                        <button
                          type="button"
                          className="msgMenuBtn"
                          aria-label={t("menu")}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuMessageId((id) => (id === m.id ? null : m.id));
                          }}
                        >
                          ⋯
                        </button>
                        {menuMessageId === m.id ? (
                          <div
                            className="msgMenuDropdown"
                            role="menu"
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                          >
                            {canQuickReact ? (
                              <>
                                <div
                                  className="msgMenuReactions"
                                  role="group"
                                  aria-label={t("messageMenuReactions")}
                                >
                                  {QUICK_REACTION_EMOJIS.map((emo) => (
                                    <button
                                      key={emo}
                                      type="button"
                                      className="msgMenuReactionBtn"
                                      aria-label={emo}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onTouchStart={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuMessageId(null);
                                        onToggleReaction?.(m.id, emo);
                                      }}
                                    >
                                      {emo}
                                    </button>
                                  ))}
                                </div>
                                {hasSecondaryActions ? <div className="msgMenuDivider" aria-hidden /> : null}
                              </>
                            ) : null}
                            {canEditOwn ? (
                              <button
                                type="button"
                                className="msgMenuItem"
                                role="menuitem"
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
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
                            {canAdminDelete ? (
                              <button
                                type="button"
                                className="msgMenuItem msgMenuItem--danger"
                                role="menuitem"
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuMessageId(null);
                                  onAdminDeleteMessage?.(m.id);
                                }}
                              >
                                {t("deleteMessage")}
                              </button>
                            ) : null}
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
                          onError={(e) => {
                            // If backend URL is wrong/missing, keep the bubble usable (link stays).
                            e.currentTarget.style.display = "none";
                          }}
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
                  );
                })()
              )
            )}
          </div>

          <div className="composer">
            {isBanned ? <div className="banBanner">{t("authBanned")}</div> : null}
            {uploadError ? <div className="uploadErrBanner">{uploadError}</div> : null}
            {imageUploading ? <div className="uploadProgressHint">{t("uploadImageProgress")}</div> : null}
            {voiceUploading ? <div className="uploadProgressHint">{t("voiceSending")}</div> : null}
            {videoNoteUploading ? <div className="uploadProgressHint">{t("videoNoteUploading")}</div> : null}
            {voiceArming || voiceRecording ? (
              <div className="recBottomBar" role="group" aria-label={t("voiceRecordingControls")}>
                <div className="recBottomBarLeft">
                  <span className="recBottomDot" aria-hidden />
                  <span className="recBottomText">
                    {t("recordingInline")} {formatRecordingClock(voiceRecMs)}
                  </span>
                  {voiceLocked ? (
                    <span className="recBottomLock" aria-label="Locked">
                      🔒
                    </span>
                  ) : (
                    <span className="recBottomHint" aria-hidden>
                      ↑
                    </span>
                  )}
                </div>
                <div className="recBottomBarActions">
                  <button type="button" className="recBottomBtn recBottomBtn--ghost" onClick={onVoiceFallbackCancel}>
                    {t("voiceCancel")}
                  </button>
                  <button type="button" className="recBottomBtn recBottomBtn--primary" onClick={onVoiceFallbackSend}>
                    {t("voiceStopSend")}
                  </button>
                </div>
              </div>
            ) : null}
            {pendingPreviewObjectUrl && !editingMessageId ? (
              <div className="pendingImageStrip">
                <img src={pendingPreviewObjectUrl} alt="" className="pendingImageThumb" />
                <button
                  type="button"
                  className="pendingImageRemove"
                  onClick={clearPendingImage}
                  disabled={
                    imageUploading ||
                    voiceRecording ||
                    voiceArming ||
                    videoRecording ||
                    videoArming ||
                    videoNoteUploading
                  }
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
            <div
              className={`composerMain${
                voiceRecording || voiceArming || videoRecording || videoArming ? " composerMain--recording" : ""
              }`}
            >
              <button
                type="button"
                className="attachPhotoBtn"
                disabled={
                  isBanned ||
                  Boolean(editingMessageId) ||
                  imageUploading ||
                  voiceUploading ||
                  voiceRecording ||
                  voiceArming ||
                  videoRecording ||
                  videoArming ||
                  videoNoteUploading
                }
                aria-label={t("attachPhoto")}
                title={t("attachPhoto")}
                onClick={() => fileInputRef.current?.click()}
              >
                📎
              </button>
              {voiceArming || voiceRecording ? (
                <span className="recInlineIndicator" role="status" aria-live="polite">
                  <span className="recInlineDot" aria-hidden />
                  {t("recordingInline")} {formatRecordingClock(voiceRecMs)}
                </span>
              ) : null}
              {!isMobileChat ? (
                <>
                  <div
                    className={`inlineVideoRecWrap${
                      videoArming || videoRecording ? " inlineVideoRecWrap--on" : ""
                    }`}
                  >
                    <video
                      ref={inlineVideoRef}
                      className="inlineVideoRec"
                      playsInline
                      muted
                      autoPlay
                      aria-hidden="true"
                    />
                  </div>
                  {videoArming || videoRecording ? (
                    <span className="recInlineIndicator recInlineIndicator--video" role="status" aria-live="polite">
                      <span className="recInlineDot recInlineDot--video" aria-hidden />
                      {t("recordingInline")} {formatRecordingClock(videoRecSec * 1000)}
                    </span>
                  ) : null}
                </>
              ) : null}
              <textarea
                className="composerInput"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  scheduleTyping();
                }}
                rows={1}
                placeholder={t("typeMessagePlaceholder")}
                disabled={
                  isBanned ||
                  imageUploading ||
                  voiceRecording ||
                  voiceArming ||
                  videoRecording ||
                  videoArming ||
                  videoNoteUploading
                }
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
                className={`videoCamBtn${
                  videoRecording || videoArming || videoPressing ? " videoCamBtn--active" : ""
                }${videoPressing ? " videoCamBtn--pressing" : ""}`}
                disabled={
                  isBanned ||
                  Boolean(editingMessageId) ||
                  Boolean(pendingImageUrl) ||
                  voiceRecording ||
                  voiceArming ||
                  imageUploading ||
                  voiceUploading ||
                  videoNoteUploading
                }
                aria-label={t("videoNoteHoldRecord")}
                title={t("videoNoteHoldRecord")}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={onVideoCamPointerDown}
                onMouseDown={onVideoCamMouseDown}
                onMouseUp={onVideoCamMouseUp}
                onTouchEnd={onVideoCamTouchEnd}
                onTouchStart={(e) => {
                  // iOS Safari: prevent long-press callout/selection while holding record.
                  e.preventDefault();
                }}
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
              <div className="composerActionSlot" aria-label={t("composerActions")}>
                <button
                  type="button"
                  className={`voiceMicBtn composerActionBtn${
                    voiceRecording || voiceArming ? " voiceMicBtn--recording" : ""
                  }${voicePressing ? " voiceMicBtn--pressing" : ""}${showSendAction ? " isHidden" : ""}`}
                  disabled={
                    isBanned ||
                    Boolean(editingMessageId) ||
                    Boolean(pendingImageUrl) ||
                    imageUploading ||
                    voiceUploading ||
                    videoRecording ||
                    videoArming ||
                    videoNoteUploading
                  }
                  aria-label={voiceRecording || voiceArming ? t("voiceTapStopSend") : t("voiceHoldRecord")}
                  title={voiceRecording || voiceArming ? t("voiceTapStopSend") : t("voiceHoldRecord")}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={onMicPointerDown}
                  onMouseDown={onMicMouseDown}
                  onMouseUp={onMicMouseUp}
                  onTouchEnd={onMicTouchEnd}
                  onTouchStart={(e) => {
                    // iOS Safari: prevent long-press callout/selection while holding record.
                    e.preventDefault();
                  }}
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
                  className={`sendBtn composerActionBtn${showSendAction ? "" : " isHidden"}`}
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
                    voiceArming ||
                    videoRecording ||
                    videoArming ||
                    videoNoteUploading ||
                    (editingMessageId ? !composerHasText : !composerHasText && !pendingImageUrl)
                  }
                >
                  {isMobileChat ? (
                    <svg
                      className="sendIcon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  ) : (
                    (editingMessageId ? t("save") : t("send"))
                  )}
                </button>
              </div>
            </div>
            {/* Telegram-style recording bar is shown above; keep this area clean. */}
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

function pickVideoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=h264,opus",
    "video/webm",
    // Safari/iOS typically prefers MP4/H.264
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
  ];
  for (const typ of types) {
    try {
      if (MediaRecorder.isTypeSupported(typ)) return typ;
    } catch {
      // ignore
    }
  }
  return "";
}

function extFromVideoMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("quicktime")) return ".mov";
  if (m.includes("3gpp")) return ".3gp";
  return ".webm";
}

function normalizeMime(mime) {
  const s = String(mime || "").trim();
  if (!s) return "";
  return s.split(";")[0].trim();
}

function getVideoDurationSeconds(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      v.removeAttribute("src");
      v.load?.();
      resolve(0);
    };

    const finish = (d) => {
      if (settled) return;
      settled = true;
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      v.removeAttribute("src");
      v.load?.();
      resolve(d);
    };

    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) {
        finish(d);
        return;
      }
      // iOS Safari sometimes reports Infinity until we seek.
      try {
        v.currentTime = 1e101;
      } catch {
        // ignore
      }
    };

    const onTimeUpdate = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) {
        finish(d);
        return;
      }
      // Some implementations set currentTime to a huge value but only update duration later.
      try {
        v.currentTime = 0;
      } catch {
        // ignore
      }
    };

    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.addEventListener("loadedmetadata", onMeta, { once: true });
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("error", cleanup, { once: true });

    // Timeout so we don't block upload forever.
    window.setTimeout(() => {
      if (settled) return;
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) finish(d);
      else cleanup();
    }, 1200);

    v.src = url;
  });
}

async function sniffVideoContainerMime(blob) {
  try {
    const head = await blob.slice(0, 32).arrayBuffer();
    const b = new Uint8Array(head);
    // WebM/Matroska: EBML header 1A 45 DF A3
    if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
      return "video/webm";
    }
    // ISO BMFF (MP4/MOV): bytes 4..7 = 'ftyp'
    if (
      b.length >= 12 &&
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70
    ) {
      // Could be mp4 or quicktime; both are widely handled as video/mp4 for Content-Type.
      return "video/mp4";
    }
  } catch {
    // ignore
  }
  return "";
}

async function detectVideoMime(blob, mimeHint) {
  const hinted = String(mimeHint || "").trim();
  const typed = String(blob?.type || "").trim();
  if (typed) return typed;
  if (hinted) return hinted;
  const sniffed = await sniffVideoContainerMime(blob);
  return sniffed;
}

function formatRecordingClock(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
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
