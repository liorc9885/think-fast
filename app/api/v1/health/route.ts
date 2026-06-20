import { NextRequest } from 'next/server';
import { json } from '@/lib/http';
import { preflight } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'));
}

export function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  const configured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return json(
    { ok: true, status: 'ready', configured, time: new Date().toISOString() },
    { origin },
  );
}
