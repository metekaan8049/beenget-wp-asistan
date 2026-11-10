// Vercel fonksiyonu: https://<proje>.vercel.app/api/webhook
// Meta (WhatsApp Cloud API) webhook adresi olarak bu URL girilir.

import { getConfig, missingConfig } from '../lib/config.js';
import { verifySignature, parseIncoming } from '../lib/whatsapp.js';
import { handleIncomingMessage } from '../lib/handler.js';

// Meta'nin webhook dogrulamasi (kurulumda bir kez)
export async function GET(request) {
  const cfg = getConfig();
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === cfg.waVerifyToken) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Gelen mesajlar
export async function POST(request) {
  const cfg = getConfig();
  const missing = missingConfig(cfg);
  if (missing.length) {
    console.error('Eksik ortam degiskenleri:', missing.join(', '));
    return new Response('Server not configured', { status: 500 });
  }

  // Vercel AI Gateway icin Vercel'in otomatik verdigi kimlik (anahtar gerekmez)
  cfg.oidcToken = request.headers.get('x-vercel-oidc-token') || cfg.oidcToken;

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), cfg.waAppSecret)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const messages = parseIncoming(body);
  for (const msg of messages) {
    try {
      await handleIncomingMessage(cfg, msg);
    } catch (e) {
      // Hata olsa da 200 donuyoruz; aksi halde Meta ayni mesaji tekrar tekrar gonderir.
      console.error('Mesaj islenemedi', msg.id, e);
    }
  }
  return new Response('OK', { status: 200 });
}
