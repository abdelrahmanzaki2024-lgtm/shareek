/* ============================================================
   الهيكل والتوجيه وشاشات الدخول والتسجيل
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, $ = A.$, call = A.call, H = A.handlers;

  var TABS = [
    { id: 'today', t: 'اليوم', i: 'home' }, { id: 'learn', t: 'اعرف', i: 'book' }, { id: 'play', t: 'العب', i: 'game' },
    { id: 'market', t: 'السوق', i: 'trend' }, { id: 'talk', t: 'كلّمنا', i: 'chat' }
  ];
  var STABS = [
    { id: 'gate', t: 'البوابة', i: 'shield' }, { id: 'inbox', t: 'الرسائل', i: 'chat' }, { id: 'farms', t: 'المزارع', i: 'truck' }, { id: 'market', t: 'السوق', i: 'trend' }, { id: 'dash', t: 'اللوحة', i: 'chart' }
  ];

  /* ---------- الرسم الرئيسي ---------- */
  function renderInner() {
    var app = $('#app');
    if (S.booting) { app.innerHTML = splash(); return; }
    if (S.role === 'route') return A.screens.route();
    if (!S.role) { app.innerHTML = authView(); return; }
    if (S.role === 'trader') return A.screens.trader();
    if (S.role === 'staff') return A.screens.staff();
  }
  /* حاجز الأخطاء: إن تعثّرت شاشة نعرض بطاقة استرداد بدل صفحة فارغة، ونبلّغ الخادم بنص مقصوص */
  function render() {
    try { renderInner(); }
    catch (e) {
      if (A.reportErr) A.reportErr(e, 'render');
      var app = $('#app');
      if (app) app.innerHTML = '<div class="hero" style="padding-bottom:30px"><div class="card tc col" style="margin:16px"><b>حصلت مشكلة مؤقتة في الشاشة دي</b><p class="mut sm">بياناتك محفوظة ومفيش حاجة اتمسحت. اضغط «حاول تاني».</p><div class="grid2"><button class="btn dk" data-act="recover">حاول تاني</button><button class="btn gh" data-act="logout">خروج</button></div></div></div>';
    }
  }
  H.recover = function () { render(); };
  function splash() {
    return '<div class="hero" style="padding-bottom:40px;flex:1;display:flex;flex-direction:column;justify-content:center;border-radius:0">' + A.img('wordmark_dark', 'wm', 'العدو غير المرئي') + '<div class="spin"></div></div>';
  }
  A.render = render;

  /* ---------- رأس الصفحة والتبويبات ---------- */
  function header(opts) {
    var back = opts.back ? '<button class="ib" data-act="back" aria-label="رجوع">' + ic('back') + '</button>' : '<img class="logo" src="' + A.IMG.wordmark_dark + '" alt="العدو غير المرئي" style="height:38px">';
    return '<header class="hdr">' + back + '<div class="ttl">' + esc(opts.title || 'شريك الدفاع') + (opts.sub ? '<span class="sub">' + esc(opts.sub) + '</span>' : '') + '</div>' + (opts.right || '') + '</header>' + (opts.staff ? '<div class="staffbar"></div>' : '');
  }
  function tabbar(list, cur, act, badges) {
    return '<nav class="tabs">' + list.map(function (t) {
      var b = badges && badges[t.id] ? '<span class="tdot">' + badges[t.id] + '</span>' : '';
      return '<button class="' + (t.id === cur ? 'on' : '') + '" data-act="' + act + '" data-id="' + t.id + '">' + ic(t.i) + '<span>' + t.t + '</span>' + b + '</button>';
    }).join('') + '</nav>';
  }
  A.header = header; A.tabbar = tabbar; A.TABS = TABS; A.STABS = STABS;

  /* ---------- تبويبات فرعية (شرائح) داخل الصفحات الطويلة ---------- */
  function segs(group, list, def) {
    var cur = (S.seg && S.seg[group]) || def;
    return '<div class="segs" role="tablist">' + list.map(function (x) {
      return '<button role="tab" aria-selected="' + (x.id === cur) + '" class="' + (x.id === cur ? 'on' : '') + '" data-act="seg" data-g="' + group + '" data-id="' + x.id + '">' + x.t + (x.n ? '<i>' + x.n + '</i>' : '') + '</button>';
    }).join('') + '</div>';
  }
  A.segs = segs;
  A.seg = function (group, def) { return (S.seg && S.seg[group]) || def; };
  H.seg = function (el) {
    S.seg = S.seg || {}; S.seg[el.dataset.g] = el.dataset.id;
    if (S.role === 'staff') { if (A.sView) A.sView(); } else A.renderView();
    window.scrollTo(0, 0);
  };

  /* ---------- شاشة الدخول ---------- */
  var FARMS = []; for (var i = 1; i <= 10; i++) FARMS.push(i);
  function authView() {
    var mode = S.authMode || 'login';
    var demo = window.__DEMO && A.demoAuth ? A.demoAuth() : '';
    var form;
    if (mode === 'staff') {
      form = '<h2>دخول فريق الأمن الحيوي</h2><p class="mut sm" style="margin:0 0 12px">للمعاونين والمشرفين والإدارة فقط.</p>' + fld('s_phone', 'رقم الموبايل', '<input id="s_phone" class="in ltr" inputmode="tel" autocomplete="username" placeholder="01xxxxxxxxx">') +
        fld('s_pin', 'الرمز السري', '<input id="s_pin" class="in ltr" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password">') +
        '<div class="err" id="s_err"></div><button class="btn dk" data-act="staffLogin">دخول</button><button class="lnk" data-act="authmode" data-m="login">دخول التجار</button>';
    } else if (mode === 'register') {
      form = '<div class="seg" style="margin-bottom:14px"><button data-act="authmode" data-m="login">دخول</button><button class="on">حساب جديد</button></div>' +
        fld('r_name', 'الاسم بالكامل', '<input id="r_name" class="in" autocomplete="name" maxlength="40">') +
        fld('r_phone', 'رقم الموبايل', '<input id="r_phone" class="in ltr" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx">', 'ده اللي هتدخل بيه كل مرة') +
        fld('r_pin', 'رمز سري (٤ إلى ٦ أرقام)', '<input id="r_pin" class="in ltr" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password">', 'متحفظش رقم موبايلك أو تاريخ ميلادك') +
        fld('r_plate', 'رقم لوحة عربيتك (اختياري)', '<input id="r_plate" class="in" maxlength="14" placeholder="مثال: 1234 أ ب ج">', 'بيسهّل التعرف عليك عند البوابة') +
        fld('r_company', 'اسم شركتك أو تجارتك (اختياري)', '<input id="r_company" class="in" maxlength="40">') +
        fld('r_farm', 'أكتر مزرعة بتتعامل معاها (اختياري)', '<select id="r_farm" class="in"><option value="">مش متأكد</option>' + FARMS.map(function (f) { return '<option value="' + f + '">مزرعة ' + f + '</option>'; }).join('') + '</select>') +
        fld('r_ref', 'كود تاجر زميلك (لو عندك)', '<input id="r_ref" class="in ltr" maxlength="6" value="' + esc(S.ref || '') + '" style="text-transform:uppercase">', 'أنت وهو بتاخدوا نقاط') +
        '<label class="chk"><input type="checkbox" id="r_agree"><span>وافقت على <a href="#" data-act="terms">شروط الاستخدام والخصوصية</a></span></label>' +
        '<div class="err" id="r_err"></div><button class="btn" data-act="register">إنشاء حسابي</button>';
    } else {
      form = '<div class="seg" style="margin-bottom:14px"><button class="on">دخول</button><button data-act="authmode" data-m="register">حساب جديد</button></div>' +
        fld('l_phone', 'رقم الموبايل', '<input id="l_phone" class="in ltr" inputmode="tel" autocomplete="username" placeholder="01xxxxxxxxx">') +
        fld('l_pin', 'الرمز السري', '<input id="l_pin" class="in ltr" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password">') +
        '<div class="err" id="l_err"></div><button class="btn" data-act="login">ادخل</button><p class="mut xs tc" style="margin:0">نسيت الرمز؟ اطلب من معاون المزرعة يعيّنه لك.</p><button class="lnk" data-act="authmode" data-m="staff">دخول الموظفين</button>';
    }
    return '<div class="hero">' + A.img('wordmark_dark', 'wm', 'العدو غير المرئي') + A.img('logo_company_dark', 'co', 'Cairo 3A Poultry') + '<p>شريك الدفاع · تطبيق التجار للأمن الحيوي</p></div>' +
      '<div class="card authcard col">' + form + '</div>' + (A.authExtra ? A.authExtra() : '') + '<div style="padding:14px" class="col">' + demo + '<p class="mut xs tc" style="margin:6px 0 0">أنت خط الدفاع الأول</p></div>';
  }
  function fld(id, label, input, help) { return '<div class="fld"><label for="' + id + '">' + label + '</label>' + input + (help ? '<span class="help">' + help + '</span>' : '') + '</div>'; }
  A.fld = fld;

  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function setErr(id, msg) { var e = document.getElementById(id); if (e) e.textContent = msg || ''; }

  function enter(data, role) {
    S.tok = data.token; S.role = role; A.secSave('c3a_tok', data.token); A.lsSet('c3a_role', role);
    S.authMode = 'login'; S.tab = 'today'; S.stab = 'gate'; S.sub = null; S.seg = {}; S.annShown = false;
    if (role === 'trader') { S.me = data.me; return A.loadHome().then(function () { render(); window.scrollTo(0, 0); if (A.announce) A.announce(); }); }
    S.staff = data.staff; return A.screens.staffInit().then(function () { render(); window.scrollTo(0, 0); if (A.fleetNotesStart) A.fleetNotesStart(); });
  }
  A.enter = enter;

  H.authmode = function (el) { S.authMode = el.dataset.m; render(); };
  H.login = function (el) {
    setErr('l_err', ''); var p = val('l_phone'), pin = val('l_pin');
    if (!p || !pin) return setErr('l_err', 'اكتب رقم الموبايل والرمز السري');
    el.disabled = true; el.textContent = 'لحظة…';
    call('login', { phone: p, pin: pin }, { keepErr: true }).then(function (d) {
      if (d && d.__err) { el.disabled = false; el.textContent = 'ادخل'; return setErr('l_err', d.__err.msg); }
      if (d) enter(d, 'trader');
    });
  };
  H.staffLogin = function (el) {
    setErr('s_err', ''); var p = val('s_phone'), pin = val('s_pin');
    if (!p || !pin) return setErr('s_err', 'اكتب رقم الموبايل والرمز السري');
    el.disabled = true;
    call('staffLogin', { phone: p, pin: pin }, { keepErr: true }).then(function (d) {
      if (d && d.__err) { el.disabled = false; return setErr('s_err', d.__err.msg); }
      if (d) enter(d, 'staff');
    });
  };
  H.register = function (el) {
    setErr('r_err', '');
    var p = { name: val('r_name'), phone: val('r_phone'), pin: val('r_pin'), plate: val('r_plate'), company: val('r_company'), farmId: val('r_farm'), ref: val('r_ref').trim().toUpperCase(), agree: !!(document.getElementById('r_agree') || {}).checked };
    el.disabled = true; el.textContent = 'لحظة…';
    call('register', p, { keepErr: true }).then(function (d) {
      if (d && d.__err) { el.disabled = false; el.textContent = 'إنشاء حسابي'; return setErr('r_err', d.__err.msg); }
      if (d) { enter(d, 'trader').then(function () { A.toast('أهلًا بيك في شريك الدفاع!', 'ok'); }); }
    });
  };
  H.terms = function (el, ev) {
    ev.preventDefault();
    A.sheet('<h2>شروط الاستخدام والخصوصية</h2><div class="col sm">' +
      [['بنحفظ إيه؟', 'اسمك، ورقم موبايلك، ورقم لوحة عربيتك (لو كتبته)، ونشاطك في التطبيق ونتائج الألعاب وزيارات البوابة. مش بنجمع أي بيانات مالية.'],
       ['ليه؟', 'عشان نسهّل دخولك المزارع، ونحسب نقاطك ومكافآتك، ونقيس أثر التوعية بالأمن الحيوي.'],
       ['مين بيشوف؟', 'فريق الأمن الحيوي في المواقع بيشوف اسمك ولوحتك وسجل زياراتك. رقمك بيظهر لموظف واحد بس لو قرر يتصل بيك ردًا على رسالتك.'],
       ['أرقام المسؤولين', 'محفوظة ومش بتظهر لأي تاجر. كل التواصل بيتم جوه التطبيق.'],
       ['الرمز السري', 'بيتخزن مشفّر، ومحدش يقدر يشوفه. لو نسيته المعاون يعيّنه لك.'],
       ['النقاط والجوائز', 'النقاط مش بتتخصم. الجوائز بالاستحقاق والالتزام مش بالحظ. وبعض الامتيازات التشغيلية محتاجة اعتماد الإدارة.'],
       ['لوحة الشرف', 'اسمك مش بيظهر فيها غير بإذنك، وتقدر تلغيه في أي وقت.']].map(function (x) { return '<div><b>' + x[0] + '</b><div class="mut">' + x[1] + '</div></div>'; }).join('') + '</div><button class="btn" style="margin-top:14px" data-act="closesheet">تمام، فهمت</button>');
  };
  H.closesheet = function () { A.closeSheet(); };
  H.logout = function () { A.logout(); };

  /* ---------- الاستدعاءات العامة ---------- */
  A.loadHome = function () {
    return call('home', {}).then(function (d) { if (d) { S.home = d; S.me = d.me; } return d; });
  };
  A.setMe = function (me) { if (me) { S.me = me; if (S.home) S.home.me = me; } };

  /* ---------- التفويض العام للنقرات ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var fn = H[t.dataset.act];
    if (fn) { fn(t, e); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
      var id = e.target.id || '';
      var map = { l_phone: 'login', l_pin: 'login', s_phone: 'staffLogin', s_pin: 'staffLogin' };
      if (map[id]) { var b = document.querySelector('[data-act="' + map[id] + '"]'); if (b) b.click(); }
    }
  });

  /* ---------- الإقلاع ---------- */
  /* بعد فتح الصفحة بلا جلسة: لو فيه رحلة سائق نشطة على الجهاز نكمّلها من حيث توقفت (الرابط محفوظ مشفّرًا) */
  function resumeRoute() {
    return A.secLoad('c3a_route').then(function (rt) {
      if (rt && !A.routeMode && !S.tok) return A.startRoute(rt);
      S.booting = false; render();
    }, function () { S.booting = false; render(); });
  }
  A.boot = function () {
    /* رابط السائق: ?r=… يفتح شاشة الخط مباشرة بلا تسجيل دخول */
    try { var rq = /[?&]r=([A-Za-z0-9]{16,80})(?:&|$)/.exec(location.search || ''); if (rq) return A.startRoute(rq[1]); } catch (e0) { /* ignore */ }
    S.booting = true; render();
    try { if (window.google && google.script && google.script.url && google.script.url.getLocation) google.script.url.getLocation(function (loc) {
      var rr = loc && loc.parameter && loc.parameter.r;
      if (rr && /^[A-Za-z0-9]{16,80}$/.test(String(rr))) return A.startRoute(String(rr));
      if (loc && loc.parameter && loc.parameter.ref) { S.ref = String(loc.parameter.ref).substring(0, 6).toUpperCase(); S.authMode = 'register'; if (!S.role && !S.booting) render(); } }); } catch (e) { /* ignore */ }
    try { var q = /[?&]ref=([A-Za-z0-9]{3,6})/.exec(location.search); if (q) { S.ref = q[1].toUpperCase(); S.authMode = 'register'; } } catch (e2) { /* ignore */ }
    var role = A.lsGet('c3a_role');
    A.secLoad('c3a_tok').then(function (tok) {
      if (!tok || !role) return resumeRoute();
      S.tok = tok;
      var first = role === 'staff' ? call('sMe', {}, { quiet: true }) : call('home', {}, { quiet: true });
      first.then(function (d) {
        if (A.routeMode) return;   // فُتح رابط سائق في الأثناء: لا نكتب فوقه
        S.booting = false;
        if (!d) { S.tok = ''; A.secClear('c3a_tok'); A.lsSet('c3a_role', null); return render(); }
        S.role = role;
        if (role === 'staff') { S.staff = d.staff; A.screens.staffInit(d).then(render).then(function () { if (A.fleetNotesStart) A.fleetNotesStart(); }); }
        else { S.home = d; S.me = d.me; render(); if (A.announce) A.announce(); }
      });
    });
  };
})();
