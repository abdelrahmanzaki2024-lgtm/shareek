/* ============================================================
   الجزء 4: طبقة الخدمة (api) — تعمل فوق أي مخزن (Sheets أو ذاكرة)
   store: all/find/filter/insert/update/count   |   env: now/secret/randHex/notify
   كل مفاتيح الإجابات وأرقام المسؤولين تبقى هنا (الخادم) ولا تصل للهاتف.
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U, L = C.L, ApiError = C.ApiError;

  /* مخطط الجداول: العمود الأول هو المفتاح. s نص | n رقم | j JSON كنص */
  C.SCHEMA = {
    Traders: [['id', 's'], ['code', 's'], ['name', 's'], ['phone', 's'], ['pinHash', 's'], ['salt', 's'], ['plate', 's'], ['company', 's'], ['farmId', 's'], ['status', 's'], ['created', 'n'], ['lastLogin', 'n'], ['fails', 'n'], ['lockUntil', 'n'], ['state', 'j'], ['mizan', 'j']],
    Staff: [['id', 's'], ['name', 's'], ['title', 's'], ['role', 's'], ['farmId', 's'], ['phone', 's'], ['email', 's'], ['pinHash', 's'], ['salt', 's'], ['active', 'n'], ['fails', 'n'], ['lockUntil', 'n'], ['perms', 's']],
    Gate: [['id', 's'], ['ts', 'n'], ['traderId', 's'], ['farmId', 's'], ['staffId', 's'], ['checks', 'j'], ['pass', 'n'], ['clean', 'n'], ['violation', 'n'], ['waitMin', 'n'], ['note', 's'], ['points', 'n']],
    Tickets: [['id', 's'], ['ts', 'n'], ['traderId', 's'], ['farmId', 's'], ['type', 's'], ['subject', 's'], ['status', 's'], ['level', 'n'], ['lastTs', 'n'], ['firstReplyTs', 'n'], ['resolvedTs', 'n'], ['stars', 'n'], ['unreadTrader', 'n'], ['unreadStaff', 'n'], ['lastStaffId', 's'], ['accepted', 'n']],
    TicketMsgs: [['id', 's'], ['ticketId', 's'], ['ts', 'n'], ['from', 's'], ['staffId', 's'], ['text', 's']],
    Events: [['ts', 'n'], ['traderId', 's'], ['type', 's'], ['ref', 's'], ['points', 'n'], ['meta', 's']],
    Rewards: [['id', 's'], ['ts', 'n'], ['traderId', 's'], ['rewardId', 's'], ['status', 's'], ['decidedBy', 's'], ['decidedTs', 'n'], ['note', 's']],
    Farms: [['id', 's'], ['name', 's'], ['status', 's'], ['note', 's'], ['ts', 'n'], ['by', 's']],
    Notifications: [['ts', 'n'], ['to', 's'], ['channel', 's'], ['subject', 's'], ['ok', 'n']],
    Counters: [['key', 's'], ['value', 'n']],
    Config: [['key', 's'], ['value', 's'], ['note', 's']],
    Content: [['id', 's'], ['type', 's'], ['title', 's'], ['desc', 's'], ['driveId', 's'], ['cover', 's'], ['minSec', 'n'], ['order', 'n'], ['active', 'n']],
    MarketItems: [['id', 's'], ['name', 's'], ['short', 's'], ['unit', 's'], ['dec', 'n'], ['order', 'n'], ['main', 'n'], ['hidden', 'n']],
    MarketDay: [['dk', 's'], ['prices', 'j'], ['note', 's'], ['by', 's'], ['ts', 'n']],
    MarketPending: [['id', 's'], ['dk', 's'], ['prices', 'j'], ['note', 's'], ['by', 's'], ['ts', 'n'], ['jumps', 's'], ['status', 's'], ['decidedBy', 's'], ['decidedTs', 'n'], ['reason', 's']]
  };

  var ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var STAFF_ROLES = { assistant: 1, supervisor: 2, manager: 3, admin: 4 };
  var ROLE_LABEL = { assistant: 'معاون موقع', supervisor: 'مشرف الأمن الحيوي', manager: 'مدير الإدارة', admin: 'مسؤول النظام' };
  /* صلاحيات الموظفين. كل صلاحية مفتاح ثابت؛ الدور يعطي مجموعة افتراضية (انظر defaultPerms)، والمدير يخصّص لكل موظف ما يناسبه */
  var PERMS = [
    { key: 'gate', label: 'تسجيل زيارات البوابة', group: 'الميدان' },
    { key: 'farms', label: 'تحديث حالة المزرعة', group: 'الميدان' },
    { key: 'inbox', label: 'الرد على رسائل التجار', group: 'الرسائل' },
    { key: 'suggest.accept', label: 'قبول اقتراح التاجر وإضافة نقاطه', group: 'الرسائل' },
    { key: 'prices.publish', label: 'نشر أسعار «السوق النهاردة»', group: 'السوق' },
    { key: 'prices.approve', label: 'اعتماد الأسعار المعلّقة (القفزات الكبيرة)', group: 'السوق' },
    { key: 'dash', label: 'لوحة المؤشرات', group: 'الإدارة' },
    { key: 'traders', label: 'البحث في قائمة التجار', group: 'الإدارة' },
    { key: 'traders.block', label: 'إيقاف حساب تاجر أو تفعيله', group: 'الإدارة' },
    { key: 'traders.edit', label: 'تعديل بيانات التاجر وتغيير رمزه السري', group: 'الإدارة' },
    { key: 'traders.delete', label: 'حذف التاجر (يوقف حسابه ويحفظ سجله)', group: 'الإدارة' },
    { key: 'rewards', label: 'عرض طلبات الجوائز', group: 'الإدارة' },
    { key: 'rewards.approve', label: 'اعتماد الجوائز وتسليمها', group: 'الإدارة' },
    { key: 'report', label: 'التقرير الأسبوعي للإدارة', group: 'الإدارة' },
    { key: 'fleet', label: 'متابعة الأسطول: الخريطة والطوارئ والتنبيهات', group: 'الأسطول' },
    { key: 'fleet.manage', label: 'إنشاء خطوط السير ومشاركتها عبر واتساب', group: 'الأسطول' }
  ];
  var PERM_KEYS = PERMS.map(function (p) { return p.key; });
  var PERM_MIN = { gate: 1, farms: 1, inbox: 1, 'suggest.accept': 2, dash: 2, traders: 2, 'traders.block': 3, 'traders.edit': 3, 'traders.delete': 3, rewards: 2, 'rewards.approve': 3, 'fleet': 2, 'fleet.manage': 3 };
  var MANAGER_ALWAYS = ['traders.edit', 'traders.delete', 'traders.block', 'fleet', 'fleet.manage'];   // لا تُسحب من مدير الإدارة
  /* إعادة التهيئة من البداية: تُفرَّغ هذه الجداول، وتُحفظ نسخة منها أولًا. الإعدادات والمحتوى وقائمة الأسعار تبقى */
  var RESET_CLEAR = ['Traders', 'Gate', 'Tickets', 'TicketMsgs', 'Events', 'Rewards', 'Notifications', 'Counters', 'Farms', 'MarketDay', 'MarketPending', 'FleetRoutes', 'FleetPings', 'FleetAlerts', 'FleetNotes', 'FleetDevices', 'FleetConsents', 'ErrLog', 'HealthLog'];
  var RESET_KEEP = ['Config', 'Content', 'MarketItems'];
  var RESET_PHRASE = 'أعد التهيئة الكاملة';
  var RESET_KEEP_BACKUPS = 2;

  function createService(store, env) {
    var _cfg = null;
    function cfg() { if (!_cfg) _cfg = L.mergeConfig(C.CONFIG, store.all('Config')); return _cfg; }
    function now() { return env.now(); }
    function today() { return U.dateKey(now()); }
    function err(code, msg) { return new ApiError(code, msg); }
    function jparse(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }

    /* ---------- عدادات وأرقام ---------- */
    function counter(key) {
      var row = store.find('Counters', function (r) { return r.key === key; });
      if (!row) { store.insert('Counters', { key: key, value: 1 }); return 1; }
      var v = Number(row.value) + 1; store.update('Counters', key, { value: v }); return v;
    }
    function peek(key) {
      var row = store.find('Counters', function (r) { return r.key === key; });
      return row ? Number(row.value) : 0;
    }
    function addCounter(key, by) {
      var row = store.find('Counters', function (r) { return r.key === key; });
      if (!row) { store.insert('Counters', { key: key, value: by }); return by; }
      var v = Number(row.value) + by; store.update('Counters', key, { value: v }); return v;
    }
    function nextId(prefix, width) {
      var n = counter('id:' + prefix), s = String(n);
      while (s.length < (width || 4)) s = '0' + s;
      return prefix + '-' + s;
    }
    function genCode() {
      for (var tries = 0; tries < 60; tries++) {
        var h = env.randHex(8), code = '';
        for (var i = 0; i < 4; i++) code += ALPHA[parseInt(h.substr(i * 2, 2), 16) % ALPHA.length];
        if (!store.find('Traders', function (r) { return r.code === code; })) return code;
      }
      throw err('code', 'تعذّر إنشاء كود، حاول مرة أخرى');
    }
    function log(traderId, type, ref, points, meta) {
      store.insert('Events', { ts: now(), traderId: traderId || '', type: type, ref: ref || '', points: points || 0, meta: meta ? JSON.stringify(meta).substring(0, 400) : '' });
    }

    /* ---------- مصادقة ---------- */
    function issue(sub, role, hours) {
      return U.signToken({ sub: sub, role: role, exp: now() + hours * 3600000, iat: now() }, env.secret());
    }
    /* الحسابات المحذوفة تُستبعد من كل القوائم والمؤشرات. وتغيير الرمز من الإدارة يُنهي الجلسات الأقدم منه (sessAt في الحالة) */
    function liveTraders() { return store.all('Traders').filter(function (r) { return r.status !== 'deleted'; }); }
    function whoTrader(token) {
      var p = U.verifyToken(token, env.secret(), now());
      if (!p || p.role !== 'trader') throw err('auth', 'سجّل دخولك من جديد');
      var row = store.find('Traders', function (r) { return r.id === p.sub; });
      if (!row || row.status === 'blocked' || row.status === 'deleted') throw err('auth', 'الحساب غير متاح، تواصل مع المعاون');
      var st = jparse(row.state, null);
      if (st && st.sessAt && (Number(p.iat) || 0) < Number(st.sessAt)) throw err('auth', 'انتهت جلستك، سجّل دخولك بالرمز الجديد');
      return row;
    }
    function whoStaff(token, minRole) {
      var p = U.verifyToken(token, env.secret(), now());
      if (!p || p.role !== 'staff') throw err('auth', 'سجّل دخولك من جديد');
      var row = store.find('Staff', function (r) { return r.id === p.sub; });
      if (!row || !Number(row.active)) throw err('auth', 'الحساب غير متاح');
      if (minRole && STAFF_ROLES[row.role] < STAFF_ROLES[minRole]) throw err('perm', 'الصلاحية غير كافية');
      return row;
    }
    function checkPin(row, pin, kind) {
      var lim = cfg().limits;
      if (Number(row.lockUntil) > now()) throw err('locked', 'محاولات كثيرة. جرّب بعد ' + Math.ceil((Number(row.lockUntil) - now()) / 60000) + ' دقيقة');
      var ok = U.safeEq(U.hashPin(pin, row.salt, env.secret()), row.pinHash);
      if (!ok) {
        var f = Number(row.fails) + 1, patch = { fails: f };
        if (f >= lim.loginFails) { patch.fails = 0; patch.lockUntil = now() + lim.lockMinutes * 60000; }
        store.update(kind, row.id, patch);
        throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      }
      if (Number(row.fails)) store.update(kind, row.id, { fails: 0 });
    }

    /* ---------- حالة التاجر ---------- */
    function stateOf(row) {
      var s = jparse(row.state, null);
      if (!s) s = L.newState(Number(row.created) || now());
      if (!s.stats) s.stats = { games: 0, perfect: 0, rounds: 0 };
      if (!s.vStart) s.vStart = {};
      return s;
    }
    function save(row, st) {
      var patch = { state: JSON.stringify(st) };
      store.update('Traders', row.id, patch);
      row.state = patch.state;
    }
    function rankOf(row, st) {
      return L.computeRank(st, cfg(), now(), today());
    }

    /* ---------- الشارات ---------- */
    function badgesOf(st, rank) {
      var si = L.streakInfo(st, today(), cfg()), vids = C.VIDEOS.length, seen = Object.keys(st.videos).length;
      return [
        { id: 'b1', title: 'أول جولة', earned: st.days.length >= 1 },
        { id: 'b2', title: 'أسبوع كامل', earned: si.goalWeeks >= 1 },
        { id: 'b3', title: 'قنّاص الأخطاء', earned: st.stats.perfect >= 1 },
        { id: 'b4', title: 'حارس البوابة', earned: st.gate.clean >= 1 },
        { id: 'b5', title: 'خمس زيارات نظيفة', earned: st.gate.clean >= 5 },
        { id: 'b6', title: 'مشاهد متابع', earned: seen >= vids },
        { id: 'b7', title: 'صاحب رأي', earned: Object.keys(st.rated).length >= 1 || st.sugg >= 1 },
        { id: 'b8', title: 'شريك مرشِّح', earned: st.invites.done >= 1 }
      ];
    }

    /* ---------- ملف التاجر العام ---------- */
    function profile(row, st) {
      var c = cfg(), t = today(), rank = rankOf(row, st);
      var si = L.streakInfo(st, t, c), d = L.rollDaily(st, t);
      var rinfo = C.RANKS[rank];
      var unread = store.filter('Tickets', function (x) { return x.traderId === row.id && Number(x.unreadTrader); }).length;
      var followupDue = !!(st.baseline && !st.followup && (now() - st.baseline.ts) >= c.followupAfterDays * 86400000);
      return {
        id: row.id, code: row.code, name: row.name, plate: row.plate, company: row.company, farmId: row.farmId,
        pts: st.pts, rank: { n: rank, name: rinfo.name, perk: rinfo.perk },
        next: rank < 6 ? { n: rank + 1, name: C.RANKS[rank + 1].name, need: C.RANKS[rank + 1].need, items: L.nextRankProgress(st, c, now(), t, rank) } : null,
        week: { count: si.count, goal: si.goal, met: si.met, streak: si.streak, mult: si.mult, freezesLeft: si.freezesLeft, goalWeeks: si.goalWeeks, days: weekDays(st, si.weekStart) },
        daily: { roundDone: !!d.round, pts: d.pts, cap: c.dailyDigitalCap, games: d.games },
        onboarding: { launch: !!st.videos.launch, charter: !!st.charter, baseline: !!st.baseline, done: L.onboardingDone(st) },
        followupDue: followupDue,
        gate: { visits: st.gate.visits, clean: st.gate.clean, cleanRun: st.gate.cleanRun, viol: st.gate.viol, last: st.gate.last },
        honor: !!st.honor, unread: unread, badges: badgesOf(st, rank),
        invites: st.invites, baseline: st.baseline, followup: st.followup,
        mizanDone: !!st.mizan, joined: row.created
      };
    }
    function weekDays(st, ws) {
      var out = [];
      for (var i = 0; i < 7; i++) { var dk = U.addDays(ws, i); out.push({ dk: dk, on: st.days.indexOf(dk) >= 0 }); }
      return out;
    }

    /* ---------- التسجيل والدخول ---------- */
    function doRegister(p, assistedBy) {
      var name = U.cleanText(p.name, 40), phone = U.normPhone(p.phone), pin = U.normPin(p.pin);
      if (name.length < 3) throw err('name', 'اكتب اسمك بالكامل (3 حروف على الأقل)');
      if (!phone) throw err('phone', 'رقم الموبايل غير صحيح (مثال: 01001234567)');
      if (!pin) throw err('pin', 'الرمز السري من 4 إلى 6 أرقام');
      if (!assistedBy && !p.agree) throw err('agree', 'وافق على شروط الاستخدام والخصوصية');
      var dupTrader = store.find('Traders', function (r) { return r.phone === phone; });
      if (dupTrader) throw err('phone_exists', dupTrader.status === 'deleted' ? 'الحساب ده أُوقف. كلّم المعاون لمراجعة الموضوع' : 'الرقم ده مسجّل قبل كده — سجّل دخولك');
      if (!assistedBy) { /* حماية من التسجيل الآلي: حد يومي عام */
        if (peek('reg:' + today()) >= cfg().limits.registerPerDay) throw err('busy', 'التسجيل مزدحم الآن، جرّب بعد قليل أو اطلب من المعاون تسجيلك');
        addCounter('reg:' + today(), 1);
      }
      var salt = env.randHex(8), id = nextId('TR', 4), t = now();
      var st = L.newState(t);
      var farm = U.cleanText(p.farmId, 8);
      if (p.ref) {
        var inv = store.find('Traders', function (r) { return r.code === String(p.ref).toUpperCase().trim(); });
        if (inv) st.invitedBy = inv.id;
      }
      var row = {
        id: id, code: genCode(), name: name, phone: phone, pinHash: U.hashPin(pin, salt, env.secret()), salt: salt,
        plate: U.normPlate(p.plate), company: U.cleanText(p.company, 40), farmId: farm, status: 'active',
        created: t, lastLogin: t, fails: 0, lockUntil: 0, state: JSON.stringify(st), mizan: ''
      };
      store.insert('Traders', row);
      log(id, 'register', assistedBy || '', 0, null);
      return row;
    }
    function register(token, p) {
      var row = doRegister(p, '');
      return { token: issue(row.id, 'trader', cfg().limits.tokenDays * 24), me: profile(row, stateOf(row)) };
    }
    function login(token, p) {
      var phone = U.normPhone(p.phone), pin = U.normPin(p.pin);
      if (!phone || !pin) throw err('bad_login', 'اكتب رقم الموبايل والرمز السري');
      var row = store.find('Traders', function (r) { return r.phone === phone; });
      if (!row) throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      if (row.status === 'deleted') throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      if (row.status === 'blocked') throw err('auth', 'الحساب غير متاح، تواصل مع المعاون');
      checkPin(row, pin, 'Traders');
      store.update('Traders', row.id, { lastLogin: now() });
      return { token: issue(row.id, 'trader', cfg().limits.tokenDays * 24), me: profile(row, stateOf(row)) };
    }
    function staffLogin(token, p) {
      var phone = U.normPhone(p.phone), pin = U.normPin(p.pin);
      if (!phone || !pin) throw err('bad_login', 'اكتب رقم الموبايل والرمز السري');
      var row = store.find('Staff', function (r) { return r.phone === phone; });
      if (!row || !Number(row.active)) throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      checkPin(row, pin, 'Staff');
      return { token: issue(row.id, 'staff', cfg().limits.staffTokenHours), staff: staffPublic(row) };
    }
    function staffPublic(s) {
      return { id: s.id, name: s.name, title: s.title, role: s.role, roleLabel: ROLE_LABEL[s.role], farmId: s.farmId, perms: permsOf(s) };
    }

    /* ---------- محتوى ---------- */
    function contentMap() {
      var rows = store.all('Content'), m = {};
      rows.forEach(function (r) { m[r.id] = r; });
      return m;
    }
    function videosList(st) {
      var cm = contentMap(), c = cfg();
      return C.VIDEOS.map(function (v) {
        var r = cm[v.id] || {};
        if (r.active === 0 || r.active === '0') return null;
        return {
          id: v.id, title: r.title || v.title, desc: r.desc || v.desc, cover: r.cover || v.cover,
          driveId: r.driveId || '', secs: v.secs, minSec: Number(r.minSec) || v.minSec, required: !!v.required,
          watched: !!st.videos[v.id], pts: c.points.video, order: Number(r.order) || v.order
        };
      }).filter(Boolean).sort(function (a, b) { return a.order - b.order; });
    }
    function cardsList(st) {
      return C.CARDS.map(function (k) {
        return { id: k.id, tag: k.tag, title: k.title, fact: k.fact, why: k.why, src: k.src, url: k.url, forTrader: !!k.forTrader, read: !!st.cards[k.id] };
      });
    }
    function content(row) {
      var st = stateOf(row);
      return { videos: videosList(st), cards: cardsList(st), cardPts: cfg().points.card };
    }

    function videoStart(row, p) {
      var v = C.VIDEOS.filter(function (x) { return x.id === p.id; })[0];
      if (!v) throw err('video', 'فيديو غير موجود');
      var st = stateOf(row); st.vStart[v.id] = now(); save(row, st);
      return { started: true };
    }
    function videoDone(row, p) {
      var v = C.VIDEOS.filter(function (x) { return x.id === p.id; })[0];
      if (!v) throw err('video', 'فيديو غير موجود');
      var st = stateOf(row), c = cfg();
      var cm = contentMap(), minSec = (cm[v.id] && Number(cm[v.id].minSec)) || v.minSec;
      if (st.videos[v.id]) return { pts: 0, already: true, me: profile(row, st) };
      var started = st.vStart[v.id] || 0;
      if (!started || (now() - started) < minSec * 800) throw err('too_early', 'كمّل الفيديو للآخر الأول');
      st.videos[v.id] = now();
      var a = L.awardDigital(st, c.points.video, today(), c);
      log(row.id, 'video', v.id, a.pts, null);
      afterProgress(row, st);
      save(row, st);
      return { pts: a.pts, capped: a.capped, mult: a.mult, me: profile(row, st) };
    }
    function cardRead(row, p) {
      var k = C.CARDS.filter(function (x) { return x.id === p.id; })[0];
      if (!k) throw err('card', 'بطاقة غير موجودة');
      var st = stateOf(row), c = cfg();
      if (st.cards[k.id]) return { pts: 0, already: true, me: profile(row, st) };
      st.cards[k.id] = now();
      var a = L.awardDigital(st, c.points.card, today(), c);
      log(row.id, 'card', k.id, a.pts, null);
      save(row, st);
      return { pts: a.pts, capped: a.capped, mult: a.mult, me: profile(row, st) };
    }

    /* ---------- جولة اليوم ---------- */
    function traderSeed(row) { return U.seedFrom(row.id) % 997; }
    function roundPick(row) {
      var di = U.dayIndex(today()), ts = traderSeed(row);
      var card = C.CARDS[(di + ts) % C.CARDS.length];
      var tf = C.GAMES.tf.items, q = tf[(di * 5 + ts) % tf.length];
      return { card: card, q: q };
    }
    function roundGet(row) {
      var st = stateOf(row), d = L.rollDaily(st, today()), pick = roundPick(row);
      return {
        done: !!d.round,
        card: { id: pick.card.id, tag: pick.card.tag, title: pick.card.title, fact: pick.card.fact, why: pick.card.why, src: pick.card.src, url: pick.card.url },
        q: { id: pick.q.id, q: pick.q.q }
      };
    }
    function roundSubmit(row, p) {
      var st = stateOf(row), c = cfg(), t = today(), d = L.rollDaily(st, t);
      if (d.round) throw err('done', 'خلّصت جولة النهارده. نشوفك بكرة!');
      var pick = roundPick(row);
      var correct = (p.answer === true || p.answer === 'true') === pick.q.a;
      d.round = 1;
      L.markActive(st, t);
      st.stats.rounds++;
      if (!st.cards[pick.card.id]) st.cards[pick.card.id] = now();
      var a = L.awardDigital(st, c.points.round, t, c);
      var bonus = L.weekGoalBonus(st, t, c);
      addCounter('rounds:' + L.streakInfo(st, t, c).weekStart, 1);
      log(row.id, 'round', pick.q.id, a.pts + bonus, { ok: correct ? 1 : 0 });
      afterProgress(row, st);
      save(row, st);
      return {
        correct: correct, answer: pick.q.a, why: pick.q.why, src: pick.q.src, pts: a.pts, mult: a.mult, capped: a.capped,
        weekBonus: bonus, me: profile(row, st)
      };
    }

    /* ---------- الألعاب ---------- */
    function gameSet(id, row) {
      var g = C.GAMES[id];
      if (!g) throw err('game', 'لعبة غير موجودة');
      var t = today(), di = U.dayIndex(t), items;
      if (id === 'tf') items = U.shuffled(g.items, 'tf:' + t).slice(0, g.per);
      else if (id === 'steps') { var s0 = (di * g.per) % g.items.length; items = []; for (var i = 0; i < g.per; i++) items.push(g.items[(s0 + i) % g.items.length]); }
      else items = U.shuffled(g.items, id + ':' + t).slice(0, g.per);
      return { g: g, items: items, t: t };
    }
    function optsShuffled(item, t) {
      var idx = item.opts.map(function (_, i) { return i; });
      var order = U.shuffled(idx, 'o:' + item.id + ':' + t);
      return order; // order[k] = index الأصلي للخيار المعروض k
    }
    function gameGet(row, p) {
      var set = gameSet(p.id, row), g = set.g, st = stateOf(row), d = L.rollDaily(st, today());
      var items = set.items.map(function (it) {
        if (g.kind === 'tf') return { id: it.id, q: it.q };
        if (g.kind === 'order') return { id: it.id, t: it.t, cards: U.shuffled(it.order, 'k:' + it.id + ':' + set.t) };
        var ord = optsShuffled(it, set.t);
        return { id: it.id, tag: it.tag || '', q: it.q, opts: ord.map(function (k) { return it.opts[k]; }) };
      });
      return {
        id: g.id, title: g.title, tag: g.tag, intro: g.intro, kind: g.kind, secs: g.secs, items: items,
        playedToday: !!d.games[g.id], pts: cfg().points.gameBase + '–' + (cfg().points.gameBase + cfg().points.gameBonus)
      };
    }
    function scoreGame(id, items, answers, t) {
      var g = C.GAMES[id], res = [], correct = 0;
      items.forEach(function (it, i) {
        var a = answers ? answers[i] : null, ok = false, shown = '';
        if (g.kind === 'tf') {
          ok = (a === true || a === 'true') ? it.a === true : (a === false || a === 'false') ? it.a === false : false;
          shown = it.a ? 'صح' : 'غلط';
        } else if (g.kind === 'order') {
          ok = Array.isArray(a) && a.length === it.order.length && a.every(function (x, k) { return x === it.order[k]; });
          shown = it.order.join(' ← ');
        } else {
          var ord = optsShuffled(it, t), pick = (typeof a === 'number' && a >= 0 && a < ord.length) ? ord[a] : -1;
          ok = pick === it.a; shown = it.opts[it.a];
        }
        if (ok) correct++;
        res.push({ id: it.id, ok: ok, answer: shown, why: it.why || '', wrong: it.wrong || '', src: it.src || null, q: it.q || it.t || '' });
      });
      return { correct: correct, total: items.length, res: res };
    }
    function gameSubmit(row, p) {
      var set = gameSet(p.id, row), g = set.g, st = stateOf(row), c = cfg(), t = set.t;
      var sc = scoreGame(g.id, set.items, p.answers, t), d = L.rollDaily(st, t);
      var pts = 0, a = null, first = !d.games[g.id];
      st.stats.games++;
      if (sc.correct === sc.total) st.stats.perfect++;
      if (first) {
        d.games[g.id] = sc.correct;
        a = L.awardDigital(st, L.gamePoints(sc.correct, sc.total, c), t, c);
        pts = a.pts;
      }
      log(row.id, 'game', g.id, pts, { s: sc.correct + '/' + sc.total });
      save(row, st);
      return { correct: sc.correct, total: sc.total, res: sc.res, pts: pts, first: first, capped: a ? a.capped : false, mult: a ? a.mult : 1, me: profile(row, st) };
    }

    /* ---------- الميثاق والاختبارات ---------- */
    function charterSign(row, p) {
      var st = stateOf(row), c = cfg();
      if (st.charter) return { pts: 0, me: profile(row, st) };
      st.charter = now();
      st.pts += c.points.charter;
      log(row.id, 'charter', '', c.points.charter, null);
      afterProgress(row, st);
      save(row, st);
      return { pts: c.points.charter, me: profile(row, st) };
    }
    function testItems(kind) {
      var pl = C.PLACEMENT[kind]; if (!pl) throw err('test', 'اختبار غير موجود');
      var items = [];
      pl.tf.forEach(function (id) { var it = C.GAMES.tf.items.filter(function (x) { return x.id === id; })[0]; items.push({ k: 'tf', it: it }); });
      pl.shoes.forEach(function (id) { var it = C.GAMES.shoes.items.filter(function (x) { return x.id === id; })[0]; items.push({ k: 'choice', it: it }); });
      return items;
    }
    function testGet(row, p) {
      var st = stateOf(row), kind = p.kind === 'followup' ? 'followup' : 'baseline';
      var items = testItems(kind).map(function (x) {
        if (x.k === 'tf') return { id: x.it.id, kind: 'tf', q: x.it.q };
        var ord = optsShuffled(x.it, 'test');
        return { id: x.it.id, kind: 'choice', q: x.it.q, opts: ord.map(function (k) { return x.it.opts[k]; }) };
      });
      return { kind: kind, title: C.PLACEMENT[kind].title, items: items, done: !!st[kind], result: st[kind] };
    }
    function testSubmit(row, p) {
      var st = stateOf(row), c = cfg(), kind = p.kind === 'followup' ? 'followup' : 'baseline';
      if (st[kind]) throw err('done', 'خلّصت الاختبار ده قبل كده');
      if (kind === 'followup' && !st.baseline) throw err('order', 'ابدأ بالاختبار الأول');
      if (kind === 'followup' && (now() - st.baseline.ts) < c.followupAfterDays * 86400000) throw err('early', 'اختبار الشهر بيفتح بعد ' + c.followupAfterDays + ' يوم');
      var items = testItems(kind), correct = 0, res = [];
      items.forEach(function (x, i) {
        var a = p.answers ? p.answers[i] : null, ok = false, shown;
        if (x.k === 'tf') { ok = (a === true || a === 'true') ? x.it.a === true : (a === false || a === 'false') ? x.it.a === false : false; shown = x.it.a ? 'صح' : 'غلط'; }
        else { var ord = optsShuffled(x.it, 'test'); var pick = (typeof a === 'number' && a >= 0 && a < ord.length) ? ord[a] : -1; ok = pick === x.it.a; shown = x.it.opts[x.it.a]; }
        if (ok) correct++;
        res.push({ id: x.it.id, ok: ok, answer: shown, why: x.it.why, q: x.it.q });
      });
      st[kind] = { score: correct, total: items.length, ts: now() };
      var pts = kind === 'baseline' ? c.points.baseline : c.points.followup;
      st.pts += pts;
      log(row.id, 'test', kind, pts, { s: correct + '/' + items.length });
      afterProgress(row, st);
      save(row, st);
      return { correct: correct, total: items.length, res: res, pts: pts, me: profile(row, st) };
    }

    /* مكافآت الدعوة تُمنح عند اكتمال المدعو وعند أول زيارة نظيفة */
    function afterProgress(row, st) {
      if (st.invitedBy && !st.invitePaid.done && L.onboardingDone(st)) {
        var inv = store.find('Traders', function (r) { return r.id === st.invitedBy; });
        if (inv) {
          var ist = stateOf(inv), c = cfg();
          ist.pts += c.points.inviteDone; ist.invites.done++;
          st.invitePaid.done = 1;
          log(inv.id, 'invite_done', row.id, c.points.inviteDone, null);
          save(inv, ist);
        }
      }
    }
    function payInviteClean(row, st) {
      if (st.invitedBy && !st.invitePaid.clean) {
        var inv = store.find('Traders', function (r) { return r.id === st.invitedBy; });
        if (inv) {
          var ist = stateOf(inv), c = cfg();
          ist.pts += c.points.inviteClean; ist.invites.clean++;
          st.invitePaid.clean = 1;
          log(inv.id, 'invite_clean', row.id, c.points.inviteClean, null);
          save(inv, ist);
        }
      }
    }

    /* ---------- ميزان التاجر (حفظ المدخلات) ---------- */
    function mizanSave(row, p) {
      var inp = p.inputs || {}, clean = {};
      ['birds', 'kg', 'price', 'margin', 'trips', 'dayCost', 'lostDays', 'share'].forEach(function (k) { clean[k] = Math.max(0, Math.min(1e9, U.toNum(inp[k], 0))); });
      store.update('Traders', row.id, { mizan: JSON.stringify(clean) });
      var st = stateOf(row), pts = 0;
      if (!st.mizan) { st.mizan = now(); pts = cfg().points.mizan; st.pts += pts; log(row.id, 'mizan', '', pts, null); }
      save(row, st);
      return { pts: pts, me: profile(row, st) };
    }
    function mizanGet(row) { return { inputs: jparse(row.mizan, null) }; }

    /* ---------- الرسائل (كلّمنا) ---------- */
    function roleStaff(roles, farmId) {
      return store.filter('Staff', function (s) {
        if (!Number(s.active) || roles.indexOf(s.role) < 0 || !can(s, 'inbox')) return false;
        if (s.role === 'assistant') return !farmId || !s.farmId || s.farmId === farmId;
        return true;
      });
    }
    function notifyMail(list, subject, body) {
      var emails = [];
      list.forEach(function (s) { if (s.email && emails.indexOf(s.email) < 0) emails.push(s.email); });
      var ok = 0;
      if (emails.length) {
        try { ok = env.notify(emails, subject, body) ? 1 : 0; } catch (e) { ok = 0; }
      }
      store.insert('Notifications', { ts: now(), to: list.map(function (s) { return s.id; }).join(','), channel: 'email', subject: subject, ok: ok });
    }
    function notifyStaffList(list, ticket, why) {
      var tt = cfg().ticketTypes[ticket.type];
      var subject = '[' + cfg().appName + '] ' + why + ' رقم ' + ticket.id + (ticket.type === 'urgent' ? ' (عاجل)' : '');
      var body = why + ' رقم ' + ticket.id + ' — النوع: «' + tt.label + '». افتح التطبيق للاطلاع والرد. هذا البريد لا يتضمن نص الرسالة.';
      notifyMail(list, subject, body);
    }
    function ticketCreate(row, p) {
      var c = cfg(), lim = c.limits, tt = c.ticketTypes[p.type];
      if (!tt) throw err('type', 'اختر نوع الرسالة');
      var subject = U.cleanText(p.subject, lim.subjectMax), body = U.cleanText(p.body, lim.bodyMax);
      if (subject.length < 3) throw err('subject', 'اكتب عنوانًا قصيرًا للرسالة');
      if (body.length < 5) throw err('body', 'اكتب تفاصيل الرسالة');
      var dk = today();
      var cnt = store.filter('Tickets', function (x) { return x.traderId === row.id && U.dateKey(Number(x.ts)) === dk; }).length;
      if (cnt >= lim.ticketsPerDay) throw err('limit', 'وصلت للحد اليومي للرسائل (' + lim.ticketsPerDay + '). جرّب بكرة.');
      var t = now(), id = nextId('T', 4);
      var farm = U.cleanText(p.farmId, 8) || row.farmId || '';
      var tk = { id: id, ts: t, traderId: row.id, farmId: farm, type: p.type, subject: subject, status: 'open', level: 0, lastTs: t, firstReplyTs: 0, resolvedTs: 0, stars: 0, unreadTrader: 0, unreadStaff: 1, lastStaffId: '', accepted: 0 };
      store.insert('Tickets', tk);
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: id, ts: t, from: 'trader', staffId: '', text: body });
      log(row.id, 'ticket', id, 0, { type: p.type });
      notifyStaffList(roleStaff(tt.first, farm), tk, 'لديك رسالة جديدة');
      return { id: id, ticket: ticketPublic(tk) };
    }
    function ticketPublic(tk) {
      var tt = cfg().ticketTypes[tk.type] || {};
      return { id: tk.id, type: tk.type, typeLabel: tt.label || tk.type, subject: tk.subject, status: tk.status, ts: Number(tk.ts), lastTs: Number(tk.lastTs), unread: !!Number(tk.unreadTrader), stars: Number(tk.stars), farmId: tk.farmId, callback: false };
    }
    function msgsOf(id, forTrader) {
      var staffMap = {};
      store.all('Staff').forEach(function (s) { staffMap[s.id] = s; });
      return store.filter('TicketMsgs', function (m) { return m.ticketId === id; }).sort(function (a, b) { return Number(a.ts) - Number(b.ts); }).map(function (m) {
        var s = m.staffId ? staffMap[m.staffId] : null;
        var o = { ts: Number(m.ts), from: m.from, text: m.text };
        if (m.from === 'staff') o.who = s ? s.title : 'فريق الأمن الحيوي';
        if (!forTrader && s) o.whoName = s.name;
        return o;
      });
    }
    function ticketList(row) {
      var list = store.filter('Tickets', function (x) { return x.traderId === row.id; }).sort(function (a, b) { return Number(b.lastTs) - Number(a.lastTs); });
      return { tickets: list.map(ticketPublic), types: typesPublic() };
    }
    function typesPublic() {
      var t = cfg().ticketTypes, out = [];
      Object.keys(t).forEach(function (k) { out.push({ id: k, label: t[k].label, hint: t[k].hint, sla: t[k].sla }); });
      return out;
    }
    function ticketGet(row, p) {
      var tk = store.find('Tickets', function (x) { return x.id === p.id && x.traderId === row.id; });
      if (!tk) throw err('nf', 'الرسالة غير موجودة');
      if (Number(tk.unreadTrader)) store.update('Tickets', tk.id, { unreadTrader: 0 });
      var o = ticketPublic(tk); o.unread = false;
      return { ticket: o, msgs: msgsOf(tk.id, true), canRate: !!(Number(tk.firstReplyTs) && !Number(tk.stars)) };
    }
    function ticketReply(row, p) {
      var tk = store.find('Tickets', function (x) { return x.id === p.id && x.traderId === row.id; });
      if (!tk) throw err('nf', 'الرسالة غير موجودة');
      var text = U.cleanText(p.text, cfg().limits.bodyMax);
      if (text.length < 2) throw err('body', 'اكتب ردك');
      var dk = today(), myIds = {};
      store.filter('Tickets', function (x) { return x.traderId === row.id; }).forEach(function (x) { myIds[x.id] = 1; });
      var mine = store.filter('TicketMsgs', function (m) { return m.from === 'trader' && myIds[m.ticketId] && U.dateKey(Number(m.ts)) === dk; }).length;
      if (mine >= cfg().limits.repliesPerDay + cfg().limits.ticketsPerDay) throw err('limit', 'وصلت للحد اليومي للرسائل');
      var t = now();
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: t, from: 'trader', staffId: '', text: text });
      var reopened = tk.status !== 'open';
      store.update('Tickets', tk.id, { status: 'open', lastTs: t, unreadStaff: 1, resolvedTs: 0 });
      if (reopened) {
        var target = tk.lastStaffId ? store.filter('Staff', function (s) { return s.id === tk.lastStaffId && Number(s.active); }) : [];
        if (!target.length) target = roleStaff(cfg().ticketTypes[tk.type].first, tk.farmId);
        notifyStaffList(target, tk, 'رد جديد من التاجر على الرسالة');
      }
      return ticketGet(row, { id: tk.id });
    }
    function ticketRate(row, p) {
      var tk = store.find('Tickets', function (x) { return x.id === p.id && x.traderId === row.id; });
      if (!tk) throw err('nf', 'الرسالة غير موجودة');
      if (!Number(tk.firstReplyTs)) throw err('early', 'استنى رد المسؤول الأول');
      if (Number(tk.stars)) throw err('done', 'قيّمت الرد قبل كده');
      var stars = U.clamp(U.toInt(p.stars, 0), 1, 5), st = stateOf(row), c = cfg();
      store.update('Tickets', tk.id, { stars: stars });
      st.rated[tk.id] = stars; st.pts += c.points.rateReply;
      log(row.id, 'rate', tk.id, c.points.rateReply, { stars: stars });
      save(row, st);
      return { pts: c.points.rateReply, me: profile(row, st) };
    }

    /* ---------- الجوائز ---------- */
    function myClaims(row) {
      var m = {};
      store.filter('Rewards', function (r) { return r.traderId === row.id; }).forEach(function (r) { m[r.rewardId] = r; });
      return m;
    }
    function rewardsList(row) {
      var st = stateOf(row), rank = rankOf(row, st), claims = myClaims(row);
      return {
        rewards: C.REWARDS.map(function (rw) {
          var sv = L.rewardState(rw, rank, st.pts, st, claims[rw.id]);
          if (rw.id === 'honor' && sv === 'available' && st.honor) sv = 'delivered';
          return { id: rw.id, kind: rw.kind, title: rw.title, desc: rw.desc, rank: rw.rank, points: rw.points, state: sv };
        }),
        pts: st.pts, rank: rank
      };
    }
    function rewardClaim(row, p) {
      var rw = C.REWARDS.filter(function (x) { return x.id === p.id; })[0];
      if (!rw) throw err('nf', 'جائزة غير موجودة');
      var st = stateOf(row), rank = rankOf(row, st), claims = myClaims(row);
      var sv = L.rewardState(rw, rank, st.pts, st, claims[rw.id]);
      if (sv !== 'available') throw err('state', sv === 'locked' ? 'لسه ماوصلتش لشروطها' : sv === 'pending_ops' ? 'قيد اعتماد إدارة التشغيل' : 'تم طلبها قبل كده');
      if (rw.id === 'honor') { st.honor = 1; save(row, st); }
      var status = rw.id === 'honor' ? 'delivered' : 'requested';
      store.insert('Rewards', { id: nextId('R', 4), ts: now(), traderId: row.id, rewardId: rw.id, status: status, decidedBy: '', decidedTs: 0, note: '' });
      log(row.id, 'reward_claim', rw.id, 0, null);
      return rewardsList(row);
    }
    function honorSet(row, p) {
      var st = stateOf(row); st.honor = p.on ? 1 : 0; save(row, st);
      return { honor: !!st.honor };
    }

    /* ---------- الرئيسية ---------- */
    function farmsList() {
      var c = cfg(), t = now();
      return store.all('Farms').map(function (f) {
        var st = f.status || 'unknown';
        if (!f.ts || (t - Number(f.ts)) > c.farmStaleHours * 3600000) st = 'unknown';
        return { id: f.id, name: f.name, status: st, label: C.FARM_STATUS[st].label, tone: C.FARM_STATUS[st].tone, note: st === 'unknown' ? '' : f.note, ts: Number(f.ts) };
      });
    }
    function collective() {
      var c = cfg(), ws = U.weekStart(today());
      var n = peek('rounds:' + ws);
      return { count: n, target: c.collective.weeklyTarget, reached: n >= c.collective.weeklyTarget };
    }
    function bandOf(row, st) {
      var all = [];
      liveTraders().forEach(function (r) { var s = jparse(r.state, null); if (s && s.pts > 0) all.push(s.pts); });
      if (!all.length || st.pts <= 0) return null;
      var higher = all.filter(function (x) { return x > st.pts; }).length;
      var pct = higher / all.length;
      return pct <= 0.1 ? 10 : pct <= 0.25 ? 25 : pct <= 0.5 ? 50 : 100;
    }
    function honorBoard() {
      var out = [];
      liveTraders().forEach(function (r) {
        var s = jparse(r.state, null);
        if (s && s.honor && s.rankMax >= 2) out.push(r.name);
      });
      out.sort(function (a, b) { return a < b ? -1 : 1; });
      return out.slice(0, 30);
    }
    function home(row) {
      var st = stateOf(row);
      var pr = profile(row, st), mk = mkSafe(), tk = today();
      /* قياس الاستخدام للتقرير الأسبوعي: أول فتح في اليوم، وأول مرة يصله فيها سعر اليوم (حدث واحد لكل منهما يوميًا) */
      if (st.openDk !== tk) { st.openDk = tk; log(row.id, 'open', tk, 0, null); }
      if (mk && mk.state === 'fresh' && st.pvDk !== tk) { st.pvDk = tk; log(row.id, 'pview', tk, 0, null); }
      save(row, st); // يثبّت أعلى رتبة وصل لها
      return { me: pr, farms: farmsList(), collective: collective(), band: bandOf(row, st), honor: honorBoard(), facts: cfg().facts, appName: cfg().appName, market: mk, welcome: welcomeCfg(), milestone: milestoneOf(row, st, pr), feat: featCfg() };
    }
    /* رسالة الترحيب والتقدير: نص وتوقيع وتشغيل فقط (التخصيص بالاسم والإنجاز يتم في الواجهة من بيانات التاجر نفسه) */
    function welcomeCfg() {
      var w = cfg().welcome || {}, d = C.CONFIG.welcome, lines = [], defs = [], i;
      for (i = 1; i <= 8; i++) {
        var v = U.cleanText(w['t' + i] == null ? '' : w['t' + i], 240);
        if (v) lines.push(v);
        defs.push(d['t' + i]);
      }
      return {
        on: !(w.on === false || w.on === 'false' || w.on === 0),
        message: U.cleanText(w.message == null ? '' : w.message, 240),
        sign: U.cleanText(w.sign == null || w.sign === '' ? d.sign : w.sign, 80),
        lines: lines.length ? lines : defs     // لو مُسحت كل الجمل نرجع للجمل الجاهزة بدل رسالة فارغة
      };
    }
    function visits(row) {
      var list = store.filter('Gate', function (g) { return g.traderId === row.id; }).sort(function (a, b) { return Number(b.ts) - Number(a.ts); }).slice(0, 40);
      var farms = {}; store.all('Farms').forEach(function (f) { farms[f.id] = f.name; });
      return {
        visits: list.map(function (g) {
          return { ts: Number(g.ts), farm: farms[g.farmId] || g.farmId, checks: jparse(g.checks, {}), pass: Number(g.pass), clean: !!Number(g.clean), violation: !!Number(g.violation), points: Number(g.points) };
        })
      };
    }
    function inviteInfo(row) {
      var st = stateOf(row);
      return { code: row.code, done: st.invites.done, clean: st.invites.clean, ptsDone: cfg().points.inviteDone, ptsClean: cfg().points.inviteClean };
    }

    /* ---------- السوق النهاردة: أسعار بيع منتجات الشركة للتجار ---------- */
    function mkCfg() {
      var m = cfg().market || {}, d = C.CONFIG.market;
      function n(v, def, lo, hi) { v = Number(v); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); }
      return {
        editRole: STAFF_ROLES[m.editRole] ? m.editRole : d.editRole,
        directRole: STAFF_ROLES[m.directRole] ? m.directRole : d.directRole,
        remind: !(m.remind === false || m.remind === 'false' || m.remind === 0),
        remindHour: Math.round(n(m.remindHour, d.remindHour, 0, 23)),
        staleDays: Math.round(n(m.staleDays, d.staleDays, 0, 30)),
        historyDays: Math.round(n(m.historyDays, d.historyDays, 3, 60)),
        maxJumpPct: n(m.maxJumpPct, d.maxJumpPct, 1, 500),
        backup: String(m.backup == null ? '' : m.backup).split(/[,،;\s]+/).map(function (x) { x = x.trim(); return /^1\d{9}$/.test(x) ? '0' + x : x; }).filter(Boolean),
        approval: ['jump', 'always', 'off'].indexOf(String(m.approval)) >= 0 ? String(m.approval) : d.approval,
        approveRole: STAFF_ROLES[m.approveRole] ? m.approveRole : d.approveRole,
        selfApprove: m.selfApprove === true || m.selfApprove === 'true' || m.selfApprove === 1,
        approveRemindMin: Math.round(n(m.approveRemindMin, d.approveRemindMin, 5, 1440)),
        escalate: !(m.escalate === false || m.escalate === 'false' || m.escalate === 0),
        escalateHour: Math.round(n(m.escalateHour, d.escalateHour, 1, 23)),
        company: String(m.company || d.company),
        disclaimer: String(m.disclaimer || d.disclaimer)
      };
    }
    /* منتجات السوق من ورقة MarketItems (وإن كانت فارغة تمامًا نستخدم الافتراضي) */
    function mkItems() {
      var rows = store.all('MarketItems'), out = [], seen = {}, hasMain = false;
      rows.forEach(function (r, i) {
        var id = String(r.id == null ? '' : r.id).trim();
        if (!/^[A-Za-z0-9_]{1,20}$/.test(id) || seen[id]) return;
        var name = U.cleanText(r.name, 60);
        if (!name || Number(r.hidden)) return;
        seen[id] = 1;
        var main = Number(r.main) && !hasMain ? 1 : 0; if (main) hasMain = true;
        out.push({ id: id, name: name, short: U.cleanText(r.short, 20) || name, unit: U.cleanText(r.unit, 20), dec: U.clamp(U.toInt(r.dec, 0), 0, 3), order: Number(r.order) || 0, main: main, i: i });
      });
      if (!out.length && !rows.length) {
        C.MARKET_ITEMS.forEach(function (x, i) { out.push({ id: x.id, name: x.name, short: x.short, unit: x.unit, dec: x.dec, order: x.order, main: x.main && !hasMain ? 1 : 0, i: i }); hasMain = hasMain || !!x.main; });
      }
      out.sort(function (a, b) { return a.order - b.order || a.i - b.i; });
      if (out.length && !hasMain) out[0].main = 1;
      return out;
    }
    function normDk(v) { var s = String(v == null ? '' : v).trim().substring(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
    function mkPrice(v) { v = Number(v); return v > 0 && v < 1e7 ? v : 0; }
    /* أيام الأسعار الأحدث أولًا (تتجاهل أي تاريخ مستقبلي أو غير مفهوم) */
    function mkDays() {
      var t = today(), out = [];
      store.all('MarketDay').forEach(function (r) {
        var dk = normDk(r.dk); if (!dk || dk > t) return;
        var pr = jparse(r.prices, {}); if (!pr || typeof pr !== 'object') pr = {};
        out.push({ dk: dk, prices: pr, note: String(r.note || ''), ts: Number(r.ts) || 0, by: r.by, raw: r });
      });
      out.sort(function (a, b) { return a.dk < b.dk ? 1 : a.dk > b.dk ? -1 : 0; });
      return out;
    }
    function mkBuild(full) {
      var c = mkCfg(), items = mkItems(), days = mkDays(), t = today();
      var priced = days.filter(function (d) { return items.some(function (it) { return mkPrice(d.prices[it.id]); }); });
      var last = priced[0] || null, age = last ? U.diffDays(last.dk, t) : -1;
      var state = !last ? 'empty' : age === 0 ? 'fresh' : age <= c.staleDays ? 'old' : 'stale';
      var list = items.map(function (it) {
        var pts = [];
        for (var i = 0; i < days.length && pts.length < 8; i++) { var p = mkPrice(days[i].prices[it.id]); if (p) pts.push({ dk: days[i].dk, price: p }); }
        var cur = pts[0] || null, prev = pts[1] || null;
        var chg = cur && prev ? Math.round((cur.price - prev.price) * 1000) / 1000 : null;
        var pct = chg !== null ? Math.round(chg * 1000 / prev.price) / 10 : null;
        var o = {
          id: it.id, name: it.name, short: it.short, unit: it.unit, dec: it.dec, main: !!it.main,
          price: cur ? cur.price : null, dk: cur ? cur.dk : '', fresh: !!cur && cur.dk === t,
          prev: prev ? prev.price : null, prevDk: prev ? prev.dk : '', chg: chg, pct: pct, dir: chg === null ? '' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat'
        };
        if (full) o.series = pts.slice(0, 7).reverse();
        return o;
      });
      var res = { state: state, dk: t, lastDk: last ? last.dk : '', ageDays: age, ts: last ? last.ts : 0, note: last ? last.note : '', items: list, company: c.company };
      if (full) {
        res.disclaimer = c.disclaimer;
        res.history = priced.slice(0, c.historyDays).map(function (d) {
          var vals = {}; items.forEach(function (it) { var p = mkPrice(d.prices[it.id]); vals[it.id] = p || null; });
          return { dk: d.dk, vals: vals, note: d.note };
        });
      }
      return res;
    }
    function mkSafe() { try { return mkBuild(false); } catch (e) { onErr(e, 'market'); return null; } }
    function marketGet() { return mkBuild(true); }
    function parsePrice(raw) {
      var t = U.arabicDigitsToLatin(String(raw)).replace(/[\s ]/g, '').replace(/٫/g, '.').replace(/٬/g, ',');
      if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');     // فاصل آلاف
      else t = t.replace(/,/g, '.');                                           // فاصلة عشرية
      return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
    }
    function mkPricesOf(day, items) {
      var o = {}; if (!day) return o;
      items.forEach(function (it) { var p = mkPrice(day.prices[it.id]); if (p) o[it.id] = p; });
      return o;
    }
    /* ---- الناشرون والمعتمدون ---- */
    function isBackup(s) { return mkCfg().backup.some(function (x) { return x === s.id || x === s.phone; }); }
    function mkCanEdit(s) { return can(s, 'prices.publish'); }
    function staffName(id) { var r = store.find('Staff', function (x) { return x.id === id; }); return r ? r.name : ''; }
    function mkPublishers() {
      var c = mkCfg();
      return store.filter('Staff', function (x) { return Number(x.active) && can(x, 'prices.publish'); });
    }
    function mkApprovers(exceptId) {
      var c = mkCfg();
      return store.filter('Staff', function (x) { return Number(x.active) && can(x, 'prices.approve') && x.id !== exceptId; });
    }
    /* لا يعتمد الناشرُ طلبه بنفسه إلا بإعداد selfApprove أو لو لا يوجد معتمد آخر (حتى لا يتعطل النشر) */
    function mkCanSelfApprove(s) {
      var c = mkCfg();
      return can(s, 'prices.approve') && (c.selfApprove || mkApprovers(s.id).length === 0);
    }
    /* مدير الإدارة ينشر أسعاره مباشرة بلا اعتماد أي جهة (market.directRole) */
    function mkIsDirect(s) { return mkCanEdit(s) && s.role === mkCfg().directRole; }
    function mkCanDecide(s, pend) {
      if (!can(s, 'prices.approve')) return false;
      return s.id !== pend.by || mkCanSelfApprove(s);
    }
    function mkPendingRows() {
      var t = today(), y = U.addDays(t, -1);
      return store.filter('MarketPending', function (r) { return r.status === 'pending' && (r.dk === t || r.dk === y); }).sort(function (a, b) { return Number(b.ts) - Number(a.ts); });
    }
    function mkPendingPublic(r, s, items) {
      var pr = jparse(r.prices, {}), list = [];
      items.forEach(function (it) { var p = mkPrice(pr[it.id]); if (p) list.push({ id: it.id, short: it.short, unit: it.unit, dec: it.dec, price: p }); });
      return { id: r.id, dk: r.dk, by: r.by, byName: staffName(r.by), mine: r.by === s.id, ts: Number(r.ts), jumps: r.jumps ? String(r.jumps).split(' | ') : [], items: list, note: r.note, canDecide: mkCanDecide(s, r) };
    }
    function mkPendingFor(s) {
      return mkPendingRows().filter(function (r) { return mkCanDecide(s, r); }).length;
    }
    function s_marketGet(s) {
      var c = mkCfg(), d = mkBuild(true), days = mkDays(), items = mkItems(), t = today(), y = U.addDays(t, -1);
      function one(dk) { var day = days.filter(function (x) { return x.dk === dk; })[0] || null; return { dk: dk, prices: mkPricesOf(day, items), note: day ? day.note : '', ts: day ? day.ts : 0 }; }
      var canEdit = mkCanEdit(s), canApprove = can(s, 'prices.approve');
      d.canEdit = canEdit; d.editRole = ROLE_LABEL[c.editRole]; d.maxJumpPct = c.maxJumpPct; d.direct = mkIsDirect(s); d.directRole = ROLE_LABEL[c.directRole];
      d.approval = { mode: c.approval, role: ROLE_LABEL[c.approveRole] };
      d.edit = { today: one(t), yesterday: one(y) };
      d.pending = canEdit || canApprove ? mkPendingRows().map(function (r) { return mkPendingPublic(r, s, items); }) : [];
      d.pendingCount = d.pending.filter(function (x) { return x.canDecide; }).length;
      return d;
    }
    function mkWrite(dk, prices, note, by) {
      var existing = mkDays().filter(function (x) { return x.dk === dk; })[0] || null;
      var patch = { prices: JSON.stringify(prices), note: note, by: by, ts: now() };
      if (existing) store.update('MarketDay', existing.raw.dk, patch);
      else store.insert('MarketDay', { dk: dk, prices: patch.prices, note: note, by: by, ts: patch.ts });
      store.filter('MarketPending', function (r) { return r.status === 'pending' && r.dk === dk; }).forEach(function (r) {
        store.update('MarketPending', r.id, { status: 'replaced', decidedTs: now() });
      });
    }
    function s_marketSet(s, p) {
      var c = mkCfg();
      if (!mkCanEdit(s)) throw err('perm', 'ليس لديك صلاحية نشر الأسعار. يحدّدها مدير الإدارة من «الفريق والصلاحيات»');
      var items = mkItems(), days = mkDays(), t = today(), dk = p.day === 'yesterday' ? U.addDays(t, -1) : t;
      var vals = p.values || {}, prices = {}, n = 0, jumps = [];
      var existing = days.filter(function (x) { return x.dk === dk; })[0] || null, ex = existing ? existing.prices : {};
      items.forEach(function (it) {
        var raw = vals[it.id];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        var num = parsePrice(raw);
        if (!(num > 0) || num >= 1e7) throw err('price', 'سعر «' + it.short + '» غير صحيح. اكتب رقمًا أكبر من صفر.');
        num = Math.round(num * 1000) / 1000;
        prices[it.id] = num; n++;
        if (mkPrice(ex[it.id]) !== num) {
          var prev = 0;
          for (var i = 0; i < days.length; i++) { if (days[i].dk < dk && mkPrice(days[i].prices[it.id])) { prev = mkPrice(days[i].prices[it.id]); break; } }
          if (prev) { var pc = Math.round((num - prev) * 1000 / prev) / 10; if (Math.abs(pc) > c.maxJumpPct) jumps.push(it.short + ': ' + prev + ' ← ' + num + ' (' + (pc > 0 ? '+' : '') + pc + '%)'); }
        }
      });
      if (!n) throw err('empty', 'اكتب سعر منتج واحد على الأقل');
      var direct = mkIsDirect(s);
      var big = jumps.length > 0, needs = !direct && (c.approval === 'always' || (c.approval === 'jump' && big)), self = mkCanSelfApprove(s);
      if (big && !p.force && (direct || c.approval !== 'always')) {
        if (needs && !self) throw err('jump_ap', 'تغيّر كبير عن آخر سعر: ' + jumps.join('، ') + '. لو الأرقام صحيحة اضغط «أرسل للاعتماد»، وهيحتاج اعتماد «' + ROLE_LABEL[c.approveRole] + '» آخر قبل ما يظهر للتجار.');
        throw err('jump', 'تغيّر كبير عن آخر سعر: ' + jumps.join('، ') + '. لو الأرقام صحيحة اضغط «أكّد وانشر».');
      }
      Object.keys(ex).forEach(function (k) { if (!items.some(function (it) { return it.id === k; }) && mkPrice(ex[k])) prices[k] = ex[k]; });   // أسعار منتجات مخفية تبقى كما هي
      var note = p.note === undefined || p.note === null ? (existing ? existing.note : '') : U.cleanText(p.note, 200);
      if (needs && !self) {
        store.filter('MarketPending', function (r) { return r.status === 'pending' && r.dk === dk; }).forEach(function (r) { store.update('MarketPending', r.id, { status: 'replaced', decidedBy: s.id, decidedTs: now() }); });
        var pid = nextId('MP', 4);
        store.insert('MarketPending', { id: pid, dk: dk, prices: JSON.stringify(prices), note: note, by: s.id, ts: now(), jumps: jumps.join(' | '), status: 'pending', decidedBy: '', decidedTs: 0, reason: '' });
        log('', 'market_pending', dk, 0, { id: pid, by: s.id, j: jumps.length });
        notifyMail(mkApprovers(s.id), '[' + cfg().appName + '] أسعار «السوق النهاردة» تنتظر اعتمادك', 'اقترح ' + s.name + ' تحديث أسعار «السوق النهاردة»' + (big ? ' وفيها تغيّر كبير عن آخر سعر' : '') + '، وهي تنتظر اعتمادك قبل أن تظهر للتجار. افتح التطبيق ← تبويب «السوق» ← راجع الأسعار ثم اعتمد أو ارفض.');
        var res = s_marketGet(s); res.submitted = pid; return res;
      }
      mkWrite(dk, prices, note, s.id);
      log('', 'market', dk, 0, { n: n, by: s.id, direct: direct ? 1 : 0 });
      return s_marketGet(s);
    }
    /* اعتماد أو رفض الأسعار المعلّقة، أو سحبها من صاحبها */
    function s_marketDecide(s, p) {
      var r = store.find('MarketPending', function (x) { return x.id === String(p.id) && x.status === 'pending'; });
      if (!r) throw err('gone', 'الطلب غير موجود أو سبق البتّ فيه');
      var dec = String(p.decision);
      if (dec === 'cancel') {
        if (r.by !== s.id) throw err('perm', 'سحب الطلب لصاحبه فقط');
        store.update('MarketPending', r.id, { status: 'cancelled', decidedBy: s.id, decidedTs: now() });
        return s_marketGet(s);
      }
      if (dec !== 'approve' && dec !== 'reject') throw err('decision', 'قرار غير مفهوم');
      if (!mkCanDecide(s, r)) throw err('perm', 'ليس لديك صلاحية اعتماد الأسعار، أو أنت مقدّم الطلب نفسه');
      var t = today();
      if (r.dk !== t && r.dk !== U.addDays(t, -1)) { store.update('MarketPending', r.id, { status: 'expired', decidedBy: s.id, decidedTs: now() }); throw err('gone', 'انتهت صلاحية الطلب. اطلب من الناشر إرسال الأسعار من جديد.'); }
      var by = store.find('Staff', function (x) { return x.id === r.by; });
      if (dec === 'approve') {
        var pr = jparse(r.prices, {});
        mkWrite(r.dk, pr, r.note || '', r.by);
        store.update('MarketPending', r.id, { status: 'approved', decidedBy: s.id, decidedTs: now() });
        log('', 'market', r.dk, 0, { n: Object.keys(pr).length, by: r.by, ok: s.id });
      } else {
        store.update('MarketPending', r.id, { status: 'rejected', decidedBy: s.id, decidedTs: now(), reason: U.cleanText(p.reason, 120) });
        log('', 'market_reject', r.dk, 0, { id: r.id, by: s.id });
      }
      OPS.audit(s, dec === 'approve' ? 'market_approve' : 'market_reject', r.id, { dk: r.dk, by: r.by });
      if (by) notifyMail([by], '[' + cfg().appName + '] ' + (dec === 'approve' ? 'تم اعتماد أسعار «السوق النهاردة» ونُشرت' : 'رُفضت أسعار «السوق النهاردة» المقترحة'), (dec === 'approve' ? 'اعتمد ' + s.name + ' الأسعار التي أرسلتها، وهي الآن ظاهرة للتجار.' : 'رفض ' + s.name + ' الأسعار التي أرسلتها' + (p.reason ? ': ' + U.cleanText(p.reason, 120) : '') + '. راجعها وأرسلها من جديد.'));
      return s_marketGet(s);
    }

    /* =================== الموظفون =================== */
    function scopeTickets(s) {
      return store.filter('Tickets', function (t) {
        if (s.role === 'assistant') {
          if (t.type === 'complaint') return false;
          return !s.farmId || !t.farmId || t.farmId === s.farmId;
        }
        return true;
      });
    }
    function traderBrief(r) {
      var st = stateOf(r), rank = L.computeRank(st, cfg(), now(), today()), dk = today();
      return {
        id: r.id, code: r.code, name: r.name, plate: r.plate, company: r.company, farmId: r.farmId,
        rank: { n: rank, name: C.RANKS[rank].name }, cleanRun: st.gate.cleanRun, visitsToday: st.gate.perDay[dk] || 0,
        last: st.gate.last, status: r.status
      };
    }
    function s_find(s, p) {
      if (!can(s, 'gate')) throw err('perm', 'غير مصرح');
      var q = U.arabicDigitsToLatin(U.cleanText(p.q, 30)).toUpperCase();
      if (q.length < 2) return { list: [] };
      var qp = U.normPlate(q), digits = q.replace(/\D/g, '');
      var list = store.filter('Traders', function (r) {
        if (r.status === 'blocked' || r.status === 'deleted') return false;
        if (r.code === q) return true;
        if (qp.length >= 3 && r.plate && r.plate.indexOf(qp) >= 0) return true;
        if (digits.length >= 4 && r.phone && r.phone.slice(-digits.length) === digits) return true;
        return q.length >= 3 && r.name.toUpperCase().indexOf(q) >= 0;
      }).slice(0, 8).map(traderBrief);
      return { list: list };
    }
    function s_gate(s, p) {
      if (!can(s, 'gate')) throw err('perm', 'غير مصرح');
      var r = store.find('Traders', function (x) { return x.id === p.traderId; });
      if (!r) throw err('nf', 'التاجر غير موجود');
      var idem = p.clientId ? 'idem:' + String(p.clientId).replace(/[^A-Za-z0-9_-]/g, '').substring(0, 40) : '';
      if (idem && peek(idem)) return { trader: r.name, dup: true, pass: 0, total: 0, clean: false, violation: false, points: 0, weekBonus: 0, capped: false, rankBefore: '', rankAfter: '', ranked: false, cleanRun: 0 };
      var c = cfg(), t = now(), dk = today(), farm = U.cleanText(p.farmId, 8) || s.farmId || r.farmId || '';
      var recent = store.filter('Gate', function (g) { return g.traderId === r.id && g.farmId === farm && (t - Number(g.ts)) < 10 * 60000; });
      if (recent.length) throw err('dup', 'تم تسجيل زيارة لهذا التاجر قبل دقائق');
      var checks = {};
      C.GATE_ITEMS.forEach(function (it) { checks[it.id] = !!(p.checks && p.checks[it.id]); });
      var gs = L.gateScore(checks);
      var st = stateOf(r), before = L.computeRank(st, c, t, dk);
      var scored = st.gate.perDay[dk] || 0, pts = 0, capped = false;
      if (scored >= c.gateMaxScoredPerDay) capped = true;
      else pts = L.gatePoints(gs, c);
      st.gate.visits++;
      st.gate.perDay = (function (o) { var n = {}; n[dk] = (o[dk] || 0) + 1; return n; })(st.gate.perDay);
      st.gate.lastTs = t;
      st.gate.last = { ts: t, pass: gs.pass, clean: gs.clean, violation: gs.violation };
      if (gs.clean) { st.gate.clean++; st.gate.cleanRun++; }
      else if (gs.violation) L.applyViolation(st, t);
      else st.gate.cleanRun = 0;
      L.markActive(st, dk);
      st.pts += pts;
      var bonus = L.weekGoalBonus(st, dk, c);
      if (gs.clean) payInviteClean(r, st);
      var wait = U.clamp(U.toInt(p.waitMin, 0), 0, 600);
      var gid = nextId('G', 5);
      store.insert('Gate', { id: gid, ts: t, traderId: r.id, farmId: farm, staffId: s.id, checks: JSON.stringify(checks), pass: gs.pass, clean: gs.clean ? 1 : 0, violation: gs.violation ? 1 : 0, waitMin: wait, note: U.cleanText(p.note, 200), points: pts });
      log(r.id, 'gate', gid, pts + bonus, { pass: gs.pass, v: gs.violation ? 1 : 0 });
      if (idem) addCounter(idem, 1);
      var after = L.computeRank(st, c, t, dk);
      save(r, st);
      return { trader: r.name, pass: gs.pass, total: gs.total, clean: gs.clean, violation: gs.violation, points: pts, weekBonus: bonus, capped: capped, rankBefore: C.RANKS[before].name, rankAfter: C.RANKS[after].name, ranked: after > before, cleanRun: st.gate.cleanRun };
    }
    function ticketStaffView(tk, nm) {
      var tt = cfg().ticketTypes[tk.type] || {}, t = now();
      var lvl = L.ticketLevel(tk, t, cfg());
      var hours = Number(tk.firstReplyTs) ? (Number(tk.firstReplyTs) - Number(tk.ts)) / 3600000 : (t - Number(tk.ts)) / 3600000;
      var tr = nm[tk.traderId] || {};
      return {
        id: tk.id, type: tk.type, typeLabel: tt.label, subject: tk.subject, status: tk.status, level: lvl,
        ts: Number(tk.ts), lastTs: Number(tk.lastTs), unread: !!Number(tk.unreadStaff), farmId: tk.farmId,
        trader: tr.name || '—', plate: tr.plate || '', hours: Math.round(hours * 10) / 10,
        overdue: !Number(tk.firstReplyTs) && tt.sla && hours > tt.sla, stars: Number(tk.stars)
      };
    }
    function nameMap() {
      var m = {}; store.all('Traders').forEach(function (r) { m[r.id] = r; }); return m;
    }
    function s_inbox(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var nm = nameMap(), list = scopeTickets(s);
      var f = p && p.filter;
      if (f === 'open') list = list.filter(function (x) { return x.status === 'open'; });
      else if (f === 'done') list = list.filter(function (x) { return x.status !== 'open'; });
      var out = list.map(function (x) { return ticketStaffView(x, nm); });
      out.sort(function (a, b) {
        var oa = a.status === 'open' ? 0 : 1, ob = b.status === 'open' ? 0 : 1;
        if (oa !== ob) return oa - ob;
        if (b.level !== a.level) return b.level - a.level;
        return b.lastTs - a.lastTs;
      });
      return { tickets: out.slice(0, 80), unread: out.filter(function (x) { return x.unread; }).length };
    }
    function s_ticket(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var tk = scopeTickets(s).filter(function (x) { return x.id === p.id; })[0];
      if (!tk) throw err('nf', 'الرسالة غير موجودة أو خارج نطاقك');
      var nm = nameMap(), tr = nm[tk.traderId] || {};
      if (Number(tk.unreadStaff)) store.update('Tickets', tk.id, { unreadStaff: 0 });
      return {
        ticket: ticketStaffView(tk, nm), msgs: msgsOf(tk.id, false),
        trader: { name: tr.name, plate: tr.plate, company: tr.company, code: tr.code },
        canAccept: tk.type === 'suggestion' && !Number(tk.accepted) && can(s, 'suggest.accept')
      };
    }
    function s_reply(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var tk = scopeTickets(s).filter(function (x) { return x.id === p.id; })[0];
      if (!tk) throw err('nf', 'الرسالة غير موجودة أو خارج نطاقك');
      var text = U.cleanText(p.text, cfg().limits.bodyMax);
      if (text.length < 2) throw err('body', 'اكتب الرد');
      var t = now();
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: t, from: 'staff', staffId: s.id, text: text });
      var patch = { status: p.resolve ? 'resolved' : 'answered', lastTs: t, unreadTrader: 1, unreadStaff: 0, lastStaffId: s.id };
      if (!Number(tk.firstReplyTs)) patch.firstReplyTs = t;
      if (p.resolve) patch.resolvedTs = t;
      store.update('Tickets', tk.id, patch);
      log(tk.traderId, 'staff_reply', tk.id, 0, { by: s.id });
      return s_ticket(s, { id: tk.id });
    }
    function s_callback(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var tk = scopeTickets(s).filter(function (x) { return x.id === p.id; })[0];
      if (!tk) throw err('nf', 'الرسالة غير موجودة أو خارج نطاقك');
      var tr = store.find('Traders', function (r) { return r.id === tk.traderId; });
      var t = now();
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: t, from: 'staff', staffId: s.id, text: 'سيتصل بك ' + s.title + ' على رقمك المسجّل. لو الوقت مش مناسب رد علينا هنا.' });
      var patch = { lastTs: t, unreadTrader: 1, lastStaffId: s.id, status: tk.status === 'open' ? 'answered' : tk.status };
      if (!Number(tk.firstReplyTs)) patch.firstReplyTs = t;
      store.update('Tickets', tk.id, patch);
      log(tr.id, 'callback', tk.id, 0, { by: s.id });
      return { phone: tr.phone, name: tr.name };
    }
    function s_accept(s, p) {
      if (!can(s, 'suggest.accept')) throw err('perm', 'غير مصرح');
      var tk = store.find('Tickets', function (x) { return x.id === p.id; });
      if (!tk || tk.type !== 'suggestion') throw err('nf', 'اقتراح غير موجود');
      if (Number(tk.accepted)) throw err('done', 'تم قبوله قبل كده');
      var r = store.find('Traders', function (x) { return x.id === tk.traderId; }), st = stateOf(r), c = cfg();
      st.pts += c.points.suggestionAccepted; st.sugg++;
      save(r, st);
      store.update('Tickets', tk.id, { accepted: 1 });
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: now(), from: 'staff', staffId: s.id, text: 'تم قبول اقتراحك. شكرًا لك — أضفنا ' + c.points.suggestionAccepted + ' نقطة لرصيدك.' });
      store.update('Tickets', tk.id, { unreadTrader: 1, lastTs: now() });
      log(r.id, 'suggestion_accepted', tk.id, c.points.suggestionAccepted, { by: s.id });
      return s_ticket(s, { id: tk.id });
    }
    function s_farm(s, p) {
      if (!can(s, 'farms')) throw err('perm', 'غير مصرح');
      var f = store.find('Farms', function (x) { return x.id === p.farmId; });
      if (!f) throw err('nf', 'مزرعة غير موجودة');
      if (s.role === 'assistant' && s.farmId && s.farmId !== f.id) throw err('perm', 'تحديث مزرعتك فقط');
      if (!C.FARM_STATUS[p.status] || p.status === 'unknown') throw err('status', 'حالة غير صحيحة');
      store.update('Farms', f.id, { status: p.status, note: U.cleanText(p.note, 80), ts: now(), by: s.id });
      return { farms: farmsList() };
    }
    function s_register(s, p) {
      if (!can(s, 'gate')) throw err('perm', 'غير مصرح');
      var row = doRegister(p, s.id);
      return { trader: traderBrief(row), message: 'تم التسجيل. كود التاجر: ' + row.code };
    }
    function s_rewards(s) {
      if (!can(s, 'rewards')) throw err('perm', 'غير مصرح');
      var nm = nameMap();
      var list = store.all('Rewards').filter(function (r) { return r.status === 'requested' || r.status === 'approved'; }).map(function (r) {
        var rw = C.REWARDS.filter(function (x) { return x.id === r.rewardId; })[0], tr = nm[r.traderId] || {};
        return { id: r.id, ts: Number(r.ts), trader: tr.name, plate: tr.plate, reward: rw ? rw.title : r.rewardId, status: r.status };
      }).sort(function (a, b) { return b.ts - a.ts; });
      return { list: list };
    }
    function s_rewardDecide(s, p) {
      if (!can(s, 'rewards.approve')) throw err('perm', 'اعتماد الجوائز غير متاح لصلاحياتك');
      var r = store.find('Rewards', function (x) { return x.id === p.id; });
      if (!r) throw err('nf', 'طلب غير موجود');
      if (['approved', 'delivered', 'rejected'].indexOf(p.status) < 0) throw err('status', 'حالة غير صحيحة');
      store.update('Rewards', r.id, { status: p.status, decidedBy: s.id, decidedTs: now(), note: U.cleanText(p.note, 120) });
      OPS.audit(s, 'reward_' + p.status, r.id, { traderId: r.traderId });
      return s_rewards(s);
    }
    function s_traders(s, p) {
      if (!can(s, 'traders')) throw err('perm', 'غير مصرح');
      var q = U.cleanText(p && p.q, 30).toUpperCase();
      var list = liveTraders().filter(function (r) { return !q || r.name.toUpperCase().indexOf(q) >= 0 || r.code === q || (r.plate || '').indexOf(U.normPlate(q)) >= 0; });
      return { total: list.length, list: list.slice(0, 40).map(function (r) { var b = traderBrief(r); b.pts = stateOf(r).pts; return b; }) };
    }
    function s_block(s, p) {
      if (!can(s, 'traders.block')) throw err('perm', 'غير مصرح');
      var row = editableTrader(p);
      store.update('Traders', row.id, { status: p.on ? 'blocked' : 'active' });
      OPS.audit(s, p.on ? 'trader_block' : 'trader_unblock', row.id, {});
      return { ok: true };
    }

    /* ---------- تعديل بيانات التاجر وحذفه (صلاحيتا traders.edit و traders.delete) ---------- */
    function traderFull(r) {
      return { id: r.id, code: r.code, name: r.name, phone: r.phone, plate: r.plate || '', company: r.company || '', status: r.status || 'active' };
    }
    /* «الحذف» إيقاف مع حفظ السجل: الرسائل والنقاط والأسعار السابقة مرتبطة بالحساب */
    function editableTrader(p) {
      var row = store.find('Traders', function (x) { return x.id === String(p.id || ''); });
      if (!row || row.status === 'deleted') throw err('nf', 'التاجر غير موجود');
      return row;
    }
    function s_traderGet(s, p) {
      if (!can(s, 'traders.edit')) throw err('perm', 'تعديل بيانات التجار غير متاح لصلاحياتك');
      return { trader: traderFull(editableTrader(p)) };
    }
    function s_traderSave(s, p) {
      if (!can(s, 'traders.edit')) throw err('perm', 'تعديل بيانات التجار غير متاح لصلاحياتك');
      var row = editableTrader(p);
      var name = U.cleanText(p.name, 40), phone = U.normPhone(p.phone), plate = U.normPlate(p.plate || ''), company = U.cleanText(p.company, 60);
      if (name.length < 3) throw err('name', 'اكتب اسم التاجر بالكامل (3 حروف على الأقل)');
      if (!phone) throw err('phone', 'رقم الموبايل غير صحيح (مثال: 01001234567)');
      var taken = store.find('Traders', function (x) { return x.id !== row.id && x.phone === phone; }) || store.find('Staff', function (x) { return x.phone === phone; });
      if (taken) throw err('dup', 'الرقم ده مسجّل على حساب تاجر أو موظف آخر');
      var patch = { name: name, phone: phone, plate: plate, company: company };
      var pinRaw = String(p.pin || '');
      if (pinRaw) {
        var pin = U.normPin(pinRaw);
        if (!pin) throw err('pin', 'الرمز السري من 4 إلى 6 أرقام');
        var salt = env.randHex(8), st = stateOf(row);
        st.sessAt = now();   // الجلسات القديمة تنتهي، ويدخل التاجر بالرمز الجديد
        patch.salt = salt; patch.pinHash = U.hashPin(pin, salt, env.secret()); patch.fails = 0; patch.lockUntil = 0; patch.state = JSON.stringify(st);
      }
      store.update('Traders', row.id, patch);
      log('', 'trader_edit', row.id, 0, { by: s.id, pin: !!pinRaw });
      OPS.audit(s, 'trader_edit', row.id, { pin: !!pinRaw, fields: Object.keys(patch).filter(function (k) { return ['pinHash', 'salt', 'state', 'fails', 'lockUntil'].indexOf(k) < 0; }).join(',') });
      return { ok: true, trader: traderFull(store.find('Traders', function (x) { return x.id === row.id; })) };
    }
    function s_traderDelete(s, p) {
      if (!can(s, 'traders.delete')) throw err('perm', 'حذف التجار غير متاح لصلاحياتك');
      var row = editableTrader(p);
      store.update('Traders', row.id, { status: 'deleted' });
      log('', 'trader_delete', row.id, 0, { by: s.id });
      OPS.audit(s, 'trader_delete', row.id, {});
      return { ok: true };
    }

    /* ---------- إعادة التهيئة من البداية (مدير الإدارة فقط) ---------- */
    function s_resetPreview(s) {
      needManager(s);
      var clear = {};
      RESET_CLEAR.forEach(function (t) { clear[t] = store.count(t); });
      var keep = {};
      RESET_KEEP.forEach(function (t) { keep[t] = store.count(t); });
      return {
        phrase: RESET_PHRASE, clear: clear, keep: keep,
        staffKept: 1, staffRemoved: Math.max(0, store.count('Staff') - 1),
        backupsNow: store.snapshotLabels('R').length, keepBackups: RESET_KEEP_BACKUPS,
        keeper: { name: s.name, phone: s.phone }
      };
    }
    function s_factoryReset(s, p) {
      needManager(s);
      if (String(p.phrase || '').trim() !== RESET_PHRASE) throw err('phrase', 'اكتب العبارة بالضبط: ' + RESET_PHRASE);
      checkPin(s, String(p.pin || ''), 'Staff');
      var stamp = 'R' + new Date(now()).toISOString().replace(/\D/g, '').slice(0, 12);   // R + yyyymmddhhmm (UTC)
      var names = RESET_CLEAR.concat(['Staff'], RESET_KEEP).filter(function (t) { return store.count(t) > 0; });
      store.snapshot(stamp, names);
      store.pruneSnapshots(RESET_KEEP_BACKUPS, 'R');
      RESET_CLEAR.forEach(function (t) { store.replaceTable(t, []); });
      var me = store.find('Staff', function (r) { return r.id === s.id; });
      store.replaceTable('Staff', me ? [me] : []);
      log('', 'factory_reset', stamp, 0, { by: s.id });
      OPS.audit(s, 'factory_reset', stamp, { staffKept: 1 });
      return { ok: true, backup: stamp, staffKept: 1 };
    }

    /* ---------- مؤشرات لوحة الإدارة ---------- */
    function s_stats(s) {
      if (!can(s, 'dash')) throw err('perm', 'لوحة المؤشرات غير متاحة لصلاحياتك');
      return OPS.memo('stats', 60, function () { var v = statsBuild(); v.asOf = now(); return v; });
    }
    function statsBuild() {
      var c = cfg(), t = now(), dk = today(), d7 = U.addDays(dk, -6), d30 = t - 30 * 86400000;
      var traders = liveTraders(), states = traders.map(function (r) { return { r: r, st: stateOf(r) }; });
      var total = traders.length, active2 = 0, onboard = 0, amb = [0, 0, 0, 0];
      var base = [], fol = [];
      states.forEach(function (x) {
        var n7 = x.st.days.filter(function (d) { return d >= d7; }).length;
        if (n7 >= 2) active2++;
        if (L.onboardingDone(x.st)) onboard++;
        var rk = L.computeRank(x.st, c, t, dk);
        if (rk >= 3) amb[Math.min(3, rk - 3)]++;
        if (x.st.baseline && x.st.followup) { base.push(x.st.baseline.score / x.st.baseline.total); fol.push(x.st.followup.score / x.st.followup.total); }
      });
      var gates = store.filter('Gate', function (g) { return Number(g.ts) >= d30; });
      var cleanN = gates.filter(function (g) { return Number(g.clean); }).length, violN = gates.filter(function (g) { return Number(g.violation); }).length;
      var waits = gates.map(function (g) { return Number(g.waitMin); }).filter(function (x) { return x > 0; });
      var tks = store.all('Tickets'), answered = tks.filter(function (x) { return Number(x.firstReplyTs); });
      var resp = answered.map(function (x) { return (Number(x.firstReplyTs) - Number(x.ts)) / 3600000; });
      var slaOk = answered.filter(function (x) { return L.slaMet(x, c); }).length;
      var byType = {};
      tks.forEach(function (x) { byType[x.type] = (byType[x.type] || 0) + 1; });
      var openN = tks.filter(function (x) { return x.status === 'open'; }), esc = openN.filter(function (x) { return L.ticketLevel(x, t, c) > 0; });
      var recentObs = tks.filter(function (x) { return x.type === 'obstacle' || x.type === 'suggestion'; }).sort(function (a, b) { return Number(b.ts) - Number(a.ts); }).slice(0, 6).map(function (x) { return { id: x.id, type: c.ticketTypes[x.type].label, subject: x.subject }; });
      function avg(a) { return a.length ? a.reduce(function (p, q) { return p + q; }, 0) / a.length : null; }
      var pendingRewards = store.filter('Rewards', function (r) { return r.status === 'requested'; }).length;
      return {
        traders: total, onboarded: onboard, active2: active2, activePct: total ? Math.round(active2 * 100 / total) : 0,
        gate: { visits: gates.length, cleanPct: gates.length ? Math.round(cleanN * 100 / gates.length) : null, violPer100: gates.length ? Math.round(violN * 1000 / gates.length) / 10 : null, avgWait: waits.length ? Math.round(avg(waits)) : null },
        quiz: { pairs: base.length, baseline: base.length ? Math.round(avg(base) * 100) : null, followup: fol.length ? Math.round(avg(fol) * 100) : null },
        tickets: { total: tks.length, open: openN.length, escalated: esc.length, avgHours: avg(resp) === null ? null : Math.round(avg(resp) * 10) / 10, slaPct: answered.length ? Math.round(slaOk * 100 / answered.length) : null, byType: Object.keys(byType).map(function (k) { return { type: c.ticketTypes[k] ? c.ticketTypes[k].label : k, n: byType[k] }; }), recent: recentObs },
        ambassadors: { r3: amb[0], r4: amb[1], r5: amb[2], r6: amb[3] },
        pendingRewards: pendingRewards, collective: collective()
      };
    }

    /* =================== محطات التقدير: أحدث محطة لم يُحتفَ بها بعد =================== */
    var GW_STEPS = [1, 4, 12, 26, 52], CLEAN_STEPS = [5, 10, 25, 50], SINCE_STEPS = [1, 3, 6, 12, 24];
    function periodTxt(m) { return m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m < 11 ? m + ' شهور' : m === 12 ? 'سنة' : m === 24 ? 'سنتين' : m + ' شهر'; }
    function topStep(steps, v) { var r = 0; steps.forEach(function (x) { if (v >= x) r = x; }); return r; }
    function milestoneOf(row, st, pr) {
      var m = cfg().milestones || {}, d = C.CONFIG.milestones;
      if (m.on === false || m.on === 'false' || m.on === 0) return null;
      var seen = st.ms || {};
      function T(k) { var v = m[k]; return U.cleanText(v == null || v === '' ? d[k] : v, 240); }
      var cands = [], n;
      if (pr.rank.n >= 2) cands.push({ id: 'rank:' + pr.rank.n, kind: 'rank', n: pr.rank.n, title: 'رتبة جديدة', text: T('rank').replace(/\{rank\}/g, pr.rank.name), what: 'بلوغ رتبة «' + pr.rank.name + '»' });
      n = topStep(GW_STEPS, pr.week.goalWeeks || 0);
      if (n) cands.push({ id: 'gw:' + n, kind: 'gw', n: n, title: n === 1 ? 'أول هدف أسبوعي' : 'هدف الأسبوع', text: T(n === 1 ? 'gw1' : 'gw').replace(/\{n\}/g, n), what: n === 1 ? 'تحقيق أول هدف أسبوعي' : 'تحقيق هدف الأسبوع ' + n + ' مرة' });
      n = topStep(CLEAN_STEPS, pr.gate.clean || 0);
      if (n) cands.push({ id: 'clean:' + n, kind: 'clean', n: n, title: 'زيارات نظيفة', text: T('clean').replace(/\{n\}/g, n), what: n + ' زيارات نظيفة عند البوابة' });
      n = topStep(SINCE_STEPS, U.monthsBetween(Number(row.created) || now(), now()));
      if (n) cands.push({ id: 'since:' + n, kind: 'since', n: n, title: 'شريك معانا', text: T('since').replace(/\{period\}/g, periodTxt(n)), what: 'الشراكة مع الشركة لمدة ' + periodTxt(n) });
      for (var i = 0; i < cands.length; i++) if (!seen[cands[i].id]) return cands[i];
      return null;
    }
    function ackMilestone(row, p) {
      var id = String(p.id || '');
      if (!/^(rank|gw|clean|since):\d{1,3}$/.test(id)) throw err('ms', 'محطة غير معروفة');
      var st = stateOf(row); if (!st.ms) st.ms = {};
      if (!st.ms[id]) {
        st.ms[id] = now(); log(row.id, 'milestone', id, 0, null);
        var keys = Object.keys(st.ms); if (keys.length > 60) { keys.sort(function (a, b) { return st.ms[a] - st.ms[b]; }); for (var i = 0; i < keys.length - 60; i++) delete st.ms[keys[i]]; }
        save(row, st);
      }
      return { ok: 1 };
    }
    /* إعدادات الميزات الظاهرة للواجهة: بطاقة الشاشة الرئيسية، الشهادة، الصوت */
    function featCfg() {
      var c = cfg(), h = c.homescreen || {}, ce = c.certificate || {}, v = c.voice || {}, dc = C.CONFIG.certificate;
      function on(x) { return !(x === false || x === 'false' || x === 0); }
      function t(k, n) { var x = ce[k]; return U.cleanText(x == null || x === '' ? dc[k] : x, n); }
      return {
        homescreen: { on: on(h.on), snoozeDays: Math.max(1, Math.min(90, Math.round(Number(h.snoozeDays) || C.CONFIG.homescreen.snoozeDays))) },
        voice: { on: on(v.on), respell: U.cleanText(v.respell == null ? '' : String(v.respell), 4000), baseUrl: /^https:\/\//.test(String(v.baseUrl || '')) ? String(v.baseUrl).slice(0, 300) : '' },
        cert: { on: on(ce.on), title: t('title', 40), issuer: t('issuer', 80), body: t('body', 160), signer: U.cleanText(ce.signer == null ? '' : ce.signer, 60), signerTitle: U.cleanText(ce.signerTitle == null ? '' : ce.signerTitle, 60) }
      };
    }

    /* =================== التقرير الأسبوعي للإدارة =================== */
    function repCfg() {
      var r = cfg().report || {}, d = C.CONFIG.report;
      function n(v, def, lo, hi) { v = Number(v); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); }
      return {
        on: !(r.on === false || r.on === 'false' || r.on === 0),
        day: Math.round(n(r.day, d.day, 0, 6)), hour: Math.round(n(r.hour, d.hour, 0, 23)),
        minRole: STAFF_ROLES[r.minRole] ? r.minRole : d.minRole,
        extra: String(r.extraEmails == null ? '' : r.extraEmails).split(/[,،;\s]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); })
      };
    }
    function dowOf(dk) { var a = dk.split('-'); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay(); }
    function repMetrics(f, tt, traders, states, ev) {
      var c = cfg();
      function inR(ts) { var dk = U.dateKey(Number(ts)); return dk >= f && dk <= tt; }
      function evSet(type) { var o = {}, k = 0; ev.forEach(function (e) { if (e.type === type && e.traderId && inR(e.ts)) { o[e.traderId] = 1; k++; } }); return { u: Object.keys(o).length, n: k }; }
      function evN(type) { var k = 0; ev.forEach(function (e) { if (e.type === type && inR(e.ts)) k++; }); return k; }
      var goal = Number(c.weekGoalDays) || 4, met = 0;
      states.forEach(function (x) { if (x.st.days.filter(function (d) { return d >= f && d <= tt; }).length >= goal) met++; });
      var gates = store.filter('Gate', function (g) { return inR(g.ts); });
      var clean = gates.filter(function (g) { return Number(g.clean); }).length, viol = gates.filter(function (g) { return Number(g.violation); }).length;
      var tks = store.filter('Tickets', function (x) { return inR(x.ts); }), ans = tks.filter(function (x) { return Number(x.firstReplyTs); });
      var hrs = ans.map(function (x) { return (Number(x.firstReplyTs) - Number(x.ts)) / 3600000; });
      var items = mkItems(), mdays = mkDays().filter(function (d) { return d.dk >= f && d.dk <= tt && items.some(function (it) { return mkPrice(d.prices[it.id]); }); });
      var hh = mdays.filter(function (d) { return d.ts; }).map(function (d) { var p = U.tzParts(d.ts); return p.h + p.mi / 60; });
      var op = evSet('open'), pv = evSet('pview'), rd = evSet('round');
      return {
        newTraders: traders.filter(function (r) { return inR(r.created); }).length,
        openU: op.u, openN: op.n, pviewU: pv.u, goalMet: met, rounds: rd.n, milestones: evN('milestone'),
        gate: gates.length, gateClean: gates.length ? Math.round(clean * 100 / gates.length) : null, gateViol: viol,
        tickets: tks.length, replyH: hrs.length ? Math.round(hrs.reduce(function (a, b) { return a + b; }, 0) / hrs.length * 10) / 10 : null,
        slaPct: ans.length ? Math.round(ans.filter(function (x) { return L.slaMet(x, c); }).length * 100 / ans.length) : null,
        mkDays: mdays.length, mkHour: hh.length ? Math.round(hh.reduce(function (a, b) { return a + b; }, 0) / hh.length * 10) / 10 : null,
        mkPend: evN('market_pending'), mkRej: evN('market_reject'),
        rewards: store.filter('Rewards', function (r) { return inR(r.ts); }).length,
        fl: OPS.fleetWindow(f, tt)
      };
    }
    function repBuild() {
      var c = cfg(), t = now(), td = today(), to = U.addDays(td, -1), from = U.addDays(td, -7), pto = U.addDays(td, -8), pfrom = U.addDays(td, -14);
      var traders = liveTraders().filter(function (r) { return r.status !== 'blocked'; });
      var states = traders.map(function (r) { return { r: r, st: stateOf(r) }; }), ev = store.all('Events');
      var cur = repMetrics(from, to, traders, states, ev), prv = repMetrics(pfrom, pto, traders, states, ev);
      var amb = 0; states.forEach(function (x) { if (L.computeRank(x.st, c, t, td) >= 3) amb++; });
      var openTk = store.filter('Tickets', function (x) { return x.status === 'open'; });
      var esc2 = openTk.filter(function (x) { return L.ticketLevel(x, t, c) > 0; }).length;
      var R = { from: from, to: to, total: traders.length, amb: amb, cur: cur, prv: prv, openTickets: openTk.length, escalated: esc2, noOpenData: !cur.openN && !prv.openN };
      /* ملاحظات تلقائية للمدير */
      var ins = [];
      function add(tone, tx) { if (ins.length < 5) ins.push({ tone: tone, text: tx }); }
      if (cur.mkDays < 5) add('warn', 'أسعار «السوق النهاردة» نُشرت في ' + cur.mkDays + ' أيام فقط من 7. التجار يفتحون التطبيق للسعر، فانتظام النشر يحافظ على عودتهم.');
      else add('good', 'أسعار «السوق النهاردة» نُشرت في ' + cur.mkDays + ' أيام من 7' + (cur.mkHour !== null ? ' (متوسط وقت النشر ' + hourTxt(cur.mkHour) + ').' : '.'));
      if (cur.gate && prv.gate && cur.gateClean !== null && prv.gateClean !== null && cur.gateClean - prv.gateClean <= -10) add('warn', 'نسبة الزيارات النظيفة عند البوابة انخفضت من ' + prv.gateClean + '% إلى ' + cur.gateClean + '%. تستحق مراجعة مع معاوني البوابات.');
      else if (cur.gate && prv.gate && cur.gateClean !== null && prv.gateClean !== null && cur.gateClean - prv.gateClean >= 10) add('good', 'نسبة الزيارات النظيفة عند البوابة ارتفعت من ' + prv.gateClean + '% إلى ' + cur.gateClean + '%.');
      if (cur.gateViol > 0) add('warn', 'سُجّلت ' + cur.gateViol + ' مخالفة عند البوابات هذا الأسبوع.');
      if (esc2 > 0) add('warn', esc2 + ' رسالة من التجار متأخرة ولم يُرد عليها بعد (مصعّدة).');
      if (cur.slaPct !== null && cur.slaPct < 80) add('warn', 'الالتزام بمهلة الرد على التجار ' + cur.slaPct + '% (المستهدف 80% أو أكثر).');
      if (!R.noOpenData && prv.openU && cur.openU > prv.openU) add('good', 'عدد التجار الذين فتحوا التطبيق ارتفع من ' + prv.openU + ' إلى ' + cur.openU + '.');
      if (!R.noOpenData && prv.openU && cur.openU < prv.openU) add('warn', 'عدد التجار الذين فتحوا التطبيق انخفض من ' + prv.openU + ' إلى ' + cur.openU + '.');
      if (cur.fl.sos) add('warn', 'سُجّلت ' + cur.fl.sos + ' تنبيهات طوارئ للأسطول هذا الأسبوع. راجعها من «الأسطول» وتأكد من غلقها.');
      if (cur.fl.off > prv.fl.off && cur.fl.off - prv.fl.off >= 3) add('warn', 'تنبيهات الخروج عن الخط زادت من ' + prv.fl.off + ' إلى ' + cur.fl.off + ' هذا الأسبوع. راجع الخطوط المتكررة في تحليلات الأسطول.');
      if (cur.mkPend) add('good', 'مرّت ' + cur.mkPend + ' طلبات اعتماد ثانٍ على أسعار بها تغيّر كبير' + (cur.mkRej ? '، رُفض منها ' + cur.mkRej : '') + '.');
      R.insights = ins;
      return R;
    }
    function hourTxt(h) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh++; mm = 0; } return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }
    function xe(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function dkAr(dk) { var a = dk.split('-'); var M = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']; return Number(a[2]) + ' ' + M[Number(a[1])]; }
    /* صفوف التقرير: [القسم، العنوان، الحالي، السابق، وحدة، الأفضل: up|down|none] */
    function repRows(R) {
      var a = R.cur, b = R.prv, nod = R.noOpenData;
      return [
        ['التجار', 'تجار مسجّلون (إجمالي)', R.total, null, '', 'none'],
        ['التجار', 'تجار جدد هذا الأسبوع', a.newTraders, b.newTraders, '', 'up'],
        ['التجار', 'تجار فتحوا التطبيق (مختلفون)', nod ? null : a.openU, nod ? null : b.openU, '', 'up'],
        ['التجار', 'متوسط الفتح اليومي', nod ? null : Math.round(a.openN / 7 * 10) / 10, nod ? null : Math.round(b.openN / 7 * 10) / 10, '', 'up'],
        ['التجار', 'شاهدوا أسعار اليوم (مختلفون)', nod ? null : a.pviewU, nod ? null : b.pviewU, '', 'up'],
        ['التجار', 'حققوا هدف الأسبوع', a.goalMet, b.goalMet, '', 'up'],
        ['التجار', 'جولات اليوم المكتملة', a.rounds, b.rounds, '', 'up'],
        ['التجار', 'تجار بلغوا رتبة سفير فأعلى (إجمالي)', R.amb, null, '', 'none'],
        ['التجار', 'محطات احتُفي بها', a.milestones, b.milestones, '', 'up'],
        ['البوابة', 'زيارات مسجّلة', a.gate, b.gate, '', 'none'],
        ['البوابة', 'نسبة الزيارات النظيفة', a.gateClean, b.gateClean, '%', 'up'],
        ['البوابة', 'مخالفات موثّقة', a.gateViol, b.gateViol, '', 'down'],
        ['الرسائل', 'رسائل جديدة من التجار', a.tickets, b.tickets, '', 'none'],
        ['الرسائل', 'متوسط زمن أول رد', a.replyH, b.replyH, ' س', 'down'],
        ['الرسائل', 'الالتزام بمهلة الرد', a.slaPct, b.slaPct, '%', 'up'],
        ['الرسائل', 'مفتوحة الآن', R.openTickets, null, '', 'none'],
        ['الرسائل', 'مصعّدة ولم يُرد عليها', R.escalated, null, '', 'down'],
        ['السوق', 'أيام نشر الأسعار (من 7)', a.mkDays, b.mkDays, '', 'up'],
        ['السوق', 'طلبات اعتماد ثانٍ (قفزات كبيرة)', a.mkPend, b.mkPend, '', 'none'],
        ['الجوائز', 'طلبات جوائز جديدة', a.rewards, b.rewards, '', 'none'],
        ['الأسطول', 'رحلات بدأت', a.fl.trips, b.fl.trips, '', 'up'],
        ['الأسطول', 'متوسط زمن الرحلة', a.fl.avgMin, b.fl.avgMin, ' د', 'none'],
        ['الأسطول', 'تنبيهات خروج عن الخط', a.fl.off, b.fl.off, '', 'down'],
        ['الأسطول', 'تنبيهات طوارئ', a.fl.sos, b.fl.sos, '', 'down']
      ];
    }
    function fmtV(v, u) { return v === null || v === undefined ? '—' : v + u; }
    function repText(R) {
      var out = ['التقرير الأسبوعي — شريك الدفاع', 'من ' + dkAr(R.from) + ' إلى ' + dkAr(R.to), ''];
      var sec = '';
      repRows(R).forEach(function (r) {
        if (r[0] !== sec) { sec = r[0]; out.push('[' + sec + ']'); }
        out.push('- ' + r[1] + ': ' + fmtV(r[2], r[4]) + (r[3] !== null && r[3] !== undefined ? '  (الأسبوع السابق: ' + fmtV(r[3], r[4]) + ')' : ''));
      });
      if (R.insights.length) { out.push('', 'ملاحظات:'); R.insights.forEach(function (i) { out.push('- ' + i.text); }); }
      if (R.noOpenData) out.push('', 'ملاحظة: قياس فتح التطبيق وأسعار اليوم يبدأ من أول فتح بعد ترقية الإصدار 1.3.');
      out.push('', 'هذا التقرير مجمّع ولا يتضمن أسماء تجار ولا نصوص رسائل.');
      return out.join('\n');
    }
    function repHtml(R) {
      var C1 = '#EA2329', rows = repRows(R), sec = '', body = '';
      rows.forEach(function (r) {
        if (r[0] !== sec) { sec = r[0]; body += '<tr><td colspan="4" style="background:#242424;color:#fff;font-weight:bold;padding:8px 12px;font-size:14px">' + xe(sec) + '</td></tr>'; }
        var d = '', col = '#6D6E71';
        if (r[2] !== null && r[3] !== null && r[3] !== undefined && r[2] !== r[3]) {
          var up = r[2] > r[3], good = r[5] === 'none' ? null : (r[5] === 'up' ? up : !up);
          col = good === null ? '#6D6E71' : good ? '#1E8E4E' : '#C0392B';
          d = '<span style="color:' + col + ';font-weight:bold">' + (up ? '▲' : '▼') + ' ' + Math.abs(Math.round((r[2] - r[3]) * 10) / 10) + r[4] + '</span>';
        } else if (r[3] !== null && r[3] !== undefined) d = '<span style="color:#6D6E71">—</span>';
        body += '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px">' + xe(r[1]) + '</td><td style="padding:8px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;font-size:15px">' + xe(fmtV(r[2], r[4])) + '</td><td style="padding:8px 8px;border-bottom:1px solid #eee;text-align:center;color:#6D6E71;font-size:13px">' + (r[3] === null || r[3] === undefined ? '' : xe(fmtV(r[3], r[4]))) + '</td><td style="padding:8px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px">' + d + '</td></tr>';
      });
      var ins = R.insights.map(function (i) { return '<div style="padding:8px 12px;margin:6px 0;border-radius:8px;background:' + (i.tone === 'warn' ? '#FDF1D8' : '#E5F5EC') + ';font-size:14px;line-height:1.7">' + (i.tone === 'warn' ? '⚠ ' : '✓ ') + xe(i.text) + '</div>'; }).join('');
      return '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:640px;margin:auto;color:#242424;text-align:right">' +
        '<div style="background:' + C1 + ';color:#fff;padding:18px 20px;border-radius:12px 12px 0 0"><div style="font-size:13px;opacity:.9">كايرو ثري ايه · إدارة الأمن الحيوي</div><div style="font-size:21px;font-weight:bold;margin-top:2px">التقرير الأسبوعي — شريك الدفاع</div><div style="font-size:13px;margin-top:4px">من ' + xe(dkAr(R.from)) + ' إلى ' + xe(dkAr(R.to)) + '</div></div>' +
        '<div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:14px 12px">' +
        (ins ? '<div style="margin-bottom:10px"><div style="font-weight:bold;font-size:15px;margin:2px 4px 4px">أبرز ما يستحق الانتباه</div>' + ins + '</div>' : '') +
        '<table dir="rtl" style="width:100%;border-collapse:collapse;margin-top:6px"><tr style="background:#f4f4f5;font-size:12px;color:#6D6E71"><td style="padding:6px 12px">المؤشر</td><td style="text-align:center">هذا الأسبوع</td><td style="text-align:center">السابق</td><td style="text-align:center">التغيّر</td></tr>' + body + '</table>' +
        (R.noOpenData ? '<div style="font-size:12px;color:#6D6E71;margin-top:10px">قياس فتح التطبيق ومشاهدة أسعار اليوم يبدأ من أول فتح بعد ترقية الإصدار 1.3، لذلك تظهر «—» في الأسبوع الأول.</div>' : '') +
        '<div style="font-size:12px;color:#6D6E71;margin-top:12px">تقرير مجمّع لا يتضمن أسماء تجار ولا نصوص رسائلهم. تُضبط الأيام والمستلمون من ورقة Config (report.*).</div></div></div>';
    }
    function repSend(emails, R) {
      if (!emails.length) return 0;
      var subject = '[' + cfg().appName + '] التقرير الأسبوعي — ' + dkAr(R.from) + ' إلى ' + dkAr(R.to), ok = 0;
      try { ok = env.notify(emails, subject, repText(R), repHtml(R)) ? 1 : 0; } catch (e) { ok = 0; }
      store.insert('Notifications', { ts: now(), to: 'report:' + emails.length, channel: 'email', subject: subject, ok: ok });
      return ok;
    }
    function repRecipients() {
      var c = repCfg(), em = [];
      store.filter('Staff', function (x) { return Number(x.active) && can(x, 'report') && x.email; }).forEach(function (x) { if (em.indexOf(x.email) < 0) em.push(x.email); });
      c.extra.forEach(function (x) { if (em.indexOf(x) < 0) em.push(x); });
      return em;
    }
    /* من المؤقت: مرة واحدة يوم التقرير بعد الساعة المحددة */
    function reportTick() {
      var c = repCfg(), dk = today();
      if (!c.on || dowOf(dk) !== c.day || U.tzParts(now()).h < c.hour || peek('rep:' + dk)) return 0;
      addCounter('rep:' + dk, 1);
      var ok = repSend(repRecipients(), repBuild());
      log('', 'report', dk, 0, { ok: ok });
      return ok ? 1 : 0;
    }
    function s_report(s, p) {
      if (!can(s, 'report')) throw err('perm', 'التقرير الأسبوعي غير متاح لصلاحياتك');
      var R = repBuild(), out = { html: repHtml(R), text: repText(R), from: R.from, to: R.to, auto: repCfg(), recipients: repRecipients().length };
      if (p && p.send) {
        if (!s.email) throw err('email', 'لا يوجد بريد مسجّل لحسابك في ورقة Staff');
        out.sent = repSend([s.email], R) ? 1 : 0;
      }
      return out;
    }

    /* ---------- تصعيد دوري (يُستدعى بمؤقت كل 15 دقيقة) ---------- */
    function tick() {
      var c = cfg(), t = now(), n = 0;
      store.filter('Tickets', function (x) { return x.status === 'open' && !Number(x.firstReplyTs); }).forEach(function (tk) {
        var lvl = L.ticketLevel(tk, t, c);
        if (lvl > Number(tk.level)) {
          store.update('Tickets', tk.id, { level: lvl });
          var roles = lvl === 1 ? ['supervisor'] : ['manager', 'admin'];
          var why = lvl === 1 ? 'رسالة متأخرة تحتاج رد' : 'رسالة متأخرة جدًا (تصعيد للمدير)';
          notifyStaffList(roleStaff(roles, tk.farmId), tk, why);
          log('', 'escalate', tk.id, 0, { lvl: lvl });
          n++;
        }
      });
      var mr = marketRemind();
      var rp = 0; try { rp = reportTick(); } catch (e) { onErr(e, 'report'); }
      var ox = {}; try { ox = OPS.tick(today(), U.tzParts(t).h); } catch (e2) { onErr(e2, 'ops'); }
      return { escalated: n, marketRemind: mr, report: rp, ops: ox };
    }
    /* تذكيرات السوق: (1) أول تذكير للناشرين والبدلاء بعد ساعة التذكير، (2) تصعيد للمديرين بعد ساعة التصعيد،
       (3) تذكير المعتمدين بطلب معلّق مرّت عليه مدة. كل واحد مرة واحدة فقط. تُرجع عدد الرسائل المرسلة */
    function marketRemind() {
      var c = mkCfg(), t = now(), dk = today(), h = U.tzParts(t).h, sent = 0;
      if (!c.remind) return 0;
      var items = mkItems(), day = mkDays().filter(function (x) { return x.dk === dk; })[0];
      var published = !!(day && items.some(function (it) { return mkPrice(day.prices[it.id]); }));
      var pends = mkPendingRows();
      pends.forEach(function (r) {
        if (t - Number(r.ts) < c.approveRemindMin * 60000 || peek('mkp:' + r.id)) return;
        addCounter('mkp:' + r.id, 1);
        notifyMail(mkApprovers(r.by), '[' + cfg().appName + '] أسعار «السوق النهاردة» ما زالت تنتظر الاعتماد', 'اقترح ' + staffName(r.by) + ' أسعارًا جديدة ولم يُبتّ فيها بعد، والتجار يرون السعر السابق حتى تُعتمد. افتح التطبيق ← «السوق» ← اعتمد أو ارفض.');
        log('', 'market_remind', r.id, 0, { k: 'pending' });
        sent++;
      });
      if (published) return sent;
      var hasPend = pends.some(function (r) { return r.dk === dk; });
      if (h >= c.remindHour && !peek('mkt:' + dk)) {
        addCounter('mkt:' + dk, 1);
        if (hasPend) notifyMail(mkApprovers(''), '[' + cfg().appName + '] أسعار اليوم مقترحة وتنتظر الاعتماد', 'أُرسلت أسعار «السوق النهاردة» لليوم ولم تُعتمد بعد، فلا يراها التجار. افتح التطبيق ← «السوق» ← اعتمد.');
        else notifyMail(mkPublishers(), '[' + cfg().appName + '] لم تُنشر أسعار «السوق النهاردة» حتى الآن', 'لم يتم نشر أسعار منتجات الشركة لليوم بعد. افتح التطبيق ← تبويب «السوق» ← اكتب الأسعار واضغط «انشر». التجار بيشوفوها أول ما يفتحوا التطبيق.');
        log('', 'market_remind', dk, 0, null);
        sent++;
      }
      if (c.escalate && h >= Math.max(c.escalateHour, c.remindHour + 1) && !peek('mkt2:' + dk)) {
        addCounter('mkt2:' + dk, 1);
        var boss = store.filter('Staff', function (x) { return Number(x.active) && (STAFF_ROLES[x.role] >= STAFF_ROLES.manager || mkCfg().backup.some(function (b) { return b === x.id || b === x.phone; })); });
        notifyMail(boss, '[' + cfg().appName + '] تصعيد: أسعار «السوق النهاردة» لم تُنشر حتى الآن', 'مضت الساعة ' + c.escalateHour + ' ولم تظهر أسعار اليوم للتجار' + (hasPend ? ' (توجد أسعار مقترحة لم تُعتمد)' : '') + '. افتح التطبيق ← «السوق» لنشرها أو اعتمادها، أو كلّف الناشر البديل.');
        log('', 'market_escalate', dk, 0, null);
        sent++;
      }
      return sent;
    }

    /* =================== الصلاحيات وفريق العمل =================== */
    /* عمود perms في Staff: فارغ = صلاحيات دور الموظف الافتراضية (تتبع إعدادات الدور)، و«c:» + المفاتيح = مخصّصة (وتبقى «c:» وحدها لو لم تُمنح شيئًا) */
    function defaultPerms(role) {
      var r = STAFF_ROLES[role] || 0, c = mkCfg(), rep = repCfg(), out = [];
      PERMS.forEach(function (p) {
        var min = PERM_MIN[p.key];
        if (p.key === 'prices.publish') min = STAFF_ROLES[c.editRole] || 2;
        if (p.key === 'prices.approve') min = STAFF_ROLES[c.approveRole] || 2;
        if (p.key === 'report') min = STAFF_ROLES[rep.minRole] || 3;
        if (r >= min) out.push(p.key);
      });
      return out;
    }
    function permsOf(s) {
      var raw = String(s.perms || ''), out;
      if (raw.indexOf('c:') === 0) out = raw.substring(2).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return PERM_KEYS.indexOf(x) >= 0; });
      else out = defaultPerms(s.role);
      if (isBackup(s) && out.indexOf('prices.publish') < 0) out.push('prices.publish');   // الناشر البديل ينشر مهما كان دوره (market.backup)
      /* مدير الإدارة يحتفظ دائمًا بصلاحيات إدارة التجار والأسطول مهما كانت صلاحيات الفريق المحفوظة قبل إضافتها */
      if (s.role === 'manager') MANAGER_ALWAYS.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
      return out;
    }
    function can(s, key) { return permsOf(s).indexOf(key) >= 0; }

    var TEAM_ROLES = ['assistant', 'supervisor', 'admin'];   // مدير الإدارة لا يُنشأ حساب مدير آخر من الشاشة
    function needManager(s) { if (s.role !== 'manager') throw err('perm', 'إدارة الفريق والصلاحيات لمدير الإدارة فقط'); }
    function teamRow(r, s) {
      return {
        id: r.id, name: r.name, title: r.title, role: r.role, roleLabel: ROLE_LABEL[r.role] || r.role, phone: r.phone, email: r.email || '',
        farmId: r.farmId || '', active: Number(r.active) ? 1 : 0, custom: String(r.perms || '').indexOf('c:') === 0, perms: permsOf(r),
        locked: r.id === s.id || r.role === 'manager'
      };
    }
    function teamList(s) {
      var defaults = {};
      TEAM_ROLES.forEach(function (ro) { defaults[ro] = defaultPerms(ro); });
      var list = store.all('Staff').map(function (r) { return teamRow(r, s); });
      list.sort(function (a, b) { return (b.active - a.active) || ((STAFF_ROLES[b.role] || 0) - (STAFF_ROLES[a.role] || 0)) || (a.name < b.name ? -1 : 1); });
      return {
        me: s.id, list: list, catalog: PERMS, defaults: defaults,
        roles: TEAM_ROLES.map(function (ro) { return { id: ro, label: ROLE_LABEL[ro] }; }),
        farms: farmsList().map(function (f) { return { id: f.id, name: f.name }; })
      };
    }
    /* رقم موظف جديد لا يتكرر مع أي رقم موجود (العدّاد لا يعرف الأرقام التي أُدخلت يدويًا) */
    function newStaffId() {
      var id;
      do { id = nextId('S', 2); } while (store.find('Staff', function (x) { return x.id === id; }));
      return id;
    }
    function s_teamSave(s, p) {
      needManager(s);
      var id = String(p.id || ''), row = null;
      if (id) {
        row = store.find('Staff', function (x) { return x.id === id; });
        if (!row) throw err('nf', 'الحساب غير موجود');
        if (row.id === s.id) throw err('self', 'حسابك لا يُعدَّل من هذه الشاشة');
        if (row.role === 'manager') throw err('perm', 'لا يُعدَّل حساب مدير الإدارة من هنا');
      }
      var name = U.cleanText(p.name, 40), title = U.cleanText(p.title, 40);
      if (name.length < 2) throw err('name', 'اكتب اسم الموظف');
      if (title.length < 2) throw err('title', 'اكتب المسمى الوظيفي (يظهر للتاجر)');
      var phone = U.normPhone(String(p.phone || ''));
      if (!phone) throw err('phone', 'رقم الموبايل غير صحيح: 11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015');
      var other = store.find('Staff', function (x) { return x.phone === phone && x.id !== id; });
      if (other) throw err('dup', Number(other.active) ? 'الرقم ده مسجّل على حساب موظف آخر' : 'الرقم ده مسجّل على حساب موقوف (' + other.name + '). افتحه من القائمة لإعادة تفعيله');
      var email = String(p.email || '').trim().toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('email', 'البريد غير صحيح');
      var role = String(p.role || '');
      if (TEAM_ROLES.indexOf(role) < 0) throw err('role', 'الدور غير صحيح: معاون أو مشرف أو مسؤول نظام');
      var farmId = '';
      if (role === 'assistant') {
        farmId = String(p.farmId || '');
        if (!farmId || !store.find('Farms', function (f) { return String(f.id) === farmId; })) throw err('farm', 'اختر المزرعة التي يعمل بها المعاون');
      }
      var given = Array.isArray(p.perms) ? p.perms : [];
      var picked = PERM_KEYS.filter(function (k) { return given.indexOf(k) >= 0; });
      var defs = defaultPerms(role);
      var sameAsRole = picked.length === defs.length && picked.every(function (k) { return defs.indexOf(k) >= 0; });
      var pin = U.normPin(String(p.pin || ''));
      if (!row && !pin) throw err('pin', 'اكتب رمزًا سريًا من 4 إلى 6 أرقام للموظف');
      if (p.pin && !pin) throw err('pin', 'الرمز السري من 4 إلى 6 أرقام');
      var patch = {
        name: name, title: title, phone: phone, email: email, role: role, farmId: farmId,
        perms: sameAsRole ? '' : 'c:' + picked.join(','), active: row ? (Number(p.active) ? 1 : 0) : 1
      };
      if (pin) { var salt = env.randHex(8); patch.salt = salt; patch.pinHash = U.hashPin(pin, salt, env.secret()); patch.fails = 0; patch.lockUntil = 0; }
      var target;
      if (row) { store.update('Staff', row.id, patch); target = row.id; }
      else { target = newStaffId(); store.insert('Staff', Object.assign({ id: target, fails: 0, lockUntil: 0 }, patch)); }
      log('', 'team_save', target, 0, { by: s.id, role: role, custom: !sameAsRole });
      OPS.audit(s, 'team_save', target, { role: role, custom: !sameAsRole, pin: !!pin });
      return teamList(s);
    }
    /* «الحذف» إيقاف دائم: يُقفل الدخول فورًا وتختفي من القوائم، ويبقى السجل لأن أرقامها مرتبطة برسائل وأسعار سابقة */
    function s_teamDelete(s, p) {
      needManager(s);
      var id = String(p.id || ''), row = store.find('Staff', function (x) { return x.id === id; });
      if (!row) throw err('nf', 'الحساب غير موجود');
      if (row.id === s.id) throw err('self', 'لا يمكنك حذف حسابك');
      if (row.role === 'manager') throw err('perm', 'لا يُحذف حساب مدير الإدارة من هنا');
      store.update('Staff', row.id, { active: 0, lockUntil: 0, fails: 0 });
      log('', 'team_delete', row.id, 0, { by: s.id });
      OPS.audit(s, 'team_delete', row.id, {});
      return teamList(s);
    }

    /* =================== التوجيه =================== */
    /* خطأ من الواجهة (بلا اسم ولا رمز): نص مقصوص يُسجَّل في LAST_ERR ليعرف المسؤول أين تعثّر التطبيق */
    function clientError(token, p) {
      var msg = String((p && p.msg) || '').substring(0, 300), where = String((p && p.where) || '').substring(0, 60);
      onErr(new Error('client[' + where + ']: ' + msg), 'client');
      return { ok: true };
    }
    var PUBLIC = { register: register, login: login, staffLogin: staffLogin, clientError: clientError };
    var TRADER = {
      me: function (r) { return profile(r, stateOf(r)); },
      home: home, content: content, videoStart: videoStart, videoDone: videoDone, cardRead: cardRead,
      roundGet: roundGet, roundSubmit: roundSubmit, gameGet: gameGet, gameSubmit: gameSubmit,
      charterSign: charterSign, testGet: testGet, testSubmit: testSubmit, mizanSave: mizanSave, mizanGet: mizanGet,
      ticketCreate: ticketCreate, ticketList: ticketList, ticketGet: ticketGet, ticketReply: ticketReply, ticketRate: ticketRate,
      rewardsList: rewardsList, rewardClaim: rewardClaim, honorSet: honorSet, visits: visits, inviteInfo: inviteInfo,
      marketGet: marketGet, ackMilestone: ackMilestone
    };
    var STAFF = {
      sMe: function (s) { return { staff: staffPublic(s), farms: farmsList(), gateItems: C.GATE_ITEMS, ticketTypes: typesPublic(), mkPending: mkPendingFor(s) }; },
      sFind: s_find, sGate: s_gate, sInbox: s_inbox, sTicket: s_ticket, sReply: s_reply, sCallback: s_callback,
      sAccept: s_accept, sFarm: s_farm, sRegister: s_register, sRewards: s_rewards, sRewardDecide: s_rewardDecide,
      sTraders: s_traders, sBlock: s_block, sTraderGet: s_traderGet, sTraderSave: s_traderSave, sTraderDelete: s_traderDelete, sStats: s_stats, sMarketGet: s_marketGet, sMarketSet: s_marketSet, sMarketDecide: s_marketDecide, sReport: s_report,
      sTeamList: function (s) { needManager(s); return teamList(s); }, sTeamSave: s_teamSave, sTeamDelete: s_teamDelete,
      sResetPreview: s_resetPreview, sFactoryReset: s_factoryReset
    };
    var WRITE = { register: 1, login: 1, staffLogin: 1 };
    /* أسطول التجار: إجراءات المشرفين، وإجراءات السائق التي يحميها رمز الخط نفسه */
    var FL = C.fleetActions({ store: store, env: env, cfg: cfg, err: err, now: now, can: can, log: log, jparse: jparse, liveTraders: liveTraders });
    /* العمليات: سجل الأخطاء والصحة والنسخ والتدقيق والتصدير والتخزين المؤقت (انظر 04d_ops.js) */
    var OPS = C.opsActions({
      store: store, env: env, cfg: cfg, err: err, now: now, can: can, log: log, jparse: jparse, peek: peek, addCounter: addCounter,
      liveTraders: liveTraders, stateOf: stateOf, needManager: needManager,
      notify: function (subject, body) { var list = repRecipients(); if (list.length) env.notify(list, subject, body, ''); },
      reportRows: function () { return repRows(repBuild()); }
    });
    /* كل خطأ غير متوقع يُسجَّل في LAST_ERR (للفريق الفني) وفي سجل الأخطاء داخل التطبيق */
    function onErr(e, where) {
      try { if (env.onError) env.onError(e); } catch (x) { /* ignore */ }
      try { OPS.recordErr(e, where); } catch (y) { /* ignore */ }
    }
    /* حدّ معدل الطلبات لكل مستخدم في الدقيقة */
    function rate(sub) { if (!OPS.rateOk(sub)) throw err('rate', 'طلبات كثيرة في وقت قصير، استنى دقيقة وجرّب تاني'); }

    function dispatch(token, action, payload) {
      payload = payload || {};
      if (PUBLIC[action]) return PUBLIC[action](token, payload);
      if (TRADER[action]) { var tr = whoTrader(token); rate(tr.id); return TRADER[action](tr, payload); }
      if (STAFF[action] || OPS.STAFF[action] || FL.STAFF[action]) {
        var sf = whoStaff(token); rate(sf.id);
        if (STAFF[action]) return STAFF[action](sf, payload);
        if (OPS.STAFF[action]) return OPS.STAFF[action](sf, payload);
        return FL.STAFF[action](sf, payload);
      }
      if (FL.ROUTE[action]) { var rt = FL.routeOf(token); rate('r:' + rt.id); return FL.ROUTE[action](rt, payload); }
      throw err('action', 'طلب غير معروف');
    }
    /* واجهة الاستدعاء الوحيدة. يرجع دائمًا {ok:true,data} أو {ok:false,err,msg} */
    function api(token, action, payloadJson) {
      try {
        var payload = typeof payloadJson === 'string' ? (payloadJson ? JSON.parse(payloadJson) : {}) : (payloadJson || {});
        return { ok: true, data: dispatch(token, String(action), payload) };
      } catch (e) {
        if (e instanceof ApiError) return { ok: false, err: e.code, msg: e.msg };
        onErr(e, 'api');
        return { ok: false, err: 'server', msg: 'حصل خطأ غير متوقع، جرّب تاني بعد لحظات' };
      }
    }

    return {
      api: api, tick: tick, reportNow: function () { var R = repBuild(); return repSend(repRecipients(), R) ? repRecipients().length : 0; }, cfg: cfg, resetCfg: function () { _cfg = null; },
      _internal: { stateOf: stateOf, save: save, profile: profile, nextId: nextId, farmsList: farmsList }
    };
  }

  C.createService = createService;
  C.ROLE_LABEL = ROLE_LABEL;
  C.STAFF_ROLES = STAFF_ROLES;
})(C3A);
