import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

// GET /api/v1/leaderboard — top players by high_score. Public (no player id
// required); the response exposes display_name, high_score, coins and skin
// count, never the player id.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`leaderboard:${ip}`, 60)) {
    return error('Too many requests', 429, origin);
  }

  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '30', 10) || 30, 1),
    100,
  );

  const supabase = getSupabaseAdmin();
  const { data, error: dbErr } = await supabase
    .from('player_progress')
    .select(
      'display_name, high_score, coins, owned_skins, owned_burger_skins, owned_pizza_skins, owned_salad_skins',
    )
    .gt('high_score', 0)
    .order('high_score', { ascending: false })
    .limit(limit);

  if (dbErr) return error('Database error', 500, origin);

  const entries = (data || []).map((row, i) => ({
    rank: i + 1,
    displayName: row.display_name || 'אנונימי',
    score: row.high_score,
    coins: row.coins,
    skins:
      (row.owned_skins?.length || 0) +
      (row.owned_burger_skins?.length || 0) +
      (row.owned_pizza_skins?.length || 0) +
      (row.owned_salad_skins?.length || 0),
  }));

  return json({ entries }, { origin });
}
