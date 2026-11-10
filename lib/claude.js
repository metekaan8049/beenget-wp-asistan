// Claude (Anthropic Messages API) ile konusma ve arac (tool) kullanimi.

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
        extras: { type: 'string', description: 'Ek urunler (bebek koltugu, navigasyon vb.)' },
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

async function callClaude(cfg, { system, messages }, attempt = 1) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.claudeModel,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Gecici yogunluk/limit hatalarinda bir kez daha dene
    if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500));
      return callClaude(cfg, { system, messages }, attempt + 1);
    }
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }
  return res.json();
}

// Gecmisi Claude'un bekledigi bicime cevirir: ilk mesaj "user" olmali,
// ardisik ayni roller birlestirilir.
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

/**
 * Asistani calistirir.
 * @param toolHandlers { create_reservation_request: async (input) => string, handoff_to_human: async (input) => string }
 * @returns { reply: string, toolsUsed: string[] }
 */
export async function runAssistant(cfg, { system, history, toolHandlers, maxSteps = 4 }) {
  const messages = toClaudeMessages(history);
  const toolsUsed = [];

  for (let step = 0; step < maxSteps; step++) {
    const resp = await callClaude(cfg, { system, messages });
    const content = resp.content ?? [];
    const text = content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (resp.stop_reason !== 'tool_use') {
      return { reply: text, toolsUsed };
    }

    messages.push({ role: 'assistant', content });
    const results = [];
    for (const block of content.filter((b) => b.type === 'tool_use')) {
      toolsUsed.push(block.name);
      let output;
      let isError = false;
      try {
        const handler = toolHandlers[block.name];
        if (!handler) throw new Error(`Bilinmeyen arac: ${block.name}`);
        output = await handler(block.input ?? {});
      } catch (e) {
        isError = true;
        output = `Hata: ${e.message}`;
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: String(output), is_error: isError });
    }
    messages.push({ role: 'user', content: results });
  }

  return {
    reply: 'Mesajınızı aldım, ekibimiz en kısa sürede size dönüş yapacak.',
    toolsUsed,
  };
}
