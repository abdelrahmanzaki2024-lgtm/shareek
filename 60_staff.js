/* ============================================================
   وضع الموظفين: البوابة، الرسائل، المزارع، لوحة الإدارة
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, $ = A.$, call = A.call, H = A.handlers, num = A.num;
  var LVL = { assistant: 1, supervisor: 2, manager: 3, admin: 4 };
  S.g = { q: '', list: null, sel: null, checks: {}, wait: '', note: '', farm: '', result: null };

  function lvl() { return LVL[(S.staff || {}).role] || 1; }
  /* الصلاحيات تأتي من الخادم مع بيانات الموظف (sMe) */
  function can(k) { var p = (S.staff && S.staff.perms) || []; return p.indexOf(k) >= 0; }
  A.can = can;
  function tabOk(t) {
    if (t.id === 'market') return can('prices.publish') || can('prices.approve');
    if (t.id === 'gate' || t.id === 'inbox' || t.id === 'farms' || t.id === 'dash' || t.id === 'fleet') return can(t.id);
    return false;
  }

  A.screens.staffInit = function (d) {
    var p = d ? Promise.resolve(d) : call('sMe', {});
    return p.then(function (x) { if (x) { S.sme = x; S.staff = x.staff; if (!S.g.farm) S.g.farm = x.staff.farmId || ''; } return loadInbox(true); });
  };
  function loadInbox(quiet) {
    return call('sInbox', { filter: S.sfilter || 'open' }, { quiet: !!quiet }).then(function (d) { if (d) S.sinbox = d; return d; });
  }

  A.screens.staff = function () {
    A.cleanup && A.cleanup();
    var st = S.staff, app = $('#app'), ss = S.ssub;
    var right = '<button class="ib" data-act="logout" aria-label="خروج">' + ic('out') + '</button>';
    var hdr = ss ? A.header({ back: true, title: ss.title || '', staff: true }) : A.header({ title: st.title, sub: st.roleLabel + (st.farmId ? ' · مزرعة ' + st.farmId : ''), right: right, staff: true });
    var tabs = A.STABS.filter(tabOk);
    if (!ss && tabs.length && !tabs.some(function (t) { return t.id === S.stab; })) S.stab = tabs[0].id;
    app.innerHTML = hdr + '<main id="view" class="' + (ss ? 'notab' : '') + '"></main>' + (ss ? '' : A.tabbar(tabs, S.stab, 'stab', { inbox: (S.sinbox && S.sinbox.unread) || 0, market: (S.sme && S.sme.mkPending) || 0 })) + (window.__DEMO && A.demoFab ? A.demoFab() : '');
    sView();
  };
  /* noPost: تحديث العرض بعد وصول بيانات بدون إعادة طلبها (يمنع حلقة طلبات لا تنتهي) */
  function sView(noPost) {
    var v = $('#view'); if (!v) return;
    var html = S.ssub ? (SS[S.ssub.type] || function () { return ''; })(S.ssub) : (ST[S.stab] || function () { return ''; })();
    v.innerHTML = A.fx(html);
    var post = S.ssub ? (SP[S.ssub.type]) : (SP[S.stab]);
    if (post && noPost !== true) post(S.ssub);
  }
  A.sView = sView;
  var ST = {}, SS = {}, SP = {};
  A.staffST = ST; A.staffSP = SP; A.staffSS = SS;   // يسجّل تبويبات إضافية (الأسطول) من ملف مستقل
  H.stab = function (el) { S.stab = el.dataset.id; S.ssub = null; A.screens.staff(); window.scrollTo(0, 0); };

  /* ============ البوابة ============ */
  ST.gate = function () {
    var g = S.g, items = (S.sme && S.sme.gateItems) || A.ST.gateItems || [], out = [];
    if (g.result) return resultView(g.result);
    if (!g.sel) {
      out.push('<div class="card col"><h2 style="margin:0">زيارة بوابة</h2><div class="mut sm">اكتب كود التاجر أو رقم اللوحة أو آخر 4 أرقام من موبايله.</div><div class="row"><input id="g_q" class="in grow" placeholder="مثال: A7K2 أو 1234" value="' + esc(g.q) + '" autocomplete="off" autocapitalize="characters"><button class="btn sm dk" data-act="g_search" style="min-height:50px">' + ic('search', 'sm') + 'بحث</button></div></div>');
      if (g.list) {
        if (!g.list.length) out.push('<div class="card tc mut">مفيش نتيجة. تأكد من الكود أو سجّل التاجر كحساب جديد.</div>');
        g.list.forEach(function (t) { out.push(traderRow(t)); });
      }
      out.push('<button class="btn gh" data-act="g_reg">' + ic('plus') + 'تسجيل تاجر جديد</button>');
      return out.join('');
    }
    var t = g.sel, ready = items.every(function (it) { return g.checks[it.id] !== undefined; });
    var gs = gateEval(g.checks, items);
    out.push('<div class="card"><div class="row">' + A.rankBadge(t.rank.n, 40) + '<div class="grow"><b style="font-size:17px">' + esc(t.name) + '</b><div class="mut sm">' + (t.plate ? esc(t.plate) : 'بدون لوحة') + (t.company ? ' · ' + esc(t.company) : '') + '</div></div><button class="lnk" data-act="g_clear">تغيير</button></div><div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px"><span class="chip dk">' + esc(t.rank.name) + '</span><span class="chip ok">' + t.cleanRun + ' زيارات نظيفة متتالية</span>' + (t.visitsToday ? '<span class="chip warn">زار النهارده ' + t.visitsToday + ' مرة</span>' : '') + (t.status === 'blocked' ? '<span class="chip bad">موقوف</span>' : '') + '</div></div>');
    out.push('<div class="sec-t">فحص الأربع خطوات (دوس لتحديد الحالة)</div>');
    items.forEach(function (it) {
      var s = g.checks[it.id];
      out.push('<button class="tgl ' + (s === true ? 'on' : s === false ? 'no' : '') + '" data-act="g_tgl" data-id="' + it.id + '">' + A.img(it.icon, '', '') + '<div class="grow"><b>' + esc(it.title) + '</b><div class="sm mut">' + esc(s === false ? it.bad : it.ok) + (it.critical ? ' · <b style="color:var(--red-d)">بند حرج</b>' : '') + '</div></div><span class="st">' + (s === true ? ic('check', 'sm') : s === false ? ic('x', 'sm') : '') + '</span></button>');
    });
    out.push('<div class="row" style="gap:8px"><button class="btn gh sm" data-act="g_allok">' + ic('check', 'sm') + 'الكل سليم</button><div class="grow"></div></div>');
    out.push('<div class="card col"><div class="grid2"><div class="fld"><label>زمن الانتظار (دقيقة)</label><input id="g_wait" class="in ltr" inputmode="numeric" value="' + esc(g.wait) + '" placeholder="اختياري"></div><div class="fld"><label>المزرعة</label><select id="g_farm" class="in">' + farmOpts(g.farm) + '</select></div></div><div class="fld"><label>ملاحظة (اختياري)</label><input id="g_note" class="in" maxlength="200" value="' + esc(g.note) + '"></div></div>');
    if (ready && gs.violation) out.push('<div class="notice" style="background:var(--bad-bg)">' + ic('warn') + '<div><b>مخالفة موثّقة.</b> ' + (gs.vehicleFail ? 'العربية غير مطهّرة (بند حرج). ' : '') + 'مش بتتخصم نقاط، لكن السلسلة بتتوقف.</div></div>');
    out.push('<button class="btn ' + (ready ? (gs.violation ? 'dk' : 'ok') : 'off') + '" data-act="g_submit" ' + (ready ? '' : 'disabled') + '>' + (ready ? (gs.violation ? 'سجّل المخالفة' : gs.clean ? 'سجّل زيارة نظيفة (+40)' : 'سجّل الزيارة') : 'حدّد حالة كل الخطوات الأربع') + '</button>');
    return out.join('');
  };
  function gateEval(checks, items) {
    var pass = 0, vf = false;
    items.forEach(function (it) { if (checks[it.id] === true) pass++; else if (it.critical) vf = true; });
    return { pass: pass, clean: pass === items.length, violation: pass <= 2 || vf, vehicleFail: vf };
  }
  function farmOpts(sel) { var o = '<option value="">—</option>'; for (var i = 1; i <= 10; i++) o += '<option value="' + i + '"' + (String(sel) === String(i) ? ' selected' : '') + '>مزرعة ' + i + '</option>'; return o; }
  function traderRow(t) {
    return '<button class="tkt" data-act="g_pick" data-id="' + t.id + '">' + A.rankBadge(t.rank.n, 34) + '<div class="grow"><b>' + esc(t.name) + '</b><div class="mut sm">' + (t.plate ? esc(t.plate) : 'بدون لوحة') + ' · كود ' + esc(t.code) + '</div><div class="xs mut">' + (t.last ? 'آخر زيارة ' + A.ago(t.last.ts) + ' (' + t.last.pass + '/4)' : 'مفيش زيارات') + '</div></div>' + (t.status === 'blocked' ? '<span class="chip bad">موقوف</span>' : ic('fwd')) + '</button>';
  }
  H.g_search = function () {
    var q = $('#g_q').value; S.g.q = q;
    call('sFind', { q: q }).then(function (d) { if (d) { S.g.list = d.list; sView(); if (d.list.length === 1) H.g_pick({ dataset: { id: d.list[0].id } }); } });
  };
  H.g_pick = function (el) {
    var t = (S.g.list || []).filter(function (x) { return x.id === el.dataset.id; })[0]; if (!t) return;
    S.g.sel = t; S.g.checks = {}; S.g.result = null; if (!S.g.farm && S.staff.farmId) S.g.farm = S.staff.farmId; sView(); window.scrollTo(0, 0);
  };
  H.g_clear = function () { S.g.sel = null; S.g.checks = {}; sView(); };
  H.g_tgl = function (el) {
    keepGateInputs();
    var id = el.dataset.id, s = S.g.checks[id]; S.g.checks[id] = s === undefined ? true : s === true ? false : true; sView();
  };
  H.g_allok = function () { keepGateInputs(); ((S.sme && S.sme.gateItems) || A.ST.gateItems).forEach(function (it) { S.g.checks[it.id] = true; }); sView(); };
  function keepGateInputs() { var w = $('#g_wait'), n = $('#g_note'), f = $('#g_farm'); if (w) S.g.wait = w.value; if (n) S.g.note = n.value; if (f) S.g.farm = f.value; }
  /* ---- صندوق الزيارات غير المتصلة: الزيارة تُحفظ على الجهاز بمعرّف ثابت، وتُرسل عند عودة النت.
     الخادم يتعرّف على المعرّف المكرر ويرد بـ dup فلا تتكرر الزيارة ---- */
  var OB_KEY = 'c3a_outbox';
  function newClientId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function obRead() { try { var v = JSON.parse(A.lsGet(OB_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function obWrite(list) { try { A.lsSet(OB_KEY, list.length ? JSON.stringify(list.slice(0, 50)) : null); } catch (e) { /* ignore */ } }
  A.outboxCount = function () { return obRead().length; };
  A.outboxAdd = function (action, payload) {
    var list = obRead();
    if (!list.some(function (x) { return x.payload && x.payload.clientId === payload.clientId; })) list.push({ action: action, payload: payload, at: Date.now() });
    obWrite(list);
  };
  var flushing = false;
  A.outboxFlush = function () {
    if (flushing) return Promise.resolve(0);
    var list = obRead(); if (!list.length || !S.tok) return Promise.resolve(0);
    flushing = true;
    var sent = 0;
    function next() {
      var cur = obRead(); if (!cur.length) return Promise.resolve();
      var item = cur[0];
      return A.rawCall(item.action, item.payload).then(function (r) {
        if (r && r.err === 'net') return;                       // ما زال بلا نت: نحتفظ بالباقي
        var rest = obRead().filter(function (x) { return x.payload.clientId !== item.payload.clientId; });
        obWrite(rest);
        if (r && r.ok) sent++;
        else if (r && r.msg) A.toast('زيارة ما اتقبلتش: ' + r.msg, 'err');
        return next();
      });
    }
    return next().then(function () { flushing = false; if (sent) A.toast('اتبعتت ' + sent + ' زيارة كانت مستنية النت', 'ok'); if (sent && S.role === 'staff' && A.sView && S.stab === 'gate') A.sView(true); return sent; }, function () { flushing = false; return 0; });
  };
  try {
    window.addEventListener('online', function () { A.outboxFlush(); });
    setTimeout(function () { A.outboxFlush(); }, 2000);
  } catch (e) { /* ignore */ }

  H.g_submit = function (el) {
    keepGateInputs(); el.disabled = true;
    var payload = { traderId: S.g.sel.id, farmId: S.g.farm, checks: S.g.checks, waitMin: S.g.wait, note: S.g.note, clientId: S.g.clientId || (S.g.clientId = newClientId()) };
    A.rawCall('sGate', payload).then(function (r) {
      if (r && r.ok) return gateDone(r.data);
      if (r && r.err === 'net') {
        A.outboxAdd('sGate', payload);
        gateReset();
        A.toast('مفيش نت دلوقتي. الزيارة اتحفظت على الجهاز وهتتبعت أول ما النت يرجع.', 'ok');
        sView(); window.scrollTo(0, 0);
        return;
      }
      el.disabled = false;
      if (r && r.err === 'auth') { A.toast(r.msg || 'سجّل دخولك من جديد', 'err'); if (A.logout) A.logout(true); return; }
      A.toast((r && r.msg) || 'تعذّر تسجيل الزيارة، جرّب تاني', 'err');
    });
  };
  function gateReset() { S.g.list = null; S.g.sel = null; S.g.checks = {}; S.g.wait = ''; S.g.note = ''; S.g.q = ''; S.g.clientId = null; }
  function gateDone(d) {
    if (!d) return;
    S.g.result = d; gateReset();
    if (d.clean || d.ranked) A.confetti();
    sView(); window.scrollTo(0, 0);
  }
  function resultView(r) {
    var tone = r.violation ? 'bad' : r.clean ? 'ok' : 'warn';
    return '<div class="card tc col"><div style="color:var(--' + (r.violation ? 'red' : r.clean ? 'ok' : 'warn') + ')">' + ic(r.violation ? 'warn' : 'check', 'lg') + '</div><h2 style="margin:0">' + esc(r.trader) + '</h2><div class="score" style="color:var(--' + (r.violation ? 'red' : r.clean ? 'ok' : 'warn') + ')">' + r.pass + '</div><div class="mut" style="font-size:20px;font-weight:700">من ' + r.total + ' خطوات</div><div><span class="chip ' + tone + '">' + (r.violation ? 'مخالفة موثّقة' : r.clean ? 'زيارة نظيفة' : 'زيارة مسجّلة') + '</span></div><div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">' + (r.points ? '<span class="chip red">+' + r.points + ' نقطة للتاجر</span>' : '') + (r.weekBonus ? '<span class="chip ok">وحقق هدف الأسبوع (+' + r.weekBonus + ')</span>' : '') + (r.capped ? '<span class="chip">وصل سقف نقاط البوابة اليومي</span>' : '') + '<span class="chip">' + r.cleanRun + ' نظيفة متتالية</span></div>' + (r.ranked ? '<div class="notice" style="background:var(--ok-bg)">' + ic('trophy') + '<div>ترقّى إلى <b>' + esc(r.rankAfter) + '</b>!</div></div>' : '') + '<button class="btn" data-act="g_next">زيارة جديدة</button></div>';
  }
  H.g_next = function () { S.g.result = null; sView(); window.scrollTo(0, 0); };

  H.g_reg = function () {
    A.sheet('<h2>تسجيل تاجر جديد</h2><div class="col">' + A.fld('gr_name', 'الاسم', '<input id="gr_name" class="in" maxlength="40">') + A.fld('gr_phone', 'رقم الموبايل', '<input id="gr_phone" class="in ltr" inputmode="tel">') + A.fld('gr_pin', 'رمز سري مؤقت (4–6 أرقام)', '<input id="gr_pin" class="in ltr" inputmode="numeric" maxlength="6">', 'قول له يغيّره بعدين') + A.fld('gr_plate', 'رقم اللوحة', '<input id="gr_plate" class="in" maxlength="14">') + A.fld('gr_company', 'الشركة (اختياري)', '<input id="gr_company" class="in" maxlength="40">') + '<div class="err" id="gr_err"></div><button class="btn" data-act="g_reg_ok">تسجيل</button></div>');
  };
  H.g_reg_ok = function (el) {
    var p = { name: $('#gr_name').value, phone: $('#gr_phone').value, pin: $('#gr_pin').value, plate: $('#gr_plate').value, company: $('#gr_company').value, farmId: S.staff.farmId };
    el.disabled = true;
    call('sRegister', p, { keepErr: true }).then(function (d) {
      el.disabled = false;
      if (d && d.__err) return ($('#gr_err').textContent = d.__err.msg);
      if (!d) return;
      A.closeSheet(); A.toast(d.message, 'ok'); S.g.list = [d.trader]; S.g.q = d.trader.code; sView();
    });
  };

  /* ============ الرسائل ============ */
  ST.inbox = function () {
    var d = S.sinbox, f = S.sfilter || 'open';
    var chips = [['open', 'مفتوحة'], ['done', 'تم الرد'], ['all', 'الكل']].map(function (x) { return '<button class="chip ' + (f === x[0] ? 'sel' : '') + '" data-act="s_filter" data-f="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    var out = ['<div class="row"><div class="grow row" style="gap:6px">' + chips + '</div><button class="btn sm gh" data-act="s_refresh">' + ic('clock', 'sm') + 'تحديث</button></div>'];
    if (!d) return out.join('') + A.loading();
    if (!d.tickets.length) out.push('<div class="card tc mut">مفيش رسائل هنا.</div>');
    d.tickets.forEach(function (t) {
      var lv = t.level >= 2 ? '<span class="lvl lvl2">مصعّدة للمدير</span>' : t.level === 1 ? '<span class="lvl lvl1">مصعّدة للمشرف</span>' : '';
      out.push('<button class="tkt ' + (t.unread ? 'un' : '') + '" data-act="s_open" data-id="' + t.id + '"><div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap"><span class="chip dk">' + esc(t.typeLabel) + '</span>' + lv + (t.overdue ? '<span class="chip bad">' + ic('clock', 'sm') + 'متأخرة ' + t.hours + ' س</span>' : '') + (t.status !== 'open' ? '<span class="chip ok">' + (t.status === 'resolved' ? 'اتحلّت' : 'تم الرد') + '</span>' : '') + '</div><b style="display:block;margin-top:6px">' + esc(t.subject) + '</b><div class="xs mut">' + esc(t.trader) + (t.plate ? ' · ' + esc(t.plate) : '') + (t.farmId ? ' · مزرعة ' + esc(t.farmId) : '') + ' · ' + A.ago(t.lastTs) + '</div></div>' + ic('fwd') + '</button>');
    });
    return out.join('');
  };
  SP.inbox = function () { loadInbox(true).then(function () { if (!S.ssub && S.stab === 'inbox') { sView(true); updateBadge(); } }); };
  function updateBadge() { var b = document.querySelector('.tabs button[data-id="inbox"]'); if (!b) return; var e = b.querySelector('.tdot'); var n = (S.sinbox && S.sinbox.unread) || 0; if (e) e.remove(); if (n) b.insertAdjacentHTML('beforeend', '<span class="tdot">' + n + '</span>'); }
  H.s_filter = function (el) { S.sfilter = el.dataset.f === 'all' ? '' : el.dataset.f; S.sinbox = null; sView(true); loadInbox(true).then(function () { sView(true); }); };
  H.s_refresh = function () { S.sinbox = null; sView(true); loadInbox(true).then(function () { sView(true); updateBadge(); }); };
  H.s_open = function (el) { S.ssub = { type: 'sthread', id: el.dataset.id, title: 'الرسالة ' + el.dataset.id }; A.screens.staff(); window.scrollTo(0, 0); };
  SS.sthread = function (sub) {
    if (!sub.data) { call('sTicket', { id: sub.id }).then(function (d) { if (!d) { S.ssub = null; return A.screens.staff(); } sub.data = d; if (S.ssub === sub) sView(); }); return A.loading(); }
    var d = sub.data, t = d.ticket, tr = d.trader, tp = (A.ST.ticketTypes || []).filter(function (x) { return x.id === t.type; })[0] || {};
    var bubbles = d.msgs.map(function (m) {
      return m.from === 'trader' ? '<div class="bub st"><b class="who" style="color:var(--ink)">' + esc(tr.name) + '</b>' + esc(m.text) + '<small>' + A.fdt(m.ts) + '</small></div>' : '<div class="bub me"><b class="who" style="color:#F2A900">' + esc(m.whoName || m.who || '') + ' · ' + esc(m.who || '') + '</b>' + esc(m.text) + '<small>' + A.fdt(m.ts) + '</small></div>';
    }).join('');
    return '<div class="card"><div class="row" style="flex-wrap:wrap;gap:6px"><span class="chip dk">' + esc(t.typeLabel) + '</span>' + (t.level ? '<span class="lvl lvl' + t.level + '">' + (t.level >= 2 ? 'تصعيد للمدير' : 'تصعيد للمشرف') + '</span>' : '') + (t.overdue ? '<span class="chip bad">متأخرة</span>' : '') + (t.stars ? '<span class="chip warn">' + ic('star', 'sm') + t.stars + '</span>' : '') + '</div><h3 style="margin-top:8px">' + esc(t.subject) + '</h3><div class="mut sm">' + esc(tr.name) + (tr.plate ? ' · ' + esc(tr.plate) : '') + (tr.company ? ' · ' + esc(tr.company) : '') + ' · كود ' + esc(tr.code) + '</div></div><div class="col" style="gap:8px">' + bubbles + '</div>' +
      '<div class="card col"><textarea id="sr_text" class="in" maxlength="1200" placeholder="اكتب الرد للتاجر…" style="min-height:90px"></textarea><div class="err" id="sr_err"></div><div class="grid2"><button class="btn" data-act="s_reply" data-r="0">أرسل الرد</button><button class="btn ok" data-act="s_reply" data-r="1">رد وأغلق</button></div><button class="btn gh" data-act="s_callback">' + ic('phone') + 'أنا هتصل بالتاجر</button>' + (d.canAccept ? '<button class="btn dk" data-act="s_accept">' + ic('trophy') + 'اقبل الاقتراح (+100 للتاجر)</button>' : '') + '<div class="xs mut">اسمك ورقمك مش بيظهروا للتاجر. بيشوف مسماك الوظيفي بس. زر الاتصال بيعرض رقم التاجر ليك أنت فقط.</div></div>';
  };
  H.s_reply = function (el) {
    var t = $('#sr_text').value; $('#sr_err').textContent = '';
    if (t.trim().length < 2) return ($('#sr_err').textContent = 'اكتب الرد الأول');
    el.disabled = true;
    call('sReply', { id: S.ssub.id, text: t, resolve: el.dataset.r === '1' }).then(function (d) {
      el.disabled = false; if (!d) return;
      S.ssub.data = d; S.sinbox = null; A.toast(el.dataset.r === '1' ? 'اتبعت واتقفلت الرسالة' : 'اتبعت الرد', 'ok'); loadInbox(true); sView(); window.scrollTo(0, document.body.scrollHeight);
    });
  };
  H.s_callback = function () {
    call('sCallback', { id: S.ssub.id }).then(function (d) {
      if (!d) return;
      A.sheet('<h2>رقم التاجر</h2><p class="mut sm">اتبعتله رسالة إنك هتتصل. الرقم ده ليك أنت بس.</p><div class="card tc"><b style="font-size:17px">' + esc(d.name) + '</b><div class="big" style="direction:ltr;margin:8px 0">' + esc(d.phone) + '</div><div class="grid2"><a class="btn" href="tel:' + esc(d.phone) + '">' + ic('phone') + 'اتصل</a><button class="btn gh" data-act="copy_phone" data-p="' + esc(d.phone) + '">نسخ</button></div></div>');
      S.ssub.data = null; S.sinbox = null; loadInbox(true);
    });
  };
  H.copy_phone = function (el) { A.copyText(el.dataset.p); };
  H.s_accept = function (el) {
    el.disabled = true;
    call('sAccept', { id: S.ssub.id }).then(function (d) { if (d) { S.ssub.data = d; A.toast('تم قبول الاقتراح وأضفنا النقاط', 'ok'); A.confetti(); sView(); } else el.disabled = false; });
  };

  /* ============ المزارع ============ */
  ST.farms = function () {
    var farms = (S.sme && S.sme.farms) || [], st = S.staff;
    var tone = { ready: 'ok', limited: 'warn', closed: 'bad' };
    return '<div class="notice">' + ic('truck') + '<div>حالة المزرعة بتظهر للتجار في شاشة «اليوم». حدّثها أول الصبح وكل ما تتغير. لو عدّى عليها 24 ساعة من غير تحديث بتظهر «—».</div></div>' + farms.map(function (f) {
      var mine = can('farms') && (st.role !== 'assistant' || !st.farmId || st.farmId === f.id);
      return '<div class="card col" style="gap:8px"><div class="row sp"><b style="font-size:17px">' + esc(f.name) + '</b><span class="chip ' + (f.tone === 'good' ? 'ok' : f.tone === 'warn' ? 'warn' : f.tone === 'bad' ? 'bad' : '') + '">' + esc(f.label) + '</span></div>' + (mine ? '<div class="seg">' + [['ready', 'جاهزة'], ['limited', 'محدود'], ['closed', 'مغلقة']].map(function (x) { return '<button data-act="f_set" data-id="' + f.id + '" data-s="' + x[0] + '" class="' + ((f.status === x[0]) ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><input class="in" id="fn_' + f.id + '" maxlength="80" placeholder="ملاحظة قصيرة (اختياري)" value="' + esc(f.note || '') + '">' : '<div class="xs mut">تحديثها من معاون المزرعة نفسها.</div>') + '<div class="xs mut">' + (f.ts ? 'آخر تحديث ' + A.ago(f.ts) : 'لم تُحدَّث') + '</div></div>';
    }).join('');
  };
  H.f_set = function (el) {
    var id = el.dataset.id, note = (document.getElementById('fn_' + id) || {}).value || '';
    call('sFarm', { farmId: id, status: el.dataset.s, note: note }).then(function (d) { if (d) { S.sme.farms = d.farms; A.toast('اتحدثت حالة مزرعة ' + id, 'ok'); sView(); } });
  };

  /* ============ السوق النهاردة: نشر أسعار بيع الشركة ============ */
  S.mkday = 'today'; S.mkForce = false;
  ST.market = function () {
    var m = S.smarket, K = A.mk, out = [];
    if (!m) return A.loading();
    out.push('<div class="row sp"><h2 style="margin:0">السوق النهاردة</h2><button class="btn sm gh" data-act="mk_sref">' + ic('clock', 'sm') + 'تحديث</button></div>');
    out.push(K.stateBar(m));
    out.push(pendCards(m));
    if (!m.canEdit) {
      out.push('<div class="notice">' + ic('lock') + '<div>نشر الأسعار مش متاح لصلاحياتك. مدير الإدارة بيحدّد مين ينشر من «الفريق والصلاحيات». تقدر تتابع هنا الأسعار اللي التجار شايفينها.</div></div>');
      out.push(K.prices(m)); out.push(K.note(m)); out.push(K.hist(m));
      return out.join('');
    }
    var day = S.mkday === 'yesterday' ? 'yesterday' : 'today', e = m.edit[day];
    out.push('<div class="seg"><button data-act="mk_day" data-d="today" class="' + (day === 'today' ? 'on' : '') + '">النهاردة</button><button data-act="mk_day" data-d="yesterday" class="' + (day === 'yesterday' ? 'on' : '') + '">أمس (تصحيح)</button></div>');
    var last = {}; m.items.forEach(function (it) { last[it.id] = it; });
    out.push('<div class="card col"><div class="row sp"><b>' + K.dkLabel(e.dk) + '</b>' + (e.ts ? '<span class="chip ok">نُشر ' + A.ftime(e.ts) + '</span>' : '<span class="chip warn">لم يُنشر بعد</span>') + '</div>' +
      m.items.map(function (it) {
        var ph = it.price !== null ? 'آخر سعر: ' + K.fmt(it.price, it.dec) : '';
        return '<div class="fld"><label for="mk_' + it.id + '">' + esc(it.name) + ' <span class="mut">(' + esc(it.unit) + ')</span></label><input id="mk_' + it.id + '" data-mk="1" class="in ltr" inputmode="decimal" autocomplete="off" value="' + (e.prices[it.id] !== undefined ? esc(e.prices[it.id]) : '') + '" placeholder="' + esc(ph) + '"></div>';
      }).join('') +
      '<div class="fld"><label for="mk_note">ملاحظة اليوم للتجار (اختياري)</label><textarea id="mk_note" data-mk="1" class="in" maxlength="200" style="min-height:70px" placeholder="مثال: التحميل بعد الثانية ظهرًا">' + esc(e.note || '') + '</textarea></div>' +
      '<div class="xs mut">اترك الخانة فاضية لو المنتج مالوش سعر في اليوم ده. الأرقام الظاهرة هي اللي هيشوفها التجار بعد النشر.</div><div class="err" id="mk_err"></div>' +
      '<button class="btn" id="mk_pub" data-act="mk_pub">' + (m.approval && m.approval.mode === 'always' && !m.direct ? 'أرسل للاعتماد' : e.ts ? 'حدّث الأسعار' : 'انشر أسعار النهاردة') + '</button></div>');
    out.push(K.hist(m));
    out.push('<div class="xs mut">قائمة المنتجات تتعدّل من ورقة <b>MarketItems</b> في الشيت (اسم، وحدة، ترتيب، إخفاء). ' + approvalHint(m) + '</div>');
    return out.join('');
  };
  function approvalHint(m) {
    var md = m.approval && m.approval.mode, rl = m.approval ? esc(m.approval.role) : '';
    if (m.direct) return 'أنت مدير الإدارة: أسعارك بتظهر للتجار مباشرة من غير اعتماد أي حد. القفزة الكبيرة بتطلب منك تأكيد «أكّد وانشر» بس.';
    if (md === 'always') return 'كل نشر بيتبعت لاعتماد «' + rl + '» آخر قبل ما يظهر للتجار.';
    if (md === 'off') return 'أي تغيّر في السعر أكبر من ' + m.maxJumpPct + '% عن آخر سعر هيطلب منك تأكيد قبل النشر.';
    return 'أي تغيّر في السعر أكبر من ' + m.maxJumpPct + '% عن آخر سعر بيتبعت لاعتماد «' + rl + '» آخر قبل ما يظهر للتجار.';
  }
  function pendCards(m) {
    var K = A.mk;
    if (!m.pending || !m.pending.length) return '';
    return m.pending.map(function (p) {
      var rows = p.items.map(function (x) { return '<div class="row sp"><span>' + esc(x.short) + ' <span class="xs mut">' + esc(x.unit) + '</span></span><b>' + K.fmt(x.price, x.dec) + '</b></div>'; }).join('');
      var who = p.mine ? 'أنت' : esc(p.byName || 'موظف');
      var foot = '';
      if (p.canDecide) foot = '<input id="mkr_' + p.id + '" class="in" maxlength="120" placeholder="سبب الرفض (اختياري)"><div class="grid2"><button class="btn ok" data-act="mk_ap" data-id="' + p.id + '">' + ic('check', 'sm') + 'اعتماد ونشر</button><button class="btn gh" data-act="mk_rj" data-id="' + p.id + '">رفض</button></div>';
      else if (p.mine) foot = '<div class="xs mut">طلبك بانتظار اعتماد «' + esc(m.approval.role) + '» آخر. التجار شايفين السعر السابق لحد ما يتعتمد.</div><button class="btn sm gh" data-act="mk_cx" data-id="' + p.id + '">سحب الطلب</button>';
      else foot = '<div class="xs mut">بانتظار اعتماد من مسؤول آخر.</div>';
      return '<div class="card col" style="border:2px solid var(--warn)"><div class="row sp"><b>' + ic('clock', 'sm') + ' أسعار بانتظار الاعتماد</b><span class="chip warn">' + (p.dk === m.dk ? 'النهاردة' : 'أمس') + '</span></div><div class="xs mut">اقترحها ' + who + ' · ' + A.ago(p.ts) + '</div>' + rows +
        (p.jumps.length ? '<div class="notice" style="background:var(--warn-bg)">' + ic('warn') + '<div><b>تغيّر كبير:</b> ' + p.jumps.map(esc).join('، ') + '</div></div>' : '') + (p.note ? '<div class="xs">ملاحظة: ' + esc(p.note) + '</div>' : '') + foot + '</div>';
    }).join('');
  }
  function mkBadge(n) {
    if (S.sme) S.sme.mkPending = n || 0;
    var b = document.querySelector('nav.tabs button[data-id="market"]'); if (!b) return;
    var d = b.querySelector('.tdot');
    if (n) { if (!d) { d = document.createElement('span'); d.className = 'tdot'; b.appendChild(d); } d.textContent = n; } else if (d) d.remove();
  }
  function mkGot(d) { S.smarket = d; S.market = null; S.marketTs = 0; mkBadge(d.pendingCount || 0); }
  function mkDecide(id, decision, reason) {
    call('sMarketDecide', { id: id, decision: decision, reason: reason || '' }).then(function (d) {
      if (!d) return;
      mkGot(d); sView(true);
      A.toast(decision === 'approve' ? 'اتعتمدت الأسعار وظهرت للتجار' : decision === 'reject' ? 'اترفضت الأسعار' : 'اتسحب الطلب', 'ok');
    });
  }
  H.mk_ap = function (el) { mkDecide(el.dataset.id, 'approve'); };
  H.mk_rj = function (el) { var i = document.getElementById('mkr_' + el.dataset.id); mkDecide(el.dataset.id, 'reject', i ? i.value : ''); };
  H.mk_cx = function (el) { mkDecide(el.dataset.id, 'cancel'); };
  SP.market = function () {
    call('sMarketGet', {}, { quiet: true }).then(function (d) { if (d) { S.smarket = d; mkBadge(d.pendingCount || 0); if (S.stab === 'market' && !S.ssub && !(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.mk)) sView(true); } });
  };
  H.mk_sref = function () { S.smarket = null; sView(true); SP.market(); };
  H.mk_day = function (el) { S.mkday = el.dataset.d; S.mkForce = false; sView(true); };
  document.addEventListener('input', function (e) {
    if (e.target && e.target.dataset && e.target.dataset.mk && S.mkForce) { S.mkForce = false; var b = document.getElementById('mk_pub'); if (b) b.textContent = S.smarket && S.smarket.approval && S.smarket.approval.mode === 'always' && !S.smarket.direct ? 'أرسل للاعتماد' : 'انشر'; var er = document.getElementById('mk_err'); if (er) er.textContent = ''; }
  });
  H.mk_pub = function (el) {
    var m = S.smarket; if (!m) return;
    var vals = {}; m.items.forEach(function (it) { var i = document.getElementById('mk_' + it.id); vals[it.id] = i ? i.value : ''; });
    var note = (document.getElementById('mk_note') || {}).value || '';
    var er = document.getElementById('mk_err'); if (er) er.textContent = '';
    el.disabled = true;
    call('sMarketSet', { day: S.mkday, values: vals, note: note, force: S.mkForce }, { keepErr: true }).then(function (d) {
      el.disabled = false;
      if (d && d.__err) {
        if (er) er.textContent = d.__err.msg;
        if (d.__err.err === 'jump') { S.mkForce = true; el.textContent = 'أكّد وانشر'; }
        if (d.__err.err === 'jump_ap') { S.mkForce = true; el.textContent = 'أرسل للاعتماد'; }
        return;
      }
      if (!d) return;
      S.mkForce = false; mkGot(d);
      A.toast(d.submitted ? 'اتبعتت للاعتماد. هتظهر للتجار بعد ما تتعتمد' : 'اتنشرت الأسعار. التجار هيشوفوها دلوقتي', 'ok'); sView(true); window.scrollTo(0, 0);
    });
  };

  /* ============ لوحة الإدارة ============ */
  ST.dash = function () {
    var d = S.sstats;
    if (!d) return A.loading();
    var k = function (v, l, tone) { return '<div class="k"><b' + (tone ? ' style="color:var(--' + tone + ')"' : '') + '>' + v + '</b><span>' + l + '</span></div>'; };
    var pc = function (v) { return v === null || v === undefined ? '—' : v + '%'; };
    var out = [];
    var segs = [{ id: 'kpi', t: 'المؤشرات' }];
    if (can('rewards')) segs.push({ id: 'rw', t: 'الجوائز', n: d.pendingRewards || 0 });
    if (can('traders')) segs.push({ id: 'tr', t: 'التجار' });
    out.push(A.segs('dash', segs, 'kpi'));
    var seg = A.seg('dash', 'kpi');
    if (seg === 'rw' && can('rewards')) { out.push('<div class="sec-t">طلبات الجوائز (' + d.pendingRewards + ' بانتظار الاعتماد)</div><div id="rwlist">' + (S.srw ? rwList(S.srw) : '<div class="spin"></div>') + '</div>'); return out.join(''); }
    if (seg === 'tr' && can('traders')) { out.push('<div class="sec-t">التجار</div><div class="card col"><div class="row"><input id="tq" class="in grow" placeholder="ابحث بالاسم أو الكود أو اللوحة"><button class="btn sm dk" data-act="d_traders" style="min-height:50px">بحث</button></div><div id="trlist">' + (S.str ? trList(S.str) : '<div class="spin"></div>') + '</div></div>'); return out.join(''); }
    out.push('<div class="row sp"><h2 style="margin:0">لوحة المؤشرات</h2><button class="btn sm gh" data-act="d_refresh">' + ic('clock', 'sm') + 'تحديث</button></div>');
    if (S.staff && S.staff.role === 'manager') out.push('<button class="tkt" data-act="team_open">' + ic('user') + '<div class="grow"><b>الفريق والصلاحيات</b><div class="xs mut">أضف الموظفين والمسؤولين، وحدّد صلاحية كل واحد بالضبط</div></div>' + ic('back') + '</button>');
    if (can('report')) out.push('<div class="card"><div class="row" style="gap:12px"><span class="hs-ic">' + ic('chart') + '</span><div class="grow"><b>التقرير الأسبوعي للإدارة</b><div class="sm mut">بيوصل لبريد المديرين تلقائيًا في اليوم والساعة المضبوطين في ورقة Config. تقدر تعاينه أو تبعته لنفسك دلوقتي.</div></div></div><div class="grid2" style="margin-top:10px"><button class="btn sm dk" data-act="rep_prev">معاينة التقرير</button><button class="btn sm gh" data-act="rep_send">أرسل لي الآن</button></div></div>');
    out.push('<div class="sec-t">التجار والمشاركة</div><div class="kpi">' + k(num(d.traders), 'تاجر مسجّل') + k(pc(d.activePct), 'نشِط (يومين+ هذا الأسبوع)', 'ok') + k(num(d.onboarded), 'أكملوا التهيئة') + k(num(d.collective.count) + '/' + num(d.collective.target), 'حائط الدفاع هذا الأسبوع') + '</div>');
    out.push('<div class="sec-t">البوابة (آخر 30 يومًا)</div><div class="kpi">' + k(num(d.gate.visits), 'زيارة مسجّلة') + k(pc(d.gate.cleanPct), 'نسبة الزيارات النظيفة', 'ok') + k(d.gate.violPer100 === null ? '—' : d.gate.violPer100, 'مخالفة لكل 100 زيارة', 'red-d') + k(d.gate.avgWait === null ? '—' : d.gate.avgWait + ' د', 'متوسط الانتظار') + '</div>');
    out.push('<div class="sec-t">الوعي</div><div class="kpi">' + k(d.quiz.baseline === null ? '—' : d.quiz.baseline + '%', 'متوسط الاختبار الأول') + k(d.quiz.followup === null ? '—' : d.quiz.followup + '%', 'متوسط اختبار الشهر', 'ok') + '</div>' + (d.quiz.pairs ? '<div class="xs mut">محسوبة على ' + d.quiz.pairs + ' تاجر أكملوا الاختبارين.</div>' : '<div class="xs mut">اختبار الشهر بيفتح بعد 30 يومًا من الأول.</div>'));
    var tk = d.tickets, mx = Math.max.apply(null, tk.byType.map(function (x) { return x.n; }).concat([1]));
    out.push('<div class="sec-t">الرسائل</div><div class="kpi">' + k(num(tk.total), 'إجمالي الرسائل') + k(num(tk.open), 'مفتوحة الآن') + k(num(tk.escalated), 'مصعّدة ولم يُرد عليها', tk.escalated ? 'red-d' : '') + k(tk.avgHours === null ? '—' : tk.avgHours + ' س', 'متوسط زمن أول رد') + k(pc(tk.slaPct), 'التزام بمهلة الرد', tk.slaPct !== null && tk.slaPct >= 80 ? 'ok' : '') + '</div><div class="card">' + tk.byType.map(function (x) { return '<div class="hbar"><span>' + esc(x.type) + '</span>' + A.bar(x.n * 100 / mx) + '<em>' + x.n + '</em></div>'; }).join('') + (tk.recent.length ? '<hr class="sep"><b class="sm">آخر العوائق والاقتراحات</b>' + tk.recent.map(function (x) { return '<div class="sm" style="margin-top:6px"><span class="chip">' + esc(x.type) + '</span> ' + esc(x.subject) + '</div>'; }).join('') : '') + '</div>');
    out.push('<div class="sec-t">السفراء</div><div class="kpi">' + k(d.ambassadors.r3, 'شريك موثوق') + k(d.ambassadors.r4, 'سفير جديد') + k(d.ambassadors.r5, 'سفير معتمد') + k(d.ambassadors.r6, 'سفير النخبة') + '</div>');
    return out.join('');
  };
  function rwList(d) {
    if (!d.list.length) return '<div class="card tc mut">مفيش طلبات معلّقة.</div>';
    return d.list.map(function (r) {
      return '<div class="card"><div class="row"><div class="grow"><b>' + esc(r.reward) + '</b><div class="mut sm">' + esc(r.trader) + (r.plate ? ' · ' + esc(r.plate) : '') + ' · ' + A.ago(r.ts) + '</div></div><span class="chip ' + (r.status === 'approved' ? 'ok' : 'warn') + '">' + (r.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد') + '</span></div>' + (lvl() >= 3 ? '<div class="row" style="margin-top:10px;gap:8px">' + (r.status === 'requested' ? '<button class="btn sm ok" data-act="rw_do" data-id="' + r.id + '" data-s="approved">اعتماد</button>' : '<button class="btn sm ok" data-act="rw_do" data-id="' + r.id + '" data-s="delivered">تم التسليم</button>') + '<button class="btn sm gh" data-act="rw_do" data-id="' + r.id + '" data-s="rejected">رفض</button></div>' : '') + '</div>';
    }).join('');
  }
  function trList(d) { return '<div class="xs mut" style="margin:8px 0">' + num(d.total) + ' تاجر</div>' + d.list.map(function (t) { return '<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">' + A.rankBadge(t.rank.n, 30) + '<div class="grow"><b>' + esc(t.name) + '</b><div class="xs mut">' + esc(t.code) + (t.plate ? ' · ' + esc(t.plate) : '') + ' · ' + num(t.pts) + ' نقطة</div></div>' + (lvl() >= 3 ? '<button class="btn xs ' + (t.status === 'blocked' ? 'ok' : 'gh') + '" data-act="d_block" data-id="' + t.id + '" data-on="' + (t.status === 'blocked' ? 0 : 1) + '">' + (t.status === 'blocked' ? 'إلغاء الإيقاف' : 'إيقاف') + '</button>' : '') + (can('traders.edit') ? '<button class="btn xs gh" data-act="tr_edit" data-id="' + t.id + '">تعديل</button>' : '') + (can('traders.delete') ? '<button class="btn xs gh" data-act="tr_del" data-id="' + t.id + '">حذف</button>' : '') + '</div>'; }).join(''); }
  SP.dash = function () {
    call('sStats', {}, { quiet: true }).then(function (d) { if (d) { S.sstats = d; if (S.stab === 'dash' && !S.ssub) sView(true); } });
    if (can('rewards')) call('sRewards', {}, { quiet: true }).then(function (d) { if (d) { S.srw = d; var b = document.getElementById('rwlist'); if (b) b.innerHTML = rwList(d); } });
    if (can('traders')) call('sTraders', {}, { quiet: true }).then(function (d) { if (d) { S.str = d; var b = document.getElementById('trlist'); if (b) b.innerHTML = trList(d); } });
  };
  H.d_refresh = function () { S.sstats = null; sView(true); SP.dash(); };
  H.rep_prev = function () {
    call('sReport', {}).then(function (d) {
      if (!d) return;
      A.sheet('<h2>التقرير الأسبوعي</h2><div class="xs mut" style="margin-bottom:8px">مستلمون تلقائيًا: ' + d.recipients + (d.auto && d.auto.on === false ? ' · الإرسال التلقائي موقوف' : '') + '</div><div class="rep-box">' + d.html + '</div><div class="grid2" style="margin-top:12px"><button class="btn dk" data-act="rep_send">أرسل لي الآن</button><button class="btn gh" data-act="closesheet">إغلاق</button></div>');
    });
  };
  H.rep_send = function (el) {
    if (el) el.disabled = true;
    call('sReport', { send: true }).then(function (d) {
      if (el) el.disabled = false;
      if (d) A.toast(d.sent ? 'اتبعت التقرير لبريدك' : 'تعذّر إرسال الإيميل، راجع إعدادات البريد', d.sent ? 'ok' : '');
    });
  };
  H.d_traders = function () { call('sTraders', { q: $('#tq').value }).then(function (d) { if (d) { S.str = d; $('#trlist').innerHTML = trList(d); } }); };
  H.d_block = function (el) { call('sBlock', { id: el.dataset.id, on: el.dataset.on === '1' }).then(function (d) { if (d) { A.toast('تم', 'ok'); H.d_traders(); } }); };

  /* ---------- تعديل التاجر وحذفه (صلاحيتا traders.edit و traders.delete) ---------- */
  H.tr_edit = function (el) { call('sTraderGet', { id: el.dataset.id }).then(function (d) { if (d) trSheet(d.trader); }); };
  function trSheet(t) {
    A.sheet('<h2>تعديل التاجر</h2><div class="xs mut" style="margin-bottom:8px">كود ' + esc(t.code) + '</div>' +
      fld('tr_name', 'الاسم', t.name) +
      fld('tr_phone', 'رقم الموبايل (هو اسم الدخول)', t.phone, 'tel', ' dir="ltr" inputmode="tel"') +
      fld('tr_plate', 'رقم اللوحة', t.plate) +
      fld('tr_company', 'الشركة أو المزرعة', t.company) +
      fld('tr_pin', 'رمز جديد (اتركه فارغًا لو مش عايز تغيّره)', '', 'password', ' inputmode="numeric" maxlength="6" dir="ltr"') +
      '<div class="xs mut" style="margin-top:6px">لو غيّرت الرمز، الجلسات القديمة للتاجر تنتهي ويدخل بالرمز الجديد.</div>' +
      '<div class="grid2" style="margin-top:12px"><button class="btn" data-act="tr_save" data-id="' + esc(t.id) + '">احفظ</button><button class="btn gh" data-act="closesheet">إلغاء</button></div>' +
      (can('traders.delete') ? '<button class="btn gh" style="margin-top:10px" data-act="tr_del" data-id="' + esc(t.id) + '">حذف التاجر</button>' : ''));
  }
  H.tr_save = function (el) {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    call('sTraderSave', { id: el.dataset.id, name: v('tr_name'), phone: v('tr_phone'), plate: v('tr_plate'), company: v('tr_company'), pin: v('tr_pin') }).then(function (d) {
      if (!d) return;
      A.closeSheet(); A.toast('اتحفظت بيانات التاجر', 'ok'); H.d_traders();
    });
  };
  H.tr_del = function (el) {
    var id = el.dataset.id;
    if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'تأكيد: إيقاف الحساب نهائيًا'; el.classList.replace('gh', 'dk'); return; }
    call('sTraderDelete', { id: id }).then(function (d) {
      if (!d) return;
      A.closeSheet(); A.toast('اتوقف حساب التاجر', 'ok'); H.d_traders();
    });
  };
  H.rw_do = function (el) { call('sRewardDecide', { id: el.dataset.id, status: el.dataset.s }).then(function (d) { if (d) { S.srw = d; $('#rwlist').innerHTML = rwList(d); A.toast('تم تحديث الطلب', 'ok'); } }); };

  /* ---------- الفريق والصلاحيات (مدير الإدارة فقط) ---------- */
  S.team = null; S.tform = null; S.tdel = '';
  function fld(id, label, val, type, extra) {
    return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="in" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : String(val)) + '" autocomplete="off"' + (extra || '') + '></div>';
  }
  H.team_open = function () { S.ssub = { type: 'team', title: 'الفريق والصلاحيات' }; S.team = null; S.tform = null; S.tdel = ''; A.screens.staff(); window.scrollTo(0, 0); };
  SP.team = function () {
    call('sTeamList', {}).then(function (d) {
      if (!d) { S.ssub = null; return A.screens.staff(); }
      S.team = d; if (S.ssub && S.ssub.type === 'team') sView(true);
    });
  };
  SS.team = function () {
    var d = S.team;
    if (!d) return A.loading();
    if (S.tform) return teamForm(S.tform, d);
    var out = ['<div class="card col" style="gap:8px"><div class="row sp"><b>الموظفون</b><button class="btn sm" data-act="t_new">' + ic('user', 'sm') + 'موظف جديد</button></div>' +
      '<div class="xs mut">الدور يعطي صلاحيات افتراضية، وتقدر تخصّص لكل موظف الصلاحيات اللي تناسبه بس. الحذف يوقف الدخول فورًا ويحفظ السجل لأن أرقامه مرتبطة برسائل وأسعار سابقة.</div></div>'];
    d.list.forEach(function (x) { out.push(teamRowCard(x, d)); });
    if (S.staff && S.staff.role === 'manager') out.push('<div class="card col" style="gap:8px;border:2px solid #EA2329;margin-top:14px"><b>إعادة التهيئة من البداية</b><div class="xs mut">تمسح بيانات التجريب: التجار وزيارات البوابة والتذاكر والجوائز والمؤشرات والأسطول والمزارع وأسعار اليوم، وتُبقي الإعدادات والمحتوى وقائمة الأسعار وحسابك. قبل المسح تُحفظ نسخة كاملة في أوراق مخفية باسم bk_، ولا تُحفظ أكثر من نسختين.</div><button class="btn dk" data-act="reset_open">معاينة إعادة التهيئة</button></div>');
    return out.join('');
  };
  var RESET_LABEL = { Traders: 'التجار', Gate: 'زيارات البوابة', Tickets: 'التذاكر', TicketMsgs: 'ردود التذاكر', Events: 'سجل الأحداث', Rewards: 'طلبات الجوائز', Notifications: 'الإشعارات', Counters: 'العدّادات', Farms: 'المزارع', MarketDay: 'أسعار اليوم', MarketPending: 'أسعار بانتظار الاعتماد', FleetRoutes: 'خطوط السير', FleetPings: 'مواقع السائقين', FleetAlerts: 'تنبيهات الأسطول', FleetNotes: 'ملاحظات الأسطول', FleetDevices: 'أجهزة الإشعارات' };
  var RESET_KEEP_LABEL = { Config: 'الإعدادات', Content: 'المحتوى والدروس', MarketItems: 'قائمة الأسعار' };
  var RESET_PHRASE = 'أعد التهيئة الكاملة';
  H.reset_open = function () {
    call('sResetPreview', {}).then(function (p) {
      if (!p) return;
      var rows = Object.keys(p.clear).filter(function (t) { return p.clear[t] > 0; }).map(function (t) { return '<div class="row sp sm" style="padding:4px 0"><span>' + esc(RESET_LABEL[t] || t) + '</span><b>' + num(p.clear[t]) + '</b></div>'; }).join('') || '<div class="xs mut">لا توجد بيانات للمسح</div>';
      var kept = Object.keys(p.keep).map(function (t) { return '<div class="row sp sm" style="padding:4px 0"><span>' + esc(RESET_KEEP_LABEL[t] || t) + '</span><b>' + num(p.keep[t]) + '</b></div>'; }).join('');
      A.sheet('<h2>إعادة التهيئة من البداية</h2>' +
        '<div class="xs mut" style="margin-bottom:6px">هيتمسح:</div><div class="card" style="padding:10px 14px">' + rows + '</div>' +
        '<div class="xs mut" style="margin:10px 0 6px">هيفضل:</div><div class="card" style="padding:10px 14px">' + kept +
        '<div class="row sp sm" style="padding:4px 0"><span>حسابك (' + esc(p.keeper.name) + ')</span><b>1</b></div>' +
        '<div class="row sp sm" style="padding:4px 0"><span>حسابات الموظفين الأخرى هتتشال</span><b>' + num(p.staffRemoved) + '</b></div></div>' +
        '<div class="xs mut" style="margin:10px 0">نسخ احتياطية موجودة: ' + num(p.backupsNow) + ' · هنحتفظ بآخر ' + num(p.keepBackups) + ' نسخ بس.</div>' +
        '<div class="fld"><label for="rs_phrase">اكتب العبارة دي بالضبط: ' + esc(RESET_PHRASE) + '</label><input id="rs_phrase" class="in" autocomplete="off"></div>' +
        '<div class="fld"><label for="rs_pin">رمزك السري</label><input id="rs_pin" class="in ltr" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>' +
        '<div class="err" id="rs_err"></div><button class="btn dk" data-act="reset_go">نفّذ إعادة التهيئة الآن</button><button class="btn gh" data-act="closesheet">إلغاء</button>');
    });
  };
  H.reset_go = function () {
    var ph = (document.getElementById('rs_phrase') || {}).value || '', pin = (document.getElementById('rs_pin') || {}).value || '';
    var er = document.getElementById('rs_err');
    if (ph.trim() !== RESET_PHRASE) { er.textContent = 'اكتب العبارة بالضبط: ' + RESET_PHRASE; return; }
    if (!pin) { er.textContent = 'اكتب رمزك السري'; return; }
    call('sFactoryReset', { phrase: ph, pin: pin }, { keepErr: true }).then(function (d) {
      if (d && d.__err) { er.textContent = d.__err.msg; return; }
      if (!d) return;
      A.logout(true);   /* تفريغ كل الحالات المحفوظة في الجهاز، ثم دخول من جديد */
      A.toast('تمت إعادة التهيئة. النسخة الاحتياطية: ' + d.backup + ' (مخفية). سجّل دخولك من جديد.', 'ok');
    });
  };
  function teamRowCard(x, d) {
    var chips = (x.active ? '' : '<span class="chip warn">موقوف</span>') +
      (x.locked ? '<span class="chip">' + (x.id === d.me ? 'حسابك' : 'مدير الإدارة') + '</span>' : '') +
      (x.custom ? '<span class="chip dk">صلاحيات مخصّصة · ' + x.perms.length + '</span>' : '<span class="chip">قالب الدور · ' + x.perms.length + '</span>');
    var body = '<div class="grow"><b>' + esc(x.name) + '</b><div class="xs mut">' + esc(x.title) + ' · ' + esc(x.roleLabel) + (x.farmId ? ' · مزرعة ' + esc(x.farmId) : '') + '</div>' +
      '<div class="xs mut" dir="ltr" style="text-align:right">' + esc(x.phone) + '</div><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">' + chips + '</div></div>';
    if (x.locked) return '<div class="card"><div class="row" style="gap:12px">' + body + '</div></div>';
    return '<button class="tkt" data-act="t_edit" data-id="' + esc(x.id) + '">' + body + ic('back') + '</button>';
  }
  function teamForm(f, d) {
    var isNew = !f.id;
    var roleLabel = (d.roles.filter(function (r) { return r.id === f.role; })[0] || {}).label || '';
    var roleOpts = d.roles.map(function (r) { return '<option value="' + r.id + '"' + (f.role === r.id ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }).join('');
    var farmOpts = '<option value="">—</option>' + d.farms.map(function (x) { return '<option value="' + esc(x.id) + '"' + (String(f.farmId) === String(x.id) ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    var groups = [], gi = {};
    d.catalog.forEach(function (p) { if (!(p.group in gi)) { gi[p.group] = groups.length; groups.push({ g: p.group, items: [] }); } groups[gi[p.group]].items.push(p); });
    var perms = groups.map(function (gr) {
      return '<div class="sec-t">' + esc(gr.g) + '</div><div class="card col" style="gap:12px">' + gr.items.map(function (p) {
        return '<label class="chk"><input type="checkbox" data-pk="' + p.key + '"' + ((f.perms || []).indexOf(p.key) >= 0 ? ' checked' : '') + '><span>' + esc(p.label) + '</span></label>';
      }).join('') + '</div>';
    }).join('');
    var del = isNew ? '' : (S.tdel === f.id
      ? '<button class="btn dk" data-act="t_del" data-id="' + esc(f.id) + '">' + ic('warn', 'sm') + 'تأكيد: إيقاف الحساب نهائيًا</button>'
      : '<button class="btn gh" data-act="t_del" data-id="' + esc(f.id) + '">حذف الموظف</button>');
    return '<div class="card col" style="gap:12px"><b>' + (isNew ? 'موظف جديد' : 'تعديل: ' + esc(f.name)) + '</b>' +
      fld('t_name', 'الاسم', f.name) +
      fld('t_title', 'المسمى الوظيفي (يظهر للتاجر)', f.title) +
      fld('t_phone', 'رقم الموبايل (هو اسم الدخول)', f.phone, 'tel', ' dir="ltr" inputmode="tel"') +
      fld('t_email', 'البريد للتنبيهات والتقرير (اختياري)', f.email, 'email', ' dir="ltr"') +
      '<div class="fld"><label for="t_role">الدور</label><select id="t_role" class="in">' + roleOpts + '</select></div>' +
      (f.role === 'assistant' ? '<div class="fld"><label for="t_farm">المزرعة</label><select id="t_farm" class="in">' + farmOpts + '</select></div>' : '') +
      (isNew ? fld('t_pin', 'الرمز السري (من 4 إلى 6 أرقام)', '', 'password', ' inputmode="numeric" maxlength="6" dir="ltr"')
             : fld('t_pin', 'رمز جديد (اتركه فارغًا لو مش عايز تغيّره)', '', 'password', ' inputmode="numeric" maxlength="6" dir="ltr"')) +
      (isNew ? '' : '<label class="chk"><input type="checkbox" id="t_active"' + (f.active ? ' checked' : '') + '><span>الحساب نشط (لو أزلته يتوقف دخوله فورًا)</span></label>') +
      '<div class="sec-t" style="margin-top:4px">الصلاحيات</div>' +
      '<div class="xs mut">الصلاحيات الحالية تطابق قالب دور «' + esc(roleLabel) + '». عدّل اللي تحتاجه ثم احفظ. لو خصّصت الصلاحيات تبقى ثابتة حتى لو تغيّر الدور.</div>' +
      perms +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="t_save">' + ic('check', 'sm') + 'احفظ</button><button class="btn gh" data-act="t_tpl">رجّع قالب الدور</button><button class="btn gh" data-act="t_cancel">إلغاء</button></div>' +
      del + '</div>';
  }
  function captureForm() {
    var f = S.tform; if (!f) return;
    var v = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    var rl = v('t_role'); if (rl !== null) f.role = rl;
    if (v('t_name') !== null) {
      f.name = v('t_name'); f.title = v('t_title'); f.phone = v('t_phone'); f.email = v('t_email'); f.pin = v('t_pin') || '';
      var fa = v('t_farm'); if (fa !== null) f.farmId = fa;
      var ac = document.getElementById('t_active'); if (ac) f.active = ac.checked ? 1 : 0;
    }
    var boxes = document.querySelectorAll('input[data-pk]');
    if (boxes.length) f.perms = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return b.getAttribute('data-pk'); });
  }
  H.t_new = function () {
    S.tform = { id: '', name: '', title: '', phone: '', email: '', farmId: '', role: 'assistant', perms: S.team.defaults.assistant.slice(), active: 1, pin: '' };
    S.tdel = ''; sView(true); window.scrollTo(0, 0);
  };
  H.t_edit = function (el) {
    var x = (S.team.list || []).filter(function (r) { return r.id === el.dataset.id; })[0]; if (!x) return;
    S.tform = { id: x.id, name: x.name, title: x.title, phone: x.phone, email: x.email, farmId: x.farmId, role: x.role, perms: x.perms.slice(), active: x.active, pin: '' };
    S.tdel = ''; sView(true); window.scrollTo(0, 0);
  };
  H.t_cancel = function () { S.tform = null; S.tdel = ''; sView(true); };
  H.t_tpl = function () { captureForm(); if (!S.tform) return; S.tform.perms = (S.team.defaults[S.tform.role] || []).slice(); sView(true); };
  H.t_save = function () {
    captureForm(); var f = S.tform; if (!f) return;
    var payload = { id: f.id, name: f.name, title: f.title, phone: f.phone, email: f.email, role: f.role, farmId: f.farmId, perms: f.perms, pin: f.pin, active: f.active };
    call('sTeamSave', payload).then(function (d) {
      if (!d) return;
      S.team = d; S.tform = null; S.tdel = '';
      A.toast(f.id ? 'اتحفظت بيانات الموظف' : 'اتضاف الموظف. ابعت له رقمه والرمز السري', 'ok');
      sView(true); window.scrollTo(0, 0);
    });
  };
  H.t_del = function (el) {
    var id = el.dataset.id;
    if (S.tdel !== id) { S.tdel = id; return sView(true); }
    call('sTeamDelete', { id: id }).then(function (d) {
      if (!d) return;
      S.team = d; S.tform = null; S.tdel = '';
      A.toast('اتوقف حساب الموظف', 'ok'); sView(true); window.scrollTo(0, 0);
    });
  };
  H.t_role = function () { captureForm(); if (!S.tform) return; S.tform.perms = (S.team.defaults[S.tform.role] || []).slice(); sView(true); };
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 't_role' && H.t_role) H.t_role(); });
})();
