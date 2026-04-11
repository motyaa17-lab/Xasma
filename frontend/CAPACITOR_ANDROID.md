# Xasma — Android (Capacitor)

The React app in `frontend/` is wrapped with [Capacitor](https://capacitorjs.com/). The native shell loads the **Vite production build** from `dist/` (copied into `android/app/src/main/assets/public` on sync).

## What you install on your PC (Windows)

1. **Node.js** (LTS, e.g. 18 or 20) — already used for the web app.
2. **Android Studio** (includes Android SDK, build tools, emulator).
   - Install **Android SDK Platform** and a **build-tools** version (Studio’s SDK Manager).
   - Accept SDK licenses when prompted (`sdkmanager --licenses`).
3. **Java JDK 17** (Android Gradle Plugin uses it; Studio often bundles a JBR that works).

Optional: a physical Android phone with **USB debugging** for faster testing.

## One-time: npm dependencies

From the `frontend/` folder:

```bash
npm install
```

## Standard commands (from `frontend/`)

| Command | Purpose |
|--------|---------|
| `npm run build` | Production Vite build → `dist/` |
| `npm run cap:sync` | Copy `dist/` into the Android project and update native config |
| `npm run android:sync` | **`build` + `sync`** (use this before opening Android Studio or building APK) |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:assets` | Regenerate launcher icons and splash screens from `assets/logo.svg` |

## Generating an APK (debug)

1. Set API URL for production builds (see below).
2. `cd frontend`
3. `npm run android:sync`
4. `npm run android:open` (or open `frontend/android` in Android Studio).
5. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
6. Debug APK output is typically under:
   `android/app/build/outputs/apk/debug/app-debug.apk`

Install on a device: copy the APK or use **Run** with a device/emulator.

## Release APK / Play Store (short)

- Change the **application id** from the placeholder `com.xasma.app` (see “Package name”).
- Create a **signing keystore** and configure **release** signing in Android Studio (or `signingConfigs` in Gradle).
- Build **Release** variant or **AAB** for Play Console.

## Pointing the app at your server

The web client uses `VITE_API_URL` (preferred) or legacy `VITE_API_BASE` (see `src/api.js`). For a real device you must build with your backend URL:

1. Copy `frontend/.env.production.example` to `frontend/.env.production` (or use `.env.production.local`).
2. Set `VITE_API_URL=https://your-api-host` (HTTPS recommended).
3. Run `npm run android:sync` so the bundled JS includes that URL.

**HTTP / LAN:** Android blocks cleartext HTTP by default. For `http://` APIs you must add a network security config or `android:usesCleartextTraffic="true"` (dev only).

## Capacitor config

- **App name:** `Xasma` (`capacitor.config.json` → `appName` and Android `strings.xml`).
- **Package / application id:** `com.xasma.app` — placeholder; change in:
  - `frontend/capacitor.config.json` (`appId`)
  - `frontend/android/app/build.gradle` (`applicationId`, `namespace`)
  - Then run `npx cap sync`.

## Icons and splash

- Source logo: `frontend/assets/logo.svg` (same artwork as `public/xasma-icon.svg`).
- Regenerate mipmaps: `npm run android:assets`, then `npm run android:sync`.

## Routing and auth

The app does **not** use React Router with URL paths; UI state is in React. **Auth tokens** stay in `localStorage` in the WebView. **Service worker** registration uses `import.meta.env.BASE_URL` so it works with Capacitor’s `base: './'` build.

## Files added or changed (summary)

| Path | Role |
|------|------|
| `frontend/package.json` | Capacitor deps + scripts |
| `frontend/capacitor.config.json` | App id, name, `webDir`, `server.androidScheme` |
| `frontend/vite.config.js` | `base: './'` for WebView asset URLs |
| `frontend/src/main.jsx` | Service worker path uses `BASE_URL` |
| `frontend/android/` | Native Android project (generated; icons/splash updated) |
| `frontend/assets/logo.svg` | Source for `@capacitor/assets` |

## Troubleshooting

- **Blank WebView:** run `npm run android:sync` after every web change; confirm `VITE_API_URL` (or `VITE_API_BASE`) is reachable from the device.
- **White screen after deploy:** often wrong API URL or mixed content; check HTTPS and CORS/socket.io on the server.
- **Synced web assets:** `android/.gitignore` ignores `app/src/main/assets/public`; always run `cap sync` locally before building.
