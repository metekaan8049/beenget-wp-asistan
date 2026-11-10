// Yapay zeka saglayicilari:
//  - "gateway"  : Vercel AI Gateway (varsayilan). Vercel uzerinde anahtarsiz calisir (OIDC);
//                 her ay 5$ ucretsiz kredi. Model: AI_MODEL (or. google/gemini-3.8-flash)
//  - "gemini"   : Google AI Studio ucretsiz anahtari (GEMINI_API_KEY)
//  - "anthropic": Claude API (ANTHROPIC_API_KEY, ucretli)

export const TOOLS = [
  {
    name: 'create_reservation_request',
    description:
      'Musterinin arac kiralama talebini kaydeder ve ekibe bildirir. Sadece zorunlu bilgiler (ad soyad, alis yeri, alis tarihi/saati, iade tarihi/saati) toplandiktan ve musteriye ozetlendikten sonra cagir. Bu bir kesin rezervasyon degildir; ekip teyit eder.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Musterinin adi soyadi' },
        pickup_location: { type: 'string', description: 'Alis yeri (or. Dalaman Havalimani, otel adi)' },
        pickup_datetime: { type: 'string', description: 'Alis tarihi ve saati, mumkunse YYYY-MM-DD HH:MM' },
        return_location: { type: 'string', description: 'Iade yeri; alis yeriyle ayniysa bos birak' },
        return_datetime: { type: 'string', description: 'Iade tarihi ve saati, mumkunse YYYY-MM-DD HH:MM' },
        car_preference: { type: 'string', description: 'Arac sinifi/model tercihi, vites/yakit' },
        driver_age: { type: 'integer', description: 'Surucu yasi' },
        flight_number: { type: 'string', description: 'Ucus numarasi' },
        extras: { type: 'string', description: 'Ek urunler (bebek koltugu vb.)' },
        notes: { type: 'string', description: 'Diger notlar' },
        language: { type: 'string', description: 'Musterinin yazdigi dil (or. tr, en, de, ru)' },
      },
      required: ['customer_name', 'pickup_location', 'pickup_datetime', 'return_datetime'],
    },
  },
  {
    name: 'handoff_to_human',
    description:
      'Konusmayi Beenget ekibine devreder ve ekibe bildirim gonderir. Devirden sonra bot bu musteriye bir sure cevap vermez.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Devretme nedeni (kisa)' },
        summary: { type: 'string', description: 'Ekip icin konusmanin kisa ozeti' },
      },
      required: ['reason', 'summary'],
    },
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(url, headers, body, label, attempt = 1) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Gecici yogunluk/limit hatalarinda bir kez daha dene
    if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
      await sleep(1500);
      return postJson(url, headers, body, label, attempt + 1);
    }
    throw new Error(`${label} ${res.status}: ${text}`);
  }
  return res.json();
}

// Gecmisi sohbet bicimine cevirir: ilk mesaj "user" olmali, ardisik ayni roller birlestirilir.
export function toClaudeMessages(history) {
  const msgs = [];
  for (const h of history) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const text = String(h.content ?? '').trim();
    if (!text) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += '\n' + text;
    else msgs.push({ role, content: text });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

async function runTool(toolHandlers, name, input) {
  try {
    const handler = toolHandlers[name];
    if (!handler) throw new Error(`Bilinmeyen arac: ${name}`);
    return { output: String(await handler(input ?? {})), isError: false };
  } catch (e) {
    return { output: `Hata: ${e.message}`, isError: true };
  }
}

const FALLBACK = 'Mesajınızı aldım, ekibimiz en kısa sürede size dönüş yapacak.';

// ---------------- Anthropic (Claude) ----------------
async function runAnthropic(cfg, { system, history, toolHandlers, maxSteps }) {
  const messages = toClaudeMessages(history);
  const toolsUsed = [];
  for (let step = 0; step < maxSteps; step++) {
    const resp = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
      { model: cfg.aiModel, max_tokens: 1024, system, tools: TOOLS, messages },
      'Anthropic API',
    );
    const content = resp.content ?? [];
    const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (resp.stop_reason !== 'tool_use') return { reply: text, toolsUsed };

    messages.push({ role: 'assistant', content });
    const results = [];
    for (const block of content.filter((b) => b.type === 'tool_use')) {
      toolsUsed.push(block.name);
      const { output, isError } = await runTool(toolHandlers, block.name, block.input);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: output, is_error: isError });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: FALLBACK, toolsUsed };
}

// ---------------- OpenAI uyumlu (Vercel AI Gateway / Gemini) ----------------
function openAiEndpoint(cfg) {
  if (cfg.aiProvider === 'gemini') {
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: cfg.geminiKey,
      label: 'Gemini API',
    };
  }
  return {
    url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    key: cfg.gatewayKey || cfg.oidcToken,
    label: 'Vercel AI Gateway',
  };
}

const OPENAI_TOOLS = TOOLS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

async function runOpenAiCompatible(cfg, { system, history, toolHandlers, maxSteps }) {
  const { url, key, label } = openAiEndpoint(cfg);
  if (!key) throw new Error(`${label} icin anahtar/OIDC token bulunamadi`);
  const messages = [{ role: 'system', content: system }, ...toClaudeMessages(history)];
  const toolsUsed = [];

  for (let step = 0; step < maxSteps; step++) {
    const resp = await postJson(
      url,
      { Authorization: `Bearer ${key}` },
      { model: cfg.aiModel, max_tokens: 1024, messages, tools: OPENAI_TOOLS, tool_choice: 'auto' },
      label,
    );
    const msg = resp.choices?.[0]?.message ?? {};
    const calls = msg.tool_calls ?? [];
    const text = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!calls.length) return { reply: text, toolsUsed };

    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      const name = call.function?.name;
      toolsUsed.push(name);
      let input = {};
      try {
        input = JSON.parse(call.function?.arguments || '{}');
      } catch {
        input = {};
      }
      const { output } = await runTool(toolHandlers, name, input);
      messages.push({ role: 'tool', tool_call_id: call.id, content: output });
    }
  }
  return { reply: FALLBACK, toolsUsed };
}

/**
 * Asistani calistirir.
 * @returns { reply: string, toolsUsed: string[] }
 */
export async function runAssistant(cfg, { system, history, toolHandlers, maxSteps = 4 }) {
  const args = { system, history, toolHandlers, maxSteps };
  if (cfg.aiProvider === 'anthropic') return runAnthropic(cfg, args);
  return runOpenAiCompatible(cfg, args);
}
