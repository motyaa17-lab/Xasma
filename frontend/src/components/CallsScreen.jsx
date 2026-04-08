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

function localeForLang(lang) {
  if (lang === "ru") return "ru-RU";
  if (lang === "uk") return "uk-UA";
  return "en-US";
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDurationMmSs(ms) {
  const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatGroupLabel(iso, lang, t) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("callsOlder");
  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const diffDays = Math.round((today.getTime() - that.getTime()) / (24 * 3600 * 1000));
  if (diffDays === 0) return t("callsToday");
  if (diffDays === 1) return t("callsYesterday");
  return d.toLocaleDateString(localeForLang(lang), { year: "numeric", month: "long", day: "numeric" });
}

export default function CallsScreen({ t, lang, logs, onOpenChat, onRedial }) {
  const [tab, setTab] = useState("all"); // all | missed

  const grouped = useMemo(() => {
    const list = Array.isArray(logs) ? logs : [];
    const base = list.slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
    const filtered = tab === "missed" ? base.filter((x) => x.status === "missed") : base;

    const groups = [];
    const byKey = new Map();
    for (const c of filtered) {
      const startedAt = String(c?.startedAt || "");
      const key = formatGroupLabel(startedAt, lang, t);
      if (!byKey.has(key)) {
        const g = { key, items: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      byKey.get(key).items.push(c);
    }
    return groups;
  }, [logs, tab, lang, t]);

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
        {grouped.length ? (
          grouped.map((g) => (
            <section key={g.key} className="callsGroup" aria-label={g.key}>
              <div className="callsGroupHeader">
                <div className="callsGroupTitle">{g.key}</div>
                <div className="callsGroupSep" aria-hidden />
              </div>
              {g.items.map((c) => {
                const name = String(c.peerUsername || "");
                const avatar = String(c.peerAvatar || "");
                const isMissed = c.status === "missed";
                const dirIcon = isMissed ? "!" : c.direction === "outgoing" ? "↗" : "↘";

                const reason =
                  c.status === "missed"
                    ? t("callsReasonMissed")
                    : c.status === "declined"
                      ? t("callsReasonDeclined")
                      : t("callsReasonEnded");

                const startedMs = Date.parse(String(c.startedAt || ""));
                const endedMs = c.endedAt ? Date.parse(String(c.endedAt)) : NaN;
                const hasDur = c.status === "answered" && Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs >= startedMs;
                const dur = hasDur ? formatDurationMmSs(endedMs - startedMs) : "";

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
                          <span className="callsRight">
                            <span className="callsTime">{formatListTime(c.startedAt, lang)}</span>
                            {dur ? <span className="callsDur">{dur}</span> : null}
                          </span>
                        </span>
                        <span className="callsRowBottom">
                          <span className={`callsDir${isMissed ? " callsDir--missed" : ""}`} aria-hidden>
                            {dirIcon}
                          </span>
                          <span className="callsSubtitle">{reason}</span>
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
              })}
            </section>
          ))
        ) : (
          <div className="callsEmpty muted">{t("callsEmpty")}</div>
        )}
      </div>
    </div>
  );
}

