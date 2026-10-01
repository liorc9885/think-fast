import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight, isOriginAllowed } from '@/lib/cors';
import {
  json,
  error,
  rateLimit,
  clientKey,
  withPlayerCookie,
  isSameOrigin,
} from '@/lib/http';
import {
  getPlayerId,
  playerIdSchema,
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

  const res = data
    ? json({ progress: rowToProgress(data), isNew: false }, { origin })
    : json({ progress: defaultProgress(), isNew: true }, { origin });
  return withPlayerCookie(res, req, playerId);
}

// PUT /api/v1/progress — upsert progress (replaces saveToSupabase). The server
// validates/sanitizes the payload and sets updated_at.
export async function PUT(req: NextRequest) {
  const origin = req.headers.get('origin');
  const playerId = getPlayerId(req);
  if (!playerId) return error('Missing or invalid X-Player-Id', 400, origin);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error('Invalid JSON body', 400, origin);
  }
  return saveProgress(req, playerId, body);
}

// POST /api/v1/progress — same upsert, for navigator.sendBeacon() when the
// player leaves the page (the most reliable exit channel on iPhone Safari).
// sendBeacon can't set headers, so the player id may come in the body as
// `playerId`, and the body is sent as text/plain to stay a CORS-simple request.
// Simple requests skip the CORS preflight, so other sites' origins are rejected
// here explicitly.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && !isSameOrigin(req) && !isOriginAllowed(origin)) {
    return error('Origin not allowed', 403, origin);
  }

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return error('Invalid JSON body', 400, origin);
  }

  let playerId = getPlayerId(req);
  if (!playerId && body && typeof body === 'object') {
    const parsedId = playerIdSchema.safeParse((body as { playerId?: unknown }).playerId);
    if (parsedId.success) playerId = parsedId.data;
  }
  if (!playerId) return error('Missing or invalid player id', 400, origin);

  return saveProgress(req, playerId, body);
}

async function saveProgress(req: NextRequest, playerId: string, body: unknown) {
  const origin = req.headers.get('origin');

  if (!rateLimit(clientKey(req, playerId), 120)) {
    return error('Too many requests', 429, origin);
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

  return withPlayerCookie(
    json({ progress: rowToProgress(data) }, { origin }),
    req,
    playerId,
  );
}
