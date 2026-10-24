/* ============================================================
   الجزء 4ب: أسطول التجار — خطوط السير والتتبع والطوارئ والإشعارات
   - الخط يُرسل للتاجر على واتساب برابط فيه رمز سري للخط. الخادم يخزّن بصمة الرمز فقط (HMAC) ولا يخزّنه كما هو.
   - السائق يرسل موقعه من الصفحة وهي مفتوحة. الخادم يحسب الخروج عن الممر ويعيد الحالة للهاتف.
   - الخروج عن الخط (بعد نبضتين متتاليتين) والطوارئ يسجّلان تنبيهًا ويصلان لكل من له صلاحية «fleet».
   - الإشعار والتطبيق مغلق يمر عبر خادم دفع خارجي (push.relayUrl)، وإن لم يُضبط يبقى التنبيه داخل التطبيق والبريد.
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U;

  /* الجداول الجديدة. لا تغيّر أي جدول قديم، والأوراق تُنشأ تلقائيًا عند أول استخدام أو عند التهيئة */
  C.SCHEMA.FleetRoutes = [['id', 's'], ['title', 's'], ['status', 's'], ['traderId', 's'], ['points', 'j'], ['corridorM', 'n'], ['createdBy', 's'], ['createdTs', 'n'], ['updatedTs', 'n'], ['startedTs', 'n'], ['endedTs', 'n'], ['tokenHash', 's'], ['tokenExp', 'n'], ['lastTs', 'n'], ['lastLat', 'n'], ['lastLng', 'n'], ['lastAcc', 'n'], ['lastDist', 'n'], ['offCount', 'n'], ['lastStoredTs', 'n'], ['lastState', 's']];
  C.SCHEMA.FleetPings = [['id', 's'], ['routeId', 's'], ['ts', 'n'], ['lat', 'n'], ['lng', 'n'], ['acc', 'n'], ['dist', 'n'], ['state', 's']];
  C.SCHEMA.FleetAlerts = [['id', 's'], ['ts', 'n'], ['routeId', 's'], ['traderId', 's'], ['type', 's'], ['status', 's'], ['lat', 'n'], ['lng', 'n'], ['acc', 'n'], ['dist', 'n'], ['reason', 's'], ['resolvedBy', 's'], ['resolvedTs', 'n'], ['note', 's']];
  C.SCHEMA.FleetNotes = [['id', 's'], ['ts', 'n'], ['toStaffId', 's'], ['toRoute', 's'], ['kind', 's'], ['title', 's'], ['body', 's'], ['routeId', 's'], ['alertId', 's'], ['read', 'n']];
  C.SCHEMA.FleetDevices = [['id', 's'], ['ts', 'n'], ['ownerKind', 's'], ['ownerId', 's'], ['token', 's'], ['platform', 's']];
  /* موافقة السائق على التتبع: صف واحد لكل خط (المفتاح = رقم الخط). تغيير نص الموافقة يرفع رقم الإصدار فتُطلب من جديد */
  C.SCHEMA.FleetConsents = [['id', 's'], ['ts', 'n'], ['ver', 's'], ['traderId', 's']];
  C.FLEET_CONSENT_VER = 'v1';

  /* قيم افتراضية؛ تُغيَّر من ورقة Config بالمفاتيح fleet.* و push.* */
  C.CONFIG.fleet = Object.assign({
    corridorM: 150,            // عرض الممر المسموح حول الخط بالمتر
    offConfirm: 2,             // عدد النبضات المتتالية خارج الممر قبل إصدار التنبيه (يمنع الإنذار الكاذب من GPS)
    trackEverySec: 60,         // كل كم ثانية تُحفظ نقطة في سجل الحركة (والطوارئ 15 ثانية)
    pingMinSec: 8,             // أقل فاصل بين نبضتين تُحفظان
    staleMin: 10,              // بعد كم دقيقة بدون إشارة يظهر السائق «بلا إشارة»
    tokenHours: 72,            // صلاحية رابط الخط بالساعات
    center: [30.0444, 31.2357],
    zoom: 6,
    hotline: '',               // رقم المسؤول المباشر يظهر للسائق عند الطوارئ
    linkBase: '',              // رابط صفحة السائق (GitHub Pages غالبًا). فارغ = رابط التطبيق العام
    reasons: ['عطل في العربية', 'حادثة', 'مريض أو إصابة', 'ضياع في الطريق', 'أخرى'],
    retainDays: 90             // مدة الاحتفاظ بنقاط الحركة بالأيام، ثم تُحذف تلقائيًا (0 = بلا حذف)
  }, C.CONFIG.fleet || {});
  C.CONFIG.push = Object.assign({ relayUrl: '' }, C.CONFIG.push || {});   // سرّ الخادم الخارجي في Script Properties، لا في الجدول

  /* ---------- هندسة: المسافة من نقطة إلى الخط (تقريب مستوٍ محلي، دقيق للمسافات القصيرة) ---------- */
  var EARTH = 6371000, DEG = Math.PI / 180;
  function distPointSeg(p, a, b) {
    var k = EARTH * DEG, c = Math.cos(p.lat * DEG);
    var ax = (a.lng - p.lng) * k * c, ay = (a.lat - p.lat) * k;
    var bx = (b.lng - p.lng) * k * c, by = (b.lat - p.lat) * k;
    var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    var t = len2 ? -(ax * dx + ay * dy) / len2 : 0;      // موضع أقرب نقطة على AB (الموقع عند الأصل)
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var cx = ax + t * dx, cy = ay + t * dy;
    return Math.sqrt(cx * cx + cy * cy);
  }
  function distToRoute(p, pts) {
    if (!pts || !pts.length) return Infinity;
    if (pts.length === 1) return distPointSeg(p, pts[0], pts[0]);
    var best = Infinity;
    for (var i = 0; i + 1 < pts.length; i++) { var d = distPointSeg(p, pts[i], pts[i + 1]); if (d < best) best = d; }
    return best;
  }
  C.fleetGeo = { distToRoute: distToRoute, distPointSeg: distPointSeg };

  var ACTIVE = { planned: 1, active: 1, off_route: 1, emergency: 1 };
  var LIVE = { active: 1, off_route: 1, emergency: 1 };   // الرحلة جارية وتستقبل النبضات

  /* ctx من createService: store, env, cfg, err, now, can, log, jparse, liveTraders */
  C.fleetActions = function (ctx) {
    var store = ctx.store, env = ctx.env, cfg = ctx.cfg, err = ctx.err, now = ctx.now, can = ctx.can, log = ctx.log, jparse = ctx.jparse, liveTraders = ctx.liveTraders;
    function fc() { return cfg().fleet || C.CONFIG.fleet; }
    function need(s, key) { if (!can(s, key)) throw err('perm', 'الصلاحية غير كافية'); }
    function rid(prefix) { return prefix + env.randHex(5).toUpperCase(); }
    /* موافقة السائق على التتبع لهذا الخط (بالإصدار الحالي من النص) */
    function consentOf(r) { var c = store.find('FleetConsents', function (x) { return x.id === r.id; }); return c && c.ver === C.FLEET_CONSENT_VER ? c : null; }
    function giveConsent(r) {
      var t = now(), c = store.find('FleetConsents', function (x) { return x.id === r.id; });
      if (c) store.update('FleetConsents', r.id, { ts: t, ver: C.FLEET_CONSENT_VER, traderId: r.traderId });
      else store.insert('FleetConsents', { id: r.id, ts: t, ver: C.FLEET_CONSENT_VER, traderId: r.traderId });
    }

    function cleanPoints(list) {
      if (!Array.isArray(list) || list.length < 2 || list.length > 60) throw err('points', 'الخط لازم يكون فيه نقطتين على الأقل، وحد أقصى 60 نقطة');
      return list.map(function (p, i) {
        var lat = Number(p && p.lat), lng = Number(p && p.lng);
        if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw err('points', 'إحداثيات النقطة ' + (i + 1) + ' غير صحيحة');
        return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), name: U.cleanText(String((p && p.name) || ('محطة ' + (i + 1))), 40) || ('محطة ' + (i + 1)) };
      });
    }
    /* موقع الهاتف: الدقة الأسوأ من 1000 متر مرفوضة، والدقة المفقودة تُعامل كـ 100 متر */
    function fixOf(p) {
      var lat = Number(p && p.lat), lng = Number(p && p.lng), acc = Number(p && p.acc);
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      if (!isFinite(acc) || acc < 0) acc = 100;
      if (acc > 1000) return null;
      return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.round(acc) };
    }
    function tokenHashOf(token) { return U.hmacHex(env.secret(), 'route:' + String(token)); }
    function routeOf(token) {
      var t = String(token || '');
      if (t.length < 16 || t.length > 80) throw err('auth', 'الرابط غير صالح');
      var h = tokenHashOf(t);
      var r = store.find('FleetRoutes', function (x) { return x.tokenHash === h; });
      if (!r || r.status === 'cancelled' || !r.tokenExp || now() > Number(r.tokenExp)) throw err('auth', 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من المشرف');
      return r;
    }
    function routeById(id) { return store.find('FleetRoutes', function (x) { return x.id === id; }); }
    function traderOf(r) { return store.find('Traders', function (x) { return x.id === r.traderId; }); }
    function isStale(r) { return !!(LIVE[r.status] && r.lastTs && now() - Number(r.lastTs) > Number(fc().staleMin) * 60000); }

    /* الشكل الذي يراه المشرف (فيه اسم التاجر ولوحته) */
    function staffView(r) {
      var pts = jparse(r.points, []), t = traderOf(r);
      return {
        id: r.id, title: r.title, status: r.status, traderId: r.traderId, traderName: t ? t.name : '—', plate: t ? (t.plate || '') : '',
        points: pts, corridorM: Number(r.corridorM) || fc().corridorM, startedTs: Number(r.startedTs) || 0, endedTs: Number(r.endedTs) || 0,
        tokenValid: !!(r.tokenHash && r.tokenExp && now() <= Number(r.tokenExp) && ACTIVE[r.status]),
        lastTs: Number(r.lastTs) || 0, lastLat: Number(r.lastLat) || 0, lastLng: Number(r.lastLng) || 0, lastAcc: Number(r.lastAcc) || 0,
        lastDist: Number(r.lastDist) || 0, offCount: Number(r.offCount) || 0, stale: isStale(r)
      };
    }
    /* الشكل الذي يراه السائق: بلا بيانات التاجر ولا المشرفين */
    function driverView(r, alert) {
      var pts = jparse(r.points, []);
      return {
        id: r.id, title: r.title, status: r.status, stops: pts.map(function (p) { return p.name; }), points: pts,
        corridorM: Number(r.corridorM) || fc().corridorM, startedTs: Number(r.startedTs) || 0, endedTs: Number(r.endedTs) || 0,
        lastDist: Number(r.lastDist) || 0, serverTs: now(),
        alert: alert ? { type: alert.type, ts: Number(alert.ts) || 0, reason: alert.reason || '' } : null
      };
    }
    function openAlertOf(routeId, type) {
      return store.find('FleetAlerts', function (a) { return a.routeId === routeId && a.status === 'open' && (!type || a.type === type); });
    }

    /* ---------- الإشعارات ---------- */
    function fleetStaff() { return store.filter('Staff', function (s) { return Number(s.active) && can(s, 'fleet'); }); }
    function devicesOf(kind, ids) {
      return store.filter('FleetDevices', function (d) { return d.ownerKind === kind && ids.indexOf(d.ownerId) >= 0; });
    }
    /* الإرسال: أولًا Firebase مباشرة إن ضُبط FCM_SERVICE_ACCOUNT، ثم خادم الدفع الخارجي إن ضُبط push.relayUrl.
       لا يحمل أي رقم هاتف ولا رمز خط. الجهاز الذي يرفض Firebase رمزه (لم يعد مسجّلًا) يُفرَّغ رمزه ولا يُرسل له بعد ذلك */
    function pushTo(devs, title, body, data) {
      var list = devs.filter(function (d) { return d.token; });
      if (!list.length) return 0;
      var sent = 0, urgent = !!(data && data.kind === 'alert_sos');
      var tag = data && data.routeId ? 'route-' + data.routeId : 'c3a-general';
      if (env.fcmReady && env.fcmSend && env.fcmReady()) {
        try {
          var batch = list.slice(0, C.fcm.MAX_BATCH);
          var msgs = batch.map(function (d) {
            return C.fcm.message(d.token, { title: title, body: body, data: data || {}, priority: urgent ? 'high' : 'normal', tag: tag });
          });
          var res = env.fcmSend(msgs) || [];
          res.forEach(function (r, i) {
            if (!r) return;
            if (r.ok) sent++;
            else if (r.unregistered) store.update('FleetDevices', batch[i].id, { token: '' });
          });
        } catch (e) { if (env.onError) env.onError(e); }
      }
      var c = cfg().push || {};
      if (c.relayUrl && env.push) {
        try {
          env.push(String(c.relayUrl), env.pushAuth ? String(env.pushAuth() || '') : '', {
            tokens: list.map(function (d) { return d.token; }), title: title, body: body, data: data || {}, priority: urgent ? 'high' : 'normal'
          });
          sent += list.length;
        } catch (e) { /* ignore: الرسالة تبقى داخل التطبيق والبريد */ }
      }
      return sent;
    }
    function notifyFleet(title, body, meta) {
      var list = fleetStaff(), t = now();
      list.forEach(function (s) {
        store.insert('FleetNotes', { id: rid('N'), ts: t, toStaffId: s.id, toRoute: '', kind: meta.kind, title: title, body: body, routeId: meta.routeId || '', alertId: meta.alertId || '', read: 0 });
      });
      var emails = [];
      list.forEach(function (s) { if (s.email && emails.indexOf(s.email) < 0) emails.push(s.email); });
      if (emails.length && env.notify) { try { env.notify(emails, '[' + cfg().appName + '] ' + title, body); } catch (e) { /* البريد اختياري */ } }
      pushTo(devicesOf('staff', list.map(function (s) { return s.id; })), title, body, meta);
    }
    function noteRoute(r, kind, title, body) {
      store.insert('FleetNotes', { id: rid('N'), ts: now(), toStaffId: '', toRoute: r.id, kind: kind, title: title, body: body, routeId: r.id, alertId: '', read: 0 });
      pushTo(devicesOf('route', [r.id]), title, body, { kind: kind, routeId: r.id });
    }
    function notesForRoute(routeId, n) {
      return store.filter('FleetNotes', function (x) { return x.toRoute === routeId; })
        .sort(function (a, b) { return b.ts - a.ts; }).slice(0, n).map(function (x) { return { id: x.id, ts: x.ts, kind: x.kind, title: x.title, body: x.body }; });
    }

    /* ---------- التنبيهات ---------- */
    function openAlert(r, type, f, dist, reason) {
      var id = rid('AL'), t = now();
      store.insert('FleetAlerts', { id: id, ts: t, routeId: r.id, traderId: r.traderId, type: type, status: 'open', lat: f ? f.lat : (Number(r.lastLat) || 0), lng: f ? f.lng : (Number(r.lastLng) || 0), acc: f ? f.acc : 0, dist: Math.round(dist || 0), reason: reason || '', resolvedBy: '', resolvedTs: 0, note: '' });
      var tr = traderOf(r), who = (tr ? tr.name : '') || r.title;
      if (type === 'emergency') {
        notifyFleet('طوارئ: ' + r.title, 'حالة طوارئ عند ' + who + ' — ' + reason + '. افتح تبويب «الأسطول» وتابع المكان.', { kind: 'alert_sos', routeId: r.id, alertId: id });
      } else {
        notifyFleet('خروج عن خط السير: ' + r.title, who + ' خرج عن الخط بحوالي ' + Math.round(dist || 0) + ' متر. افتح «الأسطول» لمتابعة المكان.', { kind: 'alert_off', routeId: r.id, alertId: id });
        noteRoute(r, 'alert_off', 'أنت خارج خط السير', 'ارجع للمسار المحدد. المشرف شايف مكانك دلوقتي.');
      }
      return id;
    }
    function closeAlerts(routeId, type, status, note, by) {
      var t = now(), n = 0;
      store.filter('FleetAlerts', function (a) { return a.routeId === routeId && a.type === type && a.status === 'open'; }).forEach(function (a) {
        store.update('FleetAlerts', a.id, { status: status, resolvedTs: t, resolvedBy: by || '', note: note || '' }); n++;
      });
      return n;
    }

    /* ---------- نبضة الموقع: قلب الخدمة ---------- */
    function applyPing(r, f) {
      var pts = jparse(r.points, []), corridor = Number(r.corridorM) || fc().corridorM, t = now();
      var d = distToRoute(f, pts), eff = Math.max(0, d - Math.min(f.acc, 100));
      var off = eff > corridor, state = off ? 'off' : 'ok';
      var lastTs = Number(r.lastTs) || 0, prevState = r.lastState || '';
      if (t - lastTs < Number(fc().pingMinSec) * 1000 && state === prevState) return { state: state, dist: Math.round(d), saved: false };

      var offCount = off ? (Number(r.offCount) || 0) + 1 : 0;
      var status = r.status;
      if (status === 'active' || status === 'off_route') status = offCount >= Number(fc().offConfirm || 2) ? 'off_route' : 'active';
      var patch = { lastTs: t, lastLat: f.lat, lastLng: f.lng, lastAcc: f.acc, lastDist: Math.round(d), offCount: offCount, lastState: state, updatedTs: t, status: status };

      var every = (status === 'emergency' ? 15 : Number(fc().trackEverySec)) * 1000;
      var stored = false;
      if (t - (Number(r.lastStoredTs) || 0) >= every || state !== prevState) {
        store.insert('FleetPings', { id: rid('P'), routeId: r.id, ts: t, lat: f.lat, lng: f.lng, acc: f.acc, dist: Math.round(d), state: state });
        patch.lastStoredTs = t; stored = true;
      }
      if (status === 'off_route' && r.status !== 'off_route') openAlert(r, 'off_route', f, eff, 'خارج الممر المسموح');
      if (r.status === 'off_route' && status === 'active') {
        closeAlerts(r.id, 'off_route', 'auto', 'عاد إلى خط السير', '');
        noteRoute(r, 'back_on_route', 'رجعت للخط', 'ممتاز، كمّل على نفس الخط.');
      }
      store.update('FleetRoutes', r.id, patch);
      return { state: state, dist: Math.round(d), saved: stored, status: status };
    }

    /* ---------- أفعال الدخول بالرابط (السائق) ---------- */
    var ROUTE = {
      routeGet: function (r) {
        var a = openAlertOf(r.id, '');
        return { route: driverView(r, a), notes: notesForRoute(r.id, 5), reasons: fc().reasons, hotline: fc().hotline || '', consent: { ok: !!consentOf(r), ver: C.FLEET_CONSENT_VER, retainDays: Number(fc().retainDays) || 0 } };
      },
      routeStart: function (r, p) {
        if (r.status === 'done') throw err('state', 'الرحلة انتهت بالفعل');
        if (!consentOf(r)) {
          if (!(p && p.consent === true)) throw err('consent', 'وافق على التتبع أولًا قبل بدء الرحلة');
          giveConsent(r);
        }
        var t = now(), patch = { status: r.status === 'planned' ? 'active' : r.status, startedTs: Number(r.startedTs) || t, updatedTs: t };
        store.update('FleetRoutes', r.id, patch);
        var fresh = routeById(r.id), f = fixOf(p);
        if (r.status === 'planned') log('', 'route_start', r.id, 0, { route: r.title });
        if (f && LIVE[fresh.status]) applyPing(fresh, f);
        return ROUTE.routeGet(routeById(r.id));
      },
      routePing: function (r, p) {
        if (!LIVE[r.status]) throw err('state', r.status === 'planned' ? 'لازم تبدأ الرحلة الأول' : 'الرحلة انتهت');
        if (!consentOf(r)) throw err('consent', 'وافق على التتبع من الشاشة أولًا');
        var f = fixOf(p);
        if (!f) throw err('pos', 'الموقع غير متاح، تأكد إن GPS شغال ومسموح للتطبيق');
        var res = applyPing(r, f);
        return { state: res.state, dist: res.dist, status: routeById(r.id).status, corridorM: Number(r.corridorM) || fc().corridorM };
      },
      routeEmergency: function (r, p) {
        if (r.status === 'done') throw err('state', 'الرحلة انتهت');
        var reasons = fc().reasons || [], reason = U.cleanText(String((p && p.reason) || ''), 60);
        if (reasons.indexOf(reason) < 0) reason = reasons[reasons.length - 1] || 'أخرى';
        var f = fixOf(p), t = now();
        var open = openAlertOf(r.id, 'emergency');
        if (open) {
          if (f) store.update('FleetAlerts', open.id, { lat: f.lat, lng: f.lng, acc: f.acc, ts: t });
          store.update('FleetRoutes', r.id, { status: 'emergency', lastTs: f ? t : r.lastTs, lastLat: f ? f.lat : r.lastLat, lastLng: f ? f.lng : r.lastLng, lastAcc: f ? f.acc : r.lastAcc, updatedTs: t, startedTs: Number(r.startedTs) || t });
          return { ok: true, alertId: open.id, repeated: true };
        }
        var fresh = routeById(r.id);
        store.update('FleetRoutes', r.id, { status: 'emergency', startedTs: Number(r.startedTs) || t, updatedTs: t, lastState: fresh.lastState || '', lastTs: f ? t : r.lastTs, lastLat: f ? f.lat : r.lastLat, lastLng: f ? f.lng : r.lastLng, lastAcc: f ? f.acc : r.lastAcc });
        if (f) store.insert('FleetPings', { id: rid('P'), routeId: r.id, ts: t, lat: f.lat, lng: f.lng, acc: f.acc, dist: Math.round(Number(r.lastDist) || 0), state: 'sos' });
        var alertId = openAlert(routeById(r.id), 'emergency', f, 0, reason);
        log('', 'route_sos', r.id, 0, { reason: reason, fix: !!f });
        return { ok: true, alertId: alertId, repeated: false, hotline: fc().hotline || '' };
      },
      routeEnd: function (r, p) {
        if (r.status === 'done') return { ok: true };
        var t = now(), f = fixOf(p);
        var hadEmergency = !!openAlertOf(r.id, 'emergency');
        store.update('FleetRoutes', r.id, { status: 'done', endedTs: t, updatedTs: t, lastState: '', lastTs: f ? t : r.lastTs, lastLat: f ? f.lat : r.lastLat, lastLng: f ? f.lng : r.lastLng });
        log('', 'route_end', r.id, 0, { emergencyOpen: hadEmergency });
        if (hadEmergency) notifyFleet('انتهت الرحلة والطوارئ ما زالت مفتوحة: ' + r.title, 'السائق أنهى الرحلة وتنبيه الطوارئ لم يُغلق بعد. تأكد من حالته ثم اضغط «تم الحل» في «الأسطول».', { kind: 'alert_sos', routeId: r.id, alertId: (openAlertOf(r.id, 'emergency') || {}).id || '' });
        return { ok: true };
      },
      routePushRegister: function (r, p) {
        var tok = String((p && p.token) || '');
        if (tok.length < 20 || tok.length > 4096) throw err('token', 'رمز الإشعارات غير صالح');
        var old = store.find('FleetDevices', function (d) { return d.ownerKind === 'route' && d.ownerId === r.id && d.token === tok; });
        if (!old) store.insert('FleetDevices', { id: rid('D'), ts: now(), ownerKind: 'route', ownerId: r.id, token: tok, platform: U.cleanText(String((p && p.platform) || 'web'), 12) });
        return { ok: true };
      }
    };

    /* ---------- أفعال المشرفين ---------- */
    function s_fleet(s) {
      need(s, 'fleet');
      var t = now(), rows = store.all('FleetRoutes'), out = [];
      rows.forEach(function (r) {
        var recent = (r.status === 'done' || r.status === 'cancelled') && Number(r.endedTs || r.updatedTs) > t - 12 * 3600000;
        if (ACTIVE[r.status] || recent) out.push(staffView(r));
      });
      var rank = { emergency: 0, off_route: 1, active: 2, planned: 3, done: 4, cancelled: 5 };
      out.sort(function (a, b) { return (rank[a.status] - rank[b.status]) || (b.lastTs - a.lastTs); });
      var alerts = store.filter('FleetAlerts', function (a) { return a.status === 'open'; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 50).map(function (a) {
        var r = routeById(a.routeId), tr = store.find('Traders', function (x) { return x.id === a.traderId; });
        return { id: a.id, ts: a.ts, routeId: a.routeId, routeTitle: r ? r.title : '', traderName: tr ? tr.name : '', type: a.type, lat: a.lat, lng: a.lng, acc: a.acc, dist: a.dist, reason: a.reason };
      });
      var stats = { active: 0, off: 0, emergency: 0, stale: 0, planned: 0 };
      out.forEach(function (x) { if (x.status === 'active') stats.active++; if (x.status === 'off_route') stats.off++; if (x.status === 'emergency') stats.emergency++; if (x.status === 'planned') stats.planned++; if (x.stale) stats.stale++; });
      var manage = can(s, 'fleet.manage');
      var traders = manage ? liveTraders().filter(function (x) { return x.status === 'active'; }).map(function (x) { return { id: x.id, name: x.name, plate: x.plate || '' }; }).slice(0, 400) : [];
      return { routes: out.slice(0, 80), alerts: alerts, stats: stats, canManage: manage, traders: traders, now: t, staleMin: Number(fc().staleMin), offConfirm: Number(fc().offConfirm), center: fc().center, zoom: fc().zoom, reasons: fc().reasons };
    }
    function s_track(s, p) {
      need(s, 'fleet');
      var id = String((p && p.routeId) || '');
      var pings = store.filter('FleetPings', function (x) { return x.routeId === id; }).sort(function (a, b) { return a.ts - b.ts; });
      return { routeId: id, pings: pings.slice(-200).map(function (x) { return { ts: x.ts, lat: x.lat, lng: x.lng, state: x.state }; }) };
    }
    function s_routeSave(s, p) {
      need(s, 'fleet.manage');
      var title = U.cleanText(String((p && p.title) || ''), 60);
      if (title.length < 3) throw err('title', 'اكتب اسم الخط (3 حروف على الأقل)');
      var points = cleanPoints(p && p.points);
      var corridor = Math.round(Number(p && p.corridorM) || fc().corridorM);
      if (corridor < 30 || corridor > 1000) throw err('corridor', 'عرض الممر بين 30 و 1000 متر');
      var t = now(), r = p && p.id ? routeById(String(p.id)) : null;
      if (r && (r.status === 'done' || r.status === 'cancelled')) throw err('state', 'الخط انتهى أو أُلغي ولا يُعدَّل');
      var tr = store.find('Traders', function (x) { return x.id === String((p && p.traderId) || ''); });
      if (!tr || tr.status !== 'active') throw err('trader', 'اختر تاجرًا فعّالًا للخط');
      if (r) {
        store.update('FleetRoutes', r.id, { title: title, points: JSON.stringify(points), corridorM: corridor, traderId: tr.id, updatedTs: t });
        log('', 'route_edit', r.id, 0, { by: s.id });
        return { route: staffView(routeById(r.id)) };
      }
      var id = rid('RT');
      store.insert('FleetRoutes', { id: id, title: title, status: 'planned', traderId: tr.id, points: JSON.stringify(points), corridorM: corridor, createdBy: s.id, createdTs: t, updatedTs: t });
      log('', 'route_new', id, 0, { by: s.id });
      return { route: staffView(routeById(id)) };
    }
    /* يُصدر رمزًا جديدًا ويبني رسالة واتساب جاهزة. الرمز القديم يتوقف فورًا */
    function s_routeShare(s, p) {
      need(s, 'fleet.manage');
      var r = routeById(String((p && p.id) || ''));
      if (!r || !ACTIVE[r.status]) throw err('nf', 'الخط غير موجود أو انتهى');
      var tr = traderOf(r);
      if (!tr || tr.status !== 'active') throw err('trader', 'تاجر الخط غير فعّال');
      var phone = U.normPhone(tr.phone);
      if (!phone) throw err('phone', 'رقم موبايل التاجر غير مسجّل');
      var token = env.randHex(16), t = now(), exp = t + Number(fc().tokenHours) * 3600000;
      store.update('FleetRoutes', r.id, { tokenHash: tokenHashOf(token), tokenExp: exp, updatedTs: t });
      var base = [fc().linkBase, cfg().appUrl, env.serviceUrl ? env.serviceUrl() : ''].map(function (x) { return String(x || ''); }).filter(function (x) { return /^https?:\/\//.test(x); })[0] || '';
      var link = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'r=' + token;
      var pts = jparse(r.points, []);
      var stops = pts.map(function (x, i) { return (i + 1) + ') ' + x.name; }).join('\n');
      var message = 'أهلًا ' + tr.name + '،\n' +
        'ده خط السير بتاعك من شركة كايرو ثري ايه: ' + r.title + '\n' +
        'المحطات:\n' + stops + '\n\n' +
        'افتح الرابط ده واضغط «ابدأ الرحلة»، وخلي الشاشة مفتوحة طول الطريق:\n' + link + '\n\n' +
        'لو حصلت أي مشكلة اضغط زر «طوارئ» في الصفحة فورًا.';
      log(tr.id, 'route_share', r.id, 0, { by: s.id });
      return { link: link, message: message, waPhone: '20' + phone.substring(1), waUrl: 'https://wa.me/20' + phone.substring(1) + '?text=' + encodeURIComponent(message), expiresTs: exp, traderName: tr.name };
    }
    function s_routeCancel(s, p) {
      need(s, 'fleet.manage');
      var r = routeById(String((p && p.id) || ''));
      if (!r || r.status === 'done' || r.status === 'cancelled') throw err('nf', 'الخط غير موجود أو انتهى');
      store.update('FleetRoutes', r.id, { status: 'cancelled', tokenHash: '', tokenExp: 0, updatedTs: now() });
      closeAlerts(r.id, 'off_route', 'auto', 'أُلغي الخط', s.id);
      /* تنبيه الطوارئ يبقى مفتوحًا حتى يتابعه أحد المسؤولين ويغلقه بنفسه */
      log('', 'route_cancel', r.id, 0, { by: s.id, emergencyOpen: !!openAlertOf(r.id, 'emergency') });
      return { ok: true };
    }
    function s_alertResolve(s, p) {
      need(s, 'fleet');
      var a = store.find('FleetAlerts', function (x) { return x.id === String((p && p.id) || ''); });
      if (!a) throw err('nf', 'التنبيه غير موجود');
      if (a.status !== 'open') return { ok: true, already: true };
      var t = now(), note = U.cleanText(String((p && p.note) || ''), 120);
      store.update('FleetAlerts', a.id, { status: 'resolved', resolvedBy: s.id, resolvedTs: t, note: note });
      var r = routeById(a.routeId);
      if (r) {
        var stillEmergency = !!openAlertOf(r.id, 'emergency');
        var next = r.status;
        if (a.type === 'emergency' && !stillEmergency) next = r.endedTs ? 'done' : (Number(r.startedTs) ? 'active' : 'planned');
        if (a.type === 'off_route' && r.status === 'off_route') next = 'active';
        if (next !== r.status) store.update('FleetRoutes', r.id, { status: next, updatedTs: t });
        noteRoute(r, 'resolved', 'تم التأكد من حالتك', 'المشرف تابع مكانك وحالتك. كمّل بأمان، وخلي الشاشة مفتوحة.');
      }
      log('', 'alert_resolve', a.id, 0, { by: s.id, type: a.type });
      return { ok: true };
    }
    function s_notes(s) {
      need(s, 'fleet');
      var list = store.filter('FleetNotes', function (x) { return x.toStaffId === s.id; }).sort(function (a, b) { return b.ts - a.ts; });
      return { list: list.slice(0, 40).map(function (x) { return { id: x.id, ts: x.ts, kind: x.kind, title: x.title, body: x.body, routeId: x.routeId, alertId: x.alertId, read: Number(x.read) ? 1 : 0 }; }), unread: list.filter(function (x) { return !Number(x.read); }).length };
    }
    function s_noteRead(s, p) {
      need(s, 'fleet');
      var ids = Array.isArray(p && p.ids) ? p.ids.map(String) : [];
      var n = 0;
      store.filter('FleetNotes', function (x) { return x.toStaffId === s.id && ids.indexOf(x.id) >= 0 && !Number(x.read); }).forEach(function (x) { store.update('FleetNotes', x.id, { read: 1 }); n++; });
      return { marked: n };
    }
    function s_pushRegister(s, p) {
      var tok = String((p && p.token) || '');
      if (tok.length < 20 || tok.length > 4096) throw err('token', 'رمز الإشعارات غير صالح');
      var old = store.find('FleetDevices', function (d) { return d.ownerKind === 'staff' && d.ownerId === s.id && d.token === tok; });
      if (!old) store.insert('FleetDevices', { id: rid('D'), ts: now(), ownerKind: 'staff', ownerId: s.id, token: tok, platform: U.cleanText(String((p && p.platform) || 'web'), 12) });
      return { ok: true };
    }

    var STAFF = {
      sFleet: s_fleet, sTrack: s_track, sRouteSave: s_routeSave, sRouteShare: s_routeShare, sRouteCancel: s_routeCancel,
      sAlertResolve: s_alertResolve, sNotes: s_notes, sNoteRead: s_noteRead, sPushRegister: s_pushRegister
    };
    return { ROUTE: ROUTE, STAFF: STAFF, routeOf: routeOf };
  };
})(C3A);
