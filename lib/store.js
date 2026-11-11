// Supabase REST (PostgREST) uzerinden veritabani islemleri. Ek paket gerektirmez.

async function sb(cfg, path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: cfg.supabaseKey,
    Authorization: `Bearer ${cfg.supabaseKey}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res;
}

async function ok(res, what) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${what} ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Mesaji kaydeder. Ayni WhatsApp mesaj ID'si daha once islendiyse false doner
// (Meta ayni webhook'u tekrar gonderebilir).
export async function saveMessage(cfg, { waId, role, content, waMessageId = null }) {
  const res = await sb(cfg, 'wa_messages', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { wa_id: waId, role, content, wa_message_id: waMessageId },
  });
  if (res.status === 409) return false;
  await ok(res, 'saveMessage');
  return true;
}

export async function getHistory(cfg, waId, limit) {
  const res = await sb(
    cfg,
    `wa_messages?wa_id=eq.${encodeURIComponent(waId)}&role=in.(user,assistant)&select=role,content&order=created_at.desc,id.desc&limit=${limit}`,
  );
  const rows = (await ok(res, 'getHistory')) ?? [];
  return rows.reverse();
}

export async function getConversation(cfg, waId) {
  const res = await sb(cfg, `wa_conversations?wa_id=eq.${encodeURIComponent(waId)}&select=*`);
  const rows = (await ok(res, 'getConversation')) ?? [];
  return rows[0] ?? null;
}

export async function upsertConversation(cfg, row) {
  const res = await sb(cfg, 'wa_conversations?on_conflict=wa_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: { ...row, updated_at: new Date().toISOString() },
  });
  await ok(res, 'upsertConversation');
}

export async function listHumanConversations(cfg) {
  const res = await sb(
    cfg,
    'wa_conversations?status=eq.human&select=wa_id,name,human_since,handoff_reason&order=human_since.desc&limit=20',
  );
  return (await ok(res, 'listHumanConversations')) ?? [];
}

export async function countRecentUserMessages(cfg, waId, sinceIso) {
  const res = await sb(
    cfg,
    `wa_messages?wa_id=eq.${encodeURIComponent(waId)}&role=eq.user&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
  );
  const rows = (await ok(res, 'countRecentUserMessages')) ?? [];
  return rows.length;
}

export async function saveReservationRequest(cfg, row) {
  const res = await sb(cfg, 'wa_reservation_requests', {
    method: 'POST',
    prefer: 'return=representation',
    body: row,
  });
  const rows = await ok(res, 'saveReservationRequest');
  return rows?.[0] ?? null;
}
