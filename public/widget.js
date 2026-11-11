/*!
 * Beenget sohbet asistani — web sitesine eklemek icin:
 * <script src="https://beenget-wp-asistan.vercel.app/widget.js" defer></script>
 */
(function () {
  if (window.__beengetChatLoaded) return;
  window.__beengetChatLoaded = true;

  var script = document.currentScript;
  var API = (script && script.src ? new URL(script.src).origin : 'https://beenget-wp-asistan.vercel.app') + '/api/chat';
  var WHATSAPP = 'https://wa.me/905315505848';
  var lang = (navigator.language || 'tr').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en';

  var T = {
    tr: {
      title: 'Beenget Asistan',
      subtitle: '7/24 çevrimiçi · Araç kiralama yardımı',
      greeting: 'Merhaba! 👋 Ben Beenget asistanıyım. Araç seçimi, fiyat talebi, teslimat veya kiralama şartları hakkında size yardımcı olabilirim. Nasıl yardımcı olabilirim?',
      placeholder: 'Mesajınızı yazın…',
      send: 'Gönder',
      error: 'Bağlantı sorunu oluştu. Lütfen tekrar deneyin ya da WhatsApp’tan yazın.',
      note: 'Yapay zekâ asistanı · Kart bilgisi paylaşmayın',
      whatsapp: 'WhatsApp',
      open: 'Sohbeti aç',
      close: 'Kapat',
      chips: ['Araç kiralamak istiyorum', 'Gerekli belgeler neler?', 'Havalimanı teslimatı var mı?'],
    },
    en: {
      title: 'Beenget Assistant',
      subtitle: 'Online 24/7 · Car rental help',
      greeting: 'Hi! 👋 I’m the Beenget assistant. I can help with choosing a car, price requests, delivery and rental terms. How can I help?',
      placeholder: 'Type your message…',
      send: 'Send',
      error: 'Connection problem. Please try again or message us on WhatsApp.',
      note: 'AI assistant · Don’t share card details',
      whatsapp: 'WhatsApp',
      open: 'Open chat',
      close: 'Close',
      chips: ['I want to rent a car', 'Which documents do I need?', 'Do you deliver to the airport?'],
    },
  }[lang];

  function store(kind) {
    try {
      var s = window[kind];
      s.setItem('__bg_t', '1');
      s.removeItem('__bg_t');
      return s;
    } catch (e) {
      return null;
    }
  }
  var ls = store('localStorage');
  var ss = store('sessionStorage');

  function newId() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var sessionId = (ls && ls.getItem('beenget_chat_sid')) || newId();
  if (ls) ls.setItem('beenget_chat_sid', sessionId);

  var history = [];
  try { history = JSON.parse((ss && ss.getItem('beenget_chat_log')) || '[]'); } catch (e) { history = []; }
  function saveLog() {
    try { if (ss) ss.setItem('beenget_chat_log', JSON.stringify(history.slice(-40))); } catch (e) {}
  }

  var host = document.createElement('div');
  host.id = 'beenget-chat';
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;right:0;';
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    '.fab{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:#021444;color:#00e0d0;box-shadow:0 8px 24px rgba(2,20,68,.35);display:flex;align-items:center;justify-content:center;transition:transform .2s}' +
    '.fab:hover{transform:scale(1.06)}' +
    '.fab svg{width:28px;height:28px}' +
    '.badge{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:#00e0d0;border:2px solid #fff}' +
    '.panel{position:fixed;right:20px;bottom:92px;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(2,20,68,.28);display:none;flex-direction:column;overflow:hidden}' +
    '.panel.open{display:flex}' +
    '.head{background:#021444;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}' +
    '.logo{width:36px;height:36px;border-radius:50%;background:#00e0d0;color:#021444;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:18px}' +
    '.ht{flex:1;min-width:0}.ht b{display:block;font-size:15px}.ht span{font-size:12px;color:#9fe9e3}' +
    '.x{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:4px}' +
    '.msgs{flex:1;overflow-y:auto;padding:14px;background:#f4f6fb;display:flex;flex-direction:column;gap:8px}' +
    '.m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}' +
    '.m a{color:inherit;text-decoration:underline}' +
    '.bot{background:#fff;color:#14203d;border:1px solid #e3e7f0;align-self:flex-start;border-bottom-left-radius:4px}' +
    '.me{background:#021444;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}' +
    '.typing{align-self:flex-start;background:#fff;border:1px solid #e3e7f0;border-radius:14px;padding:10px 14px;display:none}' +
    '.typing i{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#8a94ad;animation:b 1s infinite}' +
    '.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}' +
    '@keyframes b{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}' +
    '.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px;background:#f4f6fb}' +
    '.chip{border:1px solid #00b8aa;color:#021444;background:#fff;border-radius:999px;padding:6px 10px;font-size:12.5px;cursor:pointer}' +
    '.chip:hover{background:#e6fbf9}' +
    'form{display:flex;gap:8px;padding:10px;border-top:1px solid #e3e7f0;background:#fff}' +
    'textarea{flex:1;resize:none;border:1px solid #d5dbe8;border-radius:10px;padding:9px 10px;font-size:14px;height:40px;max-height:110px;outline:none;color:#14203d}' +
    'textarea:focus{border-color:#00b8aa}' +
    '.send{background:#00e0d0;color:#021444;border:0;border-radius:10px;padding:0 14px;font-weight:700;cursor:pointer;font-size:14px}' +
    '.send:disabled{opacity:.5;cursor:default}' +
    '.foot{display:flex;justify-content:space-between;align-items:center;padding:6px 12px 9px;font-size:11px;color:#8a94ad;background:#fff}' +
    '.foot a{color:#0a8f5a;text-decoration:none;font-weight:600}' +
    '.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
    '@media (max-width:480px){.panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0}.fab{right:16px;bottom:16px}}' +
    '</style>' +
    '<button class="fab" aria-label="' + T.open + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg><span class="badge"></span></button>' +
    '<div class="panel" role="dialog" aria-label="' + T.title + '">' +
    '<div class="head"><div class="logo">b</div><div class="ht"><b>' + T.title + '</b><span>' + T.subtitle + '</span></div><button class="x" aria-label="' + T.close + '">×</button></div>' +
    '<div class="msgs"><div class="typing"><i></i><i></i><i></i></div></div>' +
    '<div class="chips"></div>' +
    '<form><input class="hp" name="website" tabindex="-1" autocomplete="off"><textarea rows="1" placeholder="' + T.placeholder + '" maxlength="1000"></textarea><button class="send" type="submit">' + T.send + '</button></form>' +
    '<div class="foot"><span>' + T.note + '</span><a href="' + WHATSAPP + '" target="_blank" rel="noopener">' + T.whatsapp + ' →</a></div>' +
    '</div>';

  var $ = function (s) { return root.querySelector(s); };
  var fab = $('.fab'), panel = $('.panel'), msgs = $('.msgs'), typing = $('.typing');
  var form = $('form'), input = $('textarea'), sendBtn = $('.send'), chips = $('.chips'), hp = $('.hp');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function linkify(s) {
    return esc(s)
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])((?:www\.)?beengetbookings\.com[^\s<]*)/gi, function (m, p, u) {
        return p + '<a href="https://' + u.replace(/^https?:\/\//, '') + '" target="_blank" rel="noopener">' + u + '</a>';
      });
  }
  function add(role, text, persist) {
    var d = document.createElement('div');
    d.className = 'm ' + (role === 'user' ? 'me' : 'bot');
    d.innerHTML = linkify(text);
    msgs.insertBefore(d, typing);
    msgs.scrollTop = msgs.scrollHeight;
    if (persist !== false) { history.push({ r: role, t: text }); saveLog(); }
  }
  function renderChips() {
    chips.innerHTML = '';
    if (history.some(function (h) { return h.r === 'user'; })) return;
    T.chips.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = c;
      b.onclick = function () { send(c); };
      chips.appendChild(b);
    });
  }

  if (history.length) history.forEach(function (h) { add(h.r, h.t, false); });
  else add('bot', T.greeting);
  renderChips();

  function setOpen(o) {
    panel.classList.toggle('open', o);
    var badge = $('.badge'); if (badge) badge.remove();
    if (o) setTimeout(function () { input.focus(); msgs.scrollTop = msgs.scrollHeight; }, 50);
  }
  fab.onclick = function () { setOpen(!panel.classList.contains('open')); };
  $('.x').onclick = function () { setOpen(false); };

  var busy = false;
  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    add('user', text);
    chips.innerHTML = '';
    input.value = ''; input.style.height = '40px';
    typing.style.display = 'block';
    msgs.scrollTop = msgs.scrollHeight;

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 60000);
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, message: text, lang: navigator.language || lang, pageUrl: location.href, website: hp.value }),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { add('bot', d && d.reply ? d.reply : T.error); })
      .catch(function () { add('bot', T.error); })
      .then(function () {
        clearTimeout(timer);
        typing.style.display = 'none';
        busy = false; sendBtn.disabled = false;
        input.focus();
      });
  }

  form.onsubmit = function (e) { e.preventDefault(); send(input.value); };
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', function () {
    input.style.height = '40px';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  });
})();
