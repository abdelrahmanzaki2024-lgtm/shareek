/* ============================================================
   الإصدار 1.3 — واجهة التاجر: محطات التقدير، شهادة التقدير، «اسمع الأسعار»، بطاقة الشاشة الرئيسية
   (النصوص القابلة للتغيير تأتي من الخادم في home.feat و home.milestone؛ لا شيء هنا يُحفظ خارج جهاز التاجر غير تأكيد المحطة)
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, call = A.call, H = A.handlers, TZ = 'Africa/Cairo';
  function feat() { return (S.home && S.home.feat) || {}; }
  function on(o) { return !!(o && o.on); }

  /* ============================================================
     1) أرقام بالكلمات العربية (للقراءة الصوتية)
     ============================================================ */
  var ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  var TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  var HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  function w999(n) {
    var parts = [], h = Math.floor(n / 100), r = n % 100;
    if (h) parts.push(HUND[h]);
    if (r) parts.push(r < 20 ? ONES[r] : (r % 10 ? ONES[r % 10] + ' و' : '') + TENS[Math.floor(r / 10)]);
    return parts.join(' و');
  }
  function words(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n === 0) return 'صفر';
    if (n > 999999) return String(n);
    var t = Math.floor(n / 1000), r = n % 1000, s = '';
    if (t) s = t === 1 ? 'ألف' : t === 2 ? 'ألفان' : t <= 10 ? ONES[t] + ' آلاف' : w999(t) + ' ألف';
    if (r) s += (s ? ' و' : '') + w999(r);
    return s;
  }
  /* عدّ مع المعدود: واحد، مثنى، من 3 إلى 10 جمع، ما فوق ذلك مفرد منصوب */
  function counted(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return words(n) + ' ' + few;
    return words(n) + ' ' + many;
  }
  /* مبلغ بالجنيه والقروش؛ gen=true لصيغة الجر (بعد حرف جر أو مضاف) */
  function money(v, gen) {
    v = Math.round(Math.abs(Number(v) || 0) * 100) / 100;
    var whole = Math.floor(v), pia = Math.round((v - whole) * 100), out = [];
    if (whole) out.push(counted(whole, 'جنيه واحد', gen ? 'جنيهين' : 'جنيهان', 'جنيهات', 'جنيهًا'));
    if (pia === 50 && whole) out.push('ونصف');
    else if (pia) out.push((whole ? 'و' : '') + counted(pia, 'قرش واحد', gen ? 'قرشين' : 'قرشان', 'قروش', 'قرشًا'));
    if (!out.length) return 'صفر جنيه';
    return out.join(' ');
  }
  var PER = { 'كجم': 'للكيلو', 'كيلو': 'للكيلو' };
  function perWord(u) { var w = String(u || '').split('/')[1]; return w ? (PER[w] || 'لل' + w) : ''; }
  function priceSay(it) {
    var u = String(it.unit || '');
    if (/^جنيه\//.test(u)) return money(it.price) + ' ' + perWord(u);
    return words(it.price) + ' ' + u;
  }
  function chgSay(it) {
    if (it.chg === null || it.chg === undefined) return '';
    if (it.dir === 'flat') return 'وهو ثابت زي أمس';
    var amt = Math.abs(Number(it.chg));
    if (!amt) return '';
    return (it.dir === 'up' ? 'ارتفع عن أمس بمقدار ' : 'انخفض عن أمس بمقدار ') + (/^جنيه\//.test(String(it.unit || '')) ? money(amt, true) : words(amt));
  }
  /* نص القراءة الكامل لأسعار اليوم (جمل قصيرة تُقرأ واحدة بعد الأخرى) */
  function marketSpeech(m) {
    if (!m || !m.items) return [];
    var priced = m.items.filter(function (x) { return x.price !== null && x.price !== undefined; });
    if (!priced.length) return [];
    var fresh = m.state === 'fresh', out = [];
    out.push(fresh ? 'أسعار النهاردة من ' + (m.company || 'كايرو ثري ايه') + '، ' + A.mk.dkLabel(m.dk) + '.' : 'أسعار النهاردة لسه ماتنشرتش. دي آخر أسعار منشورة، بتاريخ ' + A.mk.dkLabel(m.lastDk || m.dk) + '.');
    priced.forEach(function (it) {
      var c = chgSay(it);
      out.push(it.short + '، ' + priceSay(it) + (c && it.fresh !== false ? '. ' + c : '') + '.');
    });
    if (m.note) out.push('ملاحظة: ' + String(m.note).replace(/[\s.،!؟?]+$/, '') + '.');
    out.push('السعر النهائي بيتأكد وقت الصفقة.');
    return out;
  }
  A.say = { words: words, money: money, marketSpeech: marketSpeech };

  /* ============================================================
     2) القراءة الصوتية عبر المتصفح (speechSynthesis)
     ============================================================ */
  var VX = { speaking: false, gen: 0 };
  function canSpeak() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); }
  function pickVoice() {
    var vs = []; try { vs = window.speechSynthesis.getVoices() || []; } catch (e) { vs = []; }
    function lang(v) { return String(v.lang || '').replace('_', '-').toLowerCase(); }
    var pri = ['ar-eg', 'ar-sa', 'ar'];
    for (var i = 0; i < pri.length; i++) for (var j = 0; j < vs.length; j++) if (lang(vs[j]) === pri[i]) return vs[j];
    for (var k = 0; k < vs.length; k++) if (lang(vs[k]).indexOf('ar') === 0) return vs[k];
    return null;
  }
  function withVoice(cb) {
    var ss = window.speechSynthesis, v = pickVoice();
    if (v) return cb(v);
    var done = false;
    function fin() { if (done) return; done = true; try { ss.removeEventListener('voiceschanged', fin); } catch (e) { /* ignore */ } cb(pickVoice()); }
    try { ss.addEventListener('voiceschanged', fin); } catch (e) { /* ignore */ }
    setTimeout(fin, 900);
  }
  function syncBtns() {
    A.$$('[data-act="say_prices"]').forEach(function (b) {
      b.classList.toggle('on', VX.speaking);
      b.innerHTML = (VX.speaking ? ic('x', 'sm') + 'إيقاف' : ic('speaker', 'sm') + 'اسمع الأسعار');
    });
    A.$$('[data-act="say_card"]').forEach(function (b) {
      b.classList.toggle('on', VX.speaking);
      b.innerHTML = (VX.speaking ? ic('x', 'sm') + 'إيقاف' : ic('speaker', 'sm') + 'اسمع الدرس');
    });
  }
  function stopSay() {
    VX.gen++; VX.speaking = false;
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    syncBtns();
  }
  function say(lines) {
    if (!canSpeak() || !lines.length) return;
    var gen = ++VX.gen, ss = window.speechSynthesis;
    try { ss.cancel(); } catch (e) { /* ignore */ }
    VX.speaking = true; syncBtns();
    withVoice(function (voice) {
      if (gen !== VX.gen) return;
      var started = false, i = 0;
      function fail() {
        if (gen !== VX.gen) return;
        stopSay(); A.toast('تعذّر تشغيل الصوت. ارفع صوت الجهاز وتأكد إن فيه صوت عربي مفعّل (إعدادات الجهاز ← تحويل النص إلى كلام).');
      }
      function next() {
        if (gen !== VX.gen) return;
        if (i >= lines.length) { VX.speaking = false; syncBtns(); return; }
        var u = new window.SpeechSynthesisUtterance(lines[i++]);
        u.lang = voice ? voice.lang : 'ar-EG'; if (voice) u.voice = voice; u.rate = A.voiceRate ? A.voiceRate() : 0.92; u.pitch = 1;
        u.onstart = function () { started = true; };
        u.onend = next;
        u.onerror = function (e) { if (e && (e.error === 'canceled' || e.error === 'interrupted')) return; fail(); };
        try { ss.speak(u); } catch (e) { fail(); }
      }
      next();
      setTimeout(function () { if (gen === VX.gen && VX.speaking && !started) fail(); }, 4000);
    });
  }
  A.stopSay = stopSay;
  A.speakLines = say;
  A.isSpeaking = function () { return VX.speaking; };
  A.voiceBtn = function (cls) {
    if (!on(feat().voice) || !canSpeak()) return '';
    var m = S.market || (S.home && S.home.market);
    if (!marketSpeech(m).length) return '';
    return '<button class="btn sm gh say ' + (cls || '') + '" data-act="say_prices">' + ic('speaker', 'sm') + 'اسمع الأسعار</button>';
  };
  H.say_prices = function () {
    if (VX.speaking) return stopSay();
    say(marketSpeech(S.market || (S.home && S.home.market)));
  };
  /* اسمع الدرس: يقرأ عنوان الدرس وخلاصته بصوت عربي. للتاجر الذي لا يقرأ، ويُعرض الزر فقط إن كانت الميزة مفعّلة والمتصفح يدعم الصوت */
  A.voiceCard = function (k) {
    if (!on(feat().voice) || !canSpeak() || !k) return '';
    return '<button class="btn sm gh say" style="margin:8px 0" data-act="say_card" data-id="' + String(k.id).replace(/"/g, '') + '">' + ic('speaker', 'sm') + 'اسمع الدرس</button>';
  };
  H.say_card = function (el) {
    if (VX.speaking) return stopSay();
    var list = (S.content && S.content.cards) || [], id = el.dataset.id;
    var k = list.filter(function (x) { return x.id === id; })[0];
    if (k) say([String(k.title || ''), String(k.fact || '')].filter(Boolean));
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') stopSay(); });

  /* ============================================================
     3) محطات التقدير (بانر داخل نافذة الترحيب) وتأكيدها
     ============================================================ */
  function callName(full) {
    var t = String(full || '').trim().split(/\s+/);
    if (!t[0]) return '';
    if (/^(عبد|عبدال|أبو|ابو|أم|ام|ابن|بن)$/.test(t[0]) && t[1]) return t[0] + ' ' + t[1];
    return t[0];
  }
  var MS_IC = { rank: 'trophy', gw: 'flame', clean: 'shield', since: 'star' };
  A.msHtml = function (ms, me) {
    if (!ms) return '';
    var txt = String(ms.text || '').replace(/\{name\}/g, callName(me && me.name));
    return '<div class="ms"><span class="ms-ic">' + ic(MS_IC[ms.kind] || 'star') + '</span><div class="grow"><div class="ms-t">' + esc(ms.title) + '</div><div class="ms-x">' + esc(txt) + '</div></div></div>' +
      (on(feat().cert) ? '<button class="btn sm gh ms-cert" data-act="cert_ms">' + ic('gift', 'sm') + 'اطلع شهادة تقدير وشاركها</button>' : '');
  };
  A.msAck = function (ms) {
    if (!ms) return;
    if (S.home && S.home.milestone && S.home.milestone.id === ms.id) S.home.milestone = null;
    call('ackMilestone', { id: ms.id }, { quiet: true });
  };
  H.cert_ms = function () {
    var ms = S.msCur; if (!ms || !S.me) return;
    openCert(ms.what);
  };

  /* ============================================================
     4) شهادة التقدير: صورة تُرسم على canvas ثم تُعرض وتُشارك
     ============================================================ */
  function fontsReady() {
    var ok = Promise.resolve();
    try {
      if (document.fonts && document.fonts.load) ok = Promise.all([document.fonts.load('400 30px Cairo'), document.fonts.load('800 30px Cairo'), document.fonts.load('900 30px Cairo')]);
    } catch (e) { /* ignore */ }
    return Promise.race([ok.catch(function () { /* ignore */ }), new Promise(function (r) { setTimeout(r, 2500); })]);
  }
  function loadImg(src) {
    return new Promise(function (res) { if (!src) return res(null); var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; });
  }
  function wrap(x, text, maxW) {
    var ws = String(text || '').split(/\s+/), lines = [], cur = '';
    ws.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function fitText(x, text, weight, maxPx, minPx, maxW, family) {
    var px = maxPx;
    for (; px >= minPx; px -= 2) { x.font = weight + ' ' + px + 'px ' + family; if (x.measureText(text).width <= maxW) return px; }
    return minPx;
  }
  function shield(x, cx, top, w, color, n, family) {
    var s = w / 46, ox = cx - w / 2;
    x.save(); x.translate(ox, top); x.scale(s, s);
    var p = new Path2D('M23 2l19 7v15c0 12-8 20-19 26C12 44 4 36 4 24V9z');
    x.fillStyle = color; x.fill(p);
    x.fillStyle = 'rgba(255,255,255,.14)'; x.fill(new Path2D('M23 2l19 7v15c0 12-8 20-19 26'));
    x.restore();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '900 ' + Math.round(w * 0.46) + 'px ' + family; x.direction = 'ltr';
    x.fillText(String(n), cx, top + w * 0.72); x.direction = 'rtl';
  }
  function drawQr(x, text, px, py, size) {
    if (!text || !window.C3A || !C3A.QR) return;
    var q; try { q = C3A.QR.matrix(text); } catch (e) { return; }
    var n = q.size + 8, cell = size / n;
    x.fillStyle = '#FFFFFF'; x.fillRect(px, py, size, size);
    x.fillStyle = '#242424';
    for (var r = 0; r < q.size; r++) for (var c = 0; c < q.size; c++) if (q.mod[r][c]) x.fillRect(px + (c + 4) * cell, py + (r + 4) * cell, cell + 0.5, cell + 0.5);
  }
  function drawCert(spec) {
    var me = S.me, f = feat().cert || {}, W = 1080, H2 = 1350, FAM = 'Cairo, "Segoe UI", Tahoma, Arial, sans-serif';
    var c = document.createElement('canvas'); c.width = W; c.height = H2;
    var x = c.getContext('2d'); x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    return Promise.all([fontsReady(), loadImg(A.IMG.wordmark_dark)]).then(function (r) {
      var wm = r[1];
      /* الخلفية والإطار */
      x.fillStyle = '#FBFAF7'; x.fillRect(0, 0, W, H2);
      x.fillStyle = '#242424'; x.fillRect(0, 0, W, 250);
      x.fillStyle = '#EA2329'; x.fillRect(0, 250, W, 10);
      if (wm) { var s = Math.min(600 / wm.width, 150 / wm.height); x.drawImage(wm, (W - wm.width * s) / 2, (250 - wm.height * s) / 2, wm.width * s, wm.height * s); }
      /* رمز QR للتطبيق يظهر في ركن الشريط العلوي: من يرى الشهادة يفتح التطبيق بالكاميرا */
      drawQr(x, (S.home && S.home.appUrl) || '', 40, 40, 170);
      x.strokeStyle = '#EA2329'; x.lineWidth = 4; x.strokeRect(40, 300, W - 80, H2 - 340);
      x.strokeStyle = '#D9D9DC'; x.lineWidth = 2; x.strokeRect(54, 314, W - 108, H2 - 368);
      /* العنوان */
      x.fillStyle = '#242424'; x.font = '900 96px ' + FAM; x.fillText(f.title || 'شهادة تقدير', W / 2, 410);
      x.fillStyle = '#EA2329'; x.fillRect(W / 2 - 80, 436, 160, 7);
      x.fillStyle = '#6D6E71'; x.font = '600 34px ' + FAM; x.fillText('تُمنح هذه الشهادة إلى', W / 2, 506);
      /* الاسم */
      var name = String(me.name || '').trim(), px = fitText(x, name, 900, 84, 44, 880, FAM);
      x.fillStyle = '#EA2329'; x.font = '900 ' + px + 'px ' + FAM; x.fillText(name, W / 2, 604);
      /* الرتبة */
      var y = 640;
      if (me.rank && me.rank.n >= 1) {
        var cols = ['#9A9A9E', '#242424', '#B81E25', '#EA2329', '#EA2329', '#B81E25', '#242424'];
        shield(x, W / 2, y, 104, cols[me.rank.n] || '#242424', me.rank.n, FAM);
        x.fillStyle = '#242424'; x.font = '800 36px ' + FAM; x.fillText('رتبة «' + me.rank.name + '»', W / 2, y + 148);
        y += 184;
      } else y += 20;
      /* الإنجاز */
      x.fillStyle = '#6D6E71'; x.font = '600 30px ' + FAM; x.fillText('عن', W / 2, y + 30);
      x.font = '800 38px ' + FAM;
      var lines = wrap(x, spec.what, 760).slice(0, 2), bh = lines.length * 54 + 34, by = y + 50;
      x.fillStyle = '#FFF1F1'; x.strokeStyle = '#EA2329'; x.lineWidth = 3;
      x.beginPath(); if (x.roundRect) x.roundRect(120, by, W - 240, bh, 22); else x.rect(120, by, W - 240, bh); x.fill(); x.stroke();
      x.fillStyle = '#242424'; x.font = '800 38px ' + FAM;
      lines.forEach(function (ln, i) { x.fillText(ln, W / 2, by + 50 + i * 54); });
      /* نص التقدير */
      var ty = by + bh + 50;
      x.fillStyle = '#4A4B4E'; x.font = '600 28px ' + FAM;
      wrap(x, f.body || '', 820).slice(0, 2).forEach(function (ln, i) { x.fillText(ln, W / 2, ty + i * 40); });
      /* التذييل: التاريخ والتوقيع */
      var fy = 1168, date = '';
      try { date = new Date(A.nowMs()).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { date = ''; }
      x.strokeStyle = '#9A9A9E'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(140, fy - 36); x.lineTo(420, fy - 36); x.moveTo(660, fy - 36); x.lineTo(940, fy - 36); x.stroke();
      x.fillStyle = '#242424'; x.font = '800 30px ' + FAM;
      x.fillText(date, 280, fy);
      x.fillStyle = '#6D6E71'; x.font = '600 24px ' + FAM; x.fillText('تاريخ الإصدار', 280, fy + 34);
      x.fillStyle = '#242424'; x.font = '800 30px ' + FAM; x.fillText(f.signer || 'إدارة الأمن الحيوي', 800, fy);
      x.fillStyle = '#6D6E71'; x.font = '600 24px ' + FAM; x.fillText(f.signer ? (f.signerTitle || '') : 'الجهة المانحة', 800, fy + 34);
      /* أسفل الإطار */
      x.fillStyle = '#6D6E71'; x.font = '600 24px ' + FAM;
      x.fillText((f.issuer || 'شركة كايرو ثري ايه · إدارة الأمن الحيوي'), W / 2, 1244);
      x.font = '700 22px ' + FAM; x.fillStyle = '#9A9A9E'; x.fillText('كود الشريك ' + (me.code || ''), W / 2, 1274);
      return new Promise(function (res) { c.toBlob(function (b) { res({ canvas: c, blob: b }); }, 'image/png'); });
    });
  }
  var certUrl = '';
  function revoke() { if (certUrl) { try { URL.revokeObjectURL(certUrl); } catch (e) { /* ignore */ } certUrl = ''; } }
  function certFile() { return 'شهادة-تقدير-' + String((S.me && S.me.code) || '') + '.png'; }
  function openCert(what) {
    if (!on(feat().cert) || !S.me) return;
    A.toast('جاري تجهيز شهادتك…');
    drawCert({ what: what }).then(function (r) {
      if (!r.blob) return A.toast('تعذّر تجهيز الشهادة، جرّب تاني', 'err');
      revoke(); certUrl = URL.createObjectURL(r.blob);
      S.certBlob = r.blob;
      var f = null, canShare = false;
      try { f = new File([r.blob], certFile(), { type: 'image/png' }); canShare = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { canShare = false; }
      A.sheet('<h2>شهادة التقدير</h2><img class="cert-img" src="' + certUrl + '" alt="شهادة تقدير باسم ' + esc(S.me.name) + '">' +
        '<div class="grid2" style="margin-top:12px">' + (canShare ? '<button class="btn" data-act="cert_share">' + ic('share', 'sm') + 'شارك</button>' : '') +
        '<a class="btn ' + (canShare ? 'gh' : '') + '" download="' + esc(certFile()) + '" href="' + certUrl + '" style="' + (canShare ? '' : 'grid-column:1/-1') + '">حفظ كصورة</a></div>' +
        '<div class="xs mut tc" style="margin-top:8px">لو الحفظ ماشتغلش: اضغط مطولًا على الصورة واختار «حفظ الصورة».</div>' +
        '<button class="btn gh" style="margin-top:10px" data-act="closesheet">تمام</button>', revoke);
    });
  }
  H.cert_share = function () {
    if (!S.certBlob) return;
    var f; try { f = new File([S.certBlob], certFile(), { type: 'image/png' }); } catch (e) { return A.toast('المشاركة غير متاحة، احفظ الصورة بدلًا منها'); }
    var link = (S.home && S.home.appUrl) || '';
    navigator.share({ files: [f], title: 'شهادة تقدير', text: 'شهادة تقدير من ' + ((feat().cert || {}).issuer || 'كايرو ثري ايه') + (link ? '\n' + link : '') }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      A.toast('المشاركة غير متاحة هنا، احفظ الصورة وابعتها يدويًا');
    });
  };
  H.cert_acc = function () {
    var me = S.me; if (!me) return;
    openCert(me.rank && me.rank.n >= 1 ? 'بلوغ رتبة «' + me.rank.name + '» في برنامج شريك الدفاع' : 'الانضمام إلى برنامج شريك الدفاع');
  };
  A.certCard = function () {
    if (!on(feat().cert)) return '';
    return '<div class="card"><div class="row" style="gap:12px"><span class="hs-ic">' + ic('trophy') + '</span><div class="grow"><b>شهادة تقدير</b><div class="sm mut">صورة باسمك ورتبتك تقدر تحفظها أو تبعتها لأي حد.</div></div></div><button class="btn sm" style="margin-top:10px" data-act="cert_acc">اطلع شهادتي</button></div>';
  };

  /* ============================================================
     5) بطاقة «أضف التطبيق للشاشة الرئيسية»
     ============================================================ */
  var HS_SNZ = 'c3a_hs_snooze', HS_DONE = 'c3a_hs_done', OPENS = 'c3a_opens';
  function standalone() {
    try { if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) { /* ignore */ }
    try { return !!(navigator.standalone || (window.top && window.top.navigator && window.top.navigator.standalone)); } catch (e2) { return !!navigator.standalone; }
  }
  A.hsCard = function () {
    var f = feat().homescreen;
    if (S.role !== 'trader' || !on(f) || standalone() || A.lsGet(HS_DONE)) return '';
    if ((Number(A.lsGet(OPENS)) || 0) < 2) return '';          // لا نزاحم أول فتحة
    if ((Number(A.lsGet(HS_SNZ)) || 0) > A.nowMs()) return '';
    return '<div class="card hs"><div class="row" style="gap:12px;align-items:flex-start"><span class="hs-ic">' + ic('phone') + '</span><div class="grow"><b>خلّي شريك الدفاع على شاشة موبايلك</b><div class="sm mut">تفتحه بلمسة واحدة زي أي تطبيق، وتلاقي أسعار النهاردة وجولتك قدامك.</div></div>' +
      '<button class="hs-x" data-act="hs_snooze" aria-label="إخفاء">' + ic('x', 'sm') + '</button></div><div class="grid2" style="margin-top:10px"><button class="btn sm" data-act="hs_how">إزاي؟</button><button class="btn sm gh" data-act="hs_snooze">فكّرني بعدين</button></div></div>';
  };
  A.hsLink = function () {
    if (!on(feat().homescreen)) return '';
    return '<button class="btn gh" data-act="hs_how">' + ic('phone') + 'أضف التطبيق للشاشة الرئيسية</button>';
  };
  H.hs_snooze = function () {
    var d = (feat().homescreen || {}).snoozeDays || 14;
    A.lsSet(HS_SNZ, String(A.nowMs() + d * 86400000));
    A.toast('تمام، هنفكّرك بعد ' + (d === 7 ? 'أسبوع' : d + ' يوم'), 'ok');
    if (S.role === 'trader' && !S.sub) A.renderView(true);
  };
  function steps(list) { return '<ol class="hs-steps">' + list.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>'; }
  H.hs_how = function () {
    var ua = navigator.userAgent || '', ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), and = /Android/i.test(ua);
    var inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok|; wv\)/i.test(ua);
    var iosB = '<div class="card"><h3>آيفون (Safari)</h3>' + steps(['افتح الرابط في <b>Safari</b> (مش من جوه واتساب أو فيسبوك).', 'اضغط زر المشاركة ' + ic('share', 'sm') + ' في أسفل الشاشة.', 'اختار <b>«إضافة إلى الشاشة الرئيسية»</b> ثم <b>«إضافة»</b>.']) + '</div>';
    var andB = '<div class="card"><h3>أندرويد (Chrome)</h3>' + steps(['افتح الرابط في <b>Chrome</b>.', 'اضغط النقاط التلاتة <b>⋮</b> أعلى الشاشة.', 'اختار <b>«إضافة إلى الشاشة الرئيسية»</b> (أو «تثبيت التطبيق») ثم <b>«إضافة»</b>.']) + '</div>';
    A.sheet('<h2>أضف التطبيق للشاشة الرئيسية</h2><p class="mut sm" style="margin:0 0 10px">بعد الإضافة هتلاقي أيقونة «شريك الدفاع» جنب تطبيقاتك، تفتحها بلمسة.</p>' +
      (inApp ? '<div class="notice" style="margin-bottom:10px">' + ic('warn') + '<div>إنت فاتح الرابط من جوه تطبيق تاني. افتحه الأول في المتصفح (من قائمة ⋮ أو «فتح في المتصفح») وبعدين اتبع الخطوات.</div></div>' : '') +
      '<div class="col" style="margin-bottom:12px">' + (ios ? iosB + andB : andB + iosB) + '</div>' +
      '<div class="grid2"><button class="btn" data-act="hs_done">أضفته بالفعل</button><button class="btn gh" data-act="closesheet">لاحقًا</button></div>');
  };
  H.hs_done = function () { A.lsSet(HS_DONE, '1'); A.closeSheet(); A.toast('تمام، مش هنظهر لك البطاقة تاني', 'ok'); if (S.role === 'trader' && !S.sub) A.renderView(true); };
  /* عدّاد مرات الفتح: لا نعرض بطاقة الشاشة الرئيسية إلا من ثاني فتحة */
  A.countOpen = function () { A.lsSet(OPENS, String((Number(A.lsGet(OPENS)) || 0) + 1)); };
})();
