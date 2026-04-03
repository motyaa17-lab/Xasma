import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tf } from "../i18n.js";
import { uploadChatImage, uploadChatAudio, uploadChatVideo, getApiBase } from "../api.js";
import GroupInfoModal from "./GroupInfoModal.jsx";
import VoiceMessagePlayer from "./VoiceMessagePlayer.jsx";
import CircleVideoMessage from "./CircleVideoMessage.jsx";
import UserProfileModal from "./UserProfileModal.jsx";

const MAX_VIDEO_NOTE_SEC = 60;
const QUICK_REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
/** Pointers on these elements skip bubble tap feedback (menu, links, media, reactions). */
const BUBBLE_PRESS_IGNORE =
  'button, a[href], input, textarea, select, [role="button"], [role="menu"], [role="menuitem"], .msgMenu, .msgMenuDropdown, video, audio, .circleVideoMsg, .circleVideoSoundBtn, .voiceMsgPill, .reactionPill';
/** Distance from bottom (px) to treat as "following" the chat for auto-scroll on new messages. */
const SCROLL_NEAR_BOTTOM_PX = 100;
/** Mobile long-press → message menu (ms). */
const MOBILE_LONG_PRESS_MS = 420;
/** Cancel long-press if finger moves farther than this (px) from start. */
const MOBILE_LONG_PRESS_MOVE_CANCEL_PX = 14;
const MOBILE_LONG_PRESS_MOVE_CANCEL_PX2 = MOBILE_LONG_PRESS_MOVE_CANCEL_PX * MOBILE_LONG_PRESS_MOVE_CANCEL_PX;

// Swipe-to-reply (Telegram-like)
const ENABLE_SWIPE_TO_REPLY = false;
const SWIPE_REPLY_ARM_X_PX = 10;
const SWIPE_REPLY_CANCEL_Y_PX = 14;
const SWIPE_REPLY_TRIGGER_PX = 56;
const SWIPE_REPLY_MAX_PX = 82;

const MessageActionMenuPanel = forwardRef(function MessageActionMenuPanel(
  {
    t,
    canQuickReact,
    hasSecondaryActions,
    canEditOwn,
    canAdminDelete,
    className,
    style,
    onToggleReaction,
    onEdit,
    onAdminDelete,
    closeMenu,
  },
  ref
) {
  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {canQuickReact ? (
        <>
          <div className="msgMenuReactions" role="group" aria-label={t("messageMenuReactions")}>
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
                  closeMenu();
                  onToggleReaction?.(emo);
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
            onEdit?.();
            closeMenu();
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
            closeMenu();
            onAdminDelete?.();
          }}
        >
          {t("deleteMessage")}
        </button>
      ) : null}
    </div>
  );
});
MessageActionMenuPanel.displayName = "MessageActionMenuPanel";

/** Fixed-position menu placement for mobile (viewport + composer bounds). */
function computeMobileMessageMenuPlacement(anchorEl, menuEl, composerEl, headerEl) {
  if (!anchorEl || !menuEl) return null;

  const margin = 10;
  const gap = 6;
  const ar = anchorEl.getBoundingClientRect();
  const cr = composerEl?.getBoundingClientRect();
  const hr = headerEl?.getBoundingClientRect();
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const vw = Math.min(vv?.width ?? window.innerWidth, window.innerWidth);

  const composerTop = cr?.top ?? window.innerHeight;
  const headerBottom = hr?.bottom ?? 0;

  const bandTop = headerBottom + margin;
  const bandBottom = composerTop - margin;
  const bandH = Math.max(120, bandBottom - bandTop);

  const menuNaturalH = menuEl.offsetHeight;
  const menuW = Math.min(280, Math.max(168, vw - margin * 2));

  const spaceBelow = bandBottom - ar.bottom - gap;
  const spaceAbove = ar.top - bandTop - gap;

  let openUp = false;
  let top;
  let maxHeight = Math.min(menuNaturalH, bandH);

  if (menuNaturalH <= spaceBelow) {
    openUp = false;
    top = ar.bottom + gap;
  } else if (menuNaturalH <= spaceAbove) {
    openUp = true;
    top = ar.top - gap - menuNaturalH;
  } else {
    openUp = spaceAbove >= spaceBelow;
    maxHeight = Math.max(100, Math.min(menuNaturalH, bandH - 2));
    if (openUp) {
      top = ar.top - gap - maxHeight;
    } else {
      top = ar.bottom + gap;
    }
  }

  top = Math.max(bandTop, Math.min(top, bandBottom - maxHeight));

  let left = ar.right - menuW;
  left = Math.max(margin, Math.min(left, vw - menuW - margin));

  return { top, left, width: menuW, maxHeight, openUp };
}

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
  const safeMessages = useMemo(() => {
    if (!Array.isArray(messages)) return [];
    return messages.filter((m) => m && typeof m === "object");
  }, [messages]);

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
  const [sendAckActive, setSendAckActive] = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);
  const [replyToMessage, setReplyToMessage] = useState(null); // { id, senderUsername, preview }
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
  const menuAnchorRef = useRef(null);
  const mobileFloatingMenuRef = useRef(null);
  const composerRef = useRef(null);
  const chatHeaderRef = useRef(null);
  const [mobileMenuPlacement, setMobileMenuPlacement] = useState(null);
  const [longPressFlashMessageId, setLongPressFlashMessageId] = useState(null);
  const longPressFlashTimerRef = useRef(null);
  const longPressClickBlockUntilRef = useRef(0);
  const longPressTimerRef = useRef(null);
  const longPressTrackRef = useRef(null);
  const swipeStateRef = useRef(null); // { id, sx, sy, active, dx }
  const swipeAnimRafRef = useRef(0);
  const swipeClickBlockUntilRef = useRef(0);
  const [swipeMessageId, setSwipeMessageId] = useState(null);
  const [swipeDx, setSwipeDx] = useState(0);

  const getReplyPreviewForMessage = useCallback(
    (m) => {
      if (!m) return "";
      if (m.imageUrl) return t("notifyPreviewPhoto");
      if (m.audioUrl) return t("notifyPreviewVoice");
      if (m.videoUrl) return t("notifyPreviewVideo");
      const s = String(m.text ?? "").replace(/\s+/g, " ").trim();
      return s.length > 80 ? `${s.slice(0, 77)}…` : s;
    },
    [t]
  );

  const maybeTriggerReplyHaptic = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(10);
    } catch {
      /* ignore */
    }
  }, []);

  const onMobileBubbleSwipeTouchStart = useCallback(
    (e, message) => {
      if (!ENABLE_SWIPE_TO_REPLY) return;
      if (!isMobileChat) return;
      if (!message?.id) return;
      if (e.touches.length !== 1) return;
      const t0 = e.touches[0];
      swipeStateRef.current = { id: message.id, sx: t0.clientX, sy: t0.clientY, active: false, dx: 0, msg: message };
      setSwipeMessageId(message.id);
      setSwipeDx(0);
    },
    [isMobileChat]
  );

  const onMobileBubbleSwipeTouchMove = useCallback(
    (e) => {
      if (!ENABLE_SWIPE_TO_REPLY) return;
      if (!isMobileChat) return;
      const s = swipeStateRef.current;
      if (!s) return;
      const t0 = e.touches[0];
      if (!t0) return;
      const dx = t0.clientX - s.sx;
      const dy = t0.clientY - s.sy;

      if (!s.active) {
        if (Math.abs(dy) > SWIPE_REPLY_CANCEL_Y_PX && Math.abs(dy) > Math.abs(dx)) {
          swipeStateRef.current = null;
          setSwipeMessageId(null);
          setSwipeDx(0);
          return;
        }
        if (dx > SWIPE_REPLY_ARM_X_PX && dx > Math.abs(dy) * 1.2) {
          s.active = true;
        } else {
          return;
        }
      }

      const clamped = Math.max(0, Math.min(SWIPE_REPLY_MAX_PX, dx));
      s.dx = clamped;
      if (swipeAnimRafRef.current) cancelAnimationFrame(swipeAnimRafRef.current);
      swipeAnimRafRef.current = requestAnimationFrame(() => {
        setSwipeDx(clamped);
      });
    },
    [isMobileChat]
  );

  const finishSwipe = useCallback(
    (trigger) => {
      if (!ENABLE_SWIPE_TO_REPLY) return;
      const s = swipeStateRef.current;
      swipeStateRef.current = null;
      if (swipeAnimRafRef.current) cancelAnimationFrame(swipeAnimRafRef.current);
      swipeAnimRafRef.current = 0;

      const msg = s?.msg;
      const dx = Number(s?.dx || 0);
      const shouldTrigger = Boolean(trigger) && dx >= SWIPE_REPLY_TRIGGER_PX && msg?.id;

      setSwipeDx(0);
      setSwipeMessageId(null);

      if (shouldTrigger) {
        maybeTriggerReplyHaptic();
        swipeClickBlockUntilRef.current = Date.now() + 700;
        setReplyToMessage({
          id: msg.id,
          senderUsername: msg.sender?.username || getDisplayName(msg, meId, meUsername),
          preview: getReplyPreviewForMessage(msg),
        });
      }
    },
    [getReplyPreviewForMessage, maybeTriggerReplyHaptic, meId, meUsername]
  );

  const onMobileBubbleSwipeTouchEnd = useCallback(() => finishSwipe(true), [finishSwipe]);
  const onMobileBubbleSwipeTouchCancel = useCallback(() => finishSwipe(false), [finishSwipe]);

  const onBubblePointerDown = useCallback((e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const t = e.target;
    if (t instanceof Element && t.closest(BUBBLE_PRESS_IGNORE)) return;
    const node = e.currentTarget;
    node.classList.add("bubble--pressed");
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      // ignore (e.g. pointer not capturable)
    }
  }, []);

  const onBubblePointerUp = useCallback((e) => {
    const node = e.currentTarget;
    node.classList.remove("bubble--pressed");
    try {
      node.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const onBubblePointerCancel = useCallback((e) => {
    e.currentTarget.classList.remove("bubble--pressed");
  }, []);

  const onBubbleLostPointerCapture = useCallback((e) => {
    e.currentTarget.classList.remove("bubble--pressed");
  }, []);

  const isGroup = chat?.type === "group";
  const isMobileChat = Boolean(onMobileBack);
  const showVideoNoteOverlay = isMobileChat && (videoArming || videoRecording || Boolean(videoNoteDraft));

  const mobileMenuTarget = useMemo(() => {
    if (menuMessageId == null) return null;
    const m = messages.find((x) => x.id === menuMessageId);
    if (!m || m.type === "system") return null;
    return m;
  }, [messages, menuMessageId]);

  const mobileMenuFlags = useMemo(() => {
    const m = mobileMenuTarget;
    if (!m) return null;
    const showMessageMenu =
      (m.senderId === meId && (!isBanned || isAdmin)) ||
      (m.senderId !== meId && (isAdmin || !isBanned));
    if (!showMessageMenu) return null;
    const canEditOwn = m.senderId === meId && !isBanned;
    const canAdminDelete = Boolean(isAdmin);
    return {
      canQuickReact: !isBanned,
      canEditOwn,
      canAdminDelete,
      hasSecondaryActions: canEditOwn || canAdminDelete,
    };
  }, [mobileMenuTarget, meId, isBanned, isAdmin]);

  const clearBubbleLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTrackRef.current = null;
  }, []);

  const triggerMobileMessageMenuFeedback = useCallback((messageId) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(10);
        return;
      }
    } catch {
      /* ignore */
    }
    // Optional micro-sound fallback (very subtle), only when vibration is unavailable.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now);
      o.stop(now + 0.06);
      o.onended = () => {
        try {
          ctx.close?.();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ignore */
    }
  }, []);

  const triggerMobileLongPressFlash = useCallback((messageId) => {
    if (!messageId) return;
    setLongPressFlashMessageId(messageId);
    if (longPressFlashTimerRef.current) window.clearTimeout(longPressFlashTimerRef.current);
    longPressFlashTimerRef.current = window.setTimeout(() => {
      longPressFlashTimerRef.current = null;
      setLongPressFlashMessageId(null);
    }, 180);
  }, []);

  const onMobileBubbleTouchStart = useCallback(
    (e, messageId, showMessageMenu) => {
      if (!isMobileChat || !showMessageMenu || showVideoNoteOverlay) return;
      if (e.touches.length !== 1) return;
      // Important: arm long-press on the bubble itself even if the touch starts on
      // interactive voice controls (play button, waveform, audio element).
      // We'll suppress the post-long-press "click" to avoid triggering playback.
      clearBubbleLongPress();
      const t = e.touches[0];
      longPressTrackRef.current = { x: t.clientX, y: t.clientY };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTrackRef.current = null;
        triggerMobileMessageMenuFeedback(messageId);
        triggerMobileLongPressFlash(messageId);
        longPressClickBlockUntilRef.current = Date.now() + 900;
        setMenuMessageId(messageId);
      }, MOBILE_LONG_PRESS_MS);
    },
    [isMobileChat, showVideoNoteOverlay, clearBubbleLongPress, triggerMobileMessageMenuFeedback, triggerMobileLongPressFlash]
  );

  const onMobileBubbleTouchMove = useCallback(
    (e) => {
      if (!isMobileChat || longPressTrackRef.current == null) return;
      const t = e.touches[0];
      if (!t) return;
      const o = longPressTrackRef.current;
      const dx = t.clientX - o.x;
      const dy = t.clientY - o.y;
      if (dx * dx + dy * dy > MOBILE_LONG_PRESS_MOVE_CANCEL_PX2) {
        clearBubbleLongPress();
      }
    },
    [isMobileChat, clearBubbleLongPress]
  );

  const onMobileBubbleTouchEnd = useCallback(() => {
    if (!isMobileChat) return;
    clearBubbleLongPress();
  }, [isMobileChat, clearBubbleLongPress]);

  const onMobileBubbleTouchCancel = useCallback(() => {
    if (!isMobileChat) return;
    clearBubbleLongPress();
  }, [isMobileChat, clearBubbleLongPress]);

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

  /** Subtle outline pulse + optional light haptic when a message is sent (not edit-save). */
  function playSendAck() {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(10);
      } catch {
        /* ignore */
      }
    }
    if (reduce) return;
    setSendAckActive(false);
    requestAnimationFrame(() => {
      setSendAckActive(true);
    });
  }

  useEffect(() => {
    if (!sendAckActive) return;
    const t = window.setTimeout(() => setSendAckActive(false), 520);
    return () => window.clearTimeout(t);
  }, [sendAckActive]);

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
      if (isMobileChat) clearBubbleLongPress();
    }
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [chatId, isMobileChat, clearBubbleLongPress]);

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
    setReplyToMessage(null);
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTrackRef.current = null;
    if (longPressFlashTimerRef.current != null) {
      window.clearTimeout(longPressFlashTimerRef.current);
      longPressFlashTimerRef.current = null;
    }
    setLongPressFlashMessageId(null);
    longPressClickBlockUntilRef.current = 0;
    swipeClickBlockUntilRef.current = 0;
    swipeStateRef.current = null;
    setSwipeMessageId(null);
    setSwipeDx(0);
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

  useLayoutEffect(() => {
    if (!isMobileChat || menuMessageId == null || !mobileMenuTarget || !mobileMenuFlags) {
      setMobileMenuPlacement(null);
      return;
    }

    const run = () => {
      const place = computeMobileMessageMenuPlacement(
        menuAnchorRef.current,
        mobileFloatingMenuRef.current,
        composerRef.current,
        chatHeaderRef.current
      );
      if (place) setMobileMenuPlacement(place);
    };

    run();
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      run();
      raf2 = requestAnimationFrame(run);
    });

    const vv = window.visualViewport;
    const listEl = listRef.current;
    vv?.addEventListener("resize", run);
    vv?.addEventListener("scroll", run);
    window.addEventListener("resize", run);
    listEl?.addEventListener("scroll", run, { passive: true });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      vv?.removeEventListener("resize", run);
      vv?.removeEventListener("scroll", run);
      window.removeEventListener("resize", run);
      listEl?.removeEventListener("scroll", run);
    };
  }, [isMobileChat, menuMessageId, mobileMenuTarget, mobileMenuFlags]);

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
      if (safeMessages.length > 0) {
        lastMessageIdsRef.current = new Set(safeMessages.map((m) => String(m.id)));
        skipMessageEnterRef.current = false;
      } else {
        lastMessageIdsRef.current = new Set();
        skipMessageEnterRef.current = true;
      }
      return;
    }

    const nextIds = new Set(safeMessages.map((m) => String(m.id)));
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
  }, [chatId, safeMessages]);

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
      playSendAck();
      requestScrollAfterSend();
      onSend({ text: "", videoUrl: url, ...(replyToMessage?.id ? { replyToMessageId: replyToMessage.id } : {}) });
      setReplyToMessage(null);
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
            playSendAck();
            requestScrollAfterSend();
            onSend({ text: "", audioUrl: url, ...(replyToMessage?.id ? { replyToMessageId: replyToMessage.id } : {}) });
            setReplyToMessage(null);
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
    playSendAck();
    requestScrollAfterSend();
    onSend({
      text: trimmed,
      imageUrl: pendingImageUrl || undefined,
      ...(replyToMessage?.id ? { replyToMessageId: replyToMessage.id } : {}),
    });
    setText("");
    clearPendingImage();
    setReplyToMessage(null);
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
      <UserProfileModal
        open={Boolean(profileUserId)}
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
        t={t}
      />
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
          <div className="chatHeader" ref={chatHeaderRef}>
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
                  <button
                    type="button"
                    className="avatarSm avatarTapBtn"
                    onClick={() => chat?.other?.id && setProfileUserId(Number(chat.other.id))}
                    aria-label={t("profile")}
                  >
                    {chat?.other?.avatar ? (
                      <img src={chat.other.avatar} alt="" />
                    ) : (
                      <span>{initials(chat?.other?.username || "")}</span>
                    )}
                  </button>
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
            {safeMessages.map((m) =>
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
                  const showMenuButton = showMessageMenu && !isMobileChat;
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
                  <button
                    type="button"
                    className="msgAvatar avatarTapBtn"
                    title={m.sender?.username || ""}
                    onClick={() => {
                      const uid = Number(m.senderId);
                      if (!uid || uid === Number(meId)) return;
                      setProfileUserId(uid);
                    }}
                    aria-label={t("profile")}
                  >
                    {getAvatarSrc(m, meId, meAvatar) ? (
                      <img src={getAvatarSrc(m, meId, meAvatar)} alt="" />
                    ) : (
                      <span>{initials(getDisplayName(m, meId, meUsername))}</span>
                    )}
                  </button>
                  <div
                    className={
                      (m.senderId === meId
                        ? `bubble me${showMenuButton ? " bubbleOwn" : ""} bubbleWithActions${bubbleMediaBare}`
                        : `bubble bubbleWithActions${bubbleMediaBare}`) + (longPressFlashMessageId === m.id ? " bubble--lpFlash" : "")
                    }
                    style={
                      ENABLE_SWIPE_TO_REPLY && isMobileChat && swipeMessageId === m.id
                        ? { transform: `translate3d(${swipeDx}px, 0, 0)` }
                        : undefined
                    }
                    ref={isMobileChat && menuMessageId === m.id ? menuAnchorRef : undefined}
                    onPointerDown={onBubblePointerDown}
                    onPointerUp={onBubblePointerUp}
                    onPointerCancel={onBubblePointerCancel}
                    onLostPointerCapture={onBubbleLostPointerCapture}
                    onTouchStart={
                      isMobileChat
                        ? (e) => {
                            onMobileBubbleTouchStart(e, m.id, showMessageMenu);
                            if (ENABLE_SWIPE_TO_REPLY) onMobileBubbleSwipeTouchStart(e, m);
                          }
                        : undefined
                    }
                    onTouchMove={
                      isMobileChat
                        ? (e) => {
                            onMobileBubbleTouchMove(e);
                            if (ENABLE_SWIPE_TO_REPLY) onMobileBubbleSwipeTouchMove(e);
                          }
                        : undefined
                    }
                    onTouchEnd={
                      isMobileChat
                        ? () => {
                            onMobileBubbleTouchEnd();
                            if (ENABLE_SWIPE_TO_REPLY) onMobileBubbleSwipeTouchEnd();
                          }
                        : undefined
                    }
                    onTouchCancel={
                      isMobileChat
                        ? () => {
                            onMobileBubbleTouchCancel();
                            if (ENABLE_SWIPE_TO_REPLY) onMobileBubbleSwipeTouchCancel();
                          }
                        : undefined
                    }
                    onClickCapture={
                      isMobileChat
                        ? (e) => {
                            if (
                              Date.now() < longPressClickBlockUntilRef.current ||
                              Date.now() < swipeClickBlockUntilRef.current
                            ) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }
                        : undefined
                    }
                    onContextMenu={
                      isMobileChat && showMessageMenu ? (e) => e.preventDefault() : undefined
                    }
                  >
                    {ENABLE_SWIPE_TO_REPLY && isMobileChat ? (
                      <span
                        className={swipeMessageId === m.id && swipeDx > 8 ? "swipeReplyIcon swipeReplyIcon--on" : "swipeReplyIcon"}
                        aria-hidden
                      >
                        ↩︎
                      </span>
                    ) : null}
                    {showMenuButton ? (
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
                        {menuMessageId === m.id && !isMobileChat ? (
                          <MessageActionMenuPanel
                            t={t}
                            canQuickReact={canQuickReact}
                            hasSecondaryActions={hasSecondaryActions}
                            canEditOwn={canEditOwn}
                            canAdminDelete={canAdminDelete}
                            className="msgMenuDropdown"
                            onToggleReaction={(emo) => onToggleReaction?.(m.id, emo)}
                            onEdit={() => {
                              setEditingMessageId(m.id);
                              setText(String(m.text ?? ""));
                              onTyping?.(false);
                            }}
                            onAdminDelete={() => onAdminDeleteMessage?.(m.id)}
                            closeMenu={() => setMenuMessageId(null)}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {isGroup ? (
                      <div className="msgSenderName">{m.sender?.username || "?"}</div>
                    ) : null}
                    {m.replyTo ? (
                      <div className="replyBlock" aria-label={t("replyTo")}>
                        <div className="replyBlockSender">{m.replyTo.senderUsername || t("notifyUnknownSender")}</div>
                        <div className="replyBlockPreview muted">
                          {m.replyTo.imageUrl
                            ? t("notifyPreviewPhoto")
                            : m.replyTo.audioUrl
                              ? t("notifyPreviewVoice")
                              : m.replyTo.videoUrl
                                ? t("notifyPreviewVideo")
                                : String(m.replyTo.text || "").replace(/\s+/g, " ").trim() || t("notifyBodyFallback")}
                        </div>
                      </div>
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
            {chatId && !messages.some((m) => m.type !== "system") ? (
              <div className="chatEmptyState" role="status">
                <p className="chatEmptyStateText">{t("chatEmptyPrompt")}</p>
              </div>
            ) : null}
          </div>

          <div
            className={`typingIndicator${otherTyping && chatId ? " typingIndicator--on" : ""}`}
            role="status"
            aria-live="polite"
            aria-hidden={!otherTyping || !chatId}
          >
            <div className="typingIndicatorInner">
              <span className="typingIndicatorDots" aria-hidden="true">
                <span className="typingIndicatorDot" />
                <span className="typingIndicatorDot" />
                <span className="typingIndicatorDot" />
              </span>
              <span className="typingIndicatorLabel">{t("typing")}</span>
            </div>
          </div>

          <div className="composer" ref={composerRef}>
            {isBanned ? <div className="banBanner">{t("authBanned")}</div> : null}
            {uploadError ? <div className="uploadErrBanner">{uploadError}</div> : null}
            {imageUploading ? <div className="uploadProgressHint">{t("uploadImageProgress")}</div> : null}
            {voiceUploading ? <div className="uploadProgressHint">{t("voiceSending")}</div> : null}
            {videoNoteUploading ? <div className="uploadProgressHint">{t("videoNoteUploading")}</div> : null}
            {ENABLE_SWIPE_TO_REPLY && replyToMessage ? (
              <div className="replyComposerBar" role="group" aria-label={t("replyTo")}>
                <div className="replyComposerMain">
                  <div className="replyComposerLabel">{t("replyTo")}</div>
                  <div className="replyComposerLine">
                    <span className="replyComposerSender">{replyToMessage.senderUsername}</span>
                    <span className="replyComposerPreview muted">{replyToMessage.preview}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="replyComposerClose"
                  aria-label={t("cancelReply")}
                  onClick={() => setReplyToMessage(null)}
                >
                  ×
                </button>
              </div>
            ) : null}
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
              }${sendAckActive ? " composerSendAck" : ""}`}
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget) return;
                setSendAckActive(false);
              }}
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
              <div
                className={`composerInputShell${String(text).length ? " composerInputShell--filled" : ""}`}
              >
                <span className="composerInputGhost" aria-hidden="true">
                  {t("typeMessagePlaceholder")}
                </span>
                <textarea
                  className="composerInput"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    scheduleTyping();
                  }}
                  rows={1}
                  placeholder=""
                  aria-label={t("typeMessagePlaceholder")}
                  autoComplete="off"
                  autoCorrect="on"
                  spellCheck
                  enterKeyHint={isMobileChat ? "send" : undefined}
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
              </div>
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
            {isMobileChat &&
            menuMessageId != null &&
            mobileMenuTarget &&
            mobileMenuFlags &&
            typeof document !== "undefined"
              ? createPortal(
                  <MessageActionMenuPanel
                    ref={mobileFloatingMenuRef}
                    t={t}
                    canQuickReact={mobileMenuFlags.canQuickReact}
                    hasSecondaryActions={mobileMenuFlags.hasSecondaryActions}
                    canEditOwn={mobileMenuFlags.canEditOwn}
                    canAdminDelete={mobileMenuFlags.canAdminDelete}
                    className={`msgMenuDropdown msgMenuDropdown--mobileFixed${
                      mobileMenuPlacement?.openUp ? " msgMenuDropdown--openUp" : ""
                    }`}
                    style={
                      mobileMenuPlacement
                        ? {
                            position: "fixed",
                            top: mobileMenuPlacement.top,
                            left: mobileMenuPlacement.left,
                            width: mobileMenuPlacement.width,
                            maxHeight: mobileMenuPlacement.maxHeight,
                            zIndex: 200,
                          }
                        : {
                            position: "fixed",
                            top: 0,
                            left: 0,
                            width: 280,
                            maxHeight: 560,
                            visibility: "hidden",
                            pointerEvents: "none",
                            zIndex: 200,
                          }
                    }
                    onToggleReaction={(emo) => onToggleReaction?.(mobileMenuTarget.id, emo)}
                    onEdit={() => {
                      setEditingMessageId(mobileMenuTarget.id);
                      setText(String(mobileMenuTarget.text ?? ""));
                      onTyping?.(false);
                    }}
                    onAdminDelete={() => onAdminDeleteMessage?.(mobileMenuTarget.id)}
                    closeMenu={() => setMenuMessageId(null)}
                  />,
                  document.body
                )
              : null}
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
