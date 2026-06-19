# Server-side Plan — Think-Fast Backend (Track A)

> Status: **planning doc, not yet implemented.** To be built separately later.
> Companion doc: [`capacitor-plan.md`](./capacitor-plan.md) (the Android/iOS app).

## Context

**Think-Fast** (`public/game/index.html` after restructure — currently `index.html`,
~5,500 lines of vanilla JS/Canvas, Hebrew "המבורגר נופל!") is today a single-file web
game. It persists per-player progress (coins, owned/active skins per item type) directly
from the browser to **Supabase Postgres** (project `dhtjnpdwvuwgzdymfkra`, table
`public.player_progress`) using a **public anon key hardcoded in the client**
(`index.html:545-648`).

**Problem:** the browser writes straight to the DB with the anon key. RLS is enabled but
writes are effectively open, so any client can write any row — fine for personal save
data, but untrustworthy for tracking activity or a future scoreboard, and there is **no
record of game history** (only current state is stored). We want a proper server side to
track user activity, support a future scoreboard, and later run events.

**Decisions:**
- Backend = **separate API server** (clients no longer touch the DB directly). Reuse the
  existing Supabase Postgres as the database behind the server.
- Identity = **no auth**; keep the anonymous `player_id`. **Track activity/session data
  now**, design the schema to support a scoreboard later, but **do not build the
  scoreboard endpoints/UI yet**.

**Intended outcome:** web and Android clients both talk to a single trusted API; the DB
credentials live only on the server; every completed game is recorded as activity.

---

## Target architecture

```
            ┌─────────────┐        ┌─────────────┐
  Web (PWA) │  index.html │        │  Android    │  Capacitor wrapper of the
            └──────┬──────┘        │  (Capacitor)│  same web build (+ iOS later)
                   │               └──────┬──────┘
                   │  HTTPS (fetch, X-Player-Id header)
                   └───────────┬──────────┘
                       ┌───────▼────────┐
                       │  Next.js app   │  app/api/v1/* route handlers (the API) +
                       │  (Vercel)      │  future scoreboard/events/admin React pages
                       └───────┬────────┘  Holds the Supabase SERVICE-ROLE key only
                       ┌───────▼────────┐
                       │ Supabase       │  player_progress (existing) +
                       │ Postgres       │  game_sessions, activity_events (new)
                       └────────────────┘  RLS: deny anon writes; service-role only
```

**Hosting recommendation:** implement the server side as a **Next.js (App Router) app on
Vercel** (Vercel is already connected). The API lives in **`app/api/v1/*` route handlers**
using `@supabase/supabase-js` with the **service-role key** (server env var, never shipped
to clients). This is "a separate API server" in every way that matters (clients lose DB
access, secrets move server-side), and the same app is the natural home for the **future
scoreboard, events, and admin UI** (React/SSR pages).

**Hard line — keep the game static.** The Canvas game is NOT migrated to React/Next; it
stays a static page served as an asset. Reasons: (1) the game gets zero benefit from
SSR/React, so a port would be a pure rewrite of working code; (2) Capacitor ships a
**static** bundle (`output: 'export'`-style assets), so the mobile build must stay static
regardless. Next.js hosts the API + dashboard pages; the game is served statically beside
them and calls the API over HTTPS like any other client.

> Fallback if you'd rather not pull in Next.js before the dashboard pages exist: plain
> Vercel TS functions for the API now, graduating to Next.js when you build the UI.
> Recommended path is to start with Next.js so the API and upcoming pages share one stack.

---

## A1. Repo restructure (Next.js app + static game, keep web deployable)
Current repo is just `index.html` at root. Move to a Next.js project:
```
/app/
  /api/v1/                 ← route handlers = the API (progress, sessions, health)
  /(dashboard)/...         ← future scoreboard/events/admin React pages (Phase 4)
  layout.tsx, page.tsx     ← landing/shell
/public/game/index.html    ← existing Canvas game, served STATICALLY (unchanged logic)
/lib/                      ← supabaseAdmin, validation, shared server helpers
/android/                  ← Capacitor project (see capacitor-plan.md)
/supabase/migrations/      ← SQL migrations (source of truth for schema)
next.config.js, package.json, vercel.json
```
The game stays a static file under `public/game/`; keep it reachable at the deployed root
via a `next.config.js` rewrite so the live game URL does not break during the transition.
Capacitor points `webDir` at this static game bundle, **not** at the server-rendered Next
app.

## A2. Database schema changes (via `supabase/migrations`, applied with `apply_migration`)

> **NOTE: the additive migration below has ALREADY been applied to the live DB**
> (`dhtjnpdwvuwgzdymfkra`) under the name `add_salad_columns_sessions_activity`. The
> `player_progress` RLS lockdown is the ONLY schema step still outstanding, and it must be
> deferred to Phase 2 (see warning there). Keep this SQL in `supabase/migrations/` as the
> source of truth.

Already applied (additive, safe — live game never touches the new tables):
- **Fix drift first:** `player_progress` was **missing the `salad` columns** the client
  already references (`owned_salad_skins`, `active_salad_skin`, `salad_purchase_count`) —
  those upserts were failing silently. Added.
- **Forward-compat for scoreboard (schema only, no endpoints):** added nullable
  `display_name` and a derived `high_score` (to be updated by the session-insert path).
  A leaderboard later is just `SELECT ... ORDER BY high_score`.
- **New `game_sessions`** (one row per completed game — the activity record):
  `id, player_id, score, level_reached, coins_earned, burgers_caught, pizzas_caught,
  salads_caught, items_missed, duration_ms, client (web|android|ios), created_at`.
- **New `activity_events`** (generic telemetry for future events/funnels):
  `id, player_id, event_type, payload jsonb, client, created_at`.
- New tables have **RLS enabled with no anon/public policies** => only the service-role
  (the API) can touch them.

Still outstanding (Phase 2 only):
- **Lock down `player_progress` RLS:** revoke anon/`authenticated` write (and ideally
  read) so only the **service-role** (the API) can write. This is the core security fix.

## A3. API endpoints (Next.js route handlers under `app/api/v1`, versioned)
Each is a `route.ts` exporting the relevant HTTP method. All identify the player via an
`X-Player-Id` header (the existing anonymous UUID). No auth.
- `GET  /api/v1/progress`  → load player progress (replaces `loadFromSupabase`)
- `PUT  /api/v1/progress`  → upsert progress (replaces `saveToSupabase`); server
                             validates/sanitizes, sets `updated_at`
- `POST /api/v1/sessions`  → record a completed game (the activity tracking); server also
                             bumps `high_score` if beaten
- `POST /api/v1/activity`  → generic event ingestion (optional, future events)
- `GET  /api/v1/health`   → readiness check
- **Deliberately NOT built yet:** `GET /api/v1/leaderboard` (schema is ready; pairs with
  the scoreboard React pages in Phase 4).

Cross-cutting: CORS allow-list (web origin + Capacitor `capacitor://` / `https://localhost`
origins) via middleware or per-handler headers, input validation (zod), basic rate
limiting, and a shared `supabaseAdmin` client in `lib/` created once from `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` (server-only env vars, set in Vercel project settings).

**API-style note (for the future dashboard):** the shared API consumed by the game +
mobile stays as **Route Handlers** — a stable, versioned, CORS-friendly HTTP contract that
non-React, cross-origin clients can call. **Server Actions** are coupled to React/RSC and
not a public HTTP API, so use them only for the **internal** admin/dashboard React form
mutations (create event, edit settings), calling the same `lib/` helpers under the hood.

## A4. Web client changes (`public/game/index.html` — stays static, no React)
- Replace the inline Supabase block (`index.html:545-648`) with a tiny **API client**
  (`apiGetProgress`, `apiSaveProgress`, `apiPostSession`) that calls `/api/v1/*` with the
  `X-Player-Id` header. Remove the hardcoded Supabase URL/anon key from the client.
- Preserve existing behavior: load-on-start, save-after-purchase/coin-change, and the
  local-vs-remote "higher coins wins" merge (`index.html:634-645`) — move the merge
  decision behind the API or keep it client-side against `GET /progress`.
- **Add session tracking:** on game over (game-over logic ~`index.html:5260-5400`, where
  `score/level/lives` finalize), call `apiPostSession(...)` with the run's stats. Add
  per-run counters (burgers/pizzas/salads caught, misses, start time) alongside the
  existing `score`/`level`/`missCount` state (`index.html:663-669`).
- Keep `localStorage` as an offline cache so the game still plays if the API is down.

Reuse: keep the existing anonymous-`player_id` pattern (`index.html:551-559`) and the
"higher coins wins" merge logic (`index.html:634-645`) — move them behind the API rather
than reinventing them.

---

## Sequencing (server track)

1. **Phase 0 — Next.js scaffold + schema:** scaffold the Next.js app, move the game to
   `public/game/` (static, with a rewrite preserving the root URL). *Schema migration
   already applied; just commit the SQL into `supabase/migrations/`.* No client breakage.
2. **Phase 1 — API:** build the `app/api/v1` route handlers (progress + sessions + health),
   deploy to Vercel with the service-role key as a server env var.
3. **Phase 2 — Web cutover:** swap the web client from direct Supabase to the API; add
   game-over session tracking; remove client secrets; **then** lock down `player_progress`
   RLS. Verify the live game still works.
   - ⚠️ **Do the RLS lockdown LAST.** The currently-deployed game writes directly with the
     anon key; revoking that before the API + new web client are live will break it.
4. **Phase 4 (later):** scoreboard endpoint + React scoreboard/events/admin pages in the
   same Next.js app, optional auth, events system. (Phase 3 = Android, see capacitor-plan.)

---

## Critical files

- `public/game/index.html` (currently `index.html`, moved, stays static)
  - `:545-649` — Supabase integration to **replace** with the API client
  - `:663-669` — game state vars; add per-run catch/miss counters here
  - `:5260-5400` — game-over path; add `apiPostSession(...)` call here
- `app/api/v1/progress/route.ts`, `app/api/v1/sessions/route.ts`,
  `app/api/v1/health/route.ts` (new route handlers)
- `lib/supabaseAdmin.ts`, `lib/validation.ts` (new shared server helpers)
- `supabase/migrations/*.sql` (commit the already-applied migration + the future RLS one)
- `next.config.js` (root-URL rewrite to the static game), `package.json` (new)

---

## Verification

**Schema/RLS:** `list_tables` shows the new tables + salad columns (already true). After
the Phase 2 lockdown, confirm a raw anon-key write to `player_progress` is rejected.

**API (local + deployed):**
- `curl /api/v1/health` → ok.
- `curl -H 'X-Player-Id: <uuid>' /api/v1/progress` → defaults for a new id, real data for
  an existing one (use a known id from the existing rows).
- `PUT /api/v1/progress` then re-`GET` → round-trips coins/skins.
- `POST /api/v1/sessions` → row appears in `game_sessions` (verify via `execute_sql`);
  `high_score` updates only when beaten.

**Web cutover:** load the deployed game, earn coins, buy a skin, reload → progress persists
*through the API* (Network tab shows `/api/v1/*`, no direct Supabase calls, no anon key in
page source). Play a full game to game-over → a `game_sessions` row is written.

**Regression:** existing players' coins/skins remain intact after the cutover (spot-check a
few `player_id`s before/after).
