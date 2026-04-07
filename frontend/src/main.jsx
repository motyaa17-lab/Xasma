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

if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
<<<<<<< HEAD
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
=======
    navigator.serviceWorker.register("/sw.js").catch(() => {});
>>>>>>> 8ef4504c02cd580d6ec39c3d7d11aba6e6224cf1
  });
}

