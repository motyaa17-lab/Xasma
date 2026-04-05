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

function SwipePinIcon() {
  return (
    <svg className="mobileChatRowSwipeGlyph" viewBox="0 0 24 24" aria-hidden width={22} height={22}>
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
      />
    </svg>
  );
}

function SwipeTrashIcon() {
  return (
    <svg className="mobileChatRowSwipeGlyph" viewBox="0 0 24 24" aria-hidden width={22} height={22}>
      <path
        fill="currentColor"
        d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4zM10 9v9h2v-9h-2zm4 0v9h2v-9h-2z"
      />
    </svg>
  );
}

/**
 * Touch-only swipe row (mobile inbox). Structure:
 * - .mobileChatRowSwipe: rounded clip (overflow:hidden), holds under + front
 * - .mobileChatRowSwipeUnder: absolute pin | delete pads (z-index 0)
 * - .mobileChatRowSwipeFront: solid opaque card (z-index 1) + translateX for swipe
 * Left: delete (caller confirms). Right: pin/unpin. Desktop uses plain <button> rows.
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
      if (!touchEnabled) return;
      if (e.touches.length !== 1) return;
      const tch = e.touches[0];
      touchIdRef.current = tch.identifier;
      startXRef.current = tch.clientX;
      startYRef.current = tch.clientY;
      startOffRef.current = offsetRef.current;
      horizontalRef.current = false;
    },
    [touchEnabled]
  );

  const onTouchMove = useCallback(
    (e) => {
      if (!touchEnabled) return;
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
    [applyOffset, canDelete, chatId, onSwipeActiveChange, touchEnabled]
  );

  const touchMoveRef = useRef(onTouchMove);
  touchMoveRef.current = onTouchMove;

  useLayoutEffect(() => {
    const el = frontRef.current;
    if (!el || !touchEnabled) return;
    const fn = (e) => touchMoveRef.current(e);
    el.addEventListener("touchmove", fn, { passive: false });
    return () => el.removeEventListener("touchmove", fn);
  }, [touchEnabled]);

  const onTouchEnd = useCallback(
    (e) => {
      if (!touchEnabled) return;
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
    [canDelete, chatId, onRequestDelete, onSwipeActiveChange, onToggleListPin, snapTo, touchEnabled]
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

  if (!touchEnabled) {
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
            <SwipePinIcon />
          </span>
        </div>
        <div className="mobileChatRowSwipePad mobileChatRowSwipePad--delete">
          <span className="mobileChatRowSwipeIcon" title={t("chatListSwipeDelete")}>
            <SwipeTrashIcon />
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
