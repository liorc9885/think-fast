import { NextRequest, NextResponse } from 'next/server';
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

// ── Player id cookie ──────────────────────────────────────────────────────────
// Safari (ITP) deletes cookies written by page script (document.cookie) and
// localStorage after 7 days without a visit, which silently gave returning
// iPhone players a brand-new empty identity. Cookies set by an HTTP response are
// not subject to that cap, so mirror the player id into one on same-origin API
// calls. It is deliberately not HttpOnly: the game reads it to restore the id.
const PLAYER_COOKIE = 'thinkFastPlayerId';
const PLAYER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 years

export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export function withPlayerCookie(
  res: NextResponse,
  req: NextRequest,
  playerId: string,
): NextResponse {
  if (!isSameOrigin(req)) return res;
  res.cookies.set(PLAYER_COOKIE, playerId, {
    maxAge: PLAYER_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
  });
  return res;
}
