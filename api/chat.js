// Web sitesi sohbet kutusu API'si: POST https://<proje>.vercel.app/api/chat
// Govde: { sessionId, message, lang?, pageUrl? }  ->  { reply }

import { getConfig } from '../lib/config.js';
import { handleWebMessage, isValidSessionId, MAX_MESSAGE_CHARS } from '../lib/webchat.js';

const DEFAULT_ORIGINS = [
  'https://www.beengetbookings.com',
  'https://beengetbookings.com',
  'https://beenget-wp-asistan.vercel.app',
];

function allowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

function corsHeaders(origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' };
  if (origin && allowedOrigins().has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });

// Basit IP bazli hiz siniri (sunucu ornegi basina, en iyi caba)
const ipHits = new Map();
const IP_LIMIT_PER_MIN = 15;
function ipLimited(ip, now = Date.now()) {
  const list = (ipHits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  ipHits.set(ip, list);
  if (ipHits.size > 5000) ipHits.clear();
  return list.length > IP_LIMIT_PER_MIN;
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins().has(origin)) return json({ error: 'origin' }, 403, null);

  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY eksik');
    return json({ error: 'not_configured' }, 500, origin);
  }
  cfg.oidcToken = request.headers.get('x-vercel-oidc-token') || cfg.oidcToken;

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (ipLimited(ip)) return json({ error: 'rate_limited' }, 429, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_json' }, 400, origin);
  }
  const { sessionId, message, lang, pageUrl } = body || {};
  if (!isValidSessionId(sessionId)) return json({ error: 'bad_session' }, 400, origin);
  if (typeof message !== 'string' || !message.trim()) return json({ error: 'empty' }, 400, origin);
  if (message.length > MAX_MESSAGE_CHARS * 2) return json({ error: 'too_long' }, 413, origin);
  // Gizli alan (bot tuzagi): doluysa sessizce yok say
  if (body.website) return json({ reply: '' }, 200, origin);

  try {
    const { status, reply } = await handleWebMessage(cfg, {
      sessionId,
      text: message,
      lang: typeof lang === 'string' ? lang.slice(0, 10) : undefined,
      pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 300) : undefined,
    });
    return json({ reply }, status, origin);
  } catch (e) {
    console.error('chat hatasi', e);
    return json({ error: 'server' }, 500, origin);
  }
}
