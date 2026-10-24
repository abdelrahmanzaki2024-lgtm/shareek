/* ============================================================
   شاشات التاجر: الهيكل، اليوم، التهيئة، الفيديو، اعرف، حسابي
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, $ = A.$, call = A.call, H = A.handlers, num = A.num, V = {};
  A.V = V;
  var CLEAN = [];   // دوال تنظيف عند مغادرة الشاشة (مؤقتات)
  A.onLeave = function (fn) { CLEAN.push(fn); };
  function cleanup() { while (CLEAN.length) { try { CLEAN.pop()(); } catch (e) { /* ignore */ } } }
  A.cleanup = cleanup;

  var TITLES = { today: 'اليوم', learn: 'اعرف', play: 'العب', market: 'السوق النهاردة', talk: 'كلّمنا' };

  function todayKey() { try { return new Date(A.nowMs()).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); } catch (e) { return ''; } }
  A.todayKey = todayKey;

  /* ---------- الهيكل ---------- */
  A.screens.trader = function () {
    cleanup();
    var me = S.me, app = $('#app'), sub = S.sub;
    var right = '<div class="pts">' + ic('star', 'sm') + num(me.pts) + '</div><button class="ib" data-act="account" aria-label="حسابي">' + ic('user') + '</button>';
    var hdr = sub ? A.header({ back: true, title: sub.title || '', right: sub.hidePts ? '' : '<div class="pts">' + ic('star', 'sm') + num(me.pts) + '</div>' }) : A.header({ title: TITLES[S.tab], sub: 'مرحبًا ' + A.firstName(me.name), right: right });
    app.innerHTML = A.fx(hdr) + '<main id="view" class="' + (sub ? 'notab' : '') + '"></main>' + (sub ? '' : A.tabbar(A.TABS, S.tab, 'tab', { talk: me.unread || 0 })) + (window.__DEMO && A.demoFab ? A.demoFab() : '');
    renderView();
  };
  function renderView(noPost) {
    var v = $('#view'); if (!v) return;
    var sub = S.sub, html;
    if (sub) html = (A.subs[sub.type] || function () { return ''; })(sub);
    else html = (V[S.tab] || function () { return ''; })();
    v.innerHTML = A.fx(html);
    var post = sub ? (A.subPost && A.subPost[sub.type]) : (A.post && A.post[S.tab]);
    if (post && !noPost) post(sub);   /* noPost: تحديث العرض بعد وصول بيانات، بدون إعادة طلبها (يمنع حلقة طلبات لا تنتهي) */
  }
  A.renderView = renderView;
  A.subs = {}; A.post = {}; A.subPost = {};
  A.openSub = function (sub) { cleanup(); S.sub = sub; A.screens.trader(); window.scrollTo(0, 0); };
  H.tab = function (el) { cleanup(); S.tab = el.dataset.id; S.sub = null; A.screens.trader(); window.scrollTo(0, 0); };
  H.back = function () {
    cleanup();
    if (S.role === 'staff') { S.ssub = null; return A.screens.staff(); }
    var from = S.sub && S.sub.from; S.sub = from || null; A.screens.trader(); window.scrollTo(0, 0);
  };
  H.account = function () { S.rewards = null; S.visits = null; S.seg = S.seg || {}; S.seg.account = 'card'; A.openSub({ type: 'account', title: 'حسابي', hidePts: false }); };

  /* ============ اليوم ============ */
  var DAYN = { 6: 'سبت', 0: 'أحد', 1: 'اتنين', 2: 'تلات', 3: 'أربع', 4: 'خميس', 5: 'جمعة' };
  function dayName(dk) { var d = new Date(dk + 'T12:00:00Z'); return DAYN[d.getUTCDay()]; }

  V.today = function () {
    var me = S.me, h = S.home || {}, out = [];
    /* تحية + رتبة */
    var nx = me.next, items = nx ? nx.items.filter(function (i) { return !i.done; }).slice(0, 2) : [];
    var band = h.band === 10 ? 'ضمن أنشط 10% من التجار' : h.band === 25 ? 'ضمن أنشط 25% من التجار' : h.band === 50 ? 'ضمن أنشط نصف التجار' : '';
    out.push('<div class="card dark"><div class="row">' + A.rankBadge(me.rank.n) + '<div class="grow"><div class="xs" style="color:#BDBDC0">رتبتك</div><div class="h2" style="margin:0;color:#fff">' + esc(me.rank.name) + '</div>' + (band ? '<div class="xs" style="color:#F2A900;font-weight:700">' + band + '</div>' : '') + '</div><button class="chip" data-act="account" style="background:rgba(255,255,255,.14);color:#fff">' + ic('qr', 'sm') + 'بطاقتي</button></div>' +
      (nx ? '<hr class="sep" style="border-color:#444"><div class="xs" style="color:#BDBDC0;margin-bottom:6px">الرتبة الجاية: <b style="color:#fff">' + esc(nx.name) + '</b></div>' + items.map(function (i) { return i.need ? '<div class="sm" style="margin-bottom:6px">' + esc(i.label) + ' <b>' + i.have + ' من ' + i.need + '</b>' + A.bar(i.have * 100 / i.need) + '</div>' : '<div class="sm">• ' + esc(i.label) + '</div>'; }).join('') : '<div class="sm" style="margin-top:8px">وصلت لأعلى رتبة. شكرًا إنك خط الدفاع الأول.</div>') + '</div>');
    /* سعر النهاردة (يفتح تبويب السوق) */
    var tk = A.mkTicker ? A.mkTicker() : ''; if (tk) out.push(tk);
    var hs = A.hsCard ? A.hsCard() : ''; if (hs) out.push(hs);
    /* تبويبات فرعية */
    out.push(A.segs('today', [{ id: 'round', t: 'جولتي', n: me.onboarding.done ? 0 : 1 }, { id: 'farms', t: 'المزارع' }, { id: 'gain', t: 'مكسبك' }, { id: 'crowd', t: 'مجتمعنا' }], 'round'));
    var seg = A.seg('today', 'round');
    if (seg === 'round') {
      if (!me.onboarding.done) out.push(onboardCard(me));
      out.push(roundCard(me));
      out.push(weekCard(me));
    } else if (seg === 'farms') {
      out.push(farmsCard(h.farms));
    } else if (seg === 'gain') {
      out.push(gainLossCard(h.facts));
    } else {
      if (h.collective) out.push(wallCard(h.collective));
      out.push(inviteCard(me));
      if (h.honor && h.honor.length) out.push('<div class="card"><h3>' + ic('trophy', 'sm') + ' لوحة شرف الشهر</h3><div class="row" style="flex-wrap:wrap;gap:6px">' + h.honor.map(function (n) { return '<span class="chip dk">' + esc(n) + '</span>'; }).join('') + '</div><div class="xs mut" style="margin-top:8px">بالترتيب الأبجدي وبإذن أصحابها. مفيش ترتيب بالنقاط.</div></div>');
    }
    return out.join('');
  };
  function farmsCard(farms) {
    if (!farms || !farms.length) return '<div class="card tc mut">مفيش بيانات مزارع دلوقتي.</div>';
    var tone = { good: 'ok', warn: 'warn', bad: 'bad', mute: '' };
    return '<div class="card"><div class="row sp"><h3 style="margin:0">حالة المزارع النهارده</h3>' + ic('truck') + '</div><div class="farms" style="margin-top:10px">' + farms.map(function (f) { return '<div class="farm ' + f.tone + '">' + String(f.id) + '<small>' + (f.tone === 'good' ? 'جاهزة' : f.tone === 'warn' ? 'محدود' : f.tone === 'bad' ? 'مغلقة' : '—') + '</small></div>'; }).join('') + '</div></div>' +
      '<div class="card">' + farms.map(function (f) { return '<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line)"><b style="min-width:74px">' + esc(f.name) + '</b><span class="chip ' + (tone[f.tone] || '') + '">' + esc(f.label) + '</span><span class="xs mut grow">' + esc(f.note || '') + '</span></div>'; }).join('') + '<div class="xs mut" style="margin-top:8px">محدّثة من معاوني المواقع. «غير محدّث» يعني مفيش تحديث خلال آخر 24 ساعة.</div></div>';
  }
  A.post.today = function () { if (!S.round) loadRound(); };

  function onboardCard(me) {
    var o = me.onboarding;
    function st(done, label, pts, act, cur) { return '<button class="step ' + (done ? 'done' : cur ? 'cur' : '') + '" data-act="' + act + '"' + (done ? '' : '') + '><span class="n">' + (done ? ic('check', 'sm') : '') + '</span><span class="grow"><b>' + label + '</b></span>' + (done ? '' : '<span class="chip red">+' + pts + '</span>') + '</button>'; }
    var firstOpen = !o.launch ? 0 : !o.charter ? 1 : 2;
    return '<div class="card"><div class="row sp"><h2 style="margin:0">ابدأ رحلتك كشريك</h2><span class="chip">' + ((o.launch ? 1 : 0) + (o.charter ? 1 : 0) + (o.baseline ? 1 : 0)) + ' / 3</span></div><p class="mut sm" style="margin:4px 0 12px">تلات خطوات قصيرة وتبقى «شريك واعٍ» وتتفتح لك الرتب والجوايز.</p><div class="col">' +
      st(o.launch, 'شاهد فيديو «العدو غير المرئي»', 5, 'ob_video', firstOpen === 0) + st(o.charter, 'وقّع ميثاق خط الدفاع الأول', 20, 'ob_charter', firstOpen === 1) + st(o.baseline, 'اختبر نفسك (9 أسئلة)', 20, 'ob_test', firstOpen === 2) + '</div></div>';
  }
  H.ob_video = function () { A.openSub({ type: 'video', id: 'launch', title: 'العدو غير المرئي' }); };
  H.ob_test = function () { A.startTest('baseline'); };
  H.ob_charter = function () {
    var pledges = [['icon1', 'هغسل إيدي وأطهّرها قبل ما أدخل أي منطقة إنتاج.'], ['icon2', 'هعدّي على نقاط التطهير كلها من غير استثناء.'], ['icon3', 'عربيتي وأقفاصي نضيفة ومطهّرة قبل ما أوصل البوابة.'], ['icon4', 'جزمتي نضيفة وهمرّ على حوض القدم.'], [null, 'هلتزم بتعليمات المعاون، وهبلّغ فورًا عن أي نفوق أو أعراض.']];
    A.sheet('<h2>ميثاق خط الدفاع الأول</h2><p class="mut sm" style="margin:0 0 10px">وعد بسيط منّك لنفسك ولصناعتك.</p><div class="col">' + pledges.map(function (p) { return '<div class="row" style="align-items:flex-start;gap:12px">' + (p[0] ? A.img(p[0], '', '') .replace('<img', '<img style="width:42px;height:38px;object-fit:contain;flex:none"') : '<span style="width:42px;display:grid;place-items:center;flex:none;color:var(--red)">' + ic('shield', 'lg') + '</span>') + '<div class="grow" style="font-weight:700">' + p[1] + '</div></div>'; }).join('') + '</div><label class="chk" style="margin:14px 0"><input type="checkbox" id="ch_ok"><span>أتعهّد بالالتزام بالميثاق ده.</span></label><button class="btn" data-act="charter_sign">أوقّع الميثاق (+20 نقطة)</button>');
  };
  H.charter_sign = function (el) {
    if (!(document.getElementById('ch_ok') || {}).checked) return A.toast('علّم على التعهّد الأول');
    el.disabled = true;
    call('charterSign', {}).then(function (d) {
      if (!d) { el.disabled = false; return; }
      A.closeSheet(); A.setMe(d.me); A.popPts(d.pts); A.confetti(); A.toast('تم توقيع الميثاق. شكرًا لك!', 'ok'); A.screens.trader();
    });
  };

  /* ---------- جولة اليوم ---------- */
  function loadRound() {
    call('roundGet', {}, { quiet: true }).then(function (d) { if (d) { S.round = d; S.round.dk = todayKey(); if (S.tab === 'today' && !S.sub) A.renderView(true); } });
  }
  function roundCard(me) {
    var r = S.round;
    if (!r) return '<div class="card"><div class="skel"></div></div>';
    var c = r.card, srcl = c.url ? '<a class="ext" target="_blank" rel="noopener" href="' + esc(c.url) + '">المصدر: ' + esc(c.src) + '</a>' : '<span class="src">' + esc(c.src) + '</span>';
    if (r.res) {
      var x = r.res;
      return '<div class="card ' + (x.correct ? '' : '') + '"><div class="row"><span class="chip ' + (x.correct ? 'ok' : 'bad') + '">' + (x.correct ? 'إجابتك صح' : 'الإجابة الصح: ' + (x.answer ? 'صح' : 'غلط')) + '</span><span class="grow"></span>' + (x.pts ? '<span class="chip red">+' + x.pts + ' نقطة' + (x.mult > 1 ? ' ×' + x.mult : '') + '</span>' : '') + '</div><div class="q" style="font-size:17px;margin-top:10px">' + esc(r.q.q) + '</div><div class="mut sm">' + esc(x.why) + '</div><div class="src" style="margin-top:6px">' + (x.src ? esc(x.src.label || x.src) : '') + '</div><hr class="sep"><div class="row"><div class="grow"><b>' + esc(c.title) + '</b><div class="mut sm">' + esc(c.fact) + '</div><div class="why sm" style="margin-top:6px;border-right:4px solid var(--red);padding-right:8px;font-weight:700">' + esc(c.why) + '</div><div style="margin-top:4px">' + srcl + '</div></div></div>' + (x.weekBonus ? '<div class="notice" style="margin-top:10px;background:var(--ok-bg)">' + ic('flame') + '<div><b>حققت هدف الأسبوع!</b> +' + x.weekBonus + ' نقطة مكافأة.</div></div>' : '') + '<div class="xs mut tc" style="margin-top:10px">نشوفك بكرة. كل يوم بتدخل فيه بيزوّد سلسلتك.</div></div>';
    }
    if (me.daily.roundDone || r.done) {
      return '<div class="card"><div class="row"><span class="chip ok">' + ic('check', 'sm') + 'خلّصت جولة النهارده</span></div><b style="display:block;margin-top:8px">' + esc(c.title) + '</b><div class="mut sm">' + esc(c.fact) + '</div><div style="margin-top:4px">' + srcl + '</div></div>';
    }
    return '<div class="card"><div class="row sp"><h2 style="margin:0">جولة اليوم</h2><span class="chip red">+10 نقاط · 30 ثانية</span></div><div class="chip" style="margin-top:8px">' + esc(c.tag) + '</div><b style="display:block;margin-top:6px;font-size:16.5px">' + esc(c.title) + '</b><div class="mut sm">' + esc(c.fact) + '</div><div style="margin:2px 0 6px">' + srcl + '</div><hr class="sep"><div class="q" style="font-size:18px">سمعت إن… ' + esc(r.q.q) + '</div><div class="grid2" style="margin-top:8px"><button class="btn dk tfbtn" data-act="round_a" data-a="1">' + ic('check', 'lg') + 'صح</button><button class="btn tfbtn" data-act="round_a" data-a="0">' + ic('x', 'lg') + 'غلط</button></div></div>';
  }
  H.round_a = function (el) {
    var btns = A.$$('[data-act="round_a"]'); btns.forEach(function (b) { b.disabled = true; });
    call('roundSubmit', { answer: el.dataset.a === '1' }).then(function (d) {
      if (!d) { btns.forEach(function (b) { b.disabled = false; }); return; }
      S.round.res = d; S.round.done = true; A.setMe(d.me);
      if (d.pts) A.popPts(d.pts);
      if (d.weekBonus) A.confetti();
      A.screens.trader();
    });
  };

  /* ---------- الأسبوع ---------- */
  function weekCard(me) {
    var w = me.week, tk = todayKey();
    var days = w.days.map(function (d) { return '<div class="' + (d.dk === tk ? 'today' : '') + '"><b class="' + (d.on ? 'on' : '') + '">' + (d.on ? ic('check', 'sm') : '') + '</b>' + dayName(d.dk) + '</div>'; }).join('');
    var left = Math.max(0, w.goal - w.count);
    return '<div class="card"><div class="row sp"><h3 style="margin:0">هدف الأسبوع</h3><span class="chip ' + (w.met ? 'ok' : '') + '">' + w.count + ' من ' + w.goal + ' أيام</span></div><div class="days" style="margin:12px 0">' + days + '</div>' + A.bar(Math.min(100, w.count * 100 / w.goal), w.met ? 'ok' : '') +
      '<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">' + (w.streak > 0 ? '<span class="chip warn">' + ic('flame', 'sm') + 'سلسلة ' + w.streak + (w.streak === 1 ? ' أسبوع' : w.streak === 2 ? ' أسبوعين' : w.streak <= 10 ? ' أسابيع' : ' أسبوع') + '</span>' : '') + (w.mult > 1 ? '<span class="chip red">مضاعف نقاط ×' + w.mult + '</span>' : '') + '<span class="chip">إجازات متبقية الشهر ده: ' + w.freezesLeft + '</span></div>' +
      '<div class="mut sm" style="margin-top:8px">' + (w.met ? 'حققت الهدف. كمّل عشان تكبّر السلسلة والمضاعف.' : left === 1 ? 'يوم واحد وتحقق هدف الأسبوع (+25 نقطة).' : 'فاضل ' + left + ' أيام لهدف الأسبوع. اليوم بيتحسب لما تخلّص جولة أو تدخل بوابة.') + '</div>' + '<div class="xs mut" style="margin-top:4px">لو فاتك أسبوع بنستخدم إجازة من إجازات الشهر وسلسلتك تفضل زي ما هي.</div></div>';
  }

  function gainLossCard(f) {
    f = f || {}; var drop = f.kgPerChickHealthy ? Math.round((1 - f.kgPerChickDisease / f.kgPerChickHealthy) * 1000) / 10 : 32.6;
    return '<div class="card"><h2>الالتزام بيكسّبك… والتساهل بيكلّفك</h2><div class="grid2" style="margin-top:8px"><div class="gainbox"><div class="xs mut" style="font-weight:700">دورة محمية</div><div class="big" style="color:var(--ok)">' + (f.kgPerChickHealthy || 2.036) + '</div><div class="sm">كجم حي لكل كتكوت</div><div class="chip ok" style="margin-top:6px">نفوق ' + esc(f.mortalityNormal || '3.2%') + '</div></div><div class="lossbox"><div class="xs mut" style="font-weight:700">دورة مصابة</div><div class="big" style="color:var(--red-d)">' + (f.kgPerChickDisease || 1.373) + '</div><div class="sm">كجم حي لكل كتكوت</div><div class="chip bad" style="margin-top:6px">نفوق ' + esc(f.mortalityDisease || '11.0%') + '</div></div></div>' +
      '<p style="margin:12px 0 4px;font-weight:700">الفرق ' + drop + '% في الوزن الحي لكل كتكوت. يعني الدورة المصابة ممكن تخسّرك تقريبًا ثلث الكيلوهات اللي كنت هتبيعها.</p><div class="xs mut">من بيانات كايرو ثري ايه: ' + (f.cyclesHealthy || 35) + ' دورة سليمة مقابل ' + (f.cyclesDisease || 22) + ' مصابة (' + esc(f.periodLabel || '') + '). ده ارتباط في البيانات، مش اتهام لأي طرف.' + (f.egyptCulled ? ' وإنفلونزا الطيور أعدمت ' + esc(f.egyptCulled) + ' في مصر (' + esc(f.egyptCulledSrc || '') + ').' : '') + '</div>' +
      '<button class="btn dk" style="margin-top:12px" data-act="go_mizan">احسب خسارتك أنت في «ميزاني»</button></div>';
  }
  function wallCard(c) {
    var on = Math.min(20, Math.round(c.count * 20 / Math.max(1, c.target))), bricks = '';
    for (var i = 0; i < 20; i++) bricks += '<i class="' + (i < on ? 'on' : '') + '"></i>';
    return '<div class="card"><div class="row sp"><h3 style="margin:0">حائط الدفاع</h3><span class="chip ' + (c.reached ? 'ok' : '') + '">' + num(c.count) + ' من ' + num(c.target) + ' جولة</span></div><div class="wall ' + (c.reached ? 'done' : '') + '" style="margin:10px 0">' + bricks + '</div><div class="mut sm">' + (c.reached ? 'الحائط اتقفل الأسبوع ده بجهود كل التجار. شكرًا لكم!' : 'كل جولة بيخلّصها أي تاجر بتزوّد طوبة. لو اتقفل الحائط الأسبوع ده، هنعلن شكر جماعي لكل المشاركين.') + '</div></div>';
  }
  function inviteText() {
    var me = S.me, url = (S.home && S.home.appUrl) || (location.href.split('?')[0]);
    return 'انضم لـ«شريك الدفاع» من كايرو ثري ايه، تطبيق الأمن الحيوي للتجار. استخدم كودي ' + me.code + '\n' + url + (url.indexOf('?') < 0 ? '?ref=' : '&ref=') + me.code;
  }
  function inviteCard(me) {
    return '<div class="card"><div class="row"><span style="color:var(--red)">' + ic('share', 'lg') + '</span><div class="grow"><h3 style="margin:0">ادعُ تاجر زميلك</h3><div class="mut sm">+50 نقطة لما يكمل تسجيله، و+100 لما يعدّي بوابة نظيفة. ' + (me.invites.done ? 'رشّحت ' + me.invites.done + ' لحد دلوقتي.' : '') + '</div></div></div><div class="row" style="margin-top:10px"><span class="chip dk" style="font-size:16px;letter-spacing:3px;direction:ltr">' + esc(me.code) + '</span><span class="grow"></span><button class="btn sm" data-act="inv_copy">' + ic('link', 'sm') + 'انسخ الدعوة</button><a class="btn sm dk" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(inviteText()) + '">واتساب</a></div></div>';
  }
  H.inv_copy = function () { A.copyText(inviteText()); };

  /* ============ الفيديو ============ */
  A.subs.video = function (sub) {
    var v = findVideo(sub.id);
    if (!v) { loadContent(function () { A.renderView(); }); return A.loading(); }
    sub.v = v; sub.started = A.nowMs(); sub.left = v.minSec;
    var cover = A.IMG[v.cover] || '';
    var body;
    var media = window.__MEDIA && window.__MEDIA[v.id];
    if (media) body = '<video id="vplayer" controls playsinline preload="metadata" poster="' + cover + '" src="' + media + '"></video>';
    else if (v.driveId) body = '<iframe src="https://drive.google.com/file/d/' + encodeURIComponent(v.driveId) + '/preview" allow="autoplay; fullscreen" allowfullscreen></iframe>';
    else body = slides(v, cover);
    var done = v.watched;
    return '<div class="player" id="pl">' + body + '</div><div class="card" style="margin-top:2px"><h2>' + esc(v.title) + '</h2><div class="mut sm">' + esc(v.desc) + '</div><div style="margin-top:12px">' + (done ? '<div class="chip ok">' + ic('check', 'sm') + 'شاهدت الفيديو ده قبل كده</div>' : '<button class="btn off" id="vdone" data-act="video_done" disabled>كمّل الفيديو… <span id="vleft">' + v.minSec + '</span> ث</button><div class="xs mut tc" style="margin-top:6px">الزر بيشتغل بعد المدة اللازمة. +' + v.pts + ' نقاط.</div>') + '</div></div>' +
      (v.id === 'launch' && !S.me.onboarding.charter ? '<div class="notice">' + ic('shield') + '<div>الخطوة الجاية: <b>وقّع ميثاق خط الدفاع الأول</b> من شاشة اليوم.</div></div>' : '');
  };
  var SLIDES = null;
  function slides(v, cover) {
    var g = (A.ST.gateItems || []);
    var list = v.id === 'launch' ? [{ t: 'فيه عدو… مابيتشافش', p: 'بيدخل المزرعة من أربع أبواب. وأنت اللي تقفلهم.', ic: 'wordmark_dark' }].concat(g.map(function (x) { return { t: x.title, p: x.ok, ic: x.icon }; })).concat([{ t: 'أنت خط الدفاع الأول', p: 'خطوة صغيرة = حماية كاملة.', ic: 'wordmark_dark' }]) : [{ t: v.title, p: v.desc, ic: v.cover }];
    SLIDES = { list: list, i: 0 };
    return '<div class="slide" id="slide">' + slideHtml(list[0]) + '</div>';
  }
  function slideHtml(s) { return (A.IMG[s.ic] ? '<img class="ic" src="' + A.IMG[s.ic] + '" alt="" style="' + (s.ic.indexOf('cv_') === 0 ? 'height:240px;border-radius:14px' : '') + '">' : '') + '<h3>' + esc(s.t) + '</h3><p>' + esc(s.p) + '</p>'; }
  A.subPost.video = function (sub) {
    if (!sub || !sub.v) return;
    var v = sub.v;
    call('videoStart', { id: v.id }, { quiet: true });
    var t0 = Date.now(), tm = setInterval(function () {
      var left = Math.max(0, v.minSec - Math.round((Date.now() - t0) / 1000)), el = document.getElementById('vleft'), b = document.getElementById('vdone');
      if (el) el.textContent = left;
      if (left <= 0 && b) { b.disabled = false; b.className = 'btn ok'; b.innerHTML = ic('check') + 'خلّصت الفيديو (' + v.pts + ' نقاط)'; }
      if (SLIDES && document.getElementById('slide')) {
        var n = Math.min(SLIDES.list.length - 1, Math.floor((Date.now() - t0) / 1000 / Math.max(6, v.minSec / SLIDES.list.length)));
        if (n !== SLIDES.i) { SLIDES.i = n; document.getElementById('slide').innerHTML = slideHtml(SLIDES.list[n]); }
      }
      if (left <= 0 && !SLIDES) clearInterval(tm);
    }, 500);
    var vp = document.getElementById('vplayer');
    if (vp) vp.addEventListener('ended', function () { var b = document.getElementById('vdone'); if (b && !b.disabled) b.click(); });
    A.onLeave(function () { clearInterval(tm); SLIDES = null; var p = document.getElementById('vplayer'); if (p) p.pause(); });
  };
  H.video_done = function (el) {
    var v = S.sub && S.sub.v; if (!v) return;
    el.disabled = true;
    call('videoDone', { id: v.id }, { keepErr: true }).then(function (d) {
      if (d && d.__err) { el.disabled = false; return A.toast(d.__err.msg); }
      if (!d) { el.disabled = false; return; }
      A.setMe(d.me); v.watched = true;
      if (S.content) S.content.videos.forEach(function (x) { if (x.id === v.id) x.watched = true; });
      if (d.pts) { A.popPts(d.pts); } else if (d.capped) A.toast('وصلت سقف نقاط اليوم الرقمية. الفيديو اتحسب لك.');
      A.toast('تمام! الفيديو اتحسب لك', 'ok');
      S.sub = null; A.screens.trader();
    });
  };
  function findVideo(id) { return S.content && S.content.videos.filter(function (v) { return v.id === id; })[0]; }
  function loadContent(cb) {
    if (S.content) return cb && cb();
    call('content', {}).then(function (d) { if (d) { S.content = d; } cb && cb(); });
  }
  A.loadContent = loadContent;

  /* ============ اعرف ============ */
  var PH = { c1: 'ph_vehwash1', c2: 'ph_chickcrates', c3: 'ph_feedtruck', c4: 'ph_mudboots', c6: 'ph_ppe', c8: 'ph_houses_ext' };
  V.learn = function () {
    var tabs = A.segs('learn', [{ id: 'vids', t: 'فيديوهات' }, { id: 'why', t: 'ليه بنعمل كده؟' }, { id: 'more', t: 'معلومات تهمك' }], 'vids');
    if (!S.content) return tabs + A.loading();
    var c = S.content, seg = A.seg('learn', 'vids');
    var tr = c.cards.filter(function (k) { return k.forTrader; }), others = c.cards.filter(function (k) { return !k.forTrader; });
    function acc(k) {
      var ph = PH[k.id] && A.IMG[PH[k.id]] ? '<img class="ph" src="' + A.IMG[PH[k.id]] + '" alt="' + esc(k.tag) + '">' : '';
      return '<div class="acc" id="acc_' + k.id + '"><button data-act="acc" data-id="' + k.id + '"><span class="chip">' + esc(k.tag) + '</span><b>' + esc(k.title) + '</b>' + (k.read ? '<span class="chip ok">' + ic('check', 'sm') + '</span>' : '<span class="chip red">+' + c.cardPts + '</span>') + ic('down', 'ch') + '</button><div class="bd">' + ph + '<div class="fact">' + esc(k.fact) + '</div>' + (A.voiceCard ? A.voiceCard(k) : '') + '<div class="why">' + esc(k.why) + '</div><a class="ext" target="_blank" rel="noopener" href="' + esc(k.url) + '">المصدر: ' + esc(k.src) + '</a></div></div>';
    }
    var foot = '<div class="xs mut">الصور من USDA وWikimedia Commons (ملك عام). المراجع: إرشادات هابرد للأمن الحيوي وبيانات كايرو ثري ايه.</div>';
    if (seg === 'why') return tabs + '<div class="col">' + tr.map(acc).join('') + '</div>' + foot;
    if (seg === 'more') return tabs + '<div class="col">' + others.map(acc).join('') + '</div>' + foot;
    return tabs + '<div class="vgrid">' + c.videos.map(function (v) { return '<button class="vcard" data-act="open_video" data-id="' + v.id + '"><img src="' + (A.IMG[v.cover] || '') + '" alt="">' + (v.watched ? '<span class="tick">' + ic('check', 'sm') + '</span>' : '<span class="pts">+' + v.pts + '</span>') + '<span class="pl">' + ic('play') + '</span><span class="cap">' + esc(v.title) + '</span></button>'; }).join('') + '</div>';
  };
  A.post.learn = function () { if (!S.content) loadContent(function () { A.renderView(true); }); };
  H.open_video = function (el) { A.openSub({ type: 'video', id: el.dataset.id, title: 'فيديو', from: null }); };
  H.acc = function (el) {
    var box = document.getElementById('acc_' + el.dataset.id); if (!box) return;
    box.classList.toggle('open');
    var k = S.content.cards.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (box.classList.contains('open') && k && !k.read) {
      k.read = true;
      call('cardRead', { id: k.id }, { quiet: true }).then(function (d) {
        if (!d) { k.read = false; return; }
        A.setMe(d.me); if (d.pts) A.popPts(d.pts);
        var hd = box.querySelector('button .chip.red'); if (hd) { hd.className = 'chip ok'; hd.innerHTML = ic('check', 'sm'); }
        var p = $('.hdr .pts'); if (p) p.innerHTML = ic('star', 'sm') + num(S.me.pts);
      });
    }
  };

  /* ============ حسابي ============ */
  A.subs.account = function () {
    var me = S.me, ranks = A.ST.ranks || [], out = [];
    out.push(A.segs('account', [{ id: 'card', t: 'بطاقتي' }, { id: 'ranks', t: 'الرتب' }, { id: 'rw', t: 'جوايزي' }, { id: 'visits', t: 'زياراتي' }, { id: 'set', t: 'إعدادات' }], 'card'));
    var seg = A.seg('account', 'card');
    if (seg === 'card') {
      var qr = window.C3A && C3A.QR ? C3A.QR.svg('C3A:' + me.code, { margin: 1 }) : '';
      out.push('<div class="pass"><div class="row" style="position:relative"><div class="grow"><div class="xs" style="color:#BDBDC0">بطاقة شريك الدفاع</div><div class="h2" style="color:#fff;margin:2px 0">' + esc(me.name) + '</div><div class="sm" style="color:#D5D5D8">' + (me.plate ? 'لوحة: ' + esc(me.plate) : 'بدون لوحة مسجّلة') + (me.company ? '<br>' + esc(me.company) : '') + '</div></div>' + A.rankBadge(me.rank.n) + '</div><div class="row" style="margin-top:14px;position:relative"><div class="qr">' + qr + '</div><div class="grow tc"><div class="xs" style="color:#BDBDC0">كودك</div><div class="code">' + esc(me.code) + '</div><div class="xs" style="color:#D5D5D8;margin-top:6px">اعرضه على المعاون عند البوابة</div></div></div><div class="row sp" style="margin-top:12px;position:relative"><span class="chip" style="background:rgba(255,255,255,.14);color:#fff">' + esc(me.rank.name) + '</span><span class="chip red">' + ic('star', 'sm') + num(me.pts) + ' نقطة</span></div></div>');
      out.push(inviteCard(me));
      if (A.certCard) out.push(A.certCard());
    } else if (seg === 'ranks') {
      out.push('<div class="card ladder"><h3>سلّم الرتب</h3>' + ranks.map(function (r) { var cur = r.n === me.rank.n; return '<div class="it ' + (cur ? 'cur' : r.n > me.rank.n ? 'lock' : '') + '">' + A.rankBadge(r.n, 34) + '<div class="grow"><b>' + esc(r.name) + '</b><div class="xs" style="opacity:.8">' + esc(r.need) + '</div>' + (r.perk ? '<div class="xs" style="opacity:.9;color:' + (cur ? '#F2A900' : 'var(--red-d)') + '">★ ' + esc(r.perk) + '</div>' : '') + '</div></div>'; }).join('') + '</div>');
      out.push('<div class="card"><h3>شاراتك</h3><div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-start">' + me.badges.map(function (b) { return '<div class="badge ' + (b.earned ? 'on' : '') + '"><div class="c">' + ic(b.earned ? 'star' : 'lock', 'sm') + '</div>' + esc(b.title) + '</div>'; }).join('') + '</div></div>');
    } else if (seg === 'rw') {
      out.push('<div class="card" id="rwbox"><h3>جوايزك</h3>' + (S.rewards ? rewardsHtml(S.rewards) : '<div class="spin"></div>') + '</div>');
    } else if (seg === 'visits') {
      out.push('<div class="card" id="vsbox"><h3>سجل زياراتك للبوابة</h3>' + (S.visits ? visitsHtml(S.visits) : '<div class="spin"></div>') + '</div>');
    } else {
      out.push('<div class="card"><label class="chk"><input type="checkbox" id="honor_t" data-act="honor" ' + (me.honor ? 'checked' : '') + '><span><b>اسمي في لوحة الشرف</b><br><span class="mut sm">اختياري، وتقدر تلغيه في أي وقت. (بتظهر من رتبة «شريك منتظم»)</span></span></label><hr class="sep"><button class="btn gh" data-act="inv_copy">' + ic('share') + 'انسخ دعوتي (' + esc(me.code) + ')</button><button class="lnk" data-act="terms">الشروط والخصوصية</button></div>');
      if (A.hsLink) out.push(A.hsLink());
      out.push('<button class="btn gh" data-act="logout">' + ic('out') + 'تسجيل الخروج</button>');
    }
    return out.join('');
  };
  function rewardsHtml(d) {
    var STATE = { locked: ['مقفولة', 'chip'], available: ['متاحة', 'chip ok'], pending_ops: ['قيد اعتماد التشغيل', 'chip warn'], requested: ['اتطلبت', 'chip warn'], approved: ['معتمدة', 'chip ok'], delivered: ['تم', 'chip ok'], rejected: ['مرفوضة', 'chip bad'] };
    return d.rewards.map(function (r) {
      var s = STATE[r.state] || ['', 'chip'];
      var need = r.state === 'locked' ? '<div class="xs mut">محتاج رتبة ' + esc((A.ST.ranks[r.rank] || {}).name || r.rank) + (r.points ? ' و' + num(r.points) + ' نقطة' : '') + '</div>' : '';
      return '<div class="rw"><div class="ic" style="color:' + (r.state === 'locked' ? 'var(--mut)' : 'var(--red)') + '">' + ic(r.state === 'locked' ? 'lock' : 'gift') + '</div><div class="grow"><b>' + esc(r.title) + '</b><div class="mut sm">' + esc(r.desc) + '</div>' + need + '</div>' + (r.state === 'available' ? '<button class="btn sm" data-act="claim" data-id="' + r.id + '">اطلبها</button>' : '<span class="' + s[1] + '">' + s[0] + '</span>') + '</div>';
    }).join('') + '<div class="xs mut" style="margin-top:8px">الجوايز بالاستحقاق والالتزام مش بالسحب. الامتيازات التشغيلية بتحتاج اعتماد الإدارة. النقاط مش بتتخصم أبدًا.</div>';
  }
  function visitsHtml(d) {
    if (!d.visits.length) return '<div class="mut sm">لسه ماعندكش زيارات مسجّلة. أول زيارة نظيفة هتظهر هنا.</div>';
    var items = (A.ST.gateItems || []);
    return d.visits.slice(0, 8).map(function (v) {
      return '<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="chip ' + (v.clean ? 'ok' : v.violation ? 'bad' : 'warn') + '">' + v.pass + '/4</span><div class="grow"><b>' + esc(v.farm) + '</b><div class="xs mut">' + A.fdt(v.ts) + ' · ' + items.map(function (it) { return (v.checks[it.id] ? '✓ ' : '✗ ') + it.title; }).join(' · ') + '</div></div>' + (v.points ? '<span class="chip red">+' + v.points + '</span>' : '') + '</div>';
    }).join('');
  }
  A.subPost.account = function () {
    var seg = A.seg('account', 'card');
    if (seg === 'rw' && !S.rewards) call('rewardsList', {}, { quiet: true }).then(function (d) { if (d) { S.rewards = d; var b = document.getElementById('rwbox'); if (b) b.innerHTML = '<h3>جوايزك</h3>' + rewardsHtml(d); } });
    if (seg === 'visits' && !S.visits) call('visits', {}, { quiet: true }).then(function (d) { if (d) { S.visits = d; var b = document.getElementById('vsbox'); if (b) b.innerHTML = '<h3>سجل زياراتك للبوابة</h3>' + visitsHtml(d); } });
  };
  H.claim = function (el) {
    el.disabled = true;
    call('rewardClaim', { id: el.dataset.id }).then(function (d) {
      if (!d) { el.disabled = false; return; }
      S.rewards = d; var b = document.getElementById('rwbox'); if (b) b.innerHTML = '<h3>جوايزك</h3>' + rewardsHtml(d);
      A.toast('تم تسجيل طلبك. هيراجعه فريق الأمن الحيوي.', 'ok'); A.confetti();
    });
  };
  H.honor = function (el) {
    call('honorSet', { on: el.checked }).then(function (d) { if (d) { S.me.honor = d.honor; A.toast(d.honor ? 'اسمك هيظهر في لوحة الشرف' : 'اتشال اسمك من لوحة الشرف', 'ok'); A.loadHome(); } });
  };
})();
