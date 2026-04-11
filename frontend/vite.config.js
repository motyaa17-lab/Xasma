import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  /** Required for Capacitor: load JS/CSS from relative paths inside Android WebView (file://). */
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Allow ngrok / LAN Host headers (Vite type: string[] | true; `true` = any host — dev-only risk, see vite.dev)
    allowedHosts: true,
  },
});

