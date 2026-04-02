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
window.visualViewport?.addEventListener?.("resize", setAppHeightVar);
window.visualViewport?.addEventListener?.("scroll", setAppHeightVar);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

