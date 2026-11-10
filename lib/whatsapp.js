import crypto from 'node:crypto';

// Meta'nin gonderdigi X-Hub-Signature-256 basligini dogrular.
export function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !appSecret) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Webhook govdesinden gelen musteri mesajlarini sade bir listeye cevirir.
// Teslim/okundu bildirimleri (statuses) yok sayilir.
export function parseIncoming(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value?.messages) continue;
      const names = {};
      for (const c of value.contacts ?? []) names[c.wa_id] = c?.profile?.name;
      for (const m of value.messages) {
        out.push({
          id: m.id,
          from: m.from,
          name: names[m.from] ?? null,
          timestamp: Number(m.timestamp) || null,
          type: m.type,
          text: messageToText(m),
        });
      }
    }
  }
  return out;
}

// Farkli mesaj turlerini modelin anlayacagi metne cevirir.
// null donerse: bu tur desteklenmiyor demektir.
function messageToText(m) {
  switch (m.type) {
    case 'text':
      return m.text?.body ?? '';
    case 'button':
      return m.button?.text ?? '';
    case 'interactive':
      return (
        m.interactive?.button_reply?.title ??
        m.interactive?.list_reply?.title ??
        ''
      );
    case 'location': {
      const l = m.location ?? {};
      const label = [l.name, l.address].filter(Boolean).join(', ');
      return `[Musteri konum paylasti: ${label ? label + ' — ' : ''}${l.latitude}, ${l.longitude}]`;
    }
    case 'image':
    case 'document':
    case 'video':
      return m[m.type]?.caption
        ? `[Musteri bir ${m.type} gonderdi, aciklamasi: ${m[m.type].caption}]`
        : null;
    default:
      return null; // ses, sticker vb.
  }
}

async function graph(cfg, path, payload) {
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.waToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WhatsApp API ${res.status}: ${text}`);
  }
  return res.json();
}

// WhatsApp tek mesajda en fazla 4096 karakter kabul eder.
export function splitMessage(text, max = 4000) {
  const parts = [];
  let rest = String(text).trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendText(cfg, to, text) {
  for (const part of splitMessage(text)) {
    await graph(cfg, `${cfg.waPhoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body: part },
    });
  }
}

export async function markRead(cfg, messageId) {
  try {
    await graph(cfg, `${cfg.waPhoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  } catch (e) {
    console.warn('markRead basarisiz:', e.message);
  }
}
