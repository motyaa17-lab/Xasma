import React, { useEffect, useMemo, useState } from "react";

function detectPlatform() {
  if (typeof navigator === "undefined") {
    return { android: false, ios: false, desktop: true };
  }
  const ua = String(navigator.userAgent || "");
  const navPlatform = String(navigator.platform || "");
  const isAndroid = /Android/i.test(ua);
  const isiPhoneOrPod = /iPhone|iPod/i.test(ua);
  const isiPad = /iPad/i.test(ua) || (navPlatform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
  const isIOS = isiPhoneOrPod || isiPad;
  const isMobile = isAndroid || isIOS || /Mobile/i.test(ua);
  return { android: isAndroid, ios: isIOS, desktop: !isMobile };
}

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  const displayStandalone = Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches);
  const iosStandalone = Boolean(window.navigator?.standalone);
  return displayStandalone || iosStandalone;
}

export default function DownloadInstallPanel({ open, onClose, androidApkUrl = "" }) {
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [installOutcome, setInstallOutcome] = useState("");

  const platform = useMemo(() => detectPlatform(), []);
  const standalone = useMemo(() => isStandaloneApp(), []);
  const apkUrl = String(androidApkUrl || "").trim();
  const recommended = platform.ios ? "ios" : platform.android ? "android" : "desktop";

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    }

    function handleAppInstalled() {
      setInstallOutcome("accepted");
      setDeferredInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function triggerInstallPrompt() {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        setInstallOutcome("accepted");
        setDeferredInstallPrompt(null);
      } else {
        setInstallOutcome("dismissed");
      }
    } catch {
      setInstallOutcome("dismissed");
    }
  }

  if (!open) return null;

  const canPromptInstall = Boolean(deferredInstallPrompt) && !standalone;
  const canPromptDesktop = canPromptInstall && platform.desktop;
  const canPromptAndroid = canPromptInstall && platform.android;

  return (
    <div className="modalBackdrop modalBackdrop--app downloadPanelBackdrop" role="presentation" onClick={onClose}>
      <div
        className="modalCard modalCard--mobileFriendly downloadPanelCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="downloadPanelTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader downloadPanelHeader">
          <div>
            <div className="downloadPanelEyebrow">Xasma</div>
            <div className="modalTitle" id="downloadPanelTitle">
              Скачать и установить
            </div>
          </div>
          <button type="button" className="ghostBtn" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="modalBody downloadPanelBody">
          <p className="downloadPanelLead">
            Установите Xasma как приложение или скачайте сборку для нужной платформы.
          </p>

          <div className="downloadOptionGrid">
            <section
              className={`downloadOptionCard${recommended === "android" ? " downloadOptionCard--recommended" : ""}`}
              aria-label="Android"
            >
              <div className="downloadOptionTop">
                <h3 className="downloadOptionTitle">Android</h3>
                {recommended === "android" ? <span className="downloadOptionBadge">Рекомендуется</span> : null}
              </div>

              {apkUrl ? (
                <a className="primaryBtn downloadPanelAction" href={apkUrl} target="_blank" rel="noreferrer">
                  Скачать APK
                </a>
              ) : (
                <div className="downloadSoonBadge">APK: Скоро</div>
              )}

              {canPromptAndroid ? (
                <button type="button" className="ghostBtn downloadPanelActionAlt" onClick={triggerInstallPrompt}>
                  Установить как приложение
                </button>
              ) : (
                <ol className="downloadSteps">
                  <li>Откройте Xasma в Chrome на Android.</li>
                  <li>Откройте меню браузера (⋮).</li>
                  <li>Нажмите «Установить приложение».</li>
                </ol>
              )}
            </section>

            <section
              className={`downloadOptionCard${recommended === "desktop" ? " downloadOptionCard--recommended" : ""}`}
              aria-label="ПК"
            >
              <div className="downloadOptionTop">
                <h3 className="downloadOptionTitle">ПК</h3>
                {recommended === "desktop" ? <span className="downloadOptionBadge">Рекомендуется</span> : null}
              </div>

              {standalone ? (
                <div className="downloadInstalledState">Приложение уже установлено на этом устройстве.</div>
              ) : canPromptDesktop ? (
                <button type="button" className="primaryBtn downloadPanelAction" onClick={triggerInstallPrompt}>
                  Установить на ПК
                </button>
              ) : (
                <ol className="downloadSteps">
                  <li>Откройте Xasma в Chrome или Edge на ПК.</li>
                  <li>Откройте меню браузера (⋮ или …).</li>
                  <li>Выберите «Установить приложение / Install app».</li>
                </ol>
              )}

              {installOutcome === "dismissed" ? (
                <p className="muted small">Установка была отменена. Можно попробовать снова в любой момент.</p>
              ) : null}
            </section>

            <section
              className={`downloadOptionCard${recommended === "ios" ? " downloadOptionCard--recommended" : ""}`}
              aria-label="iPhone и iPad"
            >
              <div className="downloadOptionTop">
                <h3 className="downloadOptionTitle">iPhone / iPad</h3>
                {recommended === "ios" ? <span className="downloadOptionBadge">Рекомендуется</span> : null}
              </div>
              <ol className="downloadSteps">
                <li>Откройте Xasma в Safari.</li>
                <li>Нажмите кнопку Share (Поделиться).</li>
                <li>Выберите «На экран Домой».</li>
              </ol>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
