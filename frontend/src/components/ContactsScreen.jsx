import React, { useEffect, useMemo, useRef, useState } from "react";
import AvatarAura from "./AvatarAura.jsx";
import { formatAtUserHandle } from "../userHandleDisplay.js";
import { isPremiumActive } from "../premium.js";
import { avatarRingWrapClass, usernameDisplayClass } from "../userPersonalization.js";

const CONTACTS_PERMISSION_KEY = "xasma.contactsPermission.v1"; // unknown|granted|denied
const CONTACTS_STORAGE_KEY = "xasma.contacts.v1"; // [{ id, name, username, userHandle }]

function loadPermission() {
  try {
    const v = String(localStorage.getItem(CONTACTS_PERMISSION_KEY) || "");
    if (v === "granted" || v === "denied") return v;
    return "unknown";
  } catch {
    return "unknown";
  }
}

function savePermission(v) {
  try {
    localStorage.setItem(CONTACTS_PERMISSION_KEY, v);
  } catch {
    /* ignore */
  }
}

function loadContacts() {
  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: String(x.id || ""),
        name: String(x.name || ""),
        username: String(x.username || ""),
        userHandle: String(x.userHandle || ""),
      }))
      .filter((x) => x.name || x.username || x.userHandle);
  } catch {
    return [];
  }
}

function saveContacts(list) {
  try {
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(list.slice(0, 500)));
  } catch {
    /* ignore */
  }
}

function makeId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function ContactsScreen({ t, lang, me, chats = [], onStartChat }) {
  const [permission, setPermission] = useState(() => loadPermission());
  const [contacts, setContacts] = useState(() => loadContacts());
  const [rev, setRev] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [addHandle, setAddHandle] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");

  const promptHiddenRef = useRef(false);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e) return;
      if (e.key === CONTACTS_STORAGE_KEY) {
        setContacts(loadContacts());
        setRev((n) => n + 1);
      }
      if (e.key === CONTACTS_PERMISSION_KEY) {
        setPermission(loadPermission());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const recentUsers = useMemo(() => {
    return chats
      .filter((c) => c && typeof c === "object")
      .filter((c) => c.type === "direct" && c.other?.id)
      .map((c) => c.other)
      .filter(Boolean)
      .map((u) => ({
        userId: Number(u.id),
        username: String(u.username || ""),
        userHandle: String(u.userHandle || ""),
        avatar: String(u.avatar || ""),
        auraColor: u.auraColor,
        isPremium: isPremiumActive(u),
        avatarRing: String(u.avatarRing || ""),
        tag: u.tag ?? null,
        tagColor: String(u.tagColor || ""),
        tagStyle: u.tagStyle === "gradient" ? "gradient" : "solid",
        messageCount: Number(u.messageCount || 0),
        usernameStyle: String(u.usernameStyle || ""),
      }))
      .filter((u) => u.userId && u.username);
  }, [chats, rev]);

  async function tryImportContacts() {
    setImportError("");
    setImportBusy(true);
    try {
      if (navigator.contacts?.select) {
        const picked = await navigator.contacts.select(["name", "email", "tel"], { multiple: true });
        const rows = (picked || []).map((c) => {
          const name = Array.isArray(c.name) ? String(c.name[0] || "") : String(c.name || "");
          const email = Array.isArray(c.email) ? String(c.email[0] || "") : String(c.email || "");
          const tel = Array.isArray(c.tel) ? String(c.tel[0] || "") : String(c.tel || "");
          return { id: makeId(), name, username: email || tel, userHandle: "" };
        });
        const next = rows.concat(loadContacts()).slice(0, 500);
        saveContacts(next);
        setContacts(next);
        setRev((n) => n + 1);
      } else {
        setImportError(t("contactsNotSupported") ?? "Contact API not supported on this device/browser.");
      }
    } catch (e) {
      setImportError(e?.message || t("errorGeneric"));
    } finally {
      setImportBusy(false);
    }
  }

  async function resolveAndStartChatByQuery(q) {
    const query = String(q || "").trim();
    if (!query) return;
    const mod = await import("../api.js");
    const list = await mod.searchUsers(query);
    const best = Array.isArray(list) && list.length ? list[0] : null;
    if (best?.id) {
      await onStartChat?.(best.id);
    } else {
      throw new Error(t("searchNoResults") ?? "No results");
    }
  }

  const showPermissionPrompt = permission === "unknown" && !promptHiddenRef.current;

  return (
    <div className="tgContactsRoot">
      {showPermissionPrompt ? (
        <div className="tgContactsPrompt" role="region" aria-label={t("contactsPermissionTitle") ?? "Contacts permission"}>
          <div className="tgContactsPromptTitle">{t("contactsPermissionTitle") ?? "Sync contacts"}</div>
          <div className="tgContactsPromptText muted">
            {t("contactsPermissionBody") ?? "Allow access to contacts to find people you already know."}
          </div>
          <div className="tgContactsPromptActions">
            <button
              type="button"
              className="primaryBtn"
              onClick={async () => {
                savePermission("granted");
                setPermission("granted");
                await tryImportContacts();
              }}
              disabled={importBusy}
            >
              {importBusy ? (t("saving") ?? "Saving") : (t("allow") ?? "Allow")}
            </button>
            <button
              type="button"
              className="ghostBtn"
              onClick={() => {
                savePermission("denied");
                setPermission("denied");
              }}
            >
              {t("deny") ?? "Deny"}
            </button>
          </div>
          {importError ? <div className="authError" style={{ marginTop: 10 }}>{importError}</div> : null}
        </div>
      ) : null}

      <div className="tgContactsActionsRow">
        <button type="button" className="ghostBtn" onClick={() => setAddOpen(true)}>
          {t("addContact") ?? "Add contact"}
        </button>
        <button
          type="button"
          className="ghostBtn"
          disabled={importBusy || permission !== "granted"}
          onClick={tryImportContacts}
          title={permission !== "granted" ? (t("contactsPermissionNeeded") ?? "Allow contacts access first") : ""}
        >
          {t("import") ?? "Import"}
        </button>
      </div>

      <div className="tgContactsSectionTitle">{t("recent") ?? "Recent"}</div>
      <div className="tgContactsList">
        {recentUsers.length ? (
          recentUsers.slice(0, 100).map((u) => (
            <button
              key={`r_${u.userId}`}
              type="button"
              className="tgContactsRow"
              onClick={() => onStartChat?.(u.userId)}
            >
              <span className="tgContactsAvatar">
                <AvatarAura auraColor={u.auraColor}>
                  {(() => {
                    const ringC = avatarRingWrapClass(u.isPremium ? u.avatarRing : "");
                    const inner = (
                      <span className="tgContactsAvatarInner">
                        {u.avatar ? <img src={u.avatar} alt="" /> : <span>{String(u.username || "?").slice(0, 1).toUpperCase()}</span>}
                      </span>
                    );
                    return ringC ? <span className={ringC}>{inner}</span> : inner;
                  })()}
                </AvatarAura>
              </span>
              <span className="tgContactsMain">
                <span className="tgContactsName">
                  <span className={usernameDisplayClass(u) || undefined}>{u.username}</span>
                </span>
                {u.userHandle ? <span className="tgContactsSub muted">{formatAtUserHandle(u.userHandle)}</span> : <span className="tgContactsSub muted"> </span>}
              </span>
            </button>
          ))
        ) : (
          <div className="tgContactsEmpty muted">{t("noChatsYet")}</div>
        )}
      </div>

      <div className="tgContactsSectionTitle">{t("contacts") ?? t("navContacts")}</div>
      <div className="tgContactsList">
        {contacts.length ? (
          contacts.map((c) => (
            <div key={c.id} className="tgContactsRowWrap">
              <button
                type="button"
                className="tgContactsRow"
                onClick={async () => {
                  try {
                    await resolveAndStartChatByQuery(c.userHandle || c.username || c.name);
                  } catch {
                    // show small inline error via modal state
                    setAddError(t("searchNoResults") ?? "No results");
                    setAddOpen(true);
                    setAddName(c.name);
                    setAddUsername(c.username);
                    setAddHandle(c.userHandle);
                  }
                }}
              >
                <span className="tgContactsAvatar">
                  <span className="tgContactsAvatarInner">
                    <span>{String(c.name || c.username || "?").slice(0, 1).toUpperCase()}</span>
                  </span>
                </span>
                <span className="tgContactsMain">
                  <span className="tgContactsName">{c.name || c.username || c.userHandle}</span>
                  <span className="tgContactsSub muted">
                    {c.userHandle ? formatAtUserHandle(c.userHandle) : c.username ? c.username : ""}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="tgContactsRemove"
                aria-label={t("remove") ?? "Remove"}
                onClick={() => {
                  const next = contacts.filter((x) => x.id !== c.id);
                  saveContacts(next);
                  setContacts(next);
                  setRev((n) => n + 1);
                }}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div className="tgContactsEmpty muted">{t("contactsEmpty") ?? "No contacts yet."}</div>
        )}
      </div>

      {addOpen ? (
        <div className="modalBackdrop modalBackdrop--app" role="dialog" aria-modal="true">
          <div className="modalCard modalCard--mobileFriendly" style={{ maxWidth: 420, width: "min(420px, calc(100vw - 24px))" }}>
            <div className="modalHeader">
              <div className="modalTitle">{t("addContact") ?? "Add contact"}</div>
              <button type="button" className="iconCloseBtn" onClick={() => !addBusy && setAddOpen(false)} aria-label={t("close")}>
                ×
              </button>
            </div>
            <div className="modalBody">
              <label className="groupFieldLabel">{t("name") ?? "Name"}</label>
              <input className="searchInput" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t("name") ?? "Name"} />
              <label className="groupFieldLabel" style={{ marginTop: 10 }}>{t("username") ?? "Username"}</label>
              <input className="searchInput" value={addUsername} onChange={(e) => setAddUsername(e.target.value)} placeholder={t("searchUsernamePlaceholder") ?? "username"} />
              <label className="groupFieldLabel" style={{ marginTop: 10 }}>{t("userHandle") ?? "Handle"}</label>
              <input className="searchInput" value={addHandle} onChange={(e) => setAddHandle(e.target.value)} placeholder="@handle" />

              {addError ? <div className="authError" style={{ marginTop: 10 }}>{addError}</div> : null}

              <div className="groupModalActions">
                <button type="button" className="ghostBtn" disabled={addBusy} onClick={() => setAddOpen(false)}>
                  {t("cancel") ?? "Cancel"}
                </button>
                <button
                  type="button"
                  className="primaryBtn"
                  disabled={addBusy || (!addName.trim() && !addUsername.trim() && !addHandle.trim())}
                  onClick={async () => {
                    setAddBusy(true);
                    setAddError("");
                    try {
                      const item = {
                        id: makeId(),
                        name: addName.trim(),
                        username: addUsername.trim(),
                        userHandle: addHandle.trim().replace(/^@/, ""),
                      };
                      const next = [item, ...loadContacts()].slice(0, 500);
                      saveContacts(next);
                      setContacts(next);
                      setRev((n) => n + 1);

                      // Telegram-like: immediately try to open chat if possible.
                      const q = item.userHandle || item.username || item.name;
                      await resolveAndStartChatByQuery(q);
                      setAddOpen(false);
                      setAddName("");
                      setAddUsername("");
                      setAddHandle("");
                    } catch (e) {
                      setAddError(e?.message || t("errorGeneric"));
                    } finally {
                      setAddBusy(false);
                    }
                  }}
                >
                  {addBusy ? (t("saving") ?? "Saving") : (t("save") ?? "Save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

