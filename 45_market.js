/* ============================================================
   السوق النهاردة: أسعار بيع منتجات كايرو ثري ايه للتجار
   (تبويب السوق وشريط الأسعار في «اليوم»؛ إعلان الأسعار عند فتح التطبيق صار جزءًا من نافذة الترحيب في 46_welcome.js)
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, call = A.call, H = A.handlers, V = A.V;
  var TTL = 5 * 60 * 1000;
  var DN = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];

  /* ---------- تنسيق ---------- */
  function fmt(v, dec) {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function fmtChg(v, dec) { return Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Math.max(dec || 0, 1) }); }
  function dkLabel(dk) {
    try { return new Date(dk + 'T12:00:00Z').toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return dk; }
  }
  function dkShort(dk) {
    var d = new Date(dk + 'T12:00:00Z');
    return DN[d.getUTCDay()] + ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
  }
  function mainItem(m) {
    var a = (m && m.items) || [], i;
    for (i = 0; i < a.length; i++) if (a[i].main && a[i].price !== null) return a[i];
    for (i = 0; i < a.length; i++) if (a[i].price !== null) return a[i];
    return null;
  }
  A.mkMain = function () { return mainItem(S.market || (S.home && S.home.market)); };

  /* ---------- مكوّنات ---------- */
  function chgHtml(it) {
    if (it.chg === null || it.chg === undefined) return '<span class="chg flat">أول سعر</span>';
    var d = it.dir, arrow = d === 'up' ? ic('up', 'sm') : d === 'down' ? ic('down', 'sm') : ic('flat', 'sm');
    var txt = d === 'flat' ? 'ثابت' : (d === 'up' ? 'ارتفع ' : 'انخفض ') + '<bdi>' + fmtChg(Math.abs(it.chg), it.dec) + '</bdi> <bdi>(' + Math.abs(it.pct) + '%)</bdi>';
    return '<span class="chg ' + d + '">' + arrow + txt + '</span>';
  }
  /* رسم بياني صغير: الأقدم على اليسار والأحدث على اليمين (كأي رسم أسعار: الصعود لأعلى يعني زيادة) */
  function spark(series, dir) {
    if (!series || series.length < 2) return '';
    var w = 100, h = 32, p = 3, vals = series.map(function (s) { return s.price; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), rng = hi - lo;
    var pts = series.map(function (s, i) {
      return [p + (i / (series.length - 1)) * (w - 2 * p), rng ? h - p - ((s.price - lo) / rng) * (h - 2 * p) : h / 2];
    });
    var d = pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
    var last = pts[pts.length - 1];
    return '<svg class="spark ' + (dir || '') + '" viewBox="0 0 100 32" aria-hidden="true"><path d="' + d + '"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3"/></svg>';
  }
  function stateBar(m) {
    var t = m.lastDk ? dkLabel(m.lastDk) : '';
    if (m.state === 'fresh') return '<div class="mk-state ok">' + ic('check', 'sm') + '<span>أسعار النهاردة · اتحدّثت ' + A.ftime(m.ts) + '</span></div>';
    if (m.state === 'old') return '<div class="mk-state warn">' + ic('clock', 'sm') + '<span>أسعار النهاردة لسه ماتنشرتش. اللي قدامك أسعار ' + (m.ageDays === 1 ? 'أمس' : t) + '.</span></div>';
    if (m.state === 'stale') return '<div class="mk-state bad">' + ic('warn', 'sm') + '<span>الأسعار دي قديمة (من ' + t + '). اسأل المعاون قبل ما تعتمد عليها.</span></div>';
    return '<div class="mk-state mute">' + ic('clock', 'sm') + '<span>لسه مفيش أسعار منشورة. هتظهر هنا أول ما الإدارة تنشرها.</span></div>';
  }
  function hero(it, m) {
    return '<div class="mk-hero"><div style="position:relative"><div class="xs" style="color:#BDBDC0">' + esc(m.company || '') + ' · ' + (it.fresh ? 'سعر النهاردة' : 'آخر سعر') + '</div><div class="h2" style="margin:2px 0 0;color:#fff;font-size:16px">' + esc(it.name) + '</div></div>' +
      '<div class="row" style="position:relative;margin-top:10px;align-items:flex-end;gap:12px"><div><span class="pr">' + fmt(it.price, it.dec) + '</span> <span class="sm" style="color:#D5D5D8">' + esc(it.unit) + '</span><div style="margin-top:8px">' + chgHtml(it) + '</div></div><div class="grow" style="max-width:150px;margin-right:auto">' + spark(it.series, it.dir) + '</div></div>' +
      (it.fresh ? '' : '<div class="xs" style="color:#F2A900;margin-top:8px;position:relative;font-weight:700">آخر سعر منشور: ' + dkLabel(it.dk) + '</div>') + '</div>';
  }
  function card(it) {
    return '<div class="mk-it"><div class="nm">' + esc(it.short) + '</div><div class="pr">' + fmt(it.price, it.dec) + '</div><div class="xs mut">' + esc(it.unit) + '</div><div>' + chgHtml(it) + '</div>' + spark(it.series, it.dir) +
      (it.fresh ? '' : '<div class="xs" style="color:var(--warn);font-weight:700">آخر سعر ' + dkShort(it.dk) + '</div>') + '</div>';
  }
  function pricesHtml(m) {
    var items = m.items.filter(function (x) { return x.price !== null; });
    if (!items.length) return '';
    var main = mainItem(m), rest = items.filter(function (x) { return x !== main; });
    return hero(main, m) + (rest.length ? '<div class="mk-grid">' + rest.map(card).join('') + '</div>' : '');
  }
  function histHtml(m) {
    var items = m.items;
    if (!m.history || !m.history.length) return '<div class="card tc mut">لسه مفيش سجل أسعار.</div>';
    var head = '<tr><th class="d">اليوم</th>' + items.map(function (i) { return '<th>' + esc(i.short) + '<small>' + esc(i.unit).replace('/', '/<wbr>') + '</small></th>'; }).join('') + '</tr>';
    var rows = m.history.map(function (d) {
      return '<tr class="' + (d.dk === m.dk ? 'today' : '') + '"><td>' + dkShort(d.dk) + '</td>' + items.map(function (i) { return '<td>' + fmt(d.vals[i.id], i.dec) + '</td>'; }).join('') + '</tr>' +
        (d.note ? '<tr class="nt"><td colspan="' + (items.length + 1) + '">' + esc(d.note) + '</td></tr>' : '');
    }).join('');
    return '<div class="card" style="padding:10px 6px;overflow-x:auto"><table class="mk-tbl"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div><div class="xs mut">الخلية الفاضية (—) معناها إن المنتج ده ماتنشرش له سعر في اليوم ده.</div>';
  }
  function noteHtml(m) {
    if (!m.note || m.state === 'empty') return '';
    return '<div class="notice">' + ic('speaker') + '<div><b>' + (m.state === 'fresh' ? 'ملاحظة اليوم' : 'ملاحظة ' + (m.ageDays === 1 ? 'أمس' : dkShort(m.lastDk))) + ':</b> ' + esc(m.note) + '</div></div>';
  }
  A.mk = { fmt: fmt, dkLabel: dkLabel, dkShort: dkShort, chg: chgHtml, spark: spark, stateBar: stateBar, prices: pricesHtml, hist: histHtml, note: noteHtml };

  /* ---------- تحميل ---------- */
  function loadMarket(force) {
    if (S.mkLoading) return;
    if (!force && S.market && A.nowMs() - (S.marketTs || 0) < TTL) return;
    S.mkLoading = true;
    call('marketGet', {}, { quiet: true }).then(function (d) {
      S.mkLoading = false;
      if (d) { S.market = d; S.marketTs = A.nowMs(); if (S.role === 'trader' && S.tab === 'market' && !S.sub) A.renderView(true); }
      if (force) A.toast(d ? 'الأسعار محدّثة' : 'تعذّر التحديث', d ? 'ok' : '');
    });
  }
  A.post.market = function () { loadMarket(false); };
  H.mk_refresh = function () { loadMarket(true); };

  /* ---------- تبويب السوق ---------- */
  V.market = function () {
    var seg = A.seg('market', 'prices'), m = S.market;
    var tabs = A.segs('market', [{ id: 'prices', t: 'الأسعار' }, { id: 'hist', t: 'آخر أيام' }, { id: 'mizan', t: 'ميزاني' }], 'prices');
    if (seg === 'mizan') return tabs + V.mizan();
    if (!m) return tabs + A.loading();
    var out = [tabs];
    if (seg === 'hist') {
      out.push('<div class="row sp"><h3 style="margin:0">سجل أسعار بيع الشركة</h3>' + (window.__DEMO ? '<span class="chip warn">أرقام تجريبية</span>' : '') + '</div>' + histHtml(m));
      return out.join('');
    }
    out.push('<div class="row sp"><div><b style="font-size:17px">' + dkLabel(m.dk) + '</b><div class="xs mut">أسعار بيع ' + esc(m.company || '') + '</div></div><div class="row" style="gap:6px">' + (window.__DEMO ? '<span class="chip warn">تجريبي</span>' : '') + '<button class="btn sm gh" data-act="mk_refresh">' + ic('clock', 'sm') + 'تحديث</button></div></div>');
    out.push(stateBar(m));
    if (A.voiceBtn) { var vb = A.voiceBtn('wl-say'); if (vb) out.push(vb); }
    var ph = pricesHtml(m);
    if (ph) out.push(ph);
    out.push(noteHtml(m));
    if (mainItem(m)) out.push('<button class="btn dk" data-act="go_mizan">' + ic('calc') + 'احسب شغلك بسعر النهاردة في «ميزاني»</button>');
    out.push('<div class="xs mut">' + esc(m.disclaimer || '') + '</div>');
    return out.join('');
  };
  H.go_mizan = function () { S.seg = S.seg || {}; S.seg.market = 'mizan'; H.tab({ dataset: { id: 'market' } }); };

  /* ---------- شريط الأسعار في شاشة «اليوم» ---------- */
  A.mkTicker = function () {
    var m = S.market || (S.home && S.home.market); if (!m) return '';
    var it = mainItem(m);
    if (!it) return '';
    var tag = m.state === 'fresh' ? '' : m.state === 'old' ? '<span class="chip warn">أسعار ' + (m.ageDays === 1 ? 'أمس' : 'سابقة') + '</span>' : '<span class="chip bad">قديمة</span>';
    return '<button class="mk-tick" data-act="tab" data-id="market"><span class="ico">' + ic('trend') + '</span><span class="grow"><span class="row" style="gap:6px"><b class="sm">السوق النهاردة · ' + esc(it.short) + '</b>' + tag + '</span><span class="mk-tl"><span class="pr">' + fmt(it.price, it.dec) + '</span><span class="xs mut">' + esc(it.unit) + '</span>' + chgHtml(it) + '</span></span>' + ic('fwd') + '</button>';
  };
})();
