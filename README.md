# Think-Fast

Next.js app on Vercel that hosts:

- **The trusted API** (`app/api/v1/*` route handlers) — clients no longer touch
  the database directly; the Supabase **service-role** key lives only on the
  server.
- **The static Canvas game** (`public/game/index.html`, Hebrew "המבורגר נופל!"),
  served unchanged and reachable at the deployed root via a `next.config.js`
  rewrite. Same bundle Capacitor wraps for Android/iOS.
- **A landing page** (`app/page.tsx`) — future home of the scoreboard / events /
  admin dashboard (Phase 4).

See [`docs/server-plan.md`](./docs/server-plan.md) for the full plan.

## API (versioned, `X-Player-Id` header = the anonymous player UUID)

| Method | Path                 | Purpose                                            |
| ------ | -------------------- | -------------------------------------------------- |
| GET    | `/api/v1/health`     | Readiness check                                    |
| GET    | `/api/v1/progress`   | Load player progress (defaults for a new id)       |
| PUT    | `/api/v1/progress`   | Upsert progress (validated, sets `updated_at`)     |
| POST   | `/api/v1/sessions`   | Record a completed game; bumps `high_score`        |
| POST   | `/api/v1/activity`   | Generic event ingestion (future events/funnels)    |

`GET /api/v1/leaderboard` is **deliberately not built yet** (schema is ready;
pairs with the Phase 4 scoreboard pages).

## Environment variables (set in Vercel, never committed)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; bypasses RLS
- `CORS_ALLOWED_ORIGINS` — optional extra allowed origins (comma-separated)

See [`.env.example`](./.env.example).

## Local development

```bash
npm install
# create .env.local from .env.example with real Supabase values
npm run dev      # http://localhost:3000  (root serves the game)
npm run build    # production build
```

## Database

Schema lives in [`supabase/migrations`](./supabase/migrations) (source of truth):

- `…_add_salad_columns_sessions_activity.sql` — **already applied** (additive:
  salad columns, `display_name`/`high_score`, `game_sessions`,
  `activity_events`; new tables RLS-enabled with no anon policies).
- `…_lock_down_player_progress_rls.sql` — **deferred, do NOT apply yet.** The
  core security fix; run it LAST, only after the API + new web client are live
  in production, or it will break the currently-deployed game.
