import { NextResponse } from 'next/server';

// Capacitor wraps the static web build; its WebView origins must be allowed so
// the Android/iOS app can call the same API as the web client.
const STATIC_ALLOWED = new Set<string>([
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);

function allowedOrigins(): Set<string> {
  const extra = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...STATIC_ALLOWED, ...extra]);
}

// Returns the value to echo back in Access-Control-Allow-Origin, or null if the
// origin is not allowed. Requests with no Origin header (same-origin fetches,
// curl) are allowed with a wildcard.
function resolveAllowOrigin(origin: string | null): string | null {
  if (!origin) return '*';
  if (allowedOrigins().has(origin)) return origin;
  // Allow any *.vercel.app preview/prod deployment of this app.
  try {
    const host = new URL(origin).host;
    if (host.endsWith('.vercel.app')) return origin;
  } catch {
    /* malformed Origin — fall through to deny */
  }
  return null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = resolveAllowOrigin(origin);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Player-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allow) headers['Access-Control-Allow-Origin'] = allow;
  return headers;
}

export function withCors(res: NextResponse, origin: string | null): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}

// Standard preflight response.
export function preflight(origin: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
