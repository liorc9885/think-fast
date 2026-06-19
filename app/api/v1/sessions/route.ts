import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit, clientKey } from '@/lib/http';
import { getPlayerId, sessionSchema, sessionToRow } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

// POST /api/v1/sessions — record one completed game (the activity record).
// Also bumps player_progress.high_score when the score beats the stored best
// (schema groundwork for the future scoreboard; no scoreboard endpoint yet).
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const playerId = getPlayerId(req);
  if (!playerId) return error('Missing or invalid X-Player-Id', 400, origin);

  if (!rateLimit(clientKey(req, playerId), 60)) {
    return error('Too many requests', 429, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error('Invalid JSON body', 400, origin);
  }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return error('Invalid session payload', 422, origin, {
      issues: parsed.error.issues,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data: session, error: insErr } = await supabase
    .from('game_sessions')
    .insert(sessionToRow(playerId, parsed.data))
    .select('id')
    .single();

  if (insErr) return error('Database error', 500, origin);

  // Bump high_score only when beaten. Best-effort: a failure here must not fail
  // the session record itself.
  let highScore: number | null = null;
  const { data: prog } = await supabase
    .from('player_progress')
    .select('high_score')
    .eq('player_id', playerId)
    .maybeSingle();

  const currentBest = prog?.high_score ?? 0;
  if (parsed.data.score > currentBest) {
    const { data: updated } = await supabase
      .from('player_progress')
      .update({ high_score: parsed.data.score })
      .eq('player_id', playerId)
      .select('high_score')
      .maybeSingle();
    highScore = updated?.high_score ?? parsed.data.score;
  } else {
    highScore = currentBest;
  }

  return json(
    { id: session.id, highScore, beatenHighScore: parsed.data.score > currentBest },
    { status: 201, origin },
  );
}
