import React, { useEffect, useMemo, useState } from "react";
import { formatAtUserHandle } from "../userHandleDisplay.js";
import { IconHandset, IconMic, IconMicOff, IconPhone, IconSpeaker } from "./Icons.jsx";

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
  voiceLevels = { local: 0, remote: 0 },
  speakerphone = true,
  onToggleSpeakerphone,
  speakerToggleSupported = false,
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
  const isConnected = call.phase === "connected";
  const isEnding = call.phase === "ended";
  const showOrbit = call.phase === "calling" || call.phase === "ringing" || showActiveControls;

  const vl = voiceLevels || { local: 0, remote: 0 };
  const remoteTalk = Math.min(1, Number(vl.remote) || 0);
  const localTalk = call.muted ? 0 : Math.min(1, Number(vl.local) || 0);

  return (
    <div
      className={`callScreen${isEnding ? " callScreen--out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("callOverlay")}
    >
      <div className="callScreen__bg" aria-hidden />
      <div className="callScreen__vignette" aria-hidden />

      <div className="callScreen__body">
        <div className="callScreen__main">
          <div className="callScreen__avatarStack">
            {showOrbit && !isEnding ? (
              <>
                <div
                  className="callScreen__halo callScreen__halo--remote"
                  style={{
                    opacity: 0.22 + remoteTalk * 0.78,
                    transform: `scale(${1 + remoteTalk * 0.14})`,
                  }}
                  aria-hidden
                />
                <div
                  className="callScreen__halo callScreen__halo--local"
                  style={{
                    opacity: 0.12 + localTalk * 0.72,
                    transform: `scale(${1 + localTalk * 0.11})`,
                  }}
                  aria-hidden
                />
                <div className={`callScreen__orbitRing${isConnected ? " callScreen__orbitRing--active" : ""}`} aria-hidden />
              </>
            ) : null}

            <div className="callScreen__avatar" aria-hidden>
              {avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>}
            </div>
          </div>

          <div className="callScreen__name">{name || t("displayNameUser")}</div>
          {atHandle ? <div className="callScreen__handle muted">{atHandle}</div> : null}

          <div className="callScreen__meta">
            <div className="callScreen__subtitle">
              {call.phase === "ringing" ? t("callIncomingAudioSubtitle") : t("callAudioSubtitle")}
            </div>
            <div className="callScreen__status">{title}</div>
          </div>

          {showDuration ? (
            <div className="callScreen__timer" key={tick} aria-label={t("callDuration")}>
              {formatDur(Date.now() - Number(call.connectedAtMs || 0))}
            </div>
          ) : null}

          {call.phase === "ended" ? <div className="callScreen__endedHint muted">{t("callEndedHint")}</div> : null}
        </div>

        <div className="callScreen__dock">
          {showAcceptReject ? (
            <div className="callScreen__dockRow callScreen__dockRow--incoming">
              <button type="button" className="callDockBtn callDockBtn--decline" onClick={onReject} aria-label={t("callReject")}>
                <span className="callDockBtn__icon callDockBtn__icon--phoneDown">
                  <IconPhone size={28} />
                </span>
              </button>
              <button
                type="button"
                className="callDockBtn callDockBtn--accept"
                onClick={onAccept}
                aria-label={t("callAccept")}
              >
                <span className="callDockBtn__icon">
                  <IconPhone size={28} />
                </span>
              </button>
            </div>
          ) : null}

          {showActiveControls ? (
            <div className="callScreen__dockRow callScreen__dockRow--active">
              {speakerToggleSupported ? (
                <button
                  type="button"
                  className={`callDockBtn callDockBtn--glass${speakerphone ? " callDockBtn--on" : ""}`}
                  onClick={onToggleSpeakerphone}
                  aria-label={speakerphone ? t("callEarpiece") : t("callSpeaker")}
                  title={speakerphone ? t("callEarpiece") : t("callSpeaker")}
                >
                  <span className="callDockBtn__icon">{speakerphone ? <IconSpeaker size={26} /> : <IconHandset size={26} />}</span>
                </button>
              ) : null}
              <button
                type="button"
                className={`callDockBtn callDockBtn--glass${call.muted ? " callDockBtn--muted" : ""}`}
                onClick={onToggleMute}
                aria-label={call.muted ? t("callUnmute") : t("callMute")}
                title={call.muted ? t("callUnmute") : t("callMute")}
              >
                <span className="callDockBtn__icon">{call.muted ? <IconMicOff size={26} /> : <IconMic size={26} />}</span>
              </button>
              <button type="button" className="callDockBtn callDockBtn--hangup" onClick={onEnd} aria-label={t("callEnd")}>
                <span className="callDockBtn__icon callDockBtn__icon--phoneDown">
                  <IconPhone size={30} />
                </span>
              </button>
            </div>
          ) : null}

          {showCancel ? (
            <div className="callScreen__dockRow">
              <button type="button" className="callDockBtn callDockBtn--hangup" onClick={onEnd} aria-label={t("callCancel")}>
                <span className="callDockBtn__icon callDockBtn__icon--phoneDown">
                  <IconPhone size={30} />
                </span>
              </button>
            </div>
          ) : null}

          {call.phase === "ended" ? (
            <div className="callScreen__dockRow">
              <button type="button" className="callDockBtn callDockBtn--glass callDockBtn--wide" onClick={onEnd}>
                {t("close")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
