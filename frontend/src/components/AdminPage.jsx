import React, { useEffect, useMemo, useState } from "react";
import {
  adminBroadcastOfficial,
  adminDeleteMessage,
  adminListFlaggedMessages,
  adminListMessageReports,
  adminListUsers,
  adminPatchUserTag,
  adminSetUserBanned,
  adminSetUserRole,
} from "../api.js";
import { formatAtUserHandle } from "../userHandleDisplay.js";
import { TAG_COLOR_PRESETS } from "../userPersonalization.js";
import UserTagBadge from "./UserTagBadge.jsx";

function fmtDate(v, lang) {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const locale = lang === "ru" ? "ru-RU" : lang === "uk" ? "uk-UA" : "en-US";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function AdminTagEditor({ user, t, onUpdated }) {
  const [tag, setTag] = useState(user.tag || "");
  const [tagColor, setTagColor] = useState(user.tagColor || "#38bdf8");
  const [tagStyle, setTagStyle] = useState(user.tagStyle === "gradient" ? "gradient" : "solid");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTag(user.tag || "");
    setTagColor(user.tagColor || "#38bdf8");
    setTagStyle(user.tagStyle === "gradient" ? "gradient" : "solid");
  }, [user.id, user.tag, user.tagColor, user.tagStyle]);

  async function save() {
    setBusy(true);
    try {
      const res = await adminPatchUserTag(user.id, { tag, tagColor, tagStyle });
      onUpdated?.(res.user);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adminTagEditor">
      <input
        className="adminTagInput"
        value={tag}
        onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        placeholder="TAG"
        maxLength={4}
      />
      <div className="adminTagColorRow">
        {TAG_COLOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`profileAuraPreset profileAuraPreset--sm${tagColor === p.id ? " profileAuraPreset--active" : ""}`}
            style={{ background: p.id }}
            onClick={() => setTagColor(p.id)}
            aria-label={p.label}
            title={p.label}
          />
        ))}
      </div>
      <select className="input adminTagStyleSelect" value={tagStyle} onChange={(e) => setTagStyle(e.target.value)}>
        <option value="solid">{t("userTagSolid")}</option>
        <option value="gradient">{t("userTagGradient")}</option>
      </select>
      <button type="button" className="ghostBtn" onClick={save} disabled={busy}>
        {busy ? t("saving") : t("save")}
      </button>
    </div>
  );
}

export default function AdminPage({ me, t, lang, onBack }) {
  const [users, setUsers] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  const isAdmin = me?.role === "admin";

  async function refreshAll() {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    try {
      const [u, f, r] = await Promise.all([
        adminListUsers(),
        adminListFlaggedMessages(),
        adminListMessageReports(),
      ]);
      setUsers(Array.isArray(u.users) ? u.users : []);
      setFlagged(Array.isArray(f.messages) ? f.messages : []);
      setReports(Array.isArray(r.reports) ? r.reports : []);
    } catch (e) {
      setError(e?.message || t("adminRequestFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const stats = useMemo(() => {
    const total = users.length;
    const online = users.filter((u) => u.is_online).length;
    const banned = users.filter((u) => u.banned).length;
    const admins = users.filter((u) => u.role === "admin").length;
    return { total, online, banned, admins, flagged: flagged.length, reports: reports.length };
  }, [users, flagged.length, reports.length]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "banned" && !u.banned) return false;
      if (filter === "online" && !u.is_online) return false;
      if (filter === "admins" && u.role !== "admin") return false;
      if (!q) return true;
      return [u.username, u.userHandle, String(u.id)].some((x) => String(x || "").toLowerCase().includes(q));
    });
  }, [users, query, filter]);

  async function sendBroadcast() {
    const body = broadcastText.trim();
    if (!body) return;
    setBroadcastBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await adminBroadcastOfficial(body);
      setNotice(t("adminBroadcastSent").replace("{n}", String(Number(res.messageCount) || 0)));
      setBroadcastText("");
    } catch (e) {
      setError(e?.message || t("adminBroadcastFail"));
    } finally {
      setBroadcastBusy(false);
    }
  }

  async function deleteReportedMessage(messageId) {
    if (!messageId) return;
    setError("");
    try {
      await adminDeleteMessage(messageId);
      setFlagged((prev) => prev.filter((m) => Number(m.id) !== Number(messageId)));
      setReports((prev) => prev.filter((r) => Number(r.messageId) !== Number(messageId)));
      setNotice(t("adminMessageDeleted") || "Message deleted");
    } catch (e) {
      setError(e?.message || t("adminRequestFailed"));
    }
  }

  if (!isAdmin) {
    return (
      <div className="adminPageRoot">
        <div className="adminPageDenied">
          <h1>{t("adminPanelTitle")}</h1>
          <p className="muted">{t("adminAccessDenied") || "Admin access required."}</p>
          <button type="button" className="primaryBtn" onClick={onBack}>
            {t("back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adminPageRoot">
      <header className="adminPageHeader">
        <div>
          <div className="adminPageKicker">Xasma</div>
          <h1>{t("adminPanelTitle")}</h1>
          <p className="muted">{t("adminStandaloneHint") || "Standalone moderation console."}</p>
        </div>
        <div className="adminPageHeaderActions">
          <button type="button" className="ghostBtn" onClick={onBack}>
            {t("back")}
          </button>
          <button type="button" className="primaryBtn" onClick={refreshAll} disabled={loading}>
            {loading ? t("loading") : t("adminRefresh")}
          </button>
        </div>
      </header>

      {error ? <div className="authError">{error}</div> : null}
      {notice ? <div className="realtimeBanner">{notice}</div> : null}

      <section className="adminStatsGrid" aria-label="Moderation stats">
        {[
          [t("adminUsersTotal") || "Users", stats.total],
          [t("online") || "Online", stats.online],
          [t("adminStatusBanned") || "Banned", stats.banned],
          [t("adminRoleAdmin") || "Admins", stats.admins],
          [t("adminFlaggedTitle") || "Flagged", stats.flagged],
          [t("adminMessageReportsTitle") || "Reports", stats.reports],
        ].map(([label, value]) => (
          <div key={label} className="adminStatCard">
            <div className="adminStatValue">{value}</div>
            <div className="adminStatLabel">{label}</div>
          </div>
        ))}
      </section>

      <section className="adminPageCard">
        <div className="settingsTitle">{t("adminBroadcastTitle")}</div>
        <p className="muted small">{t("adminBroadcastHint")}</p>
        <textarea
          className="adminBroadcastTextarea"
          rows={4}
          value={broadcastText}
          onChange={(e) => setBroadcastText(e.target.value)}
          placeholder={t("adminBroadcastPlaceholder")}
          maxLength={4000}
        />
        <button type="button" className="primaryBtn" onClick={sendBroadcast} disabled={broadcastBusy || !broadcastText.trim()}>
          {broadcastBusy ? t("adminBroadcastSending") : t("adminBroadcastSend")}
        </button>
      </section>

      <section className="adminPageGrid">
        <div className="adminPageCard">
          <div className="adminPanelTitleRow">
            <div className="settingsTitle">{t("adminMessageReportsTitle")}</div>
            <button type="button" className="ghostBtn" onClick={refreshAll} disabled={loading}>
              {t("adminFlaggedRefresh")}
            </button>
          </div>
          {reports.length ? (
            <div className="adminFlaggedList">
              {reports.map((r) => (
                <div key={r.id} className="adminFlaggedRow">
                  <div className="adminFlaggedMeta muted small">
                    {r.reporterUsername} · {r.reason} · {fmtDate(r.createdAt, lang)}
                  </div>
                  <div className="adminFlaggedMeta muted small">
                    {t("messageFrom")}: {r.senderUsername} · {r.chatLabel}
                  </div>
                  <div className="adminFlaggedText">{r.messageText}</div>
                  <button type="button" className="ghostBtn" onClick={() => deleteReportedMessage(r.messageId)}>
                    {t("deleteMessage") || t("delete")}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">{t("adminMessageReportsEmpty")}</div>
          )}
        </div>

        <div className="adminPageCard">
          <div className="settingsTitle">{t("adminFlaggedTitle")}</div>
          {flagged.length ? (
            <div className="adminFlaggedList">
              {flagged.map((m) => (
                <div key={m.id} className="adminFlaggedRow">
                  <div className="adminFlaggedMeta muted small">
                    {m.senderUsername} · {m.chatLabel} · {fmtDate(m.flaggedAt, lang)}
                  </div>
                  <div className="adminFlaggedReason">{m.flaggedReason}</div>
                  <div className="adminFlaggedText">{m.text}</div>
                  <button type="button" className="ghostBtn" onClick={() => deleteReportedMessage(m.id)}>
                    {t("deleteMessage") || t("delete")}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">{t("adminFlaggedEmpty")}</div>
          )}
        </div>
      </section>

      <section className="adminPageCard">
        <div className="adminUsersToolbar">
          <div className="settingsTitle">{t("users") || "Users"}</div>
          <input
            className="searchInput adminUsersSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search") || "Search"}
          />
          <div className="pillRow adminFilterPills">
            {[
              ["all", t("all") || "All"],
              ["online", t("online") || "Online"],
              ["banned", t("adminStatusBanned") || "Banned"],
              ["admins", t("adminRoleAdmin") || "Admins"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? "pillBtn active" : "pillBtn"}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="adminUserList">
          {filteredUsers.map((u) => (
            <div key={u.id} className="adminUserRow adminUserRow--standalone">
              <div className="adminUserMain">
                <div className="adminUserNameRow">
                  <div className="adminUserNameCol">
                    <div className="adminUserName">{u.username}</div>
                    {u.userHandle ? <div className="adminUserAt muted small">{formatAtUserHandle(u.userHandle)}</div> : null}
                  </div>
                  <UserTagBadge tag={u.tag} tagColor={u.tagColor} tagStyle={u.tagStyle} />
                  <div className={u.is_online ? "presenceDot online" : "presenceDot"} />
                </div>
                <div className="adminUserMeta muted small">
                  ID {u.id} · {t("adminRoleLabel")}: {u.role} ·{" "}
                  {u.banned ? t("adminStatusBanned") : t("adminStatusActive")} ·{" "}
                  {t("adminMessagesCount") || "Messages"}: {u.messageCount}
                </div>
                <div className="adminUserMeta muted small">{fmtDate(u.created_at, lang)}</div>
              </div>

              <div className="adminActions">
                <button
                  type="button"
                  className="ghostBtn"
                  onClick={async () => {
                    const nextRole = u.role === "admin" ? "user" : "admin";
                    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
                    try {
                      const res = await adminSetUserRole(u.id, nextRole);
                      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...res.user } : x)));
                    } catch (e) {
                      setError(e?.message || t("adminRequestFailed"));
                      void refreshAll();
                    }
                  }}
                >
                  {u.role === "admin" ? t("adminRemoveAdmin") : t("adminMakeAdmin")}
                </button>
                <button
                  type="button"
                  className={u.banned ? "primaryBtn" : "ghostBtn"}
                  onClick={async () => {
                    const banned = !u.banned;
                    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, banned } : x)));
                    try {
                      const res = await adminSetUserBanned(u.id, banned);
                      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...res.user } : x)));
                    } catch (e) {
                      setError(e?.message || t("adminRequestFailed"));
                      void refreshAll();
                    }
                  }}
                >
                  {u.banned ? t("adminUnban") : t("adminBan")}
                </button>
              </div>

              <AdminTagEditor
                user={u}
                t={t}
                onUpdated={(updated) => setUsers((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
