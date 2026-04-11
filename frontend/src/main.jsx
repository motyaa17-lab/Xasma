import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { syncAppRootHeight } from "./syncViewport.js";

function setAppHeightVar() {
  syncAppRootHeight();
}

setAppHeightVar();
window.addEventListener("resize", setAppHeightVar);
window.addEventListener("orientationchange", setAppHeightVar);
window.addEventListener("pageshow", setAppHeightVar);
window.visualViewport?.addEventListener?.("resize", setAppHeightVar);
window.visualViewport?.addEventListener?.("scroll", setAppHeightVar);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

// Avoid service worker caching during local "dist" testing (it can keep serving stale bundles/config).
if (!isLocalhost && import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

