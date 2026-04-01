import React, { useEffect, useRef, useState } from "react";
import { tf } from "../i18n.js";
import { uploadChatImage, uploadChatAudio, uploadChatVideo, getApiBase } from "../api.js";
import GroupInfoModal from "./GroupInfoModal.jsx";
import VoiceMessagePlayer from "./VoiceMessagePlayer.jsx";
import CircleVideoMessage from "./CircleVideoMessage.jsx";

const MAX_VIDEO_NOTE_SEC = 60;

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
  const [reactionPickerForId, setReactionPickerForId] = useState(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState(null);
  const [pendingPreviewObjectUrl, setPendingPreviewObjectUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceArming, setVoiceArming] = useState(false);
  const [voiceRecMs, setVoiceRecMs] = useState(0);
  const [voicePressing, setVoicePressing] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoArming, setVideoArming] = useState(false);
  const [videoRecSec, setVideoRecSec] = useState(0);
  const [videoPressing, setVideoPressing] = useState(false);
  const [videoNoteUploading, setVideoNoteUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const listRef = useRef(null);
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
  const videoStreamRef = useRef(null);
  const videoMediaRecorderRef = useRef(null);
  const videoRecordChunksRef = useRef([]);
  const videoRecordCancelledRef = useRef(false);
  const videoStartingRef = useRef(false);
  const abortPendingVideoRef = useRef(false);
  const videoTickRef = useRef(null);
  const videoHoldCleanupRef = useRef(null);
  const videoHoldDoneRef = useRef(null);
  const inlineVideoRef = useRef(null);
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
    setVoiceUploading(false);
    setVideoRecording(false);
    setVideoArming(false);
    setVideoRecSec(0);
    setVideoPressing(false);
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

  async function uploadVideoBlob(blob, mimeHint) {
    setUploadError("");
    setVideoNoteUploading(true);
    try {
      const ext = extFromVideoMime(blob.type || mimeHint);
      const file = new File([blob], `videonote-${Date.now()}${ext}`, {
        type: blob.type || mimeHint || "video/webm",
      });
      const url = await uploadChatVideo(file);
      onSend({ text: "", videoUrl: url });
    } catch (err) {
      const msg =
        err?.name === "ApiError" ? err.message : String(err?.message || t("videoNoteUploadError"));
      setUploadError(msg);
    } finally {
      setVideoNoteUploading(false);
    }
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
    if (fn) fn();
  }

  function detachVideoHoldEnd() {
    videoHoldDoneRef.current = null;
    const fn = videoHoldCleanupRef.current;
    videoHoldCleanupRef.current = null;
    if (fn) fn();
  }

  function cancelVoiceRecording() {
    detachVoiceHoldEnd();
    setVoicePressing(false);
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
    const runRelease = () => {
      if (handled) return;
      handled = true;
      voiceHoldDoneRef.current = null;
      const rm = voiceHoldCleanupRef.current;
      voiceHoldCleanupRef.current = null;
      if (rm) rm();
      setVoicePressing(false);
      if (abortPendingVoiceRef.current) return;
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

    const onPointerUp = (ev) => {
      if (activePointerId != null && ev.pointerId !== activePointerId) return;
      runRelease();
    };
    const onTouchEnd = () => runRelease();
    const onMouseUp = () => runRelease();

    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("mouseup", onMouseUp, true);

    voiceHoldCleanupRef.current = () => {
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("mouseup", onMouseUp, true);
    };
  }

  function attachVideoHoldEndListeners(activePointerId) {
    detachVideoHoldEnd();
    let handled = false;
    const runRelease = () => {
      if (handled) return;
      handled = true;
      videoHoldDoneRef.current = null;
      const rm = videoHoldCleanupRef.current;
      videoHoldCleanupRef.current = null;
      if (rm) rm();
      setVideoPressing(false);
      if (abortPendingVideoRef.current) return;
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

    const onPointerUp = (ev) => {
      if (activePointerId != null && ev.pointerId !== activePointerId) return;
      runRelease();
    };
    const onTouchEnd = () => runRelease();
    const onMouseUp = () => runRelease();

    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("mouseup", onMouseUp, true);

    videoHoldCleanupRef.current = () => {
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("mouseup", onMouseUp, true);
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
        if (blob.size < 64) {
          setUploadError(t("videoNoteTooShort"));
          return;
        }
        void uploadVideoBlob(blob, rec.mimeType || blob.type);
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
                <div key={m.id} className="systemMessageRow">
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
                  return (
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
                  <div
                    className={
                      m.senderId === meId
                        ? `bubble me bubbleOwn bubbleWithActions${bubbleMediaBare}`
                        : `bubble bubbleWithActions${bubbleMediaBare}`
                    }
                  >
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
                onPointerDown={onVideoCamPointerDown}
                onMouseDown={onVideoCamMouseDown}
                onMouseUp={onVideoCamMouseUp}
                onTouchEnd={onVideoCamTouchEnd}
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
                className={`voiceMicBtn${voiceRecording || voiceArming ? " voiceMicBtn--recording" : ""}${
                  voicePressing ? " voiceMicBtn--pressing" : ""
                }`}
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
                aria-label={
                  voiceRecording || voiceArming ? t("voiceTapStopSend") : t("voiceHoldRecord")
                }
                title={voiceRecording || voiceArming ? t("voiceTapStopSend") : t("voiceHoldRecord")}
                onPointerDown={onMicPointerDown}
                onMouseDown={onMicMouseDown}
                onMouseUp={onMicMouseUp}
                onTouchEnd={onMicTouchEnd}
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
                  voiceArming ||
                  videoRecording ||
                  videoArming ||
                  videoNoteUploading ||
                  (editingMessageId ? !String(text).trim() : !String(text).trim() && !pendingImageUrl)
                }
              >
                {editingMessageId ? t("save") : t("send")}
              </button>
            </div>
            {voiceArming || voiceRecording ? (
              <div className="voiceRecFallbackRow" role="group" aria-label={t("voiceRecordingControls")}>
                <button type="button" className="voiceRecFallbackSend" onClick={onVoiceFallbackSend}>
                  {t("voiceStopSend")}
                </button>
                <button type="button" className="voiceRecFallbackCancel" onClick={onVoiceFallbackCancel}>
                  {t("voiceCancel")}
                </button>
              </div>
            ) : null}
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
  return ".webm";
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
