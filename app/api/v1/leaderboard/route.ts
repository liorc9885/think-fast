import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit } from '@/lib/http';
import { getPlayerId } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

// GET /api/v1/leaderboard — top players by high_score (named players only;
// anonymous entries are excluded). Public (no player id
// required); the response only exposes display_name + high_score, never the
// player id.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`leaderboard:${ip}`, 60)) {
    return error('Too many requests', 429, origin);
  }

  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '100', 10) || 100, 1),
    100,
  );

  const supabase = getSupabaseAdmin();
  const { data, error: dbErr } = await supabase
    .from('player_progress')
    .select('display_name, high_score')
    .gt('high_score', 0)
    .not('display_name', 'is', null)
    .neq('display_name', '')
    .neq('display_name', 'אנונימי')
    .order('high_score', { ascending: false })
    .limit(limit);

  if (dbErr) return error('Database error', 500, origin);

  const entries = (data || []).map((row, i) => ({
    rank: i + 1,
    displayName: row.display_name,
    score: row.high_score,
  }));

  // Optional X-Player-Id: also return the caller's own saved name/score so the
  // client can pin it at the top even before they have a score on the board.
  let me: { displayName: string; score: number } | null = null;
  const playerId = getPlayerId(req);
  if (playerId) {
    const { data: mine } = await supabase
      .from('player_progress')
      .select('display_name, high_score')
      .eq('player_id', playerId)
      .maybeSingle();
    if (mine?.display_name && mine.display_name !== 'אנונימי') {
      me = { displayName: mine.display_name, score: mine.high_score ?? 0 };
    }
  }

  return json({ entries, me }, { origin });
}
