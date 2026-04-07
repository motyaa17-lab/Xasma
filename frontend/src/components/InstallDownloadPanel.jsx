import React, { useCallback, useEffect, useRef, useState } from "react";
import { ANDROID_APK_URL, detectInstallPlatform, isStandaloneDisplayMode } from "../installPlatform.js";

export default function InstallDownloadPanel({ open, onClose, t }) {
  const platform = detectInstallPlatform();
  const [standalone, setStandalone] = useState(() => isStandaloneDisplayMode());
  const deferredRef = useRef(null);
  const [canInstallPc, setCanInstallPc] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [installHint, setInstallHint] = useState("");

  useEffect(() => {
    setStandalone(isStandaloneDisplayMode());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      deferredRef.current = e;
      setCanInstallPc(true);
      setInstallHint("");
    }

    function onAppInstalled() {
      deferredRef.current = null;
      setCanInstallPc(false);
      setStandalone(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [open]);

  const triggerPcInstall = useCallback(async () => {
    const ev = deferredRef.current;
    if (!ev || typeof ev.prompt !== "function") {
      setInstallHint(t("downloadPcNoPromptHint"));
      return;
    }
    setInstallBusy(true);
    setInstallHint("");
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice?.outcome === "dismissed") setInstallHint(t("downloadPcDismissedHint"));
      deferredRef.current = null;
      setCanInstallPc(false);
    } catch {
      setInstallHint(t("downloadPcErrorHint"));
    } finally {
      setInstallBusy(false);
    }
  }, [t]);

  if (!open) return null;

  const apkUrl = ANDROID_APK_URL;
  const showApk = Boolean(apkUrl);

  return (
    <div className="modalBackdrop modalBackdrop--app" role="presentation" onClick={onClose}>
      <div
        className="modalCard modalCard--mobileFriendly installPanel"
        role="dialog"
        aria-labelledby="installPanelTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader installPanelHeader">
          <div className="modalTitle" id="installPanelTitle">
            {t("downloadPanelTitle")}
          </div>
          <button type="button" className="iconCloseBtn" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="modalBody installPanelBody">
          {standalone ? (
            <div className="installPanelBanner">{t("downloadStandaloneNote")}</div>
          ) : null}

          <div className="installPanelGrid">
            <section
              className={`installPanelCard${platform === "android" ? " installPanelCard--highlight" : ""}`}
              aria-label={t("downloadAndroidTitle")}
            >
              <div className="installPanelCardTop">
                <span className="installPanelIcon" aria-hidden>
                  🤖
                </span>
                <div>
                  <div className="installPanelCardTitle">{t("downloadAndroidTitle")}</div>
                  {platform === "android" ? (
                    <span className="installPanelBadge">{t("downloadRecommended")}</span>
                  ) : null}
                </div>
              </div>
              {showApk ? (
                <a className="primaryBtn installPanelAction" href={apkUrl} download rel="noopener noreferrer">
                  {t("downloadAndroidApk")}
                </a>
              ) : (
                <>
                  <div className="installPanelSoon">{t("downloadAndroidSoon")}</div>
                  <p className="installPanelHint muted small">{t("downloadAndroidPwaHint")}</p>
                </>
              )}
            </section>

            <section
              className={`installPanelCard${platform === "desktop" ? " installPanelCard--highlight" : ""}`}
              aria-label={t("downloadPcTitle")}
            >
              <div className="installPanelCardTop">
                <span className="installPanelIcon" aria-hidden>
                  💻
                </span>
                <div>
                  <div className="installPanelCardTitle">{t("downloadPcTitle")}</div>
                  {platform === "desktop" ? (
                    <span className="installPanelBadge">{t("downloadRecommended")}</span>
                  ) : null}
                </div>
              </div>
              {canInstallPc && !standalone ? (
                <button
                  type="button"
                  className="primaryBtn installPanelAction"
                  onClick={triggerPcInstall}
                  disabled={installBusy}
                >
                  {installBusy ? t("downloadPleaseWait") : t("downloadPcInstall")}
                </button>
              ) : (
                <p className="installPanelHint muted small">{t("downloadPcFallback")}</p>
              )}
              {installHint ? <p className="installPanelHint installPanelHint--warn small">{installHint}</p> : null}
            </section>

            <section
              className={`installPanelCard${platform === "ios" ? " installPanelCard--highlight" : ""}`}
              aria-label={t("downloadIosTitle")}
            >
              <div className="installPanelCardTop">
                <span className="installPanelIcon" aria-hidden>
                  📱
                </span>
                <div>
                  <div className="installPanelCardTitle">{t("downloadIosTitle")}</div>
                  {platform === "ios" ? (
                    <span className="installPanelBadge">{t("downloadRecommended")}</span>
                  ) : null}
                </div>
              </div>
              <ol className="installPanelSteps">
                <li>{t("downloadIosStep1")}</li>
                <li>{t("downloadIosStep2")}</li>
                <li>{t("downloadIosStep3")}</li>
              </ol>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
