import React from "react";
import { XASMA_LOGO_SRC } from "../branding.js";

/** Full-viewport startup splash while a stored session token is being validated. */
export default function AuthBootSplash({ t }) {
  return (
    <div className="authBootSplash" role="status" aria-live="polite" aria-busy="true">
      <div className="bootLogoShell" aria-hidden>
        <span className="bootLogoCrop">
          <img src={XASMA_LOGO_SRC} alt="" className="bootLogo" decoding="async" />
        </span>
      </div>
      <div className="authBootSplashCard">
        <div className="authBootSplashSpinner" aria-hidden />
        <p className="authBootSplashHint">{t("authBootSessionCheck")}</p>
      </div>
    </div>
  );
}
