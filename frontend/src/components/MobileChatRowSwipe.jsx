import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const ACTION_PX = 76;
/** Release past this offset (px) commits an action (Telegram-like). */
const RELEASE_COMMIT_PX = 44;
/** Treat as “full” swipe (fraction of viewport width). */
const FULL_SWIPE_FRAC = 0.38;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
}

/**
 * iOS / iPadOS WebKit: stacked swipe rows (overflow + transform layers) in a scroll view can
 * blank the chat list (white layer). Use plain tap rows there; Android/desktop touch keeps swipe.
 */
function isIosLikeDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iP(hone|ad|od)/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

/**
 * Touch-only swipe actions behind a chat list row (mobile inbox).
 * Left: delete (caller shows confirm). Right: pin/unpin inbox order.
 * Horizontal intent steals the gesture from vertical scroll; vertical scroll stays smooth otherwise.
 */
export default function MobileChatRowSwipe({
  chatId,
  children,
  rowClassName,
  canDelete,
  listPinned,
  onOpenChat,
  onRequestDelete,
  onToggleListPin,
  onSwipeActiveChange,
  shouldCollapse,
  t,
}) {
  const frontRef = useRef(null);
  const offsetRef = useRef(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffRef = useRef(0);
  const horizontalRef = useRef(false);
  const touchIdRef = useRef(null);
  const rafRef = useRef(0);

  const touchEnabled = isTouchDevice();
  const swipeUiEnabled = touchEnabled && !isIosLikeDevice();

  const applyOffset = useCallback((x, withTransition) => {
    offsetRef.current = x;
    const el = frontRef.current;
    if (!el) return;
    el.style.transition = withTransition ? "transform 0.22s ease-out" : "none";
    el.style.transform = `translateX(${x}px)`;
  }, []);

  const snapTo = useCallback(
    (x) => {
      applyOffset(x, true);
    },
    [applyOffset]
  );

  useEffect(() => {
    if (shouldCollapse && touchIdRef.current == null) snapTo(0);
  }, [shouldCollapse, snapTo]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onTouchStart = useCallback(
    (e) => {
      if (!swipeUiEnabled) return;
      if (e.touches.length !== 1) return;
      const tch = e.touches[0];
      touchIdRef.current = tch.identifier;
      startXRef.current = tch.clientX;
      startYRef.current = tch.clientY;
      startOffRef.current = offsetRef.current;
      horizontalRef.current = false;
    },
    [swipeUiEnabled]
  );

  const onTouchMove = useCallback(
    (e) => {
      if (!swipeUiEnabled) return;
      if (touchIdRef.current == null) return;
      const tch = Array.from(e.touches).find((x) => x.identifier === touchIdRef.current);
      if (!tch) return;

      const dx = tch.clientX - startXRef.current;
      const dy = tch.clientY - startYRef.current;

      if (!horizontalRef.current) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.15) {
          touchIdRef.current = null;
          horizontalRef.current = false;
          return;
        }
        horizontalRef.current = true;
        onSwipeActiveChange?.(chatId, "lock");
      }

      e.preventDefault();

      const minX = canDelete ? -ACTION_PX * 1.25 : 0;
      const maxX = ACTION_PX * 1.25;
      let next = startOffRef.current + dx;
      next = clamp(next, minX, maxX);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyOffset(next, false);
      });
    },
    [applyOffset, canDelete, chatId, onSwipeActiveChange, swipeUiEnabled]
  );

  const touchMoveRef = useRef(onTouchMove);
  touchMoveRef.current = onTouchMove;

  useLayoutEffect(() => {
    const el = frontRef.current;
    if (!el || !swipeUiEnabled) return;
    const fn = (e) => touchMoveRef.current(e);
    el.addEventListener("touchmove", fn, { passive: false });
    return () => el.removeEventListener("touchmove", fn);
  }, [swipeUiEnabled]);

  const onTouchEnd = useCallback(
    (e) => {
      if (!swipeUiEnabled) return;
      const tid = touchIdRef.current;
      if (tid == null) return;
      const still = [...e.touches].some((x) => x.identifier === tid);
      if (still) return;

      touchIdRef.current = null;
      if (!horizontalRef.current) {
        return;
      }
      horizontalRef.current = false;

      const w = typeof window !== "undefined" ? window.innerWidth : 400;
      const fullSwipePx = w * FULL_SWIPE_FRAC;
      const o = offsetRef.current;

      if (canDelete && (o <= -fullSwipePx || o <= -RELEASE_COMMIT_PX)) {
        snapTo(0);
        onRequestDelete?.();
      } else if (o >= fullSwipePx || o >= RELEASE_COMMIT_PX) {
        snapTo(0);
        onToggleListPin?.();
      } else {
        snapTo(0);
      }
      onSwipeActiveChange?.(chatId, "end");
    },
    [canDelete, chatId, onRequestDelete, onSwipeActiveChange, onToggleListPin, snapTo, swipeUiEnabled]
  );

  const onTouchCancel = useCallback(() => {
    touchIdRef.current = null;
    horizontalRef.current = false;
    snapTo(0);
    onSwipeActiveChange?.(chatId, "end");
  }, [chatId, onSwipeActiveChange, snapTo]);

  const onFrontClick = useCallback(
    (e) => {
      if (Math.abs(offsetRef.current) > 8) {
        e.preventDefault();
        e.stopPropagation();
        snapTo(0);
        return;
      }
      onOpenChat?.();
    },
    [onOpenChat, snapTo]
  );

  if (!swipeUiEnabled) {
    return (
      <button type="button" className={rowClassName} onClick={onOpenChat}>
        {children}
      </button>
    );
  }

  return (
    <div
      className={`mobileChatRowSwipe${listPinned ? " mobileChatRowSwipe--pinned" : ""}`}
      data-chat-swipe-id={chatId}
    >
      <div className="mobileChatRowSwipeUnder" aria-hidden>
        <div className="mobileChatRowSwipePad mobileChatRowSwipePad--pin">
          <span className="mobileChatRowSwipeIcon" title={t("chatListSwipePin")}>
            📌
          </span>
        </div>
        <div className="mobileChatRowSwipePad mobileChatRowSwipePad--delete">
          <span className="mobileChatRowSwipeIcon" title={t("chatListSwipeDelete")}>
            🗑
          </span>
        </div>
      </div>
      <div
        ref={frontRef}
        className={`mobileChatRowSwipeFront ${rowClassName || ""}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        role="button"
        tabIndex={0}
        onClick={onFrontClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenChat?.();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
