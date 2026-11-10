import { sendText, markRead } from './whatsapp.js';
import {
  saveMessage,
  getHistory,
  getConversation,
  upsertConversation,
  listHumanConversations,
  saveReservationRequest,
} from './store.js';
import { runAssistant } from './claude.js';
import { buildSystemPrompt } from './prompt.js';
import { notifyOwner, waLink } from './notify.js';

const UNSUPPORTED_REPLY =
  'Şu an yalnızca yazılı mesajları okuyabiliyorum, sorunuzu yazarak iletebilir misiniz? 🙏\n' +
  'I can only read text messages at the moment — could you please type your question?';

const ERROR_REPLY =
  'Mesajınızı aldık, ekibimiz en kısa sürede size dönüş yapacak. 🙏\n' +
  'We received your message, our team will get back to you shortly.';

const OWNER_HELP = [
  'Beenget asistan komutları:',
  '#durum — ekibe devredilmiş konuşmaları listeler',
  '#devral 905XXXXXXXXX — bu müşteride botu durdurur (siz cevaplarsınız)',
  '#bot 905XXXXXXXXX — bu müşteride botu tekrar açar',
  '#gonder 905XXXXXXXXX mesaj — müşteriye Beenget numarasından mesaj gönderir',
].join('\n');

function isHumanModeActive(conv, cfg, now) {
  if (!conv || conv.status !== 'human') return false;
  if (!conv.human_since) return true;
  const hours = (now - new Date(conv.human_since).getTime()) / 36e5;
  return hours < cfg.humanTimeoutHours;
}

async function tryWhatsAppOwner(cfg, text) {
  if (!cfg.ownerWaId) return;
  try {
    await sendText(cfg, cfg.ownerWaId, text);
  } catch (e) {
    // 24 saat kurali: sahip son 24 saatte numaraya yazmadiysa serbest mesaj gitmez. E-posta yeterli.
    console.warn('Sahibe WhatsApp bildirimi gitmedi:', e.message);
  }
}

// ---- Isletme sahibi komutlari ----
export async function handleOwnerCommand(cfg, text) {
  const [cmdRaw, target, ...rest] = text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const id = (target ?? '').replace(/\D/g, '');
  const reply = (t) => sendText(cfg, cfg.ownerWaId, t);

  if (cmd === '#durum') {
    const list = await listHumanConversations(cfg);
    if (!list.length) return reply('Ekibe devredilmiş açık konuşma yok. ✅');
    return reply(
      'Ekipte bekleyen konuşmalar:\n' +
        list.map((c) => `• ${c.name ?? '-'} — ${c.wa_id}${c.handoff_reason ? ` (${c.handoff_reason})` : ''}`).join('\n'),
    );
  }
  if (cmd === '#bot' && id) {
    await upsertConversation(cfg, { wa_id: id, status: 'bot', human_since: null, handoff_reason: null });
    return reply(`${id} için bot tekrar açıldı. 🤖`);
  }
  if (cmd === '#devral' && id) {
    await upsertConversation(cfg, {
      wa_id: id,
      status: 'human',
      human_since: new Date().toISOString(),
      handoff_reason: 'Sahip devraldı',
    });
    return reply(`${id} konuşmasını devraldınız, bot bu müşteriye ${cfg.humanTimeoutHours} saat cevap vermeyecek.`);
  }
  if (cmd === '#gonder' && id && rest.length) {
    const msg = rest.join(' ');
    await sendText(cfg, id, msg);
    await saveMessage(cfg, { waId: id, role: 'assistant', content: msg });
    await upsertConversation(cfg, {
      wa_id: id,
      status: 'human',
      human_since: new Date().toISOString(),
      handoff_reason: 'Sahip cevapladı',
    });
    return reply(`Mesaj ${id} numarasına gönderildi. ✉️`);
  }
  return reply(OWNER_HELP);
}

// ---- Tek bir gelen mesaji isler ----
export async function handleIncomingMessage(cfg, msg, now = Date.now()) {
  const waId = msg.from;

  // Sahip komutlari (# ile baslayan)
  if (cfg.ownerWaId && waId === cfg.ownerWaId && msg.text && msg.text.trim().startsWith('#')) {
    const fresh = await saveMessage(cfg, { waId, role: 'owner_command', content: msg.text, waMessageId: msg.id });
    if (!fresh) return { action: 'duplicate' };
    await handleOwnerCommand(cfg, msg.text);
    return { action: 'owner_command' };
  }

  // Tekrar gelen webhook'lari ele
  const isNew = await saveMessage(cfg, {
    waId,
    role: 'user',
    content: msg.text ?? `[${msg.type} mesajı]`,
    waMessageId: msg.id,
  });
  if (!isNew) return { action: 'duplicate' };

  await markRead(cfg, msg.id);

  const conv = await getConversation(cfg, waId);
  if (isHumanModeActive(conv, cfg, now)) {
    await upsertConversation(cfg, { wa_id: waId, name: msg.name ?? conv?.name ?? null });
    return { action: 'human_mode' };
  }

  await upsertConversation(cfg, {
    wa_id: waId,
    name: msg.name ?? conv?.name ?? null,
    status: 'bot',
    human_since: null,
  });

  if (msg.text === null) {
    await sendText(cfg, waId, UNSUPPORTED_REPLY);
    await saveMessage(cfg, { waId, role: 'assistant', content: UNSUPPORTED_REPLY });
    return { action: 'unsupported' };
  }

  const history = await getHistory(cfg, waId, cfg.historyLimit);
  const customerName = msg.name ?? conv?.name ?? null;

  const toolHandlers = {
    create_reservation_request: async (input) => {
      const row = await saveReservationRequest(cfg, {
        wa_id: waId,
        whatsapp_name: customerName,
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
        language: input.language || null,
      });
      const lines = [
        `Yeni rezervasyon talebi #${row?.id ?? '-'}`,
        `Müşteri: ${input.customer_name} (WhatsApp: +${waId})`,
        `Alış: ${input.pickup_location} — ${input.pickup_datetime}`,
        `İade: ${input.return_location || input.pickup_location} — ${input.return_datetime}`,
        input.car_preference ? `Araç tercihi: ${input.car_preference}` : null,
        input.driver_age ? `Sürücü yaşı: ${input.driver_age}` : null,
        input.flight_number ? `Uçuş: ${input.flight_number}` : null,
        input.extras ? `Ek ürünler: ${input.extras}` : null,
        input.notes ? `Not: ${input.notes}` : null,
        `Müşteriye yaz: ${waLink(waId)}`,
      ].filter(Boolean);
      await notifyOwner(cfg, `🚗 Yeni rezervasyon talebi — ${input.customer_name}`, lines);
      await tryWhatsAppOwner(cfg, lines.join('\n'));
      return `Talep kaydedildi (numara: ${row?.id ?? '-'}). Musteriye talebin alindigini ve ekibin musaitlik/fiyat teyidiyle donecegini soyle.`;
    },

    handoff_to_human: async (input) => {
      await upsertConversation(cfg, {
        wa_id: waId,
        status: 'human',
        human_since: new Date(now).toISOString(),
        handoff_reason: input.reason,
      });
      const lines = [
        `Müşteri ekibe devredildi: ${customerName ?? '-'} (+${waId})`,
        `Neden: ${input.reason}`,
        `Özet: ${input.summary}`,
        `Müşteriye yaz: ${waLink(waId)}`,
        `Botu tekrar açmak için bu numaraya WhatsApp'tan "#bot ${waId}" yazın.`,
      ];
      await notifyOwner(cfg, `🙋 Müşteri sizi bekliyor — ${customerName ?? waId}`, lines);
      await tryWhatsAppOwner(cfg, lines.join('\n'));
      return 'Konusma ekibe devredildi. Musteriye ekibin en kisa surede donecegini soyle; baska soru sorma.';
    },
  };

  let reply;
  let toolsUsed = [];
  try {
    ({ reply, toolsUsed } = await runAssistant(cfg, {
      system: buildSystemPrompt({ customerName, now: new Date(now) }),
      history,
      toolHandlers,
    }));
  } catch (e) {
    console.error('Asistan hatasi:', e);
    reply = ERROR_REPLY;
    await notifyOwner(cfg, '⚠️ WhatsApp asistanı hata verdi', [
      `Müşteri: ${customerName ?? '-'} (+${waId})`,
      `Mesaj: ${msg.text}`,
      `Hata: ${e.message}`,
      `Müşteriye yaz: ${waLink(waId)}`,
    ]);
  }

  if (!reply) reply = ERROR_REPLY;
  await sendText(cfg, waId, reply);
  await saveMessage(cfg, { waId, role: 'assistant', content: reply });
  return { action: 'replied', reply, toolsUsed };
}
