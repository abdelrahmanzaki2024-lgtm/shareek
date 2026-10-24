/* ============================================================
   الجزء 7: طبقة Google Apps Script + Google Sheets
   - مخزن بيانات فوق ورقات Google Sheets (قراءة كسولة، كتابة مجمّعة عند نهاية كل طلب)
   - نقطة الدخول api() بقفل لمنع التضارب، ومؤقت التصعيد، وقائمة الإعداد داخل الجدول
   ============================================================ */

var GAS = (function () {
  'use strict';
  var C = C3A, U = C.U, SCHEMA = C.SCHEMA;
  var TZ = 'Africa/Cairo';
  var APP_TITLE = 'شريك الدفاع | كايرو ثري ايه';
  var STAFF_SHEET = 'موظفون_جدد';
  var CACHEABLE = { Config: 1, Content: 1, MarketItems: 1 };   // جداول لا تكتبها الخدمة؛ تُحفظ في الكاش دقائق
  var CACHE_SECONDS = 300;

  /* ---------- التوقيت: فرق القاهرة (يشمل التوقيت الصيفي) من قاعدة بيانات جوجل نفسها ---------- */
  var offCache = {};
  function offsetMs(ts) {
    var b = Math.floor(ts / 3600000), v = offCache[b];
    if (v === undefined) {
      var z = Utilities.formatDate(new Date(b * 3600000), TZ, 'Z');           // مثال +0200
      v = (z.charAt(0) === '-' ? -1 : 1) * (parseInt(z.substr(1, 2), 10) * 60 + parseInt(z.substr(3, 2), 10)) * 60000;
      offCache[b] = v;
    }
    return v;
  }
  U.setTz(function (ts) {
    var d = new Date(ts + offsetMs(ts));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
  });

  /* ---------- أدوات عامة ---------- */
  var props = null, _ss = null, _secret = null;
  function P() { return props || (props = PropertiesService.getScriptProperties()); }
  function ss() {
    if (_ss) return _ss;
    var id = P().getProperty('SHEET_ID');
    if (id) { _ss = SpreadsheetApp.openById(id); return _ss; }
    var a = SpreadsheetApp.getActiveSpreadsheet();
    if (a) { P().setProperty('SHEET_ID', a.getId()); _ss = a; return _ss; }
    throw new Error('الجدول غير مربوط. افتح الجدول ثم شغّل «تهيئة الجداول» من قائمة «شريك الدفاع».');
  }
  function secret() {
    if (_secret) return _secret;
    _secret = P().getProperty('SECRET');
    if (!_secret) throw new Error('لم يتم إعداد النظام بعد. شغّل «تهيئة الجداول» أولًا.');
    return _secret;
  }
  function randHex(n) {
    var s = '';
    while (s.length < n * 2) s += Utilities.getUuid().replace(/-/g, '');
    return s.substring(0, n * 2);
  }
  function logError(e) {
    try {
      var msg = String((e && e.stack) || e).substring(0, 800);
      console.error(msg);
      P().setProperty('LAST_ERR', new Date().toISOString() + ' ' + msg);
    } catch (x) { /* ignore */ }
  }

  /* ---------- الإشعارات: بريد المسؤولين. لا يحمل أي نص من رسالة التاجر ولا رقمه ---------- */
  function notify(to, subject, body, html) {
    var sent = 0;
    for (var i = 0; i < to.length; i++) {
      if (MailApp.getRemainingDailyQuota() < 1) break;
      try {
        var opt = { to: to[i], subject: subject, body: body, name: 'شريك الدفاع — كايرو ثري ايه', noReply: true };
        if (html) opt.htmlBody = html;
        MailApp.sendEmail(opt); sent++;
      }
      catch (e) { logError(e); }
    }
    return sent > 0;
  }

  var nowHook = null;
  /* إرسال إشعار الدفع إلى الخادم الخارجي (push.relayUrl). لا يُرسَل شيء إن لم يُضبط الرابط */
  function pushRelay(url, auth, body) {
    try {
      var opt = { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true };
      if (auth) opt.headers = { Authorization: 'Bearer ' + auth };
      var res = UrlFetchApp.fetch(url, opt);
      if (res.getResponseCode() >= 300) logError(new Error('push relay HTTP ' + res.getResponseCode()));
    } catch (e) { logError(e); }
  }
  /* ---------- Firebase Cloud Messaging (HTTP v1) بحساب خدمة في Script Property: FCM_SERVICE_ACCOUNT ---------- */
  function fcmSa() {
    try { var s = P().getProperty('FCM_SERVICE_ACCOUNT'); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function fcmReady() { var sa = fcmSa(); return !!sa && C.fcm.validServiceAccount(sa); }
  var jwtSigner = {
    b64url: function (text) { return Utilities.base64EncodeWebSafe(Utilities.newBlob(text).getBytes()).replace(/=+$/, ''); },
    signRs256: function (text, pem) { return Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(text, pem)).replace(/=+$/, ''); }
  };
  /* رمز وصول Google يُخزَّن في الذاكرة المؤقتة نحو 50 دقيقة، ويُجدَّد عند رفض 401 */
  function fcmAccessToken(sa) {
    var cache = CacheService.getScriptCache(), key = 'fcm_at_' + sa.project_id;
    var hit = cache.get(key);
    if (hit) return hit;
    var res = UrlFetchApp.fetch(C.fcm.TOKEN_URL, {
      method: 'post', muteHttpExceptions: true,
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: C.fcm.assertion(sa, Date.now(), jwtSigner) }
    });
    var j = {}; try { j = JSON.parse(res.getContentText()); } catch (e) { j = {}; }
    if (res.getResponseCode() !== 200 || !j.access_token) throw new Error('FCM token HTTP ' + res.getResponseCode() + ': ' + String(res.getContentText()).substring(0, 160));
    cache.put(key, j.access_token, 3000);
    return j.access_token;
  }
  /* يرسل كل الرسائل بالتوازي ويعيد نتيجة لكل واحدة بالترتيب نفسه */
  function fcmSend(msgs) {
    var sa = fcmSa();
    if (!sa || !C.fcm.validServiceAccount(sa)) return msgs.map(function () { return { ok: false, skipped: true }; });
    var at = fcmAccessToken(sa);
    var url = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(sa.project_id) + '/messages:send';
    var reqs = msgs.map(function (m) {
      return { url: url, method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + at }, payload: JSON.stringify(m), muteHttpExceptions: true };
    });
    var out = UrlFetchApp.fetchAll(reqs);
    var res = out.map(function (r) { return C.fcm.interpret(r.getResponseCode(), r.getContentText()); });
    if (res.some(function (x) { return x.auth; })) { try { CacheService.getScriptCache().remove('fcm_at_' + sa.project_id); } catch (e) { /* ignore */ } }
    return res;
  }

  var env = {
    now: function () { return nowHook ? nowHook() : Date.now(); },
    secret: secret, randHex: randHex, notify: notify, onError: logError,
    push: pushRelay,
    fcmReady: fcmReady, fcmSend: fcmSend,
    /* تخزين مؤقت مشترك للقراءات الثقيلة وحدّ معدل الطلبات (CacheService، أقصى مدة 6 ساعات) */
    cache: {
      get: function (k) { try { return CacheService.getScriptCache().get(k); } catch (e) { return null; } },
      put: function (k, v, sec) { try { CacheService.getScriptCache().put(k, v, Math.max(30, sec)); } catch (e) { /* ignore */ } }
    },
    triggerOk: function () { try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'tickJob'; }); } catch (e) { return undefined; } },
    mailQuota: function () { try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; } },
    pushAuth: function () { try { return P().getProperty('PUSH_SECRET') || ''; } catch (e) { return ''; } },
    serviceUrl: function () { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } }
  };

  /* ---------- مخزن الجداول ---------- */
  function conv(v, type, name) {
    if (type === 'n') { if (typeof v === 'number') return v; if (v === '' || v === null || v === undefined) return 0; var n = Number(v); return isNaN(n) ? 0 : n; }
    if (v === null || v === undefined || v instanceof Date) return '';
    var s = String(v);
    if (name === 'phone' && s && !/^01\d{9}$/.test(s)) { var p = U.normPhone(s); if (p) return p; }   // أصلح صفرًا ضاع إن حوّلته الشيت لرقم
    return s;
  }
  function toCell(v, type) {
    if (type === 'n') { var n = Number(v); return isNaN(n) ? 0 : n; }
    var s = v === null || v === undefined ? '' : String(v);
    return s.length > 49000 ? s.substring(0, 49000) : s;
  }
  function norm(t, obj) {
    var o = {};
    SCHEMA[t].forEach(function (c) { var v = obj[c[0]]; o[c[0]] = v === undefined || v === null ? (c[1] === 'n' ? 0 : '') : v; });
    return o;
  }
  function setRow(o, n) { Object.defineProperty(o, '_row', { value: n, enumerable: false, writable: true }); return o; }

  var SELF_CREATE = { MarketItems: 1, MarketDay: 1, MarketPending: 1, FleetRoutes: 1, FleetPings: 1, FleetAlerts: 1, FleetNotes: 1, FleetDevices: 1, FleetConsents: 1, ErrLog: 1, HealthLog: 1, AuditLog: 1 };   // أوراق أُضيفت بعد الإصدار الأول؛ تُنشأ تلقائيًا عند أول استخدام لتسهيل الترقية
  function sheetOf(t) {
    var sh = ss().getSheetByName(t);
    if (!sh && SELF_CREATE[t]) sh = setupSheet(ss(), t);
    if (!sh) throw new Error('الورقة «' + t + '» غير موجودة. شغّل «تهيئة الجداول».');
    return sh;
  }
  function readTable(t) {
    var cols = SCHEMA[t], cache = null, key = 'T:' + t;
    if (CACHEABLE[t]) {
      try { var hit = CacheService.getScriptCache().get(key); if (hit) return JSON.parse(hit); } catch (e) { /* ignore */ }
    }
    var sh = sheetOf(t), last = sh.getLastRow(), rows = [];
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
      for (var i = 0; i < vals.length; i++) {
        var o = {}, blank = true;
        for (var j = 0; j < cols.length; j++) { o[cols[j][0]] = conv(vals[i][j], cols[j][1], cols[j][0]); if (vals[i][j] !== '' && vals[i][j] !== null) blank = false; }
        if (blank) continue;
        rows.push(setRow(o, i + 2));
      }
    }
    if (CACHEABLE[t]) {
      try { var js = JSON.stringify(rows); if (rows.length && js.length < 90000) CacheService.getScriptCache().put(key, js, CACHE_SECONDS); } catch (e2) { /* ignore */ }
    }
    return rows;
  }

  function createStore() {
    var T = {};
    function st(t) { if (!SCHEMA[t]) throw new Error('جدول غير معروف: ' + t); return T[t] || (T[t] = { rows: null, news: [], dirty: [] }); }
    function load(t) {
      var s = st(t);
      if (!s.rows) s.rows = readTable(t).concat(s.news);
      return s.rows;
    }
    function keyOf(t) { return SCHEMA[t][0][0]; }
    function toArr(t, r) { return SCHEMA[t].map(function (c) { return toCell(r[c[0]], c[1]); }); }

    function flushTable(t) {
      var s = T[t], cols = SCHEMA[t], sh = null;
      if (CACHEABLE[t]) { try { CacheService.getScriptCache().remove('T:' + t); } catch (e) { /* ignore */ } }
      /* 1) صفوف معدّلة: تُكتب كتلًا متجاورة */
      if (s.dirty.length) {
        sh = sheetOf(t);
        var rows = s.dirty.slice().sort(function (a, b) { return a._row - b._row; }), i = 0;
        while (i < rows.length) {
          var j = i;
          while (j + 1 < rows.length && rows[j + 1]._row === rows[j]._row + 1) j++;
          var block = rows.slice(i, j + 1).map(function (r) { return toArr(t, r); });
          sh.getRange(rows[i]._row, 1, block.length, cols.length).setValues(block);
          i = j + 1;
        }
        s.dirty = [];
      }
      /* 2) صفوف جديدة: تُلحق دفعة واحدة */
      if (s.news.length) {
        sh = sh || sheetOf(t);
        var start = sh.getLastRow() + 1, n = s.news.length;
        if (start + n - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), Math.max(n, 500));
        sh.getRange(start, 1, n, cols.length).setValues(s.news.map(function (r) { return toArr(t, r); }));
        s.news.forEach(function (r, k) { setRow(r, start + k); });   // لو حُمّل الجدول بعدها يبقى للصف رقمه
        s.news = [];
      }
    }

    return {
      all: function (t) { return load(t); },
      find: function (t, fn) { var a = load(t); for (var i = 0; i < a.length; i++) if (fn(a[i])) return a[i]; return null; },
      filter: function (t, fn) { return load(t).filter(fn); },
      count: function (t) { return load(t).length; },
      insert: function (t, obj) {
        var r = norm(t, obj), s = st(t);
        s.news.push(r);
        if (s.rows) s.rows.push(r);
        return r;
      },
      update: function (t, k, patch) {
        var kk = keyOf(t), a = load(t), s = st(t);
        for (var i = 0; i < a.length; i++) {
          if (a[i][kk] === k) {
            for (var p in patch) a[i][p] = patch[p];
            if (a[i]._row && s.dirty.indexOf(a[i]) < 0) s.dirty.push(a[i]);
            return a[i];
          }
        }
        return null;
      },
      /* استبدال كل صفوف جدول بقائمة جديدة (إعادة التهيئة). يلغي أي كتابة معلّقة لهذا الجدول */
      replaceTable: function (t, rows) {
        var s = st(t), cols = SCHEMA[t], sh = sheetOf(t);
        try { CacheService.getScriptCache().remove('T:' + t); } catch (e0) { /* ignore */ }
        var last = sh.getLastRow();
        if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
        if (rows.length) {
          sh.getRange(2, 1, rows.length, cols.length).setValues(rows.map(function (r) { return toArr(t, r); }));
          rows.forEach(function (r, k) { setRow(r, k + 2); });
        }
        s.rows = rows.slice(); s.news = []; s.dirty = [];
      },
      /* نسخة احتياطية: كل جدول يُنسخ ورقة مخفية باسم bk_<label>_<الجدول> داخل الملف نفسه */
      snapshot: function (label, names) {
        var book = ss();
        names.forEach(function (t) {
          var sh = sheetOf(t);
          if (sh.getLastRow() < 2) return;
          var c = sh.copyTo(book);
          c.setName(('bk_' + label + '_' + t).substring(0, 99));
          c.hideSheet();
        });
        return names;
      },
      snapshotLabels: function (prefix) {
        var L = {};
        ss().getSheets().forEach(function (sh) { var n = sh.getName(); if (n.indexOf('bk_') === 0 && n.lastIndexOf('_') > 3) L[n.substring(3, n.lastIndexOf('_'))] = 1; });
        return Object.keys(L).filter(function (l) { return !prefix || l.charAt(0) === prefix; }).sort().reverse();
      },
      /* يُبقي آخر عدد من النسخ (المفتاح هو الطابع الزمني) ويحذف الباقي */
      pruneSnapshots: function (keep, prefix) {
        var book = ss(), pf = prefix || 'R', drop = this.snapshotLabels(pf).slice(keep), n = 0;
        book.getSheets().forEach(function (sh) {
          var nm = sh.getName();
          if (nm.indexOf('bk_') !== 0) return;
          if (drop.indexOf(nm.substring(3, nm.lastIndexOf('_'))) >= 0) { book.deleteSheet(sh); n++; }
        });
        return n;
      },
      /* تُستدعى مرة عند نهاية الطلب. تشمل أيضًا الصفوف التي عُدّلت مباشرة على الكائن بعد update */
      flush: function () {
        Object.keys(T).forEach(function (t) {
          var s = T[t];
          if (s.dirty.length || s.news.length) flushTable(t);
        });
      }
    };
  }

  function session() {
    var store = createStore();
    return { store: store, svc: C.createService(store, env) };
  }

  /* ---------- الاستدعاء من الواجهة ---------- */
  function withLock(fn) {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(25000); } catch (e) { return { ok: false, err: 'busy', msg: 'الخدمة مشغولة لحظات، جرّب تاني' }; }
    try { return fn(); } finally { try { lock.releaseLock(); } catch (e2) { /* ignore */ } }
  }
  function appUrl(cfg) {
    var v = cfg && cfg.appUrl;
    if (v && /^https?:\/\//.test(String(v))) return String(v);
    try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
  }
  function call(token, action, payloadJson) {
    return withLock(function () {
      var g;
      try { g = session(); } catch (e) { logError(e); return { ok: false, err: 'setup', msg: 'النظام غير مهيأ بعد. راجع مسؤول النظام.' }; }
      var res = g.svc.api(String(token || ''), String(action || ''), payloadJson);
      try { g.store.flush(); }
      catch (e3) { logError(e3); return { ok: false, err: 'server', msg: 'تعذّر حفظ البيانات، جرّب تاني بعد لحظات' }; }
      if (res.ok && action === 'home') res.data.appUrl = appUrl(g.svc.cfg());
      return res;
    });
  }
  function reportNow() {
    return withLock(function () {
      var g = session(), n = g.svc.reportNow();
      g.store.flush();
      return n;
    });
  }
  function tick() {
    return withLock(function () {
      var g = session(), r = g.svc.tick();
      g.store.flush();
      return r;
    });
  }

  /* ---------- الإعداد ---------- */
  var HEAD_BG = '#EA2329', HEAD_FG = '#FFFFFF';

  var CONFIG_ROWS = [
    ['appName', 'شريك الدفاع', 'اسم التطبيق'],
    ['appUrl', '', 'رابط التطبيق للمشاركة (اتركه فارغًا لاستخدام الرابط الأصلي، أو ضع رابطًا مختصرًا معتمدًا)'],
    ['weekGoalDays', '4', 'أيام النشاط المطلوبة في الأسبوع لتحقيق الهدف'],
    ['fleet.hotline', '', 'رقم المسؤول المباشر الذي يظهر للسائق عند الطوارئ (مثال: 01001234567)'],
    ['fleet.corridorM', '150', 'عرض الممر المسموح حول خط السير بالمتر (من 30 إلى 1000)'],
    ['fleet.linkBase', '', 'رابط صفحة السائق الذي يُرسل على واتساب (مثال رابط GitHub Pages). فارغ = رابط التطبيق للمشاركة'],
    ['fleet.retainDays', '90', 'مدة الاحتفاظ بنقاط حركة السائقين بالأيام، ثم تُحذف تلقائيًا كل يوم (0 = بلا حذف). الخط والتنبيهات تبقى'],
    ['backup.on', 'true', 'نسخة احتياطية أسبوعية تلقائية لكل الجداول المهمة (true أو false)'],
    ['backup.day', '0', 'يوم النسخة الأسبوعية: 0 الأحد … 6 السبت'],
    ['backup.hour', '3', 'الساعة (بتوقيت القاهرة) التي تُؤخذ بعدها النسخة'],
    ['backup.keep', '4', 'عدد النسخ الأسبوعية التي تُحفظ (الأقدم يُحذف تلقائيًا)'],
    ['health.on', 'true', 'فحص صحة يومي للنظام، ويُرسل بريدًا للمديرين عند وجود مشكلة (true أو false)'],
    ['health.hour', '6', 'الساعة (بتوقيت القاهرة) التي يبدأ بعدها الفحص اليومي'],
    ['push.relayUrl', '', 'عنوان خادم الإشعارات الخارجي (يُترك فارغًا حتى تُفعّل الإشعارات والتطبيق مغلق)'],
    ['freezesPerMonth', '2', 'عدد الإجازات الشهرية التي لا تكسر السلسلة'],
    ['dailyDigitalCap', '40', 'سقف النقاط الرقمية اليومي (قبل المضاعف)'],
    ['gateMaxScoredPerDay', '2', 'أقصى زيارات بوابة تُحتسب نقاطها في اليوم'],
    ['points.round', '10', 'نقاط جولة اليوم'],
    ['points.video', '5', 'نقاط مشاهدة فيديو كامل'],
    ['points.card', '2', 'نقاط قراءة بطاقة'],
    ['points.weekGoal', '25', 'مكافأة تحقيق الهدف الأسبوعي'],
    ['points.gateClean', '40', 'نقاط زيارة بوابة نظيفة (4 من 4)'],
    ['points.gatePartial', '10', 'نقاط زيارة 3 من 4'],
    ['points.suggestionAccepted', '100', 'نقاط الاقتراح المقبول'],
    ['points.inviteDone', '50', 'نقاط ترشيح تاجر أكمل التسجيل'],
    ['points.inviteClean', '100', 'نقاط أول زيارة نظيفة للتاجر المرشَّح'],
    ['collective.weeklyTarget', '200', 'هدف «حائط الدفاع» الجماعي: عدد الجولات الأسبوعية'],
    ['followupAfterDays', '30', 'بعد كم يوم يفتح اختبار المتابعة'],
    ['farmStaleHours', '24', 'بعد كم ساعة تُعتبر حالة المزرعة قديمة'],
    ['limits.registerPerDay', '150', 'أقصى تسجيلات ذاتية يوميًا (حماية من التسجيل الآلي)'],
    ['limits.ticketsPerDay', '5', 'أقصى رسائل جديدة يوميًا للتاجر الواحد'],
    ['ticketTypes.urgent.toSup', '2', 'ساعات قبل تصعيد البلاغ العاجل للمشرف'],
    ['ticketTypes.urgent.toMgr', '6', 'ساعات قبل تصعيده للمدير'],
    ['ticketTypes.obstacle.toSup', '24', 'ساعات قبل تصعيد «عائق» للمشرف'],
    ['ticketTypes.obstacle.toMgr', '48', 'ساعات قبل تصعيده للمدير'],
    ['ticketTypes.inquiry.toSup', '24', 'ساعات قبل تصعيد «استفسار» للمشرف'],
    ['ticketTypes.inquiry.toMgr', '48', 'ساعات قبل تصعيده للمدير'],
    ['market.editRole', 'supervisor', '«السوق النهاردة»: أقل دور يستطيع نشر الأسعار (assistant أو supervisor أو manager أو admin)'],
    ['market.directRole', 'manager', 'الدور الذي ينشر الأسعار مباشرة بلا اعتماد أي جهة (manager = مدير الإدارة)'],
    ['market.remind', 'true', 'تذكير بريدي يومي للمسؤولين لو لم تُنشر أسعار اليوم (true أو false)'],
    ['market.remindHour', '11', 'الساعة (بتوقيت القاهرة) التي يبدأ بعدها التذكير'],
    ['market.staleDays', '1', 'أقصى عمر للأسعار بالأيام قبل أن تظهر للتاجر كـ«قديمة»'],
    ['market.maxJumpPct', '20', 'أي تغيّر في السعر أكبر من هذه النسبة % عن آخر سعر يطلب تأكيدًا قبل النشر (حماية من خطأ الكتابة)'],
    ['market.backup', '', 'ناشرون بدلاء: أكواد موظفين (مثل S-05) أو أرقام موبايل مفصولة بفاصلة؛ يستطيع كل منهم نشر الأسعار مهما كان دوره، ويصله التذكير'],
    ['market.approval', 'jump', 'اعتماد الأسعار: jump = اعتماد ثانٍ عند القفزة الكبيرة فقط | always = كل نشر يحتاج اعتمادًا | off = تأكيد الناشر نفسه فقط'],
    ['market.approveRole', 'supervisor', 'أقل دور يستطيع اعتماد الأسعار المعلّقة (من غير الناشر نفسه)'],
    ['market.selfApprove', 'false', 'true = يستطيع المعتمد اعتماد طلبه بنفسه (ويُسمح تلقائيًا لو لا يوجد معتمد آخر)'],
    ['market.approveRemindMin', '60', 'بعد كم دقيقة يُذكَّر المعتمدون بطلب أسعار معلّق'],
    ['market.escalate', 'true', 'تصعيد للمديرين بالبريد لو لم تُنشر أسعار اليوم حتى ساعة التصعيد (true أو false)'],
    ['market.escalateHour', '13', 'ساعة التصعيد (بتوقيت القاهرة)، وتكون بعد ساعة التذكير الأول'],
    ['market.disclaimer', 'الأسعار دي أسعار بيع كايرو ثري ايه المعلنة لليوم. أي منتج مش مكتوب هنا اسأل عنه الأول، والسعر النهائي بيتأكد وقت الصفقة.', 'التنبيه الذي يظهر أسفل الأسعار'],
    ['report.on', 'true', 'التقرير الأسبوعي للإدارة بالبريد (true أو false)'],
    ['report.day', '0', 'يوم إرسال التقرير: 0 الأحد، 1 الاثنين، 2 الثلاثاء، 3 الأربعاء، 4 الخميس، 5 الجمعة، 6 السبت'],
    ['report.hour', '8', 'الساعة (بتوقيت القاهرة) التي يُرسَل بعدها التقرير'],
    ['report.minRole', 'manager', 'أقل دور يصله التقرير: supervisor أو manager أو admin (بشرط وجود بريد له في ورقة Staff)'],
    ['report.extraEmails', '', 'بريد إضافي يصله التقرير (مثل الإدارة العليا)، مفصول بفاصلة'],
    ['homescreen.on', 'true', 'بطاقة «ثبّت التطبيق على شاشتك» في تبويب اليوم (true أو false)'],
    ['homescreen.snoozeDays', '14', 'بعد كم يوم تعود البطاقة لو أجّلها التاجر'],
    ['milestones.on', 'true', 'لافتة التهنئة بالمحطات (رتبة جديدة، هدف أسبوعي، زيارات نظيفة، مدة الشراكة) داخل نافذة الترحيب'],
    ['milestones.rank', C.CONFIG.milestones.rank, 'نص تهنئة الرتبة الجديدة. {name} اسم التاجر، {rank} اسم الرتبة'],
    ['milestones.gw1', C.CONFIG.milestones.gw1, 'نص تهنئة أول هدف أسبوعي. {name}'],
    ['milestones.gw', C.CONFIG.milestones.gw, 'نص تهنئة تحقيق هدف الأسبوع عدة مرات (4 و12 و26 و52). {name} {n}'],
    ['milestones.clean', C.CONFIG.milestones.clean, 'نص تهنئة الزيارات النظيفة (5 و10 و25 و50). {name} {n}'],
    ['milestones.since', C.CONFIG.milestones.since, 'نص تهنئة مدة الشراكة (شهر و3 و6 و12 و24). {name} {period}'],
    ['certificate.on', 'true', 'شهادة التقدير الرقمية التي يحفظها التاجر ويشاركها (true أو false)'],
    ['certificate.title', C.CONFIG.certificate.title, 'عنوان الشهادة'],
    ['certificate.issuer', C.CONFIG.certificate.issuer, 'الجهة المانحة (تظهر أعلى الشهادة وأسفلها)'],
    ['certificate.body', C.CONFIG.certificate.body, 'عبارة الشهادة تحت اسم التاجر'],
    ['certificate.signer', '', 'اسم الموقِّع على الشهادة (اختياري؛ اتركه فارغًا لو لا تريد اسمًا)'],
    ['certificate.signerTitle', '', 'مسمى الموقِّع الوظيفي (اختياري)'],
    ['voice.on', 'true', 'زر «اسمع الأسعار» (نسخة صوتية بصوت الجهاز العربي) (true أو false)'],
    ['voice.respell', '', 'تصويب نطق اختياري بصيغة JSON: مصفوفة أزواج ["كلمة مكتوبة","كتابتها للنطق"]. اتركه فارغًا لاستخدام الافتراضي'],
    ['voice.baseUrl', '', 'عنوان https اختياري لملفات صوت مسجّلة بالعامية (scr_<الشاشة>.mp3)، ولو فارغ أو تعذّر التحميل يُستخدم صوت الجهاز'],
    ['welcome.on', 'true', 'رسالة الترحيب والتقدير التي تظهر للتاجر عند فتح التطبيق (true أو false)'],
    ['welcome.message', '', 'نص تقدير واحد يظهر دائمًا بدل الجمل الجاهزة أدناه (اتركه فارغًا لتظهر الجمل welcome.t1 إلى t8 متبدلة يوميًا). {name} = اسم التاجر الأول'],
    ['welcome.sign', 'شركة كايرو ثري ايه · إدارة الأمن الحيوي', 'التوقيع أسفل رسالة الترحيب']
  ];
  /* جمل التقدير الجاهزة تُكتب في الورقة كلها (welcome.t1 … t8) ليراها المسؤول ويعدّلها أو يمسح منها */
  (function () {
    var d = C.CONFIG.welcome;
    for (var i = 1; i <= 8; i++) CONFIG_ROWS.push(['welcome.t' + i, d['t' + i], 'جملة تقدير جاهزة رقم ' + i + ' تظهر في رسالة الترحيب (تتبدل الجمل يوميًا). عدّلها أو امسح الخلية لحذفها. {name} = اسم التاجر الأول']);
  })();

  function styleHeader(sh, nCols) {
    var r = sh.getRange(1, 1, 1, nCols);
    r.setBackground(HEAD_BG).setFontColor(HEAD_FG).setFontWeight('bold').setHorizontalAlignment('center');
    sh.setFrozenRows(1);
  }
  function setupSheet(book, name) {
    var cols = SCHEMA[name], sh = book.getSheetByName(name);
    if (!sh) sh = book.insertSheet(name);
    try { CacheService.getScriptCache().remove('T:' + name); } catch (e0) { /* ignore */ }
    sh.getRange(1, 1, 1, cols.length).setNumberFormat('@').setValues([cols.map(function (c) { return c[0]; })]);
    var maxR = sh.getMaxRows(), fmtRow = cols.map(function (c) { return c[1] === 'n' ? '0' : '@'; }), grid = [];
    for (var i = 1; i < maxR; i++) grid.push(fmtRow);
    if (grid.length) sh.getRange(2, 1, grid.length, cols.length).setNumberFormats(grid);   // نص صريح: يحفظ الصفر الأول في الموبايل ويمنع تفسير = كمعادلة
    styleHeader(sh, cols.length);
    try { sh.setRightToLeft(true); } catch (e) { /* ignore */ }
    var tab = { Config: '#EA2329', Content: '#EA2329', MarketItems: '#EA2329', MarketDay: '#F2A900', MarketPending: '#F2A900', Staff: '#242424', Farms: '#6D6E71' };
    sh.setTabColor(tab[name] || '#B81E25');
    return sh;
  }
  function setupStaffSheet(book) {
    var sh = book.getSheetByName(STAFF_SHEET), heads = ['الاسم', 'المسمى الوظيفي (يظهر للتاجر)', 'الدور', 'رقم المزرعة (للمعاون)', 'الموبايل', 'البريد (لإشعارات الرسائل)', 'الرمز السري (٤–٦ أرقام)', 'الحالة'];
    if (!sh) sh = book.insertSheet(STAFF_SHEET);
    sh.getRange(1, 1, 1, heads.length).setNumberFormat('@').setValues([heads]);
    sh.getRange(2, 1, sh.getMaxRows() - 1, heads.length).setNumberFormat('@');
    styleHeader(sh, heads.length);
    sh.setColumnWidths(1, heads.length, 150);
    try { sh.setRightToLeft(true); } catch (e) { /* ignore */ }
    sh.setTabColor('#242424');
    if (sh.getLastRow() < 2) {
      sh.getRange(2, 1, 1, heads.length).setValues([['# مثال: أحمد محمد', 'معاون مزرعة 5', 'معاون', '5', '01001234567', 'name@company.com', '1234', '']]);
      sh.getRange(2, 1, 1, heads.length).setFontColor('#6D6E71').setFontStyle('italic');
    }
    return sh;
  }

  function setup() {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book) throw new Error('شغّل الإعداد من داخل الجدول (قائمة «شريك الدفاع»).');
    P().setProperty('SHEET_ID', book.getId());
    if (!P().getProperty('SECRET')) P().setProperty('SECRET', randHex(32));
    _ss = book; _secret = null;
    Object.keys(SCHEMA).forEach(function (t) { setupSheet(book, t); });
    setupStaffSheet(book);
    var first = book.getSheets()[0];
    var g = session(), s = g.store;
    if (!s.count('Farms')) C.seedFarms(s, env.now(), false);
    var haveCfg = {}; s.all('Config').forEach(function (r) { haveCfg[r.key] = 1; });
    CONFIG_ROWS.forEach(function (r) { if (!haveCfg[r[0]]) s.insert('Config', { key: r[0], value: r[1], note: r[2] }); });   // يُضيف الإعدادات الناقصة فقط (آمن عند الترقية)
    if (!s.count('MarketItems')) C.MARKET_ITEMS.forEach(function (it) { s.insert('MarketItems', { id: it.id, name: it.name, short: it.short, unit: it.unit, dec: it.dec, order: it.order, main: it.main, hidden: 0 }); });
    if (!s.count('Content')) C.VIDEOS.forEach(function (v) { s.insert('Content', { id: v.id, type: 'video', title: v.title, desc: v.desc, driveId: '', cover: v.cover, minSec: v.minSec, order: v.order, active: 1 }); });
    s.flush();
    try { var def = book.getSheetByName('Sheet1') || book.getSheetByName('ورقة1'); if (def && book.getSheets().length > 1) book.deleteSheet(def); } catch (e) { /* ignore */ }
    return true;
  }

  function installTriggers() {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tickJob') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('tickJob').timeBased().everyMinutes(15).create();
  }

  /* تعرّف الدور من الخلية بتسامح: يكفي أن تحوي كلمة الدور (معاون / مشرف / مدير / مسؤول)، وتُوحَّد الهمزات (مسئول = مسؤول) */
  function normAr(t) {
    return String(t == null ? '' : t).replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/[ؤئ]/g, 'و').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  var ROLE_KEYS = [['admin', ['مسوول', 'admin']], ['manager', ['مدير', 'manager']], ['supervisor', ['مشرف', 'supervisor']], ['assistant', ['معاون', 'assistant']]];
  function roleOf(cell) {
    var t = normAr(cell), found = [];
    ROLE_KEYS.forEach(function (rk) { if (rk[1].some(function (w) { return t.indexOf(w) >= 0; })) found.push(rk[0]); });
    return found.length === 1 ? found[0] : (found.length ? 'ambiguous' : '');
  }

  /* استيراد الموظفين من ورقة «موظفون_جدد»: تُشفَّر الرموز السرية ثم تُمسح من الورقة */
  function importStaff() {
    var book = SpreadsheetApp.getActiveSpreadsheet(); _ss = book;
    var sh = book.getSheetByName(STAFF_SHEET);
    if (!sh) throw new Error('ورقة «' + STAFF_SHEET + '» غير موجودة. شغّل «تهيئة الجداول» أولًا.');
    var last = sh.getLastRow(); if (last < 2) return { added: 0, updated: 0, errors: 0 };
    return withLock(function () {
      var g = session(), s = g.store, vals = sh.getRange(2, 1, last - 1, 8).getValues(), added = 0, updated = 0, errors = 0;
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i], name = U.cleanText(v[0], 40);
        if (!name || name.charAt(0) === '#') continue;
        if (!String(v[6]).trim() && /^✓/.test(String(v[7]))) continue;   // صف سبق استيراده (الرمز مُسح)؛ لا نعيد فحصه
        var title = U.cleanText(v[1], 40), role = roleOf(v[2]);
        var phone = U.normPhone(String(v[4])), email = String(v[5] || '').trim(), pin = U.normPin(String(v[6]));
        /* رقم المزرعة: للمعاون فقط. نقبل «5» أو «مزرعة 5» أو «٥»، ونتجاهل أي نص آخر لغير المعاون (مثل «كامل الموقع») */
        var farm = '';
        if (role === 'assistant') {
          var dm = /\d+/.exec(U.arabicDigitsToLatin(String(v[3]))); farm = dm ? String(Number(dm[0])) : '';
        }
        var msgs = [];
        if (!title) msgs.push('المسمى الوظيفي مطلوب (العمود الثاني)');
        if (!role) msgs.push('الدور: اكتب كلمة واحدة فقط: معاون أو مشرف أو مدير أو مسؤول');
        else if (role === 'ambiguous') msgs.push('الدور غير واضح: اكتب كلمة واحدة فقط (معاون / مشرف / مدير / مسؤول) واترك المسمى الكامل في العمود الثاني');
        if (role === 'assistant') {
          if (!farm) msgs.push('رقم المزرعة مطلوب للمعاون (مثال: 5)');
          else if (!s.find('Farms', function (r) { return String(r.id) === farm; })) msgs.push('المزرعة رقم ' + farm + ' غير موجودة: أضفها أولًا في ورقة Farms (عمود id)');
        }
        if (!phone) msgs.push('رقم الموبايل غير صحيح: 11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015');
        if (!pin) msgs.push('الرمز السري من 4 إلى 6 أرقام');
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) msgs.push('البريد غير صحيح');
        if (msgs.length) { sh.getRange(i + 2, 8).setValue('✗ ' + msgs.join(' | ')); errors++; continue; }
        var salt = randHex(8), hash = U.hashPin(pin, salt, secret());
        var ex = s.find('Staff', function (r) { return r.phone === phone; });
        if (ex) {
          s.update('Staff', ex.id, { name: name, title: title, role: role, farmId: farm, email: email, pinHash: hash, salt: salt, active: 1, fails: 0, lockUntil: 0 });
          updated++;
        } else {
          var id;
          do { id = g.svc._internal.nextId('S', 2); } while (s.find('Staff', function (r) { return r.id === id; }));
          s.insert('Staff', { id: id, name: name, title: title, role: role, farmId: farm, phone: phone, email: email, pinHash: hash, salt: salt, active: 1, fails: 0, lockUntil: 0 });
          added++;
        }
        sh.getRange(i + 2, 7).setValue('');
        sh.getRange(i + 2, 8).setValue('✓ تم ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
      }
      s.flush();
      return { added: added, updated: updated, errors: errors };
    });
  }

  function seedDemoData() {
    var book = SpreadsheetApp.getActiveSpreadsheet(); _ss = book;
    return withLock(function () {
      var g = session(), s = g.store;
      if (s.count('Traders') || s.count('Staff')) throw new Error('يوجد تجار أو موظفون بالفعل. التحميل التجريبي للجدول الفارغ فقط.');
      var fh = sheetOf('Farms'), last = fh.getLastRow();
      if (last >= 2) fh.getRange(2, 1, last - 1, SCHEMA.Farms.length).clearContent();
      g = session(); s = g.store;
      C.seedDemo(s, env);
      s.flush();
      return true;
    });
  }

  /* ---------- نقل النظام إلى حساب جوجل آخر (مثلًا من حساب شخصي إلى حساب الشركة) ----------
     بصمات الرموز السرية والجلسات موقَّعة بهذا المفتاح؛ لو تغيّر على النسخة الجديدة لا يستطيع أحد الدخول بالرمز القديم. */
  function getKey() {
    var k = P().getProperty('SECRET');
    if (!k) throw new Error('لا يوجد مفتاح بعد. شغّل «تهيئة الجداول» أولًا.');
    return k;
  }
  function setKey(hex) {
    var k = String(hex || '').replace(/\s+/g, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(k)) throw new Error('المفتاح غير صحيح: يجب أن يكون 64 حرفًا (أرقام وحروف a–f). انسخه كاملًا بدون مسافات.');
    P().setProperty('SECRET', k); _secret = null;
    return true;
  }

  function health() {
    var out = [], ok = true;
    function line(good, text) { out.push((good ? '✓ ' : '✗ ') + text); if (!good) ok = false; }
    try { _ss = SpreadsheetApp.getActiveSpreadsheet() || ss(); } catch (e) { line(false, 'الجدول غير مربوط'); return { ok: false, text: out.join('\n') }; }
    line(!!P().getProperty('SECRET'), 'مفتاح التوقيع');
    Object.keys(SCHEMA).forEach(function (t) {
      var sh = _ss.getSheetByName(t);
      if (!sh) { line(false, 'ورقة ' + t + ' غير موجودة'); return; }
      var head = sh.getRange(1, 1, 1, SCHEMA[t].length).getValues()[0].join('|'), want = SCHEMA[t].map(function (c) { return c[0]; }).join('|');
      line(head === want, 'ورقة ' + t + (head === want ? '' : ' — العناوين تغيّرت، لا تعدّل صف العناوين'));
    });
    var staff = 0, roles = {}, farms = 0, vids = 0;
    try {
      var g = session();
      g.store.all('Staff').forEach(function (r) { if (Number(r.active)) { staff++; roles[r.role] = (roles[r.role] || 0) + 1; } });
      farms = g.store.count('Farms');
      g.store.all('Content').forEach(function (r) { if (r.driveId) vids++; });
    } catch (e2) { line(false, 'تعذّرت قراءة الجداول: ' + e2.message); }
    line(staff > 0 && !!roles.admin, 'موظفون نشطون: ' + staff + (roles.admin ? '' : ' — لا يوجد «مسؤول النظام»'));
    line(!!roles.assistant, 'معاونو المواقع: ' + (roles.assistant || 0));
    line(!!roles.supervisor && !!roles.manager, 'مشرف: ' + (roles.supervisor || 0) + ' — مدير: ' + (roles.manager || 0) + ' (لازمين للتصعيد)');
    line(farms > 0, 'مزارع: ' + farms);
    line(vids > 0, 'فيديوهات مربوطة بـ Drive: ' + vids + ' من ' + C.VIDEOS.length);
    try {
      var mk = ''; session().store.all('MarketDay').forEach(function (r) { var d = String(r.dk || ''); if (d > mk) mk = d; });
      out.push('أسعار «السوق النهاردة»: ' + (mk ? 'آخر نشر ' + mk : 'لم تُنشر أسعار بعد (من تبويب «السوق» للموظفين)'));
    } catch (e4) { line(false, 'تعذّرت قراءة أسعار السوق: ' + e4.message); }
    var trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'tickJob'; });
    line(trig, 'التصعيد التلقائي كل 15 دقيقة');
    out.push('حصة البريد المتبقية اليوم: ' + MailApp.getRemainingDailyQuota());
    var url = ''; try { url = ScriptApp.getService().getUrl(); } catch (e3) { /* ignore */ }
    out.push(url ? 'رابط التطبيق: ' + url : 'لم يُنشر التطبيق بعد (نشر ← تطبيق ويب)');
    var le = P().getProperty('LAST_ERR'); if (le) out.push('آخر خطأ مسجّل: ' + le.substring(0, 300));
    return { ok: ok, text: out.join('\n') };
  }

  return {
    call: call, tick: tick, reportNow: reportNow, setup: setup, installTriggers: installTriggers, importStaff: importStaff, getKey: getKey, setKey: setKey,
    seedDemoData: seedDemoData, health: health, appUrl: appUrl, session: session, env: env, title: APP_TITLE,
    setNow: function (fn) { nowHook = fn; }
  };
})();

/* ============================================================
   نقاط الدخول العامة (يستدعيها Apps Script والواجهة)
   ============================================================ */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(GAS.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/* الواجهة تستدعي: google.script.run.api(token, action, payloadJson) */
function api(token, action, payloadJson) { return GAS.call(token, action, payloadJson); }
/* الواجهة المستضافة خارج Apps Script (GitHub Pages) ترسل POST بنص JSON: {token, action, payload} */
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = GAS.call(String(body.token || ''), String(body.action || ''), String(body.payload || '{}'));
  } catch (err) {
    out = { ok: false, err: 'server', msg: 'طلب غير صالح، حدّث الصفحة وجرّب تاني' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function appUrl() { return GAS.appUrl(null); }
function tickJob() { GAS.tick(); }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('شريك الدفاع')
    .addItem('١) تهيئة الجداول لأول مرة', 'menuSetup')
    .addItem('٢) استيراد الموظفين من ورقة «موظفون_جدد»', 'menuImportStaff')
    .addItem('٣) تفعيل التصعيد التلقائي (كل ١٥ دقيقة)', 'menuTriggers')
    .addSeparator()
    .addItem('إرسال التقرير الأسبوعي الآن للمديرين', 'menuReport')
    .addItem('فحص سلامة النظام', 'menuHealth')
    .addItem('عرض رابط التطبيق', 'menuUrl')
    .addItem('تحميل بيانات تجريبية (للتجربة فقط)', 'menuSeed')
    .addSeparator()
    .addItem('نقل النظام: نسخ مفتاح النقل (من الحساب القديم)', 'menuKeyShow')
    .addItem('نقل النظام: إدخال مفتاح النقل (في الحساب الجديد)', 'menuKeySet')
    .addToUi();
}
function ui_(msg, title) { SpreadsheetApp.getUi().alert(title || 'شريك الدفاع', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
function menuSetup() {
  try { GAS.setup(); ui_('تمت التهيئة.\nالخطوة التالية: اكتب الموظفين في ورقة «موظفون_جدد» ثم اختر «استيراد الموظفين».'); }
  catch (e) { ui_('تعذّرت التهيئة: ' + e.message); }
}
function menuImportStaff() {
  try {
    var r = GAS.importStaff();
    ui_('أُضيف: ' + r.added + '\nحُدّث: ' + r.updated + '\nأخطاء: ' + r.errors + (r.errors ? '\n(راجع عمود «الحالة» في الورقة)' : '') + '\n\nتم تشفير الرموز السرية ومسحها من الورقة.');
  } catch (e) { ui_('تعذّر الاستيراد: ' + e.message); }
}
function menuTriggers() {
  try { GAS.installTriggers(); ui_('تم تفعيل التصعيد التلقائي كل 15 دقيقة.\nقد يطلب جوجل إذنًا لإرسال البريد وللمؤقت — وافق عليه.'); }
  catch (e) { ui_('تعذّر التفعيل: ' + e.message); }
}
function menuReport() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('التقرير الأسبوعي', 'سيُرسَل تقرير آخر 7 أيام الآن لكل من دوره «مدير» فأعلى (وفق إعدادات report.*) وعناوين البريد الإضافية. متابعة؟', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  try { var n = GAS.reportNow(); ui_(n ? 'أُرسل التقرير إلى ' + n + ' عنوان بريد.' : 'لم يُرسَل: لا يوجد بريد مسجّل لأي مدير في ورقة Staff، أو انتهت حصة البريد اليوم.'); }
  catch (e) { ui_('تعذّر الإرسال: ' + e.message); }
}
function menuHealth() { try { ui_(GAS.health().text, 'فحص سلامة النظام'); } catch (e) { ui_('تعذّر الفحص: ' + e.message); } }
function menuUrl() {
  var u = ''; try { u = ScriptApp.getService().getUrl(); } catch (e) { /* ignore */ }
  ui_(u ? u : 'لم يُنشر التطبيق بعد. من محرر الكود: نشر ← تطبيق ويب ← (تنفيذ باسمي، الوصول: أي شخص).');
}
function menuSeed() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('بيانات تجريبية', 'سيُنشئ 4 تجار و5 موظفين وهميين (رمز 1234) وعددًا من الرسائل. للجدول الفارغ فقط. تأكيد؟', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  try { GAS.seedDemoData(); ui_('تم. بيانات الدخول: التجار 01100000001–04 والموظفون 01000000001–05 والرمز 1234.\nاحذفها قبل التشغيل الفعلي (امسح الصفوف من الجداول).'); }
  catch (e) { ui_('تعذّر التحميل: ' + e.message); }
}
function menuKeyShow() {
  try {
    var k = GAS.getKey();
    var html = HtmlService.createHtmlOutput('<div style="font-family:Tahoma,Arial;direction:rtl;padding:6px;line-height:1.7">' +
      '<p><b>مفتاح النقل</b> — سرّي جدًا. من يملكه يستطيع توقيع جلسات دخول. انسخه إلى مكان آمن ولا ترسله في مجموعة أو إيميل عام.</p>' +
      '<textarea readonly onclick="this.select()" style="width:100%;height:70px;direction:ltr;font-family:monospace;font-size:13px">' + k + '</textarea>' +
      '<p style="color:#555;font-size:13px">اضغط داخل المربع ثم Ctrl+C. تحتاجه مرة واحدة فقط عند النقل لحساب جديد.</p></div>').setWidth(460).setHeight(250);
    SpreadsheetApp.getUi().showModalDialog(html, 'مفتاح النقل');
  } catch (e) { ui_('تعذّر عرض المفتاح: ' + e.message); }
}
function menuKeySet() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('إدخال مفتاح النقل', 'الصق المفتاح الذي نسخته من الحساب القديم (64 حرفًا).\nاستخدم هذا فقط في نسخة جديدة منقولة. إدخال مفتاح غير صحيح يمنع الجميع من الدخول حتى تعيد المفتاح الصحيح.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try { GAS.setKey(r.getResponseText()); ui_('تم. الخطوة التالية: «١) تهيئة الجداول» ثم «٣) تفعيل التصعيد التلقائي» ثم انشر التطبيق من جديد.'); }
  catch (e) { ui_(e.message); }
}
