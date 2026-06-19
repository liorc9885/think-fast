-- Additive migration — ALREADY APPLIED to the live DB (dhtjnpdwvuwgzdymfkra)
-- under the name `add_salad_columns_sessions_activity`. Committed here as the
-- source of truth. Safe/additive: the live game never touches the new tables,
-- and the new player_progress columns are nullable/defaulted.

-- 1. Fix schema drift: the client already references the salad columns
--    (owned_salad_skins, active_salad_skin, salad_purchase_count) but they were
--    missing, so those upserts failed silently. Add them.
alter table public.player_progress
  add column if not exists owned_salad_skins jsonb not null default '["classic"]'::jsonb,
  add column if not exists active_salad_skin text not null default 'classic',
  add column if not exists salad_purchase_count integer not null default 0;

-- 2. Forward-compat for the future scoreboard (schema only, no endpoints).
alter table public.player_progress
  add column if not exists display_name text,
  add column if not exists high_score integer not null default 0;

-- 3. game_sessions — one row per completed game (the activity record).
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  score integer not null default 0,
  level_reached integer not null default 1,
  coins_earned integer not null default 0,
  burgers_caught integer not null default 0,
  pizzas_caught integer not null default 0,
  salads_caught integer not null default 0,
  items_missed integer not null default 0,
  duration_ms integer not null default 0,
  client text not null default 'web',
  created_at timestamptz not null default now()
);
create index if not exists game_sessions_player_id_idx
  on public.game_sessions (player_id);
create index if not exists game_sessions_score_idx
  on public.game_sessions (score desc);

-- 4. activity_events — generic telemetry for future events/funnels.
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  client text not null default 'web',
  created_at timestamptz not null default now()
);
create index if not exists activity_events_player_id_idx
  on public.activity_events (player_id);
create index if not exists activity_events_event_type_idx
  on public.activity_events (event_type);

-- 5. RLS enabled with NO anon/public policies => only the service-role (the API)
--    can read/write these tables.
alter table public.game_sessions enable row level security;
alter table public.activity_events enable row level security;
