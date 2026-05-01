import React, { useState } from "react";
import { XASMA_LOGO_SRC } from "../branding.js";
import { formatAuthError } from "../i18n.js";

export default function Auth({ onLogin, onRegister, error, t }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
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
        await onLogin({ email, password });
      } else {
        await onRegister({ username, email, password, avatar });
      }
    } catch (e2) {
      setErr(formatAuthError(e2, t));
    }
  }

  return (
    <div className="authWrap">
      <div className="authCard">
        <h1 className="authTitle authTitle--brand">
          <span className="appLogoShell" aria-hidden>
            <span className="appLogoCrop">
              <img src={XASMA_LOGO_SRC} alt="" className="appLogo" decoding="async" />
            </span>
          </span>
          <span className="authTitleWordmark">Xasma</span>
        </h1>

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
            <span>{t("authEmailLabel")}</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <span className="muted small authFieldHint">
              {mode === "login" ? t("authLoginEmailHint") : t("authRegisterEmailHint")}
            </span>
          </label>

          {mode === "register" ? (
            <label className="field">
              <span>{t("authDisplayNameLabel")}</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
              <span className="muted small authFieldHint">{t("authRegisterHandleAutoHint")}</span>
            </label>
          ) : null}

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
                placeholder={t("avatarUrlPlaceholder")}
              />
            </label>
          ) : null}

          <button className="primaryBtn" type="submit">
            {mode === "login" ? t("login") : t("createAccount")}
          </button>
        </form>

        <div className="authLegal">
          <div className="authLegalMeta muted small">
            {(t("aboutDeveloper") ?? "Developer") + ": Xasma Labs · " + (t("aboutSupportEmail") ?? "Support") + ": xasma.support@gmail.com"}
          </div>
          <div className="authLegalLinks">
            {[
              { href: "/privacy", label: t("privacyPolicyTitle") },
              { href: "/terms", label: t("termsTitle") },
              { href: "/data-deletion", label: t("dataDeletionTitle") },
              { href: "/data-safety", label: t("dataSafetyTitle") },
              { href: "/permissions", label: t("permissionsTitle") },
            ].map((x) => (
              <a
                key={x.href}
                className="authLegalLink"
                href={x.href}
                onClick={(e) => {
                  try {
                    e.preventDefault();
                    window.history.pushState({}, "", x.href);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  } catch {
                    /* fallback to normal navigation */
                  }
                }}
              >
                {x.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

