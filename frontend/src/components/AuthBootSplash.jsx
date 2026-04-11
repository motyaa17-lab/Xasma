import React from "react";
import { XASMA_LOGO_SRC } from "../branding.js";

/** Full-viewport startup splash while a stored session token is being validated. */
export default function AuthBootSplash({ t }) {
  return (
    <div className="authBootSplash" role="status" aria-live="polite" aria-busy="true">
      <div className="authBootSplashCard">
        <img src={XASMA_LOGO_SRC} alt="" className="bootLogo" width={90} height={90} decoding="async" />
        <div className="authBootSplashSpinner" aria-hidden />
        <p className="authBootSplashHint">{t("authBootSessionCheck")}</p>
      </div>
    </div>
  );
}
