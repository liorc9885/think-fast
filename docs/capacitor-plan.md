# Android (+ iOS) App Plan — Think-Fast via Capacitor (Track B)

> Status: **planning doc, not yet implemented.** To be built separately later.
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
1. `npm init` a Capacitor project under `/android` pointing `webDir` at the **static game
   bundle** (`public/game/`), NOT the Next.js server output; `npx cap add android`.
2. Point the app at the production API base URL (env/config, not hardcoded secrets).
3. Make the game shell mobile-app-ready: lock orientation, handle safe-area insets
   (already partly done via `100dvh` / `env(safe-area-inset-*)`), Android back-button
   behavior, splash screen + app icon.
4. Add **`@capacitor/push-notifications`** (FCM) now so future events can notify users;
   register the device token via `POST /api/v1/activity` (or a small `devices` table later).
5. Build a signed APK/AAB, test on emulator + a real device, then Play Console listing.
6. (Future, same repo) `npx cap add ios` for the iOS track.

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
