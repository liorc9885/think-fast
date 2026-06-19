import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit, clientKey } from '@/lib/http';
import { getPlayerId, activitySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

// POST /api/v1/activity — generic telemetry ingestion for future events/funnels.
export async function POST(req: NextRequest) {
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

  const parsed = activitySchema.safeParse(body);
  if (!parsed.success) {
    return error('Invalid activity payload', 422, origin, {
      issues: parsed.error.issues,
    });
  }

  const supabase = getSupabaseAdmin();
  const { error: dbErr } = await supabase.from('activity_events').insert({
    player_id: playerId,
    event_type: parsed.data.eventType,
    payload: parsed.data.payload,
    client: parsed.data.client ?? 'web',
  });

  if (dbErr) return error('Database error', 500, origin);

  return json({ ok: true }, { status: 201, origin });
}
