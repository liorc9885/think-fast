import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit, clientKey } from '@/lib/http';
import { getPlayerId, profileSchema, defaultProgress, progressToRow } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

// PUT /api/v1/profile — set/change the caller's display name for the
// leaderboard. Upserts a default progress row for brand-new player ids so
// naming yourself doesn't require having played a game first. Names are
// case-insensitively unique (enforced by a DB index) so they can also be used
// to target a coin transfer.
export async function PUT(req: NextRequest) {
  const origin = req.headers.get('origin');
  const playerId = getPlayerId(req);
  if (!playerId) return error('Missing or invalid X-Player-Id', 400, origin);

  if (!rateLimit(clientKey(req, playerId), 30)) {
    return error('Too many requests', 429, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error('Invalid JSON body', 400, origin);
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return error('Invalid profile payload', 422, origin, {
      issues: parsed.error.issues,
    });
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from('player_progress')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();

  const { highScore: _highScore, ...defaults } = defaultProgress();
  const base = existing ?? progressToRow(playerId, defaults);
  const row = { ...base, player_id: playerId, display_name: parsed.data.displayName, updated_at: new Date().toISOString() };

  const { data, error: dbErr } = await supabase
    .from('player_progress')
    .upsert(row, { onConflict: 'player_id' })
    .select('display_name, coins')
    .single();

  if (dbErr) {
    if (dbErr.code === '23505') {
      return error('Display name already taken', 409, origin);
    }
    return error('Database error', 500, origin);
  }

  return json({ displayName: data.display_name, coins: data.coins }, { origin });
}
