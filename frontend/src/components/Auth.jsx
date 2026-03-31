import React, { useState } from "react";
import { formatAuthError } from "../i18n.js";

export default function Auth({ onLogin, onRegister, error, t }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("");
  const [localError, setLocalError] = useState(error || "");

  function setErr(msg) {
    setLocalError(msg || "");
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      if (mode === "login") {
        await onLogin({ username, password });
      } else {
        await onRegister({ username, password, avatar });
      }
    } catch (e2) {
      setErr(formatAuthError(e2, t));
    }
  }

  return (
    <div className="authWrap">
      <div className="authCard">
        <h1 className="authTitle">Xasma</h1>

        <div className="segmented">
          <button
            className={mode === "login" ? "seg active" : "seg"}
            onClick={() => setMode("login")}
            type="button"
          >
            {t("login")}
          </button>
          <button
            className={mode === "register" ? "seg active" : "seg"}
            onClick={() => setMode("register")}
            type="button"
          >
            {t("register")}
          </button>
        </div>

        {localError ? <div className="authError">{localError}</div> : null}

        <form onSubmit={submit} className="authForm">
          <label className="field">
            <span>{t("username")}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label className="field">
            <span>{t("password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {mode === "register" ? (
            <label className="field">
              <span>{t("avatarUrlOptional")}</span>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </label>
          ) : null}

          <button className="primaryBtn" type="submit">
            {mode === "login" ? t("login") : t("createAccount")}
          </button>
        </form>
      </div>
    </div>
  );
}

