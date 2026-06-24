# Android (+ iOS) App Plan — Think-Fast via Capacitor (Track B)

> Status: **scaffolded & wired.** The Capacitor project, `android/` native shell,
> config and native API-base wiring are in the repo. Remaining work is build-machine
> only (Android SDK / signing / Play Console) — see §B4.
> Companion doc: [`server-plan.md`](./server-plan.md) (the backend API the app calls).

## Context

**Think-Fast** is a finished vanilla JS / HTML5-Canvas web game (Hebrew "המבורגר נופל!").
The user wants to ship it on **Android** now, and likely **iOS** later, **without
rebuilding the game**. A full native Kotlin rewrite was explicitly declined.

**Decision:** Android = **hybrid via Capacitor**, which reuses 100% of the web game and
gives the *same* process to reach iOS later.

**Depends on:** the backend from `server-plan.md`. The app is just another client that
calls the `/api/v1/*` API over HTTPS using the anonymous `X-Player-Id` header.

---

## B1. Why Capacitor (vs TWA / native Kotlin)
Capacitor wraps the existing web build in a native Android shell, ships to the Play Store,
exposes **native plugins** (push notifications for future events, haptics, status bar),
and — critically — **the identical project also builds for iOS** (`npx cap add ios`),
giving the "similar process" the user asked about. A full Kotlin rewrite was declined; TWA
is Android-only and can't reach iOS.

**Hard line:** Capacitor ships a **static** web bundle. Point `webDir` at the static game
bundle (`public/game/` from the server-plan restructure), **NOT** at the server-rendered
Next.js app. The game calls the deployed API over HTTPS like any other client.

## B2. Steps
1. ✅ **Done.** Capacitor installed (`@capacitor/core`, `@capacitor/cli`,
   `@capacitor/android`); `capacitor.config.ts` points `webDir` at the **static game
   bundle** (`public/game/`), NOT the Next.js server output. `npx cap add android`
   generated the native shell under [`/android`](../android).
2. ✅ **Wired.** The app reads its API origin from
   [`public/game/app-config.js`](../public/game/app-config.js): on the web build it
   stays same-origin (`API_BASE=''`); inside the Capacitor shell it applies `PROD_API_BASE`
   (set this one constant to your deployed origin, e.g. `https://think-fast.vercel.app`).
   No secrets are hardcoded — only a public URL.
3. **App shell polish (partial).** Safe-area insets already handled via `100dvh` /
   `env(safe-area-inset-*)`. Splash screen + status-bar plugins are configured in
   `capacitor.config.ts`. Still TODO on the build machine: app icon, lock orientation,
   Android back-button behavior.
4. ✅ **Installed.** `@capacitor/push-notifications` (FCM) is a dependency and configured
   in `capacitor.config.ts`. Token registration via `POST /api/v1/activity` (or a small
   `devices` table later) is wired when notifications are turned on.
5. **Build a signed APK/AAB** (needs Android SDK + keystore), test on emulator + a real
   device, then Play Console listing. See §B4.
6. (Future, same repo) `npx cap add ios` for the iOS track.

## B4. Build / run (on a machine with the Android SDK)
```bash
npm install                 # restores Capacitor + plugins
# (set PROD_API_BASE in public/game/app-config.js for native builds first)
npm run cap:sync            # copy public/game/ → android/ and update plugins
npm run cap:run:android     # build + launch on an emulator/device
npm run cap:android         # or: sync, then open in Android Studio for signing/AAB
```
The committed `android/` project regenerates its copied web assets on every `cap sync`
(they're git-ignored by Capacitor), so the static game bundle stays the single source of
truth. `appId` is `com.thinkfast.game`.

## B3. Player identity continuity
Reuse the same anonymous `player_id` scheme; in the WebView it persists in the app's
`localStorage`, so no Android-specific identity work is needed for now.

---

## CORS / API note
The backend's CORS allow-list must include the Capacitor origins (`capacitor://localhost`
and `https://localhost`) in addition to the web origin — see `server-plan.md` §A3.

## Verification
`npx cap run android` on an emulator → game loads, plays, progress syncs to the same
backend (Network shows `/api/v1/*`); trigger a test push notification and confirm delivery.
On a real device: install the signed AAB/APK and repeat. For iOS later: `npx cap add ios`
and repeat on the simulator.
