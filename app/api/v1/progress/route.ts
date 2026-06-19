import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit, clientKey } from '@/lib/http';
import {
  getPlayerId,
  progressSchema,
  progressToRow,
  rowToProgress,
  defaultProgress,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

// GET /api/v1/progress — load player progress (replaces loadFromSupabase).
// Returns defaults for an unknown player id so the client always gets a usable
// shape.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  const playerId = getPlayerId(req);
  if (!playerId) return error('Missing or invalid X-Player-Id', 400, origin);

  if (!rateLimit(clientKey(req, playerId), 120)) {
    return error('Too many requests', 429, origin);
  }

  const supabase = getSupabaseAdmin();
  const { data, error: dbErr } = await supabase
    .from('player_progress')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();

  if (dbErr) return error('Database error', 500, origin);

  if (!data) {
    return json({ progress: defaultProgress(), isNew: true }, { origin });
  }
  return json({ progress: rowToProgress(data), isNew: false }, { origin });
}

// PUT /api/v1/progress — upsert progress (replaces saveToSupabase). The server
// validates/sanitizes the payload and sets updated_at.
export async function PUT(req: NextRequest) {
  const origin = req.headers.get('origin');
  const playerId = getPlayerId(req);
  if (!playerId) return error('Missing or invalid X-Player-Id', 400, origin);

  if (!rateLimit(clientKey(req, playerId), 120)) {
    return error('Too many requests', 429, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error('Invalid JSON body', 400, origin);
  }

  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) {
    return error('Invalid progress payload', 422, origin, {
      issues: parsed.error.issues,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data, error: dbErr } = await supabase
    .from('player_progress')
    .upsert(progressToRow(playerId, parsed.data), { onConflict: 'player_id' })
    .select('*')
    .single();

  if (dbErr) return error('Database error', 500, origin);

  return json({ progress: rowToProgress(data) }, { origin });
}
