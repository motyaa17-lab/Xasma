import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Reveal width (px) — slightly softer than a full 76px rail. */
const ACTION_PX = 62;
/** Horizontal movement (px) before swipe can activate (12–18px range). */
const HORIZONTAL_LOCK_PX = 15;
/** Early vertical scroll detection (px): beats weak diagonals. */
const VERTICAL_BIAS_PX = 8;
/** |dx| must exceed |dy| * this to count as horizontal swipe. */
const HORIZONTAL_DOMINANCE = 1.55;
/** |dy| > |dx| * this → scroll wins while still undecided. */
const VERTICAL_DOMINANCE = 1.12;
/** Release past this offset (px) commits an action. */
const RELEASE_COMMIT_PX = 48;
/** Treat as “full” swipe (fraction of viewport width). */
const FULL_SWIPE_FRAC = 0.36;
/** Extra pull beyond max uses rubber-band (fraction of overshoot). */
const RUBBER_BAND = 0.3;
const MAX_DRAG_PX = ACTION_PX * 1.12;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function rubberBandX(raw) {
  const ax = Math.abs(raw);
  if (ax <= MAX_DRAG_PX) return raw;
  const sign = raw >= 0 ? 1 : -1;
  return sign * (MAX_DRAG_PX + (ax - MAX_DRAG_PX) * RUBBER_BAND);
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
 * - .mobileChatRowSwipeFront: solid opaque card (z-index 1) + translate3d for swipe
 * Scroll-first gesture: vertical movement wins unless dx clearly dominates after threshold.
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
  scrollCloseNonce = 0,
  t,
}) {
  const frontRef = useRef(null);
  const offsetRef = useRef(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffRef = useRef(0);
  /** 'pending' | 'vertical' | 'horizontal' */
  const gestureRef = useRef("pending");
  const touchIdRef = useRef(null);
  const rafRef = useRef(0);

  const touchEnabled = isTouchDevice();

  const applyOffset = useCallback((x, withTransition) => {
    const isRest = withTransition && Math.abs(x) < 0.5;
    const px = isRest ? 0 : x;
    offsetRef.current = px;
    const el = frontRef.current;
    if (!el) return;
    el.style.transition = withTransition
      ? "transform 0.24s cubic-bezier(0.25, 0.82, 0.2, 1)"
      : "none";
    el.style.transform = `translate3d(${px}px,0,0)`;
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

  /** List scroll closes any peek / in-progress row (parent also clears swipeOpenId). */
  useEffect(() => {
    if (scrollCloseNonce === 0) return;
    touchIdRef.current = null;
    gestureRef.current = "pending";
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    applyOffset(0, true);
    onSwipeActiveChange?.(chatId, "end");
  }, [scrollCloseNonce, applyOffset, chatId, onSwipeActiveChange]);

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
      gestureRef.current = "pending";
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
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (gestureRef.current === "pending") {
        // Scroll priority: clear vertical intent before horizontal can lock.
        if (absDy >= VERTICAL_BIAS_PX && absDy > absDx * VERTICAL_DOMINANCE) {
          gestureRef.current = "vertical";
          return;
        }
        // Wait until we have enough signal (avoid jitter).
        if (absDx < HORIZONTAL_LOCK_PX && absDy < HORIZONTAL_LOCK_PX) return;
        // Horizontal swipe requires both threshold and dominance over vertical.
        if (absDx >= HORIZONTAL_LOCK_PX && absDx > absDy * HORIZONTAL_DOMINANCE) {
          gestureRef.current = "horizontal";
          onSwipeActiveChange?.(chatId, "lock");
        } else {
          gestureRef.current = "vertical";
          return;
        }
      }

      if (gestureRef.current === "vertical") return;

      e.preventDefault();

      const minX = canDelete ? -ACTION_PX * 1.2 : 0;
      const maxX = ACTION_PX * 1.2;
      let raw = startOffRef.current + dx;
      raw = clamp(raw, minX, maxX);
      const next = rubberBandX(raw);

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
      const mode = gestureRef.current;
      gestureRef.current = "pending";

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }

      if (mode === "vertical" || mode === "pending") {
        return;
      }

      const el = frontRef.current;
      if (el) {
        applyOffset(offsetRef.current, false);
      }

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
    [canDelete, chatId, onRequestDelete, onSwipeActiveChange, onToggleListPin, snapTo, touchEnabled, applyOffset]
  );

  const onTouchCancel = useCallback(() => {
    touchIdRef.current = null;
    gestureRef.current = "pending";
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
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
