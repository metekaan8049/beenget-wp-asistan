// Tum ayarlar ortam degiskenlerinden (Vercel > Settings > Environment Variables) okunur.

function env(name, fallback = undefined) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

const DEFAULT_MODELS = {
  gateway: 'google/gemini-3.8-flash',
  gemini: 'gemini-flash-latest',
  anthropic: 'claude-sonnet-5-5',
};

function aiProvider() {
  const p = (env('AI_PROVIDER', '') || '').toLowerCase();
  if (['gateway', 'gemini', 'anthropic'].includes(p)) return p;
  if (env('GEMINI_API_KEY')) return 'gemini';
  if (env('ANTHROPIC_API_KEY')) return 'anthropic';
  return 'gateway';
}

export function getConfig() {
  return {
    // WhatsApp Cloud API (Meta)
    waToken: env('WHATSAPP_TOKEN'),
    waPhoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    waVerifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    waAppSecret: env('WHATSAPP_APP_SECRET'),
    graphVersion: env('GRAPH_API_VERSION', 'v23.0'),

    // Yapay zeka: gateway (Vercel AI Gateway, varsayilan) | gemini | anthropic
    aiProvider: aiProvider(),
    aiModel: env('AI_MODEL', DEFAULT_MODELS[aiProvider()]),
    gatewayKey: env('AI_GATEWAY_API_KEY'), // Vercel'de gerekmez (OIDC kullanilir)
    oidcToken: env('VERCEL_OIDC_TOKEN'),
    geminiKey: env('GEMINI_API_KEY'),
    anthropicKey: env('ANTHROPIC_API_KEY'),

    // Supabase
    supabaseUrl: env('SUPABASE_URL'),
    supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),

    // Resend (bildirim e-postalari)
    resendKey: env('RESEND_API_KEY'),
    notifyFrom: env('NOTIFY_FROM', 'Beenget Asistan <asistan@beengetbookings.com>'),
    notifyTo: env('NOTIFY_TO'),

    // Isletme sahibinin WhatsApp numarasi (ulke koduyla, + olmadan; or. 905315505848)
    ownerWaId: env('OWNER_WA_ID'),

    // Konusma insana devredildikten kac saat sonra bot tekrar devreye girsin
    humanTimeoutHours: Number(env('HUMAN_TIMEOUT_HOURS', '12')),

    // Modele gonderilecek gecmis mesaj sayisi
    historyLimit: Number(env('HISTORY_LIMIT', '20')),
  };
}

export function missingConfig(cfg) {
  const required = {
    WHATSAPP_TOKEN: cfg.waToken,
    WHATSAPP_PHONE_NUMBER_ID: cfg.waPhoneNumberId,
    WHATSAPP_VERIFY_TOKEN: cfg.waVerifyToken,
    WHATSAPP_APP_SECRET: cfg.waAppSecret,
    ...(cfg.aiProvider === 'anthropic' ? { ANTHROPIC_API_KEY: cfg.anthropicKey } : {}),
    ...(cfg.aiProvider === 'gemini' ? { GEMINI_API_KEY: cfg.geminiKey } : {}),
    SUPABASE_URL: cfg.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: cfg.supabaseKey,
  };
  return Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
}
