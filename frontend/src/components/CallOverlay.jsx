import React, { useMemo } from "react";

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
  const title = useMemo(() => {
    if (!call) return "";
    if (call.phase === "calling") return t("callCalling");
    if (call.phase === "ringing") return t("callIncoming");
    if (call.phase === "connecting") return t("callConnecting");
    if (call.phase === "connected") return t("callConnected");
    if (call.phase === "ended") return t("callEnded");
    return "";
  }, [call, t]);

  if (!visible) return null;

  const name = String(call?.peerUsername || "");
  const avatar = String(call?.peerAvatar || "");
  const showAcceptReject = call.phase === "ringing";
  const showCancel = call.phase === "calling";
  const showActiveControls = call.phase === "connecting" || call.phase === "connected";
  const showEnd = showCancel || showActiveControls || call.phase === "ended";

  return (
    <div className="callOverlay" role="dialog" aria-modal="true" aria-label={t("callOverlay")}>
      <div className="callCard">
        <div className="callStatus">{title}</div>
        <div className="callPeer">
          <div className="callAvatar" aria-hidden>
            {avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>}
          </div>
          <div className="callPeerMeta">
            <div className="callPeerName">{name || t("displayNameUser")}</div>
            <div className="callPeerHint muted">
              {call.phase === "calling"
                ? t("callOutgoingHint")
                : call.phase === "ringing"
                  ? t("callIncomingHint")
                  : call.phase === "connecting"
                    ? t("callConnectingHint")
                    : call.phase === "connected"
                      ? t("callConnectedHint")
                      : t("callEndedHint")}
            </div>
          </div>
        </div>

        <div className="callActions">
          {showAcceptReject ? (
            <>
              <button type="button" className="callBtn callBtn--danger" onClick={onReject}>
                {t("callReject")}
              </button>
              <button type="button" className="callBtn callBtn--primary" onClick={onAccept}>
                {t("callAccept")}
              </button>
            </>
          ) : null}

          {showActiveControls ? (
            <>
              <button type="button" className="callBtn callBtn--ghost" onClick={onToggleMute}>
                {call.muted ? t("callUnmute") : t("callMute")}
              </button>
              <button type="button" className="callBtn callBtn--danger" onClick={onEnd}>
                {t("callEnd")}
              </button>
            </>
          ) : null}

          {showCancel ? (
            <button type="button" className="callBtn callBtn--danger" onClick={onEnd}>
              {t("callCancel")}
            </button>
          ) : null}

          {call.phase === "ended" ? (
            <button type="button" className="callBtn callBtn--ghost" onClick={onEnd}>
              {t("close")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

