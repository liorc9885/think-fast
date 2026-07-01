import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { preflight } from '@/lib/cors';
import { json, error, rateLimit, clientKey } from '@/lib/http';
import { getPlayerId, transferSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

const REASON_STATUS: Record<string, { status: number; message: string }> = {
  INVALID_AMOUNT: { status: 422, message: 'Invalid amount' },
  SENDER_NOT_FOUND: { status: 404, message: 'Set a display name before sending coins' },
  RECIPIENT_NOT_FOUND: { status: 404, message: 'No player with that display name' },
  SELF_TRANSFER: { status: 422, message: 'Cannot send coins to yourself' },
  INSUFFICIENT_COINS: { status: 422, message: 'Not enough coins' },
};

// POST /api/v1/transfer — send coins from the caller to another player,
// identified by their (unique) display name. Atomic via the transfer_coins
// DB function so two concurrent transfers can't race past a balance check.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const playerId = getPlayerId(req);
  if (!playerId) return error('Missing or invalid X-Player-Id', 400, origin);

  if (!rateLimit(clientKey(req, playerId), 20)) {
    return error('Too many requests', 429, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error('Invalid JSON body', 400, origin);
  }

  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    return error('Invalid transfer payload', 422, origin, {
      issues: parsed.error.issues,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data, error: dbErr } = await supabase
    .rpc('transfer_coins', {
      p_sender_id: playerId,
      p_recipient_name: parsed.data.toDisplayName,
      p_amount: parsed.data.amount,
    })
    .single();

  if (dbErr) {
    const reason = REASON_STATUS[dbErr.message as string];
    if (reason) return error(reason.message, reason.status, origin);
    return error('Database error', 500, origin);
  }

  const row = data as { sender_coins: number; recipient_coins: number };
  return json({ coins: row.sender_coins }, { origin });
}
