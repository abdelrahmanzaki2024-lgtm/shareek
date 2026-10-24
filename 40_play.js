/* ============================================================
   العب (ألعاب + اختبارات) وميزاني
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, $ = A.$, call = A.call, H = A.handlers, num = A.num, V = A.V;

  /* ============ تبويب العب ============ */
  V.play = function () {
    var me = S.me, games = A.ST.games || [], out = [];
    var fdue = !!(me.followupDue && !me.followup);
    out.push(A.segs('play', [{ id: 'games', t: 'الألعاب' }, { id: 'test', t: 'قياس مستواك', n: fdue ? 1 : 0 }], 'games'));
    if (A.seg('play', 'games') === 'test') return out.concat(testTab(me)).join('');
    out.push('<div class="notice">' + ic('flame') + '<div>كل لعبة بتديك من <b>10 لـ 30 نقطة</b> أول مرة تلعبها في اليوم. سقف النقاط الرقمية اليومي <b>' + (me.daily.cap || 40) + '</b>، والتكرار للمتعة والتعلّم بدون نقاط. النقاط مش بتتخصم أبدًا.</div></div>');
    if (fdue) out.push('<button class="gcard" data-act="start_test" data-k="followup"><span class="chip red" style="flex:none">+20</span><div class="grow"><b>اختبار الشهر جاهز</b><div class="mut sm">9 أسئلة جديدة. نشوف إيه اللي اتغيّر من أول اختبار.</div></div>' + ic('fwd') + '</button>');
    out.push('<div class="sec-t">ألعاب «الأمن الحيوي»</div>');
    games.forEach(function (g) {
      var played = me.daily.games && me.daily.games[g.id] !== undefined;
      out.push('<button class="gcard" data-act="start_game" data-id="' + g.id + '"><img src="' + (A.IMG[g.cover] || '') + '" alt=""><div class="grow"><div class="row"><span class="chip">' + esc(g.tag) + '</span>' + (played ? '<span class="chip ok">' + ic('check', 'sm') + 'لعبتها النهارده ' + me.daily.games[g.id] + '/' + g.per + '</span>' : '<span class="chip red">من 10 إلى 30 نقطة</span>') + '</div><b style="font-size:17px;display:block;margin-top:4px">' + esc(g.title) + '</b><div class="mut sm">' + esc(g.intro) + '</div></div>' + ic('fwd') + '</button>');
    });
    return out.join('');
  };
  /* تبويب «قياس مستواك»: الاختبار الأول واختبار الشهر ونتائجهما */
  function testTab(me) {
    var out = [];
    function res(title, r) { return '<div class="grow"><div class="mut sm">' + title + '</div><b class="big" style="font-size:26px">' + r.score + ' من ' + r.total + '</b></div>'; }
    out.push('<div class="notice">' + ic('shield') + '<div>الاختبارين بدون وقت وبدون ضغط. الهدف إننا نشوف إيه اللي اتغيّر في معلوماتك بعد استخدام التطبيق، مش نحاسبك.</div></div>');
    if (me.baseline) out.push('<div class="card"><h3>اختبارك الأول</h3><div class="row">' + res('النتيجة', me.baseline) + '<span class="chip ok">' + ic('check', 'sm') + 'تم</span></div></div>');
    else out.push('<button class="gcard" data-act="start_test" data-k="baseline"><span class="chip red" style="flex:none">+20</span><div class="grow"><b>اختبر نفسك (9 أسئلة)</b><div class="mut sm">الاختبار الأول بيقيس مستواك دلوقتي، وبيفتح لك رتبة «شريك واعٍ».</div></div>' + ic('fwd') + '</button>');
    if (me.followup) out.push('<div class="card"><h3>اختبار الشهر</h3><div class="row">' + res('النتيجة', me.followup) + (me.baseline ? '<div class="grow"><div class="mut sm">الفرق عن الأول</div><b class="big" style="font-size:26px;color:' + (me.followup.score >= me.baseline.score ? 'var(--ok)' : 'var(--red-d)') + '">' + (me.followup.score - me.baseline.score >= 0 ? '+' : '') + (me.followup.score - me.baseline.score) + '</b></div>' : '') + '</div></div>');
    else if (me.followupDue) out.push('<button class="gcard" data-act="start_test" data-k="followup"><span class="chip red" style="flex:none">+20</span><div class="grow"><b>اختبار الشهر جاهز</b><div class="mut sm">9 أسئلة جديدة. نشوف إيه اللي اتغيّر من أول اختبار.</div></div>' + ic('fwd') + '</button>');
    else out.push('<div class="card tc mut">اختبار الشهر بيفتح بعد 30 يوم من الاختبار الأول.</div>');
    return out;
  }

  /* ============ محرك الأسئلة ============ */
  var Q = null;
  function stopTimer() { if (Q && Q.tm) { clearTimeout(Q.tm); Q.tm = null; } }

  H.start_game = function (el) {
    var id = el.dataset.id;
    call('gameGet', { id: id }).then(function (g) {
      if (!g) return;
      Q = { mode: 'game', id: id, title: g.title, intro: g.intro, kind: g.kind, secs: g.secs, items: g.items, i: 0, answers: [], phase: 'intro', sel: [], first: !g.playedToday };
      A.openSub({ type: 'quiz', title: g.title, hidePts: false });
    });
  };
  A.startTest = function (kind) {
    call('testGet', { kind: kind }).then(function (t) {
      if (!t) return;
      if (t.done) { A.toast('خلّصت الاختبار ده قبل كده'); return; }
      Q = { mode: 'test', id: kind, title: t.title, intro: 'بدون وقت وبدون ضغط. جاوب بأمانة عشان نعرف نساعدك أكتر. النتيجة والشرح بيظهروا في الآخر.', kind: 'mixed', secs: 0, items: t.items, i: 0, answers: [], phase: 'intro', sel: [] };
      A.openSub({ type: 'quiz', title: t.title, hidePts: false });
    });
  };
  H.start_test = function (el) { A.startTest(el.dataset.k); };

  function itemKind(it) { return Q.mode === 'game' ? Q.kind : it.kind; }

  A.subs.quiz = function () {
    if (!Q) return '';
    if (Q.phase === 'intro') {
      return '<div class="card"><h2>' + esc(Q.title) + '</h2><p class="mut">' + esc(Q.intro) + '</p><div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip">' + Q.items.length + ' ' + (Q.mode === 'game' && Q.kind === 'order' ? 'مواقف' : 'أسئلة') + '</span>' + (Q.secs ? '<span class="chip">' + Q.secs + ' ثواني لكل سؤال</span>' : '<span class="chip">من غير وقت</span>') + (Q.mode === 'game' ? (Q.first ? '<span class="chip red">من 10 إلى 30 نقطة</span>' : '<span class="chip">تكرار بدون نقاط</span>') : '<span class="chip red">+20 نقطة</span>') + '</div><button class="btn" style="margin-top:16px" data-act="quiz_go">ابدأ</button></div>';
    }
    if (Q.phase === 'submitting') return '<div class="card tc"><div class="spin"></div><div class="mut">بنحسب نتيجتك…</div></div>';
    if (Q.phase === 'result') return resultHtml();
    var it = Q.items[Q.i], k = itemKind(it), n = Q.items.length;
    var head = '<div class="row sp"><span class="pill-n">' + (Q.i + 1) + ' من ' + n + '</span>' + (it.tag ? '<span class="chip">' + esc(it.tag) + '</span>' : '') + '</div>' + A.bar(Q.i * 100 / n, 'dk') +
      (Q.secs ? '<div class="timer" style="margin-top:8px"><i style="animation:shrink ' + Q.secs + 's linear forwards"></i></div>' : '');
    var body;
    if (k === 'tf') body = '<div class="q">' + (Q.mode === 'game' ? 'سمعت إن… ' : '') + esc(it.q) + '</div><div class="grid2"><button class="btn dk tfbtn" data-act="q_tf" data-a="1">' + ic('check', 'lg') + 'صح</button><button class="btn tfbtn" data-act="q_tf" data-a="0">' + ic('x', 'lg') + 'غلط</button></div>';
    else if (k === 'choice') body = '<div class="q">' + esc(it.q) + '</div>' + it.opts.map(function (o, j) { return '<button class="opt" data-act="q_opt" data-j="' + j + '">' + esc(o) + '</button>'; }).join('');
    else body = '<div class="q">' + esc(it.t) + '</div><div class="mut sm" style="margin-bottom:8px">دوس على الخطوات بالترتيب الصح، من الأولى للأخيرة.</div>' + it.cards.map(function (c, j) { var p = Q.sel.indexOf(c); return '<button class="ordc ' + (p >= 0 ? 'sel' : '') + '" data-act="q_ord" data-j="' + j + '"><span class="no">' + (p >= 0 ? p + 1 : '') + '</span><span>' + esc(c) + '</span></button>'; }).join('') + '<div class="grid2" style="margin-top:6px"><button class="btn gh" data-act="q_reset">إعادة</button><button class="btn ' + (Q.sel.length === it.cards.length ? '' : 'off') + '" data-act="q_ord_ok" ' + (Q.sel.length === it.cards.length ? '' : 'disabled') + '>تأكيد</button></div>';
    return '<div class="col">' + head + '<div class="card">' + body + '</div></div>';
  };
  A.subPost.quiz = function () {
    if (!Q || Q.phase !== 'play' || !Q.secs) return;
    stopTimer();
    var i = Q.i; Q.tm = setTimeout(function () { if (Q && Q.phase === 'play' && Q.i === i) answer(null, true); }, Q.secs * 1000);
    A.onLeave(stopTimer);
  };
  H.quiz_go = function () { Q.phase = 'play'; A.renderView(); };
  function answer(a, timeout) {
    stopTimer();
    Q.answers.push(a); Q.sel = [];
    if (Q.i + 1 < Q.items.length) { Q.i++; A.renderView(); window.scrollTo(0, 0); }
    else submit();
  }
  H.q_tf = function (el) { answer(el.dataset.a === '1'); };
  H.q_opt = function (el) { answer(Number(el.dataset.j)); };
  H.q_ord = function (el) {
    var it = Q.items[Q.i], c = it.cards[Number(el.dataset.j)], p = Q.sel.indexOf(c);
    if (p >= 0) Q.sel.splice(p, 1); else Q.sel.push(c);
    A.renderView();
  };
  H.q_reset = function () { Q.sel = []; A.renderView(); };
  H.q_ord_ok = function () { answer(Q.sel.slice()); };

  function submit() {
    Q.phase = 'submitting'; A.renderView();
    var req = Q.mode === 'game' ? call('gameSubmit', { id: Q.id, answers: Q.answers }) : call('testSubmit', { kind: Q.id, answers: Q.answers });
    req.then(function (d) {
      if (!d) { Q.phase = 'intro'; Q.i = 0; Q.answers = []; return A.renderView(); }
      Q.phase = 'result'; Q.result = d; A.setMe(d.me);
      if (d.pts) A.popPts(d.pts);
      if (d.correct === d.total || (Q.mode === 'test' && d.me.onboarding.done && Q.id === 'baseline')) A.confetti();
      A.screens.trader();
    });
  }
  function resultHtml() {
    var d = Q.result, ratio = d.correct / d.total;
    var msg = ratio === 1 ? 'ممتاز! إجابات كاملة.' : ratio >= .7 ? 'شاطر! معلوماتك قوية.' : ratio >= .4 ? 'كويس، وفيه حاجات تستاهل تراجعها تحت.' : 'مفيش مشكلة — التعلّم بيبدأ من هنا. راجع الشرح تحت.';
    var note = '';
    if (Q.mode === 'game') note = d.first ? (d.pts ? '' : (d.capped ? '<div class="notice">' + ic('clock') + '<div>وصلت سقف نقاط النهارده الرقمية. اللعبة اتحسبت لك وهتبدأ من جديد بكرة.</div></div>' : '')) : '<div class="notice">' + ic('clock') + '<div>لعبتها النهارده قبل كده، فالتكرار للتعلّم بدون نقاط.</div></div>';
    else if (Q.id === 'baseline') note = S.me.onboarding.done ? '<div class="notice" style="background:var(--ok-bg)">' + ic('trophy') + '<div><b>بقيت «شريك واعٍ»!</b> اتفتحت لك الرتب والجوايز.</div></div>' : '<div class="notice">' + ic('shield') + '<div>باقي لك فيديو الإطلاق وتوقيع الميثاق عشان تبقى «شريك جديد».</div></div>';
    var rev = d.res.map(function (r, i) {
      var src = r.src && r.src.url ? '<a class="ext" target="_blank" rel="noopener" href="' + esc(r.src.url) + '">' + esc(r.src.label) + '</a>' : '';
      return '<div class="rev ' + (r.ok ? 'ok' : 'no') + '"><div class="row top"><span class="chip ' + (r.ok ? 'ok' : 'bad') + '">' + ic(r.ok ? 'check' : 'x', 'sm') + '</span><div class="grow"><div class="q2">' + esc(r.q) + '</div>' + (r.ok ? '' : '<div class="sm"><b>الصح:</b> ' + esc(r.answer) + '</div>' + (r.wrong ? '<div class="sm mut">لو اخترت غير كده: ' + esc(r.wrong) + '</div>' : '')) + '<div class="sm mut" style="margin-top:3px">' + esc(r.why || '') + '</div>' + src + '</div></div></div>';
    }).join('');
    return '<div class="col"><div class="card tc"><div class="mut">نتيجتك</div><div class="score" style="color:' + (ratio >= .7 ? 'var(--ok)' : 'var(--red)') + '">' + d.correct + '</div><div class="mut" style="font-size:20px;font-weight:700">من ' + d.total + ' أسئلة</div><div style="font-weight:800;margin:6px 0">' + msg + '</div>' + (d.pts ? '<span class="chip red" style="margin-top:6px">+' + d.pts + ' نقطة' + (d.mult > 1 ? ' (مضاعف ×' + d.mult + ')' : '') + '</span>' : '') + '</div>' + note + '<div class="sec-t">الشرح والمصادر</div>' + rev +
      '<div class="grid2"><button class="btn dk" data-act="quiz_end">تمام</button>' + (Q.mode === 'game' ? '<button class="btn gh" data-act="quiz_again">العب تاني</button>' : '<button class="btn gh" data-act="tab" data-id="learn">اتعلّم أكتر</button>') + '</div></div>';
  }
  H.quiz_end = function () { Q = null; S.sub = null; S.tab = 'play'; A.screens.trader(); window.scrollTo(0, 0); };
  H.quiz_again = function () { var id = Q.id; Q = null; S.sub = null; A.screens.trader(); H.start_game({ dataset: { id: id } }); };

  /* ============ ميزاني ============ */
  var MZ_DEF = { birds: 30000, kg: 2, price: 60, margin: 3, dayCost: 2000, lostDays: 2, share: 30 };
  var MZ_F = [
    ['birds', 'عدد الطيور اللي بتشتريها في الشهر', 'طائر', 1000, 500000, 1000],
    ['kg', 'متوسط وزن الطائر', 'كجم', 1, 4, .1],
    ['price', 'سعر شراء الكيلو الحي', 'جنيه', 10, 200, 1],
    ['margin', 'ربحك في الكيلو', 'جنيه', 0, 30, .5],
    ['share', 'نسبة مشترياتك اللي ممكن تيجي من دورات متأثرة بمرض', '%', 0, 100, 5],
    ['lostDays', 'أيام بتقف فيها عربيتك في الشهر (غلق مزرعة، حجر، تأخير)', 'يوم', 0, 15, 1],
    ['dayCost', 'تكلفة اليوم الواقف (عربية وعمالة)', 'جنيه', 0, 20000, 100]
  ];
  V.mizan = function () {
    var f = S.home && S.home.facts || {};
    if (!S.mz) {
      call('mizanGet', {}, { quiet: true }).then(function (d) { S.mz = (d && d.inputs) ? Object.assign({}, MZ_DEF, d.inputs) : Object.assign({}, MZ_DEF); if (S.tab === 'market' && !S.sub) A.renderView(true); });
      return A.loading();
    }
    var inp = S.mz;
    var mk = A.mkMain ? A.mkMain() : null;
    var fields = MZ_F.map(function (x) {
      var help = x[0] === 'price' && mk && mk.name ? '<button class="lnk" data-act="mz_use_mkt" style="text-align:right">استخدم سعر بيع الشركة النهاردة (' + A.mk.fmt(mk.price, mk.dec) + ' ' + esc(mk.unit) + ')</button>' : '';
      return '<div class="fld"><label for="mz_' + x[0] + '">' + x[1] + '</label><div class="row"><input class="in ltr grow" id="mz_' + x[0] + '" type="number" inputmode="decimal" min="' + x[3] + '" step="' + x[5] + '" value="' + inp[x[0]] + '" data-mz="' + x[0] + '"><span class="chip" style="min-width:52px;justify-content:center">' + x[2] + '</span></div>' + help + '</div>';
    }).join('');
    return '<div class="card dark"><div class="row"><span style="color:var(--red)">' + ic('calc', 'lg') + '</span><div class="grow"><h2 style="margin:0;color:#fff">ميزاني</h2><div class="sm" style="color:#CFCFD2">اكتب أرقامك أنت، واعرف الفرق بين شغل محمي وشغل متساهل.</div></div></div></div>' +
      '<div class="card col"><h3 style="margin:0">أرقامك (شهريًا)</h3>' + fields + '<div class="xs mut">الأرقام دي بتتحسب على جهازك، وبتتحفظ على حسابك أنت بس لو ضغطت «احفظ». مش بنشاركها مع حد.</div></div>' +
      '<div id="mz_out">' + mzOut(inp, f) + '</div>' +
      '<button class="btn dk" data-act="mz_save">احفظ أرقامي' + (S.me.mizanDone ? '' : ' (+5 نقاط)') + '</button>' +
      '<div class="card flat"><div class="xs mut">طريقة الحساب: بنقارن وزن الكتكوت الحي المسوّق في الدورات السليمة (' + (f.kgPerChickHealthy || 2.036) + ' كجم) بالدورات المصابة (' + (f.kgPerChickDisease || 1.373) + ' كجم) في بيانات كايرو ثري ايه (' + esc(f.periodLabel || '') + ')، ونطبّق نفس النسبة على نسبة مشترياتك المتأثرة. هي تقدير تقريبي مبني على ارتباط في البيانات، مش توقع مضمون ولا اتهام لأي مزرعة. أرقام الشركة المالية مش بتظهر هنا.</div></div>';
  };
  function mzOut(inp, f) {
    var r = window.C3A.M.calc(inp, { kgPerChickHealthy: f.kgPerChickHealthy || 2.036, kgPerChickDisease: f.kgPerChickDisease || 1.373 });
    var R = function (x) { return num(Math.round(x)); };
    var yearly = r.total * 12;
    var mx = Math.max(1, r.healthyKg);
    return '<div class="lossbox"><div class="xs" style="font-weight:800;color:var(--red-d)">لو اتساهلت: خسارتك المتوقعة في الشهر</div><div class="big" style="color:var(--red-d)">' + R(r.total) + ' <span style="font-size:18px">جنيه</span></div><div class="sm" style="margin-top:6px">يعني تقريبًا <b>' + R(yearly) + ' جنيه في السنة</b>.</div><hr class="sep" style="border-color:rgba(234,35,41,.3)"><div class="sm col" style="gap:4px"><div class="row sp"><span>كيلوهات حية بتضيع من إيدك</span><b>' + R(r.lostKg) + ' كجم</b></div><div class="row sp"><span>قيمة البضاعة دي</span><b>' + R(r.lostValue) + ' جنيه</b></div><div class="row sp"><span>ربحك اللي بيضيع</span><b>' + R(r.lostProfit) + ' جنيه</b></div><div class="row sp"><span>تكلفة أيام الوقوف</span><b>' + R(r.idle) + ' جنيه</b></div></div></div>' +
      '<div class="card"><h3>مشترياتك في الشهر بالكيلو الحي</h3><div class="cmp"><div class="r g"><span>شغل محمي</span><div class="bar"><i style="width:100%">' + R(r.healthyKg) + '</i></div></div><div class="r"><span>شغل متساهل</span><div class="bar"><i style="width:' + Math.round(r.diseaseKg * 100 / mx) + '%;background:var(--red)">' + R(r.diseaseKg) + '</i></div></div></div><div class="xs mut" style="margin-top:6px">الفرق ' + (Math.round(r.dropPct * 10) / 10) + '% على الجزء المتأثر من مشترياتك.</div></div>' +
      '<div class="gainbox"><div class="xs" style="font-weight:800;color:var(--ok)">لو التزمت: بتحافظ على</div><div class="big" style="color:var(--ok)">' + R(r.total) + ' <span style="font-size:18px">جنيه كل شهر</span></div><div class="sm" style="margin-top:6px">والتزامك بيحمي شغلك وشغل زمايلك، وبيفتح لك رتب وجوايز. ابدأ من البوابة: <b>أربع خطوات = حماية كاملة</b>.</div><div class="row" style="margin-top:10px;gap:14px">' + ['icon1', 'icon2', 'icon3', 'icon4'].map(function (n) { return A.img(n, '', '').replace('<img', '<img style="height:36px;width:auto"'); }).join('') + '</div></div>';
  }
  document.addEventListener('input', function (e) {
    var k = e.target && e.target.dataset && e.target.dataset.mz; if (!k || !S.mz) return;
    S.mz[k] = Number(e.target.value) || 0;
    var o = document.getElementById('mz_out'); if (o) o.innerHTML = mzOut(S.mz, S.home && S.home.facts || {});
  });
  H.mz_use_mkt = function () {
    var mk = A.mkMain && A.mkMain(); if (!mk || !S.mz) return;
    S.mz.price = mk.price;
    var e = document.getElementById('mz_price'); if (e) e.value = mk.price;
    var o = document.getElementById('mz_out'); if (o) o.innerHTML = mzOut(S.mz, S.home && S.home.facts || {});
    A.toast('استخدمنا سعر النهاردة. لا تنسَ تضغط «احفظ»', 'ok');
  };
  H.mz_save = function (el) {
    el.disabled = true;
    call('mizanSave', { inputs: S.mz }).then(function (d) {
      el.disabled = false; if (!d) return;
      A.setMe(d.me); if (d.pts) { A.popPts(d.pts); }
      A.toast('اتحفظت أرقامك', 'ok');
    });
  };
})();
