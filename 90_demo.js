/* ============================================================
   نسخة العرض التجريبية: خادم وهمي داخل المتصفح (نفس منطق الخادم الحقيقي)
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, C = window.C3A, esc = A.esc, ic = A.ic, S = A.S;
  window.__DEMO = true;
  var KEY = 'c3a_demo_v2', OFF_KEY = 'c3a_demo_off';
  var offset = 0, mails = [], store, svc, saveT = null;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  offset = Number(lsGet(OFF_KEY)) || 0;
  window.__NOW = function () { return Date.now() + offset; };

  var env = {
    now: window.__NOW, secret: function () { return 'demo-secret-not-for-production'; },
    randHex: function (n) { var a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a); var s = ''; for (var i = 0; i < n; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; },
    notify: function (to, subject, body) { mails.push({ ts: window.__NOW(), to: to.length, subject: subject, body: body }); return true; },
    onError: function (e) { if (window.console) console.error(e); }
  };
  function persist(tables) {
    if (saveT) return;
    saveT = setTimeout(function () { saveT = null; try { lsSet(KEY, JSON.stringify({ t: tables, mails: mails.slice(-30) })); } catch (e) { /* ignore */ } }, 400);
  }
  function build(fresh) {
    var saved = null;
    if (!fresh) { try { saved = JSON.parse(lsGet(KEY) || 'null'); } catch (e) { saved = null; } }
    if (saved && saved.t && saved.t.Traders) { store = C.createMemoryStore(saved.t, persist); mails = saved.mails || []; }
    else {
      store = C.createMemoryStore({}, null); C.seedDemo(store, env);
      /* بعد البذر نربط الحفظ */
      var tables = store.tables; store = C.createMemoryStore(tables, persist);
      /* نجعل كل الموظفين لهم بريد وهمي ليظهر أثر الإشعارات في لوحة العرض */
      store.all('Staff').forEach(function (s) { store.update('Staff', s.id, { email: s.id.toLowerCase() + '@demo.invalid' }); });
      persist(tables);
    }
    svc = C.createService(store, env);
  }
  build(false);
  window.__DEMO_API = function (tok, action, pj) { var r = svc.api(tok, action, pj); if (r && r.ok && action === 'home') r.data.appUrl = location.href.split('?')[0].split('#')[0]; return r; };

  /* دخول سريع على شاشة الدخول (للعرض فقط) */
  A.demoAuth = function () {
    return '<div class="demo-badge">نسخة تجريبية — كل البيانات وهمية. اضغط حسابًا للدخول السريع:</div><div class="demo-chips">' +
      [['01100000001', 'تاجر · شريك منتظم'], ['01100000002', 'تاجر · جديد'], ['01100000003', 'تاجر · موثوق'], ['01100000004', 'تاجر · بداية']].map(function (x) { return '<button class="chip dk" data-act="quick" data-p="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
      [['01000000001', 'معاون مزرعة 5'], ['01000000003', 'مشرف'], ['01000000004', 'مدير']].map(function (x) { return '<button class="chip" data-act="quickstaff" data-p="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  };
  var H0 = A.handlers;
  H0.quick = function (el) { A.call('login', { phone: el.dataset.p, pin: '1234' }).then(function (d) { if (d) A.enter(d, 'trader'); }); };
  H0.quickstaff = function (el) { A.call('staffLogin', { phone: el.dataset.p, pin: '1234' }).then(function (d) { if (d) A.enter(d, 'staff'); }); };

  /* ---------- لوحة العرض ---------- */
  A.demoFab = function () { return '<button class="demo-fab" data-act="demo_open">' + ic('bell', 'sm') + 'لوحة العرض</button>'; };
  function panel() {
    var days = Math.round(offset / 86400000);
    var ml = mails.slice(-6).reverse().map(function (m) { return '<div class="sm" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>' + esc(m.subject) + '</b><div class="mut xs">' + esc(m.body) + '</div></div>'; }).join('') || '<div class="mut sm">لسه مفيش إشعارات. ابعت رسالة من حساب تاجر وهتظهر هنا.</div>';
    A.sheet('<h2>لوحة العرض</h2><div class="demo-badge" style="margin-bottom:10px">نسخة تجريبية: البيانات وهمية وبتتحفظ على جهازك بس.</div><div class="sec-t">انتقال سريع بين الأدوار</div><div class="demo-chips" style="margin:8px 0 12px">' +
      [['01100000001', 'تاجر · شريك منتظم'], ['01100000002', 'تاجر · جديد'], ['01100000003', 'تاجر · موثوق'], ['01100000004', 'تاجر · بداية من الصفر']].map(function (x) { return '<button class="chip dk" data-act="demo_trader" data-p="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
      [['01000000001', 'معاون مزرعة 5'], ['01000000002', 'معاون مزرعة 4'], ['01000000003', 'مشرف'], ['01000000004', 'مدير']].map(function (x) { return '<button class="chip" data-act="demo_staff" data-p="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="sec-t">سافر في الزمن (' + (days ? '+' + days + ' يوم' : 'الآن') + ')</div><div class="grid2" style="margin:8px 0 12px"><button class="btn sm gh" data-act="demo_time" data-d="1">+ يوم</button><button class="btn sm gh" data-act="demo_time" data-d="7">+ أسبوع</button><button class="btn sm gh" data-act="demo_time" data-d="30">+ 30 يوم</button><button class="btn sm gh" data-act="demo_time" data-d="0.125">+ 3 ساعات</button></div><div class="xs mut">بعد كل قفزة بنشغّل مؤقت التصعيد، فشوف كيف الرسائل المتأخرة بتتصعّد للمشرف ثم المدير.</div>' +
      '<div class="sec-t" style="margin-top:12px">إشعارات البريد اللي اتبعتت للمسؤولين</div><div class="card flat">' + ml + '<div class="xs mut" style="margin-top:6px">لاحظ: الإيميل فيه رقم الرسالة ونوعها بس. نص الرسالة ورقم التاجر مش بيطلعوا برّه التطبيق.</div></div>' +
      '<button class="btn gh" style="margin-top:12px" data-act="demo_reset">إعادة ضبط كل البيانات التجريبية</button>');
  }
  var H = A.handlers;
  H.demo_open = panel;
  function reenter(role, phone) {
    A.closeSheet(); A.logout(true);
    var act = role === 'trader' ? 'login' : 'staffLogin';
    A.call(act, { phone: phone, pin: '1234' }).then(function (d) { if (d) A.enter(d, role); });
  }
  H.demo_trader = function (el) { reenter('trader', el.dataset.p); };
  H.demo_staff = function (el) { reenter('staff', el.dataset.p); };
  H.demo_time = function (el) {
    offset += Number(el.dataset.d) * 86400000; lsSet(OFF_KEY, String(offset));
    var r = svc.tick(); S.round = null; S.content = null; S.rewards = null; S.visits = null; S.tickets = null; S.sstats = null; S.sinbox = null; S.sme = S.sme; S.market = null; S.marketTs = 0; S.smarket = null; S.annShown = false;
    A.closeSheet();
    A.toast('تقدّم الزمن' + (r.escalated ? ' — اتصعّدت ' + r.escalated + ' رسالة متأخرة' : ''), 'ok');
    if (S.role === 'trader') A.loadHome().then(function () { A.screens.trader(); if (A.announce) A.announce(); });
    else if (S.role === 'staff') { A.call('sInbox', { filter: S.sfilter || 'open' }).then(function (d) { if (d) S.sinbox = d; A.screens.staff(); }); }
  };
  H.demo_reset = function () {
    lsSet(KEY, null); lsSet(OFF_KEY, null); offset = 0; mails = [];
    build(true); A.closeSheet(); A.logout(true); A.toast('اتعادت البيانات التجريبية', 'ok');
  };
})();
