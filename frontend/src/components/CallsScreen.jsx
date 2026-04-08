import React, { useMemo, useState } from "react";

function initials(name) {
  const s = String(name || "").trim();
  return (s[0] || "?").toUpperCase();
}

function formatListTime(v, lang) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(lang === "ru" ? "ru-RU" : lang === "uk" ? "uk-UA" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CallsScreen({ t, lang, logs, onOpenChat, onRedial }) {
  const [tab, setTab] = useState("all"); // all | missed

  const filtered = useMemo(() => {
    const list = Array.isArray(logs) ? logs : [];
    const base = list.slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
    if (tab === "missed") return base.filter((x) => x.status === "missed");
    return base;
  }, [logs, tab]);

  return (
    <div className="callsScreen">
      <header className="mobileSubHeader">
        <h1 className="mobileSubHeaderTitle">{t("navCalls")}</h1>
      </header>

      <div className="callsSeg">
        <button
          type="button"
          className={`callsSegBtn${tab === "all" ? " active" : ""}`}
          onClick={() => setTab("all")}
        >
          {t("callsAll")}
        </button>
        <button
          type="button"
          className={`callsSegBtn${tab === "missed" ? " active" : ""}`}
          onClick={() => setTab("missed")}
        >
          {t("callsMissed")}
        </button>
      </div>

      <div className="callsList" role="list">
        {filtered.length ? (
          filtered.map((c) => {
            const name = String(c.peerUsername || "");
            const avatar = String(c.peerAvatar || "");
            const isMissed = c.status === "missed";
            const dirIcon = isMissed ? "!" : c.direction === "outgoing" ? "↗" : "↘";
            const subtitle = isMissed
              ? t("callsSubtitleMissed")
              : c.direction === "outgoing"
                ? t("callsSubtitleOutgoing")
                : t("callsSubtitleIncoming");
            return (
              <div key={c.id} className={`callsRow${isMissed ? " callsRow--missed" : ""}`} role="listitem">
                <button
                  type="button"
                  className="callsRowMain"
                  onClick={() => onOpenChat?.(Number(c.chatId))}
                >
                  <span className="callsAvatar" aria-hidden>
                    {avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>}
                  </span>
                  <span className="callsRowText">
                    <span className="callsRowTop">
                      <span className="callsName">{name || t("displayNameUser")}</span>
                      <span className="callsTime">{formatListTime(c.startedAt, lang)}</span>
                    </span>
                    <span className="callsRowBottom">
                      <span className={`callsDir${isMissed ? " callsDir--missed" : ""}`} aria-hidden>
                        {dirIcon}
                      </span>
                      <span className="callsSubtitle muted">{subtitle}</span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="callsRedialBtn"
                  onClick={() => onRedial?.(Number(c.chatId))}
                  aria-label={t("callAudio")}
                  title={t("callAudio")}
                >
                  ☎
                </button>
              </div>
            );
          })
        ) : (
          <div className="callsEmpty muted">{t("callsEmpty")}</div>
        )}
      </div>
    </div>
  );
}

