// Resend ile isletme sahibine e-posta bildirimi. RESEND_API_KEY veya NOTIFY_TO yoksa sessizce atlar.

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export async function notifyOwner(cfg, subject, lines) {
  if (!cfg.resendKey || !cfg.notifyTo) return false;
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') +
    '</div>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.notifyFrom,
        to: cfg.notifyTo.split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        html,
        text: lines.join('\n'),
      }),
    });
    if (!res.ok) console.warn('Resend hatasi', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.warn('Resend gonderilemedi:', e.message);
    return false;
  }
}

export function waLink(waId) {
  return `https://wa.me/${waId}`;
}
