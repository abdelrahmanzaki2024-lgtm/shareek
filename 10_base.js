/* ============================================================
   واجهة «شريك الدفاع» — الأساسيات: الحالة، الاتصال بالخادم، مكوّنات مشتركة
   ============================================================ */
(function () {
  'use strict';
  var W = window;
  var ST = W.__STATIC || {};                 // يُحقن وقت البناء: الرتب وأنواع الرسائل وصور الهوية
  var IMG = W.__IMG || {};

  /* ---------- أدوات ---------- */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function arDigits(s) { return String(s).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; }); }
  var TZ = 'Africa/Cairo';
  function fdate(ts) { try { return new Date(ts).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: TZ, day: 'numeric', month: 'short' }); } catch (e) { return ''; } }
  function ftime(ts) { try { return new Date(ts).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function fdt(ts) { return fdate(ts) + ' · ' + ftime(ts); }
  function ago(ts) {
    var m = Math.max(0, Math.round((nowMs() - ts) / 60000));
    if (m < 1) return 'دلوقتي';
    if (m < 60) return 'من ' + m + ' دقيقة';
    var h = Math.round(m / 60); if (h < 24) return 'من ' + h + ' ساعة';
    var d = Math.round(h / 24); return d === 1 ? 'من أمس' : 'من ' + d + ' يوم';
  }
  function nowMs() { return W.__NOW ? W.__NOW() : Date.now(); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { if (v === null) delete mem[k]; else mem[k] = v; } }
  var mem = {};

  /* علامة + قبل الرقم داخل نص عربي تنعكس بصريًا؛ نعزلها لتبقى +10 */
  function fx(html) { return String(html).replace(/(^|[>\s(\u0600-\u06FF])\+(\d[\d,.]*)/g, '$1\u2066+$2\u2069'); }

  /* ---------- أيقونات واجهة (خطية) ---------- */
  var IC = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="16" cy="11" r="1"/><circle cx="18.5" cy="14" r="1"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>',
    back: '<path d="M9 5l7 7-7 7"/>', fwd: '<path d="M15 5l-7 7 7 7"/>', down: '<path d="M6 9l6 6 6-6"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-4M14 18v2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    truck: '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    gift: '<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8c-2-4-6-3-5 0 .5 1.5 3 1 5 0zm0 0c2-4 6-3 5 0-.5 1.5-3 1-5 0z"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    out: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
    cam: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>', edit: '<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', up: '<path d="M6 15l6-6 6 6"/>', flat: '<path d="M5 12h14"/>',
    speaker: '<path d="M3 10v4h4l6 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'
  };
  function ic(name, cls) { return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>'; }

  /* ---------- الحالة ---------- */
  var S = {
    role: '', tok: '', me: null, home: null, content: null, tab: 'today', sub: null,
    staff: null, stab: 'gate', loading: false, tickets: null, rewards: null
  };

  /* ---------- الاتصال بالخادم ---------- */
  /* القراءات فقط تُعاد بعد تعثّر الشبكة أو خطأ 5xx/429، بتأخير يتزايد (لا تُعاد الكتابات حتى لا تتكرر) */
  var RETRY_OK = { sMe: 1, sFleet: 1, sTrack: 1, sNotes: 1, sStats: 1, sTraders: 1, sTraderGet: 1, sMarketGet: 1, sTeamList: 1, sGate: 1, sInbox: 1, sTicket: 1, sRewards: 1, sFind: 1, sReport: 1, sResetPreview: 1, routeGet: 1, routePing: 1 };
  function waitMs(n) { return new Promise(function (res) { setTimeout(res, 700 * n * n); }); }
  /* رسائل الشبكة مفصولة: «مفيش إنترنت» تظهر فعلًا لما الجهاز أوفلاين، ورسالة الخادم لما الجهاز أونلاين والطلب مش واصل */
  var NET_OFFLINE = 'مفيش إنترنت دلوقتي. اتأكد من الشبكة وجرّب تاني';
  var NET_SERVER = 'الإنترنت شغال، لكن الخادم مش بيرد على المتصفح ده. كلّم المسؤول عن التطبيق يتأكد إن نشر الخادم متاح لـ«أي حد» وإنه آخر نسخة';
  var BAD_RESP = 'الخادم رد برد مش مفهوم. غالبًا محتاج إعادة نشر، كلّم المسؤول عن التطبيق';
  var GAS_FRAME = 'الصفحة دي مقدرتش توصل للخادم. افتح رابط التطبيق الجديد من Chrome أو Safari (مش من داخل واتساب)، وجرّب تاني';
  function netMsg() { return (typeof navigator !== 'undefined' && navigator.onLine === false) ? NET_OFFLINE : NET_SERVER; }
  function httpCall(action, pj, n) {
    var retryable = !!RETRY_OK[action] && n < 3;
    return fetch(String(W.__API_URL), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, token: S.tok, payload: pj }) })
      .then(function (r) {
        if (retryable && (r.status === 429 || r.status >= 500)) return { __retry: true };
        return r.text().then(function (t) {
          try { return JSON.parse(t); } catch (e) { return { __bad: true }; }
        });
      })
      .then(function (r) {
        if (r && r.__retry) return waitMs(n).then(function () { return httpCall(action, pj, n + 1); });
        if (r && r.__bad) return { ok: false, err: 'badresp', msg: BAD_RESP };
        return r;
      }, function (e) {
        if (retryable) return waitMs(n).then(function () { return httpCall(action, pj, n + 1); });
        throw e;
      });
  }
  function rawCall(action, payload) {
    return new Promise(function (resolve) {
      var pj = JSON.stringify(payload || {});
      if (W.google && W.google.script && W.google.script.run) {
        /* النسخة الداخلية (داخل إطار Apps Script): فشل الاتصال غالبًا من إعدادات المتصفح أو من رابط قديم، لا من الإنترنت نفسه */
        var gasMsg = function () { return (typeof navigator !== 'undefined' && navigator.onLine === false) ? NET_OFFLINE : GAS_FRAME; };
        try {
          W.google.script.run
            .withSuccessHandler(function (r) { resolve(r || { ok: false, err: 'server', msg: 'رد فارغ من الخادم' }); })
            .withFailureHandler(function (e) { resolve({ ok: false, err: 'net', msg: gasMsg() }); })
            .api(S.tok, action, pj);
        } catch (e) { resolve({ ok: false, err: 'net', msg: gasMsg() }); }
      } else if (W.__API_URL && /^https:\/\//.test(String(W.__API_URL))) {
        /* النسخة المستضافة (GitHub Pages): طلب POST بنص خام لتفادي preflight. القراءات فقط تُعاد عند تعثّر الشبكة */
        httpCall(action, pj, 1)
          .then(function (r) { resolve(r || { ok: false, err: 'server', msg: 'رد فارغ من الخادم' }); })
          .catch(function () { resolve({ ok: false, err: 'net', msg: netMsg() }); });
      } else if (W.__DEMO_API) {
        setTimeout(function () { resolve(W.__DEMO_API(S.tok, action, pj)); }, 60);
      } else {
        resolve({ ok: false, err: 'net', msg: 'الخدمة غير متاحة' });
      }
    });
  }
  /* يرجع data عند النجاح، ويعرض رسالة الخطأ ويرجع null عند الفشل */
  function call(action, payload, opts) {
    opts = opts || {};
    return rawCall(action, payload).then(function (r) {
      if (r && r.ok) return r.data;
      if (r && (r.err === 'auth')) { if (!opts.quiet) toast(r.msg || 'سجّل دخولك من جديد'); logout(true); return null; }
      if (!opts.quiet) toast((r && r.msg) || 'حصل خطأ، جرّب تاني', 'err');
      if (opts.keepErr) return { __err: r };
      return null;
    });
  }

  /* ---------- مكوّنات ---------- */
  var toastT = null;
  function toast(msg, kind) {
    var box = $('#toast'); if (!box) return;
    var d = document.createElement('div'); d.className = kind === 'ok' ? 'ok' : ''; d.textContent = msg;
    box.appendChild(d); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3600);
  }
  function popPts(n, label) {
    if (!n) return;
    var d = document.createElement('div'); d.className = 'pop'; d.textContent = '\u2066+' + n + '\u2069' + (label ? ' ' + label : '');
    document.body.appendChild(d); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1400);
  }
  function confetti() {
    if (W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('div'), colors = ['#EA2329', '#242424', '#2E9E5B', '#F2A900', '#fff']; c.className = 'conf';
    var html = ''; for (var i = 0; i < 46; i++) html += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + colors[i % 5] + ';animation-delay:' + (Math.random() * .5).toFixed(2) + 's;transform:rotate(' + Math.round(Math.random() * 90) + 'deg)"></i>';
    c.innerHTML = html; document.body.appendChild(c); setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 2800);
  }
  function sheet(html, onClose) {
    closeSheet();
    var o = document.createElement('div'); o.className = 'ovl'; o.id = 'ovl';
    o.innerHTML = fx('<div class="sheet" role="dialog"><div class="grab"></div>' + html + '</div>');
    o.addEventListener('click', function (e) { if (e.target === o) closeSheet(); });
    document.body.appendChild(o); document.body.style.overflow = 'hidden';
    o._onClose = onClose; return o;
  }
  function closeSheet() {
    var o = $('#ovl'); if (!o) return;
    if (o._onClose) try { o._onClose(); } catch (e) { /* ignore */ }
    o.parentNode.removeChild(o); document.body.style.overflow = '';
  }
  function copyText(t) {
    function done() { toast('تم النسخ', 'ok'); }
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, fallback); return; } } catch (e) { /* ignore */ }
    fallback();
    function fallback() { var a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('انسخ يدويًا: ' + t); } document.body.removeChild(a); }
  }
  function loading() { return '<div class="col"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>'; }
  function bar(p, cls) { return '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, Math.round(p))) + '%"></i></div>'; }
  function rankBadge(n, size) {
    var cols = ['#9A9A9E', '#242424', '#B81E25', '#EA2329', '#EA2329', '#B81E25', '#242424'];
    var c = cols[n] || '#242424';
    return '<div class="rankb" style="' + (size ? 'width:' + size + 'px;height:' + Math.round(size * 1.13) + 'px' : '') + '"><svg viewBox="0 0 46 52"><path d="M23 2l19 7v15c0 12-8 20-19 26C12 44 4 36 4 24V9z" fill="' + c + '"/><path d="M23 2l19 7v15c0 12-8 20-19 26" fill="rgba(255,255,255,.12)"/></svg><b>' + n + '</b></div>';
  }
  function img(name, cls, alt) { return IMG[name] ? '<img class="' + (cls || '') + '" src="' + IMG[name] + '" alt="' + esc(alt || '') + '">' : ''; }

  W.APP = {
    fx: fx, S: S, ST: ST, IMG: IMG, esc: esc, $: $, $$: $$, num: num, arDigits: arDigits, fdate: fdate, ftime: ftime, fdt: fdt, ago: ago, nowMs: nowMs, firstName: firstName,
    lsGet: lsGet, lsSet: lsSet, ic: ic, call: call, rawCall: rawCall, toast: toast, popPts: popPts, confetti: confetti, sheet: sheet, closeSheet: closeSheet,
    copyText: copyText, loading: loading, bar: bar, rankBadge: rankBadge, img: img, handlers: {}, screens: {}
  };

  /* خروج: يمسح الجلسة ويعود لشاشة الدخول */
  function logout(silent) {
    S.tok = ''; S.role = ''; S.me = null; S.home = null; S.content = null; S.staff = null; S.tickets = null; S.rewards = null; S.sub = null; S.tab = 'today'; S.stab = 'gate';
    S.round = null; S.mz = null; S.visits = null; S.market = null; S.marketTs = 0; S.seg = {}; S.annShown = false;   /* لا نُبقي بيانات المستخدم السابق على نفس الجهاز */
    S.sme = null; S.sinbox = null; S.sstats = null; S.srw = null; S.str = null; S.smarket = null; S.ssub = null; S.sfilter = '';
    if (W.APP.secClear) W.APP.secClear('c3a_tok'); lsSet('c3a_role', null);
    closeSheet();
    if (W.APP.fleetReset) W.APP.fleetReset();   /* حالة الأسطول (الخريطة والتنبيهات والصلاحيات) تخص الجلسة السابقة */
    if (W.APP.render) W.APP.render();
  }
  W.APP.logout = logout;

  /* تبليغ الأخطاء: لا يُرسل أكثر من خطأ كل 4 ثوانٍ، ولا يحمل إلا نصًا مقصوصًا. الفشل في الإبلاغ نفسه لا يوقف التطبيق */
  var lastErrT = 0;
  function reportErr(e, where) {
    var t = Date.now();
    if (t - lastErrT < 4000) return false;
    lastErrT = t;
    try {
      var msg = String((e && (e.message || e.stack)) || e || 'unknown').substring(0, 300);
      rawCall('clientError', { msg: msg, where: String(where || '').substring(0, 60) });
    } catch (x) { /* ignore */ }
    return true;
  }
  W.APP.reportErr = reportErr;
  W.addEventListener('error', function (ev) { if (reportErr(ev.error || ev.message, 'window')) toast('حصلت مشكلة بسيطة، التطبيق لسه شغال', 'err'); });
  W.addEventListener('unhandledrejection', function (ev) { reportErr(ev.reason, 'promise'); });
})();
