import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit } from '@/lib/http';
import { getPlayerId } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOARDS = ['score', 'coins', 'items'] as const;
type Board = (typeof BOARDS)[number];

function valueOf(row: Record<string, any>, board: Board): number {
  if (board === 'coins') return row.coins ?? 0;
  if (board === 'items') {
    return [row.owned_skins, row.owned_burger_skins, row.owned_pizza_skins, row.owned_salad_skins]
      .reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
  }
  return row.high_score ?? 0;
}

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

// GET /api/v1/leaderboard?board=score|coins|items — top players by high_score,
// coins, or number of skins owned (named players only;
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

  const board = req.nextUrl.searchParams.get('board') || 'score';
  if (!BOARDS.includes(board as Board)) return error('Invalid board', 400, origin);

  const supabase = getSupabaseAdmin();
  const cols =
    'display_name, high_score, coins, owned_skins, owned_burger_skins, owned_pizza_skins, owned_salad_skins';
  const named = () =>
    supabase
      .from('player_progress')
      .select(cols)
      .not('display_name', 'is', null)
      .neq('display_name', '')
      .neq('display_name', 'אנונימי');

  // score/coins order in the DB; "items" (total skins owned across all four
  // lists) is a jsonb array length, so it is computed and ranked here.
  const query =
    board === 'items'
      ? named().limit(5000)
      : named()
          .gt(board === 'coins' ? 'coins' : 'high_score', 0)
          .order(board === 'coins' ? 'coins' : 'high_score', { ascending: false })
          .limit(limit);
  const { data, error: dbErr } = await query;

  if (dbErr) return error('Database error', 500, origin);

  const entries = (data || [])
    .map((row) => ({ displayName: row.display_name, score: valueOf(row, board as Board) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e, i) => ({ rank: i + 1, ...e }));

  // Optional X-Player-Id: also return the caller's own saved name/score so the
  // client can pin it at the top even before they have a score on the board.
  let me: { displayName: string; score: number } | null = null;
  const playerId = getPlayerId(req);
  if (playerId) {
    const { data: mine } = await supabase
      .from('player_progress')
      .select(cols)
      .eq('player_id', playerId)
      .maybeSingle();
    if (mine?.display_name && mine.display_name !== 'אנונימי') {
      me = { displayName: mine.display_name, score: valueOf(mine, board as Board) };
    }
  }

  return json({ entries, me }, { origin });
}
