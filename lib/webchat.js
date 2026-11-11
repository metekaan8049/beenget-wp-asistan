// beengetbookings.com sohbet kutusu: mesaji isler, asistani calistirir, cevabi dondurur.
// Konusmalar WhatsApp ile ayni tablolarda, "web:<oturum>" kimligiyle saklanir.

import {
  saveMessage,
  getHistory,
  getConversation,
  upsertConversation,
  saveReservationRequest,
  countRecentUserMessages,
} from './store.js';
import { runAssistant } from './claude.js';
import { buildSystemPrompt } from './prompt.js';
import { notifyOwner } from './notify.js';

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_MESSAGES_PER_HOUR = 40;

const HUMAN_MODE_REPLY = {
  tr: 'Talebiniz ekibimize iletildi, en kısa sürede sizinle iletişime geçecekler. Acil durumlar için WhatsApp/telefon: +90 531 550 58 48',
  en: 'Your request has been passed to our team; they will contact you shortly. For urgent matters, WhatsApp/phone: +90 531 550 58 48',
};
const ERROR_REPLY = {
  tr: 'Şu an yanıt veremiyorum. Lütfen biraz sonra tekrar deneyin ya da WhatsApp/telefon ile ulaşın: +90 531 550 58 48',
  en: 'I can’t reply right now. Please try again shortly or reach us on WhatsApp/phone: +90 531 550 58 48',
};
const LIMIT_REPLY = {
  tr: 'Çok fazla mesaj gönderildi. Lütfen biraz bekleyin ya da WhatsApp/telefon ile ulaşın: +90 531 550 58 48',
  en: 'Too many messages. Please wait a bit or reach us on WhatsApp/phone: +90 531 550 58 48',
};

const pick = (obj, lang) => (String(lang || '').toLowerCase().startsWith('tr') ? obj.tr : obj.en);

export function isValidSessionId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}

function isHumanModeActive(conv, cfg, now) {
  if (!conv || conv.status !== 'human') return false;
  if (!conv.human_since) return true;
  return (now - new Date(conv.human_since).getTime()) / 36e5 < cfg.humanTimeoutHours;
}

function looksLikeContact(s) {
  const v = String(s || '');
  return /\S+@\S+\.\S+/.test(v) || v.replace(/\D/g, '').length >= 7;
}

/**
 * @param {{sessionId:string, text:string, lang?:string, pageUrl?:string}} input
 * @returns {Promise<{reply:string, status:number}>}
 */
export async function handleWebMessage(cfg, { sessionId, text, lang, pageUrl }, now = Date.now()) {
  const id = `web:${sessionId}`;
  const message = String(text || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) return { status: 400, reply: '' };

  const recent = await countRecentUserMessages(cfg, id, new Date(now - 36e5).toISOString());
  if (recent >= MAX_MESSAGES_PER_HOUR) return { status: 429, reply: pick(LIMIT_REPLY, lang) };

  await saveMessage(cfg, { waId: id, role: 'user', content: message });

  const conv = await getConversation(cfg, id);
  if (isHumanModeActive(conv, cfg, now)) {
    return { status: 200, reply: pick(HUMAN_MODE_REPLY, lang) };
  }
  await upsertConversation(cfg, { wa_id: id, name: conv?.name ?? null, status: 'bot', human_since: null });

  const history = await getHistory(cfg, id, cfg.historyLimit);

  const transcript = () =>
    history
      .slice(-12)
      .map((h) => `${h.role === 'assistant' ? 'Asistan' : 'Müşteri'}: ${h.content}`)
      .join('\n');

  const toolHandlers = {
    create_reservation_request: async (input) => {
      if (!looksLikeContact(input.contact)) {
        return 'Kaydedilmedi: musterinin telefon numarasi veya e-posta adresi eksik. Once bunu iste, sonra tekrar dene.';
      }
      const row = await saveReservationRequest(cfg, {
        wa_id: id,
        channel: 'web',
        contact: input.contact,
        customer_name: input.customer_name,
        pickup_location: input.pickup_location,
        pickup_datetime: input.pickup_datetime,
        return_location: input.return_location || null,
        return_datetime: input.return_datetime,
        car_preference: input.car_preference || null,
        driver_age: Number.isInteger(input.driver_age) ? input.driver_age : null,
        flight_number: input.flight_number || null,
        extras: input.extras || null,
        notes: input.notes || null,
        language: input.language || lang || null,
      });
      await notifyOwner(cfg, `🚗 Web sitesinden rezervasyon talebi — ${input.customer_name}`, [
        `Talep #${row?.id ?? '-'} (web sitesi sohbeti)`,
        `Müşteri: ${input.customer_name}`,
        `İletişim: ${input.contact}`,
        `Alış: ${input.pickup_location} — ${input.pickup_datetime}`,
        `İade: ${input.return_location || input.pickup_location} — ${input.return_datetime}`,
        input.car_preference ? `Araç tercihi: ${input.car_preference}` : null,
        input.driver_age ? `Sürücü yaşı: ${input.driver_age}` : null,
        input.flight_number ? `Uçuş: ${input.flight_number}` : null,
        input.extras ? `Ek ürünler: ${input.extras}` : null,
        input.notes ? `Not: ${input.notes}` : null,
      ].filter(Boolean));
      return `Talep kaydedildi (numara: ${row?.id ?? '-'}). Musteriye talebin alindigini ve ekibin verdigi iletisim bilgisinden musaitlik/fiyat teyidiyle donecegini soyle.`;
    },

    handoff_to_human: async (input) => {
      if (!looksLikeContact(input.contact)) {
        return 'Devredilmedi: once musteriden telefon numarasi veya e-posta adresi iste, sonra tekrar dene.';
      }
      await upsertConversation(cfg, {
        wa_id: id,
        status: 'human',
        human_since: new Date(now).toISOString(),
        handoff_reason: input.reason,
      });
      await notifyOwner(cfg, `🙋 Web sitesinden müşteri sizi bekliyor`, [
        `Neden: ${input.reason}`,
        `İletişim: ${input.contact}`,
        `Özet: ${input.summary}`,
        `Son yazışma:\n${transcript()}`,
      ]);
      return 'Konusma ekibe devredildi. Musteriye ekibin verdigi iletisim bilgisinden en kisa surede donecegini soyle.';
    },
  };

  let reply;
  try {
    ({ reply } = await runAssistant(cfg, {
      system: buildSystemPrompt({ now: new Date(now), channel: 'web', pageUrl }),
      history,
      toolHandlers,
    }));
  } catch (e) {
    console.error('Web asistan hatasi:', e);
    await notifyOwner(cfg, '⚠️ Web sohbet asistanı hata verdi', [`Mesaj: ${message}`, `Hata: ${e.message}`]);
    return { status: 200, reply: pick(ERROR_REPLY, lang) };
  }

  if (!reply) reply = pick(ERROR_REPLY, lang);
  await saveMessage(cfg, { waId: id, role: 'assistant', content: reply });
  return { status: 200, reply };
}
