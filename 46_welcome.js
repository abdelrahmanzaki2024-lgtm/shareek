/* ============================================================
   رسالة الترحيب والتقدير: تظهر للتاجر كل مرة يُفتح فيها التطبيق
   (نافذة واحدة: ترحيب شخصي بالاسم والإنجاز، ثم أسعار اليوم تحتها)
   النص الثابت هنا؛ ويمكن للإدارة استبدال جملة التقدير والتوقيع من ورقة Config (welcome.*)
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, H = A.handlers;
  var TZ = 'Africa/Cairo';
  var RESUME_MS = 20 * 60 * 1000;     // العودة للتطبيق بعد غياب أطول من هذا تُحسب فتحًا جديدًا
  var SEEN = 'c3a_mkt_seen';

  /* جمل التقدير الجاهزة تأتي من الخادم (ورقة Config: welcome.t1 … t8) فتتبدل يوميًا وتثبت طوال اليوم لنفس التاجر.
     هذه جملة احتياطية فقط لو لم يرسل الخادم شيئًا (نسخة خادم قديمة) */
  var THANKS = ['شراكتك معانا بتفرق، وإحنا في كايرو ثري ايه بنقدّر التزامك بالأمن الحيوي جدًا.'];

  /* ---------- أدوات صغيرة ---------- */
  function cairo(ms) {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)), o = {};
      p.forEach(function (x) { o[x.type] = x.value; });
      return { h: parseInt(o.hour, 10) % 24, dk: o.year + '-' + o.month + '-' + o.day };
    } catch (e) { var d = new Date(ms); return { h: (d.getUTCHours() + 2) % 24, dk: d.toISOString().slice(0, 10) }; }
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  /* الاسم الأول مع مراعاة الأسماء المركبة: عبد الله، عبد الرحمن، أبو بكر… */
  function callName(full) {
    var t = String(full || '').trim().split(/\s+/);
    if (!t[0]) return '';
    if (/^(عبد|عبدال|أبو|ابو|أم|ام|ابن|بن)$/.test(t[0]) && t[1]) return t[0] + ' ' + t[1];
    return t[0];
  }
  function weeksTxt(n) { return n === 1 ? 'أسبوع' : n === 2 ? 'أسبوعين' : n <= 10 ? n + ' أسابيع' : n + ' أسبوع'; }
  function greet(h) { return h >= 5 && h < 12 ? 'صباح الخير' : h >= 12 && h < 17 ? 'نهارك سعيد' : 'مساء الخير'; }

  /* جملة شخصية تُظهر أننا نرى إنجازه (بالترتيب من الأقوى للأبسط) */
  function personalLine(me) {
    var w = me.week || {}, g = me.gate || {};
    if (w.streak >= 2) return 'حققت هدف الأسبوع ' + weeksTxt(w.streak) + ' ورا بعض. ده التزام يستاهل كل التقدير.';
    if (g.cleanRun >= 2) return g.cleanRun + ' زيارات نظيفة عند البوابة ورا بعض. تسلم إيدك.';
    if (me.rank && me.rank.n >= 2) return 'وصلت لرتبة «' + me.rank.name + '» بجهدك وانتظامك.';
    if (me.daily && me.daily.roundDone) return 'خلّصت جولة النهاردة. تسلم إيدك.';
    if (me.rank && me.rank.n === 1) return 'بدأت معانا صح، ورتبتك دلوقتي «' + me.rank.name + '».';
    return 'أهلاً بيك في شريك الدفاع. أول خطوة معانا بداية شراكة نعتز بيها.';
  }
  function sinceTxt(joined) {
    var ts = Number(joined);
    if (!ts || ts < 1e12 || ts > A.nowMs()) return '';
    try { return 'معانا من ' + new Date(ts).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: TZ, month: 'long', year: 'numeric' }); } catch (e) { return ''; }
  }

  /* ---------- النافذة ---------- */
  function welcomeHtml(me, home, isNewPrices, pricesOnly, ms, noPrices) {
    var wc = (home && home.welcome) || {}, m = home && home.market, K = A.mk, c = cairo(A.nowMs());
    var name = callName(me.name);
    var pool = wc.lines && wc.lines.length ? wc.lines : THANKS;
    var thanks = String(wc.message ? wc.message : pool[hash(me.id + c.dk) % pool.length]).replace(/\{name\}/g, name);
    var sign = wc.sign || 'شركة كايرو ثري ايه · إدارة الأمن الحيوي';
    var rows = '';
    if (!noPrices && m && m.state === 'fresh' && m.items) {
      rows = m.items.filter(function (x) { return x.price !== null && x.fresh; }).map(function (it) {
        return '<div class="ann-r"><div class="grow"><b>' + esc(it.short) + '</b><div class="xs mut">' + esc(it.unit) + '</div></div><div style="text-align:left"><div class="pr">' + K.fmt(it.price, it.dec) + '</div>' + K.chg(it) + '</div></div>';
      }).join('');
    }
    var chips = '<span class="chip dk">' + ic('shield', 'sm') + esc(me.rank.name) + '</span><span class="chip red">' + ic('star', 'sm') + A.num(me.pts) + ' نقطة</span>';
    if (me.week && me.week.streak > 0) chips += '<span class="chip warn">' + ic('flame', 'sm') + 'سلسلة ' + weeksTxt(me.week.streak) + '</span>';
    var since = sinceTxt(me.joined); if (since) chips += '<span class="chip">' + esc(since) + '</span>';

    var h = '<div class="wl">';
    if (ms && A.msHtml && pricesOnly) h += '<div class="ms-wrap">' + A.msHtml(ms, me) + '</div>';
    if (!pricesOnly) {
      h += '<div class="wl-h"><div class="row" style="position:relative;gap:12px">' + A.rankBadge(me.rank.n, 46) +
        '<div class="grow"><div class="xs" style="color:#BDBDC0">' + greet(c.h) + '</div><h2 style="margin:0;color:#fff;font-size:23px;line-height:1.3">أهلاً بيك يا ' + esc(name) + '</h2></div></div>' +
        '<div class="wl-pl">' + esc(personalLine(me)) + '</div></div>' +
        (ms && A.msHtml ? '<div class="ms-wrap">' + A.msHtml(ms, me) + '</div>' : '') +
        '<div class="wl-msg"><span class="wl-ic">' + ic('star', 'sm') + '</span><div><div class="wl-tx">' + esc(thanks) + '</div><div class="wl-sg">— ' + esc(sign) + '</div></div></div>' +
        '<div class="wl-chips">' + chips + '</div>';
    }
    if (rows) {
      h += '<div class="wl-sec"><div class="grow"><b>أسعار النهاردة</b><div class="xs mut">' + esc(K.dkLabel(m.dk)) + ' · اتحدّثت ' + A.ftime(m.ts) + '</div></div>' + (isNewPrices ? '<span class="chip ok">جديد</span>' : '') + '</div>' + (A.voiceBtn ? A.voiceBtn('wl-say') : '') +
        '<div class="ann-list">' + rows + '</div>' +
        (m.note ? '<div class="notice" style="margin-top:6px">' + ic('speaker') + '<div>' + esc(m.note) + '</div></div>' : '') +
        '<div class="xs mut" style="margin:8px 2px">' + (window.__DEMO ? 'أرقام تجريبية للعرض فقط. ' : '') + 'أسعار بيع ' + esc(m.company || 'كايرو ثري ايه') + '. السعر النهائي بيتأكد وقت الصفقة.</div>' +
        '<div class="grid2 ann-cta"><button class="btn gh" data-act="ann_go">تفاصيل السوق</button><button class="btn" data-act="closesheet">يلا نبدأ</button></div>';
    } else {
      h += '<div class="ann-cta one"><button class="btn" data-act="closesheet">يلا نبدأ</button></div>';
    }
    return h + '</div>';
  }

  /* نقطة الدخول الوحيدة (تُستدعى بعد الدخول، وبعد تحميل التطبيق بجلسة محفوظة، وعند العودة بعد غياب) */
  A.announce = function () {
    if (S.role !== 'trader' || S.annShown || !S.me) return;
    if (document.getElementById('ovl')) return;     // نافذة أخرى مفتوحة (مثل الشروط): لا نقاطعها
    var home = S.home || {}, wc = home.welcome || {}, m = home.market;
    var hasPrices = !!(m && m.state === 'fresh' && m.items && m.items.some(function (x) { return x.price !== null && x.fresh; }));
    var key = hasPrices ? S.me.id + ':' + m.dk + ':' + m.ts : '';
    var isNew = !!key && A.lsGet(SEEN) !== key;
    var ms = home.milestone || null;                // محطة تقدير جديدة (واحدة في كل فتحة) تُعرض داخل نفس النافذة
    if (A.countOpen) A.countOpen();
    function closing() { if (key) A.lsSet(SEEN, key); if (A.stopSay) A.stopSay(); if (ms && A.msAck) A.msAck(ms); }
    if (wc.on === false) {
      /* الترحيب موقوف من الإدارة: نترك إعلان الأسعار (مرة لكل نسخة أسعار) ومحطة التقدير إن وُجدت */
      if (!ms && (!hasPrices || !isNew)) return;
      S.annShown = true; S.msCur = ms;
      A.sheet(welcomeHtml(S.me, home, true, true, ms, !isNew), closing);
      if (ms) A.confetti();
      return;
    }
    S.annShown = true; S.msCur = ms;
    A.sheet(welcomeHtml(S.me, home, isNew, false, ms, false), closing);
    if (ms) A.confetti();
  };
  H.ann_go = function () { A.closeSheet(); S.seg = S.seg || {}; S.seg.market = 'prices'; H.tab({ dataset: { id: 'market' } }); };

  /* فتح التطبيق من الشاشة الرئيسية غالبًا يستأنف الصفحة بدل إعادة تحميلها، فنعتبر العودة بعد غياب فتحًا جديدًا */
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (!hiddenAt) return;
    var away = Date.now() - hiddenAt; hiddenAt = 0;
    if (away < RESUME_MS || S.role !== 'trader' || !S.tok || !S.me) return;
    A.loadHome().then(function (d) { if (d && S.role === 'trader') { S.annShown = false; S.market = null; S.marketTs = 0; A.announce(); } });
  });
})();
