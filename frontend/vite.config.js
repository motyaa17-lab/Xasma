import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
<<<<<<< HEAD
  /** Required for Capacitor: load JS/CSS from relative paths inside Android WebView (file://). */
  base: "./",
=======
>>>>>>> 8ef4504c02cd580d6ec39c3d7d11aba6e6224cf1
  plugins: [react()],
  server: {
    port: 5173,
  },
});

