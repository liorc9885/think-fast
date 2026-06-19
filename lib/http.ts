import { NextResponse } from 'next/server';
import { withCors } from './cors';

// JSON response helper that always attaches CORS headers.
export function json(
  body: unknown,
  init: { status?: number; origin: string | null },
): NextResponse {
  const res = NextResponse.json(body, { status: init.status ?? 200 });
  return withCors(res, init.origin);
}

export function error(
  message: string,
  status: number,
  origin: string | null,
  extra?: Record<string, unknown>,
): NextResponse {
  return json({ error: message, ...extra }, { status, origin });
}

// ── Basic best-effort rate limiting ───────────────────────────────────────────
// In-memory, per-instance. Serverless instances are ephemeral and not shared,
// so this only blunts bursts from a single warm instance — it is a courtesy
// limiter, not a security control. A durable limiter (e.g. Upstash) can replace
// it later without changing call sites.
const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function clientKey(req: Request, playerId: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return `${ip}:${playerId}`;
}
