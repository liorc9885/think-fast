-- ⚠️ DEFERRED — DO NOT APPLY YET (Phase 2, the LAST step).
--
-- The currently-deployed game writes directly to player_progress with the anon
-- key. Revoking that access BEFORE the API + new web client are live in
-- production will break the live game. Apply this ONLY after:
--   1. The /api/v1 endpoints are deployed (service-role key set in Vercel).
--   2. The web client (public/game/index.html) has been cut over to the API and
--      that cutover is live for users.
--
-- This is the core security fix: after it, only the service-role (the API) can
-- touch player_progress; the anon key can no longer read or write it.

-- Drop any existing anon/public policies on player_progress.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'player_progress'
  loop
    execute format('drop policy if exists %I on public.player_progress', pol.policyname);
  end loop;
end $$;

-- Ensure RLS is on (it already is) and revoke direct table grants from the
-- anon/authenticated roles so PostgREST refuses their requests entirely.
alter table public.player_progress enable row level security;
revoke all on public.player_progress from anon, authenticated;

-- With RLS enabled and no policies, the service-role key (used only by the API)
-- still bypasses RLS and retains full access.
