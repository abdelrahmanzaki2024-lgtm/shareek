/* ============================================================
   الجزء 6: بيانات تجريبية (للنسخة التجريبية ولاختبار الأداء). أسماء وأرقام وهمية.
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U, L = C.L;

  function seedFarms(store, now, withStatus) {
    var n = C.CONFIG.farms;
    for (var i = 1; i <= n; i++) {
      var st = '', ts = 0, note = '';
      if (withStatus) {
        st = i <= 4 ? 'ready' : i === 5 ? 'limited' : i === 6 ? 'closed' : i <= 8 ? 'ready' : '';
        ts = st ? now - (i % 4) * 3600000 : 0;
        note = i === 5 ? 'تحميل بعد الثانية ظهرًا' : i === 6 ? 'تطهير عنبر' : '';
      }
      store.insert('Farms', { id: String(i), name: 'مزرعة ' + i, status: st, note: note, ts: ts, by: '' });
    }
  }

  /* أسعار «السوق النهاردة» التجريبية: أرقام وهمية لتجربة الشاشة فقط */
  function seedMarket(store, now) {
    var DAY = 86400000, HR = 3600000, dk0 = U.dateKey(now);
    if (!store.count('MarketItems')) C.MARKET_ITEMS.forEach(function (it) {
      store.insert('MarketItems', { id: it.id, name: it.name, short: it.short, unit: it.unit, dec: it.dec, order: it.order, main: it.main, hidden: 0 });
    });
    var series = {   // الأقدم ← اليوم (14 يومًا)
      broiler: [66, 66, 67, 68, 67, 66.5, 67, 69, 70, 70, 71, 70.5, 71, 72],
      chick: [27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 31, 31, 32],
      hatch: [8.5, 8.5, 8.5, 9, 9, 9, 9, 9.5, 9.5, 9.5, 9.5, 10, 10, 10],
      table: [118, 118, 120, 120, 122, 122, 122, 125, 125, 128, 128, 130, 130, 132]
    };
    var notes = { 0: 'أسعار تجريبية للعرض فقط. هنا هتظهر ملاحظة اليوم من فريق الأمن الحيوي.', 2: 'تعديل بسيط في سعر الفراخ مع زيادة الطلب.' };
    for (var k = 13; k >= 0; k--) {
      if (k === 4) continue;   // يوم بلا نشر ليظهر الفراغ في السجل
      var pr = {}, i = 13 - k;
      Object.keys(series).forEach(function (id) { pr[id] = series[id][i]; });
      store.insert('MarketDay', { dk: U.addDays(dk0, -k), prices: JSON.stringify(pr), note: notes[k] || '', by: 'S-03', ts: now - k * DAY - 2 * HR });
    }
  }

  function seedStaffRow(store, env, id, name, title, role, farm, phone, pin, email) {
    var salt = env.randHex(8);
    store.insert('Staff', { id: id, name: name, title: title, role: role, farmId: farm, phone: phone, email: email || '', pinHash: U.hashPin(pin, salt, env.secret()), salt: salt, active: 1, fails: 0, lockUntil: 0 });
  }

  /* يملأ جداول فارغة ببيانات عرض واقعية. كلها وهمية. */
  function seedDemo(store, env) {
    var now = env.now(), DAY = 86400000, HR = 3600000;
    var dk0 = U.dateKey(now);
    seedFarms(store, now, true);
    seedMarket(store, now);
    seedStaffRow(store, env, 'S-01', 'موظف تجريبي ١', 'معاون مزرعة 5', 'assistant', '5', '01000000001', '1234');
    seedStaffRow(store, env, 'S-02', 'موظف تجريبي ٢', 'معاون مزرعة 4', 'assistant', '4', '01000000002', '1234');
    seedStaffRow(store, env, 'S-03', 'موظف تجريبي ٣', 'مشرف الأمن الحيوي', 'supervisor', '', '01000000003', '1234');
    seedStaffRow(store, env, 'S-04', 'موظف تجريبي ٤', 'مدير إدارة الأمن الحيوي', 'manager', '', '01000000004', '1234');
    seedStaffRow(store, env, 'S-05', 'موظف تجريبي ٥', 'مسؤول النظام', 'admin', '', '01000000005', '1234');

    function trader(id, code, name, phone, plate, company, farm, createdAgo) {
      var salt = env.randHex(8), created = now - createdAgo * DAY;
      var st = L.newState(created);
      var row = store.insert('Traders', { id: id, code: code, name: name, phone: phone, pinHash: U.hashPin('1234', salt, env.secret()), salt: salt, plate: U.normPlate(plate), company: company, farmId: farm, status: 'active', created: created, lastLogin: now, fails: 0, lockUntil: 0, state: '', mizan: '' });
      return { row: row, st: st };
    }
    function finish(t) { t.row.state = JSON.stringify(t.st); }
    function daysPattern(st, from, to, skipMod) {
      for (var d = from; d <= to; d++) {
        if (d % 7 === skipMod || d % 7 === (skipMod + 3) % 7) continue;
        L.markActive(st, U.addDays(dk0, -d));
      }
    }
    function onboard(st, ts) {
      st.videos.launch = ts; st.charter = ts; st.baseline = { score: 5, total: 9, ts: ts };
    }
    function gateRow(gid, ts, tid, farm, staff, pass, wait) {
      var checks = { hands: true, disinfect: true, vehicle: true, shoes: true };
      if (pass < 4) checks.shoes = false;
      if (pass < 3) checks.hands = false;
      var gs = L.gateScore(checks);
      store.insert('Gate', { id: gid, ts: ts, traderId: tid, farmId: farm, staffId: staff, checks: JSON.stringify(checks), pass: gs.pass, clean: gs.clean ? 1 : 0, violation: gs.violation ? 1 : 0, waitMin: wait, note: '', points: L.gatePoints(gs, C.CONFIG) });
    }

    /* أ: شريك منتظم (رتبة 2) */
    var A = trader('TR-0001', 'A7K2', 'محمود السيد (تجريبي)', '01100000001', '1234 أ ب ج', 'تجارة الواحات', '5', 30);
    onboard(A.st, now - 28 * DAY); daysPattern(A.st, 1, 24, 0);
    A.st.pts = 410; A.st.rankMax = 2; A.st.stats = { games: 9, perfect: 1, rounds: 18 };
    A.st.gate = { visits: 4, clean: 3, cleanRun: 2, viol: 0, lastTs: now - 2 * DAY, lastViolTs: 0, last: { ts: now - 2 * DAY, pass: 4, clean: true, violation: false }, perDay: {} };
    A.st.honor = 1; A.st.cards = { c1: 1, c2: 1, c4: 1 }; A.st.mizan = now - 10 * DAY;
    A.row.mizan = JSON.stringify({ birds: 30000, kg: 2, price: 60, margin: 3, dayCost: 2000, lostDays: 2, share: 30 });
    finish(A);
    /* ب: شريك واعٍ (رتبة 1) */
    var B = trader('TR-0002', 'B4M9', 'عمرو فتحي (تجريبي)', '01100000002', '5678 س ع د', '', '4', 9);
    onboard(B.st, now - 8 * DAY); daysPattern(B.st, 1, 6, 2); B.st.pts = 120; B.st.rankMax = 1; finish(B);
    /* ج: شريك موثوق (رتبة 3) بسلسلة 8 أسابيع */
    var Cc = trader('TR-0003', 'C8P3', 'عبد الله حسن (تجريبي)', '01100000003', '9012 ح م ن', 'نقل الدواجن', '5', 75);
    onboard(Cc.st, now - 72 * DAY); daysPattern(Cc.st, 1, 66, 9);
    Cc.st.pts = 920; Cc.st.rankMax = 3; Cc.st.honor = 1; Cc.st.stats = { games: 40, perfect: 6, rounds: 55 };
    Cc.st.gate = { visits: 12, clean: 10, cleanRun: 6, viol: 0, lastTs: now - 1 * DAY, lastViolTs: 0, last: { ts: now - 1 * DAY, pass: 4, clean: true, violation: false }, perDay: {} };
    Cc.st.videos.virus = now - 60 * DAY; Cc.st.invites = { done: 1, clean: 1 };
    Cc.st.baseline = { score: 6, total: 9, ts: now - 72 * DAY }; Cc.st.followup = { score: 8, total: 9, ts: now - 40 * DAY };
    finish(Cc);
    /* د: جديد تمامًا (رتبة 0) */
    var D = trader('TR-0004', 'D5R6', 'إبراهيم رضا (تجريبي)', '01100000004', '3456 ك ل م', '', '', 1);
    finish(D);

    /* زيارات البوابة */
    var g = 0;
    [[1, 'TR-0003', '5', 'S-01', 4, 12], [2, 'TR-0001', '5', 'S-01', 4, 25], [3, 'TR-0003', '4', 'S-02', 4, 10], [5, 'TR-0001', '5', 'S-01', 3, 35],
      [6, 'TR-0003', '5', 'S-01', 4, 15], [9, 'TR-0001', '5', 'S-01', 4, 40], [12, 'TR-0003', '4', 'S-02', 2, 20], [15, 'TR-0003', '5', 'S-01', 4, 18]].forEach(function (x) {
      g++; gateRow('G-' + ('0000' + g).slice(-5), now - x[0] * DAY, x[1], x[2], x[3], x[4], x[5]);
    });

    /* رسائل */
    var m = 0;
    function msg(tid, ts, from, staff, text) { m++; store.insert('TicketMsgs', { id: 'M-' + ('00000' + m).slice(-5), ticketId: tid, ts: ts, from: from, staffId: staff, text: text }); }
    store.insert('Tickets', { id: 'T-0001', ts: now - 26 * HR, traderId: 'TR-0003', farmId: '5', type: 'obstacle', subject: 'انتظار طويل عند بوابة المزرعة 5', status: 'answered', level: 1, lastTs: now - 22 * HR, firstReplyTs: now - 22 * HR, resolvedTs: 0, stars: 0, unreadTrader: 1, unreadStaff: 0, lastStaffId: 'S-01', accepted: 0 });
    msg('T-0001', now - 26 * HR, 'trader', '', 'استنيت قرابة ساعة ونص عند البوابة قبل ما العربية تدخل التحميل. ممكن نعمل ميعاد مسبق؟');
    msg('T-0001', now - 22 * HR, 'staff', 'S-01', 'شكرًا لتنبيهك. رتبنا دور أسرع للعربيات اللي سجلها نظيف. لو حصل تأخير تاني ابعتلنا الوقت.');
    store.insert('Tickets', { id: 'T-0002', ts: now - 3 * HR, traderId: 'TR-0001', farmId: '5', type: 'urgent', subject: 'اشتباه نفوق في دفعة اشتريتها', status: 'open', level: 0, lastTs: now - 3 * HR, firstReplyTs: 0, resolvedTs: 0, stars: 0, unreadTrader: 0, unreadStaff: 1, lastStaffId: '', accepted: 0 });
    msg('T-0002', now - 3 * HR, 'trader', '', 'الدفعة اللي استلمتها الصبح فيها نفوق ملحوظ في الطريق وفيه كام طائر مش بياكل.');
    store.insert('Tickets', { id: 'T-0003', ts: now - 5 * DAY, traderId: 'TR-0002', farmId: '4', type: 'suggestion', subject: 'مواعيد حجز للتحميل من التطبيق', status: 'answered', level: 0, lastTs: now - 4 * DAY, firstReplyTs: now - 4 * DAY, resolvedTs: 0, stars: 0, unreadTrader: 1, unreadStaff: 0, lastStaffId: 'S-03', accepted: 0 });
    msg('T-0003', now - 5 * DAY, 'trader', '', 'يا ريت نقدر نحجز ميعاد التحميل من التطبيق قبلها بيوم.');
    msg('T-0003', now - 4 * DAY, 'staff', 'S-03', 'اقتراح ممتاز، رفعناه لإدارة التشغيل للدراسة.');
    store.insert('Tickets', { id: 'T-0004', ts: now - 9 * DAY, traderId: 'TR-0003', farmId: '4', type: 'inquiry', subject: 'مدة صلاحية المطهر في حوض العجل', status: 'resolved', level: 0, lastTs: now - 9 * DAY + 3 * HR, firstReplyTs: now - 9 * DAY + 3 * HR, resolvedTs: now - 9 * DAY + 3 * HR, stars: 5, unreadTrader: 0, unreadStaff: 0, lastStaffId: 'S-02', accepted: 0 });
    msg('T-0004', now - 9 * DAY, 'trader', '', 'كل قد إيه بيتغير المطهر في حوض العجل؟');
    msg('T-0004', now - 9 * DAY + 3 * HR, 'staff', 'S-02', 'بيتغير حسب تعليمات العبوة وعدد العربيات، وغالبًا يوميًا. المعاون بيقيس التركيز قبل الشغل.');

    /* مكافآت وعدادات */
    store.insert('Rewards', { id: 'R-0001', ts: now - 3 * DAY, traderId: 'TR-0003', rewardId: 'kit', status: 'requested', decidedBy: '', decidedTs: 0, note: '' });
    [['id:TR', 4], ['id:T', 4], ['id:M', m], ['id:G', g], ['id:R', 1]].forEach(function (c) { store.insert('Counters', { key: c[0], value: c[1] }); });
    store.insert('Counters', { key: 'rounds:' + U.weekStart(dk0), value: 120 });
    return true;
  }

  C.seedDemo = seedDemo;
  C.seedFarms = seedFarms;
  C.seedMarket = seedMarket;
  C.seedStaffRow = seedStaffRow;
})(C3A);
