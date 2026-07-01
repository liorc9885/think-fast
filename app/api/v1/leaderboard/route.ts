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
// required); the response only exposes display_name + high_score, never the
// player id.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`leaderboard:${ip}`, 60)) {
    return error('Too many requests', 429, origin);
  }

  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20, 1),
    100,
  );

  const supabase = getSupabaseAdmin();
  const { data, error: dbErr } = await supabase
    .from('player_progress')
    .select('display_name, high_score')
    .gt('high_score', 0)
    .order('high_score', { ascending: false })
    .limit(limit);

  if (dbErr) return error('Database error', 500, origin);

  const entries = (data || []).map((row, i) => ({
    rank: i + 1,
    displayName: row.display_name || 'אנונימי',
    score: row.high_score,
  }));

  return json({ entries }, { origin });
}
