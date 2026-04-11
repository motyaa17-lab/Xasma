import React, { useEffect, useMemo, useState } from "react";
import { formatAtUserHandle } from "../userHandleDisplay.js";

function initials(name) {
  const s = String(name || "").trim();
  return (s[0] || "?").toUpperCase();
}

export default function CallOverlay({
  call,
  t,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
}) {
  const visible = Boolean(call && call.phase && call.phase !== "idle");
  const [dots, setDots] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!visible) return undefined;
    const id = window.setInterval(() => setDots((d) => (d + 1) % 4), 450);
    return () => window.clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (!visible || call?.phase !== "connected") return undefined;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [visible, call?.phase]);

  function formatDur(ms) {
    const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  const title = useMemo(() => {
    if (!call) return "";
    const dotsText = "…".repeat(dots);
    if (call.phase === "calling") return `${t("callCalling")}${dotsText}`;
    if (call.phase === "ringing") return t("callIncoming");
    if (call.phase === "connecting") return `${t("callConnecting")}${dotsText}`;
    if (call.phase === "connected") return t("callConnected");
    if (call.phase === "ended") return t("callEnded");
    return "";
  }, [call, t, dots]);

  if (!visible) return null;

  const name = String(call?.peerUsername || "");
  const atHandle = call?.peerUserHandle ? formatAtUserHandle(call.peerUserHandle) : "";
  const avatar = String(call?.peerAvatar || "");
  const showAcceptReject = call.phase === "ringing";
  const showCancel = call.phase === "calling";
  const showActiveControls = call.phase === "connecting" || call.phase === "connected";
  const showDuration = call.phase === "connected" && call?.connectedAtMs;
  const isRinging = call.phase === "ringing";
  const isConnected = call.phase === "connected";
  const isEnding = call.phase === "ended";

  return (
    <div
      className={`callOverlay callOverlay--premium${isEnding ? " callOverlay--out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("callOverlay")}
    >
      <div className={`callCard callCard--premium callCard--alive callCard--in${isEnding ? " callCard--out" : ""}`}>
        <div className="callCardGlow" aria-hidden />

        <div className={`callHero${isConnected ? " callHero--connected" : ""}`}>
          <div className="callAvatar callAvatar--hero" aria-hidden>
            <div
              className={
                isConnected
                  ? "callAvatarPulse callAvatarPulse--connected"
                  : isRinging
                    ? "callAvatarPulse callAvatarPulse--ringing"
                    : "callAvatarPulse callAvatarPulse--idle"
              }
              aria-hidden
            />
            {avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>}
          </div>

          <div className="callPeerName callPeerName--hero">{name || t("displayNameUser")}</div>
          {atHandle ? <div className="callPeerUsername muted small">{atHandle}</div> : null}

          <div className="callMeta">
            <div className="callSubtitle">
              {call.phase === "ringing" ? t("callIncomingAudioSubtitle") : t("callAudioSubtitle")}
            </div>
            <div className="callStatus callStatus--hero">{title}</div>
          </div>

          {showDuration ? (
            <div className="callTimerBlock" aria-label={t("callDuration")}>
              <div className="callTimer">{formatDur(Date.now() - Number(call.connectedAtMs || 0))}</div>
              <div className="callTimerLabel">{t("callDuration")}</div>
            </div>
          ) : null}
        </div>

        <div className={`callActions${showAcceptReject ? " callActions--incoming" : ""}`}>
          {showAcceptReject ? (
            <>
              <button type="button" className="callBtn callBtn--danger callBtn--pill callBtn--xl" onClick={onReject}>
                {t("callReject")}
              </button>
              <button type="button" className="callBtn callBtn--primary callBtn--pill callBtn--xl callBtn--shine" onClick={onAccept}>
                {t("callAccept")}
              </button>
            </>
          ) : null}

          {showActiveControls ? (
            <>
              <button
                type="button"
                className={`callBtn callBtn--ghost callBtn--pill callBtn--xl${call.muted ? " callBtn--muted" : ""}`}
                onClick={onToggleMute}
              >
                {call.muted ? t("callUnmute") : t("callMute")}
              </button>
              <button type="button" className="callBtn callBtn--danger callBtn--pill callBtn--xl" onClick={onEnd}>
                {t("callEnd")}
              </button>
            </>
          ) : null}

          {showCancel ? (
            <button type="button" className="callBtn callBtn--danger callBtn--pill callBtn--xl" onClick={onEnd}>
              {t("callCancel")}
            </button>
          ) : null}

          {call.phase === "ended" ? (
            <button type="button" className="callBtn callBtn--ghost callBtn--pill callBtn--xl" onClick={onEnd}>
              {t("close")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

