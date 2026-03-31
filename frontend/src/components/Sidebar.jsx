import React, { useEffect, useMemo, useState } from "react";

export default function Sidebar({ chats, me, onSelectChat, onStartChat, t, lang }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const canSearch = useMemo(() => query.trim().length >= 1, [query]);

  useEffect(() => {
    let t = null;
    async function run() {
      if (!canSearch) {
        setResults([]);
        setSearchError("");
        return;
      }
      setSearching(true);
      setSearchError("");
      try {
        // Import lazily to keep this component simple.
        const mod = await import("../api.js");
        const users = await mod.searchUsers(query.trim());
        setResults(users);
      } catch (e) {
        setSearchError(e.message || "Search failed");
      } finally {
        setSearching(false);
      }
    }

    t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [query, canSearch]);

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="meRow">
          <div className="avatarSm" title={me.username}>
            {me.avatar ? <img src={me.avatar} alt="" /> : <span>{initials(me.username)}</span>}
          </div>
          <div className="meName">{me.username}</div>
        </div>
      </div>

      <div className="sidebarSection">
        <div className="sectionTitle">{t("chats")}</div>

        {chats.length === 0 ? <div className="muted">{t("noChatsYet")}</div> : null}

        <div className="chatList">
          {chats.map((c) => (
            <button
              key={c.id}
              className="chatListItem"
              onClick={() => onSelectChat(c.id)}
              type="button"
            >
              <div className="chatItemTop">
                <div className={c.other?.isOnline ? "avatarSm presence online" : "avatarSm presence"}>
                  {c.other.avatar ? (
                    <img src={c.other.avatar} alt="" />
                  ) : (
                    <span>{initials(c.other.username)}</span>
                  )}
                </div>
                <div className="chatOther">
                  <div className="chatOtherNameRow">
                    <div className="chatOtherName">{c.other.username}</div>
                    <div className={c.other?.isOnline ? "presenceDot online" : "presenceDot"} title={presenceText(c.other, t, lang)} />
                  </div>
                  {c.last ? (
                    <div className="chatLast">{c.last.text}</div>
                  ) : (
                    <div className="chatLast muted">{t("noMessages")}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebarSection sidebarNewChat">
        <div className="sectionTitle">{t("newChat")}</div>
        <input
          className="searchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchUsernamePlaceholder")}
        />
        {searching ? <div className="muted small">{t("searching")}</div> : null}
        {searchError ? <div className="authError">{searchError}</div> : null}

        {results.length > 0 ? (
          <div className="searchResults">
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="searchResult"
                onClick={() => onStartChat(u.id)}
              >
                <div className="avatarSm">
                  {u.avatar ? <img src={u.avatar} alt="" /> : <span>{initials(u.username)}</span>}
                </div>
                <div>
                  <div className="searchUser">{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function presenceText(user, t, lang) {
  if (!user) return "";
  if (user.isOnline) return t("online");
  if (!user.lastSeenAt) return t("lastSeen");
  const d = new Date(user.lastSeenAt);
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const s = Number.isNaN(d.getTime())
    ? String(user.lastSeenAt)
    : d.toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return t("lastSeenAt").replace("{time}", s);
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || "?";
}

