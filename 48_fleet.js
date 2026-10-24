/* ============================================================
   أسطول التجار: تبويب «الأسطول» للمشرفين (خريطة + خطوط + طوارئ)،
   شاشة السائق بالرابط (تتبّع وطوارئ بضغطة)، وإشعارات داخل التطبيق
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, $ = A.$, call = A.call, H = A.handlers;
  var W = window;
  S.fl = S.fl || { data: null, sel: '', track: null, trackRoute: '', draft: null, addMode: false, seenAlerts: {}, seenNotes: {}, timer: null, notesTimer: null, ac: null, first: true };
  S.fl.notes = S.fl.notes || { list: [], unread: 0 };

  /* عند الخروج: نوقف المؤقتات ونفرّغ الحالة كلها حتى لا يرى المشرف التالي بيانات من كان قبله */
  A.fleetReset = function () {
    try { clearInterval(S.fl.timer); clearInterval(S.fl.notesTimer); } catch (e) { /* ignore */ }
    try { if (A.fleetMap && A.fleetMap.m) A.fleetMap.m.map.remove(); } catch (e) { /* ignore */ }
    A.fleetMap = null;
    S.fl = { data: null, sel: '', track: null, trackRoute: '', draft: null, addMode: false, seenAlerts: {}, seenNotes: {}, timer: null, notesTimer: null, ac: null, first: true, notes: { list: [], unread: 0 } };
  };

  var STAT = {
    planned: { t: 'لم تبدأ', c: '#8a8a8a', cls: '' }, active: { t: 'في الطريق', c: '#2E9E5B', cls: 'ok' },
    off_route: { t: 'خارج الخط', c: '#F2A900', cls: 'warn' }, emergency: { t: 'طوارئ', c: '#EA2329', cls: 'red' },
    done: { t: 'انتهت', c: '#242424', cls: 'dk' }, cancelled: { t: 'ملغاة', c: '#bbb', cls: '' }
  };
  function statOf(s) { return STAT[s] || STAT.planned; }
  function can(k) { return A.can ? A.can(k) : false; }
  function ago(ts) { return ts ? A.ago(ts) : '—'; }
  function num(n) { return A.num ? A.num(n) : String(n); }

  /* ---------- خريطة Leaflet تُحمَّل عند أول حاجة ---------- */
  var leafP = null;
  function loadLeaflet() {
    if (W.L) return Promise.resolve(W.L);
    if (leafP) return leafP;
    leafP = new Promise(function (res, rej) {
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
      document.head.appendChild(css);
      var js = document.createElement('script'); js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
      js.onload = function () { res(W.L); };
      js.onerror = function () { leafP = null; rej(new Error('leaflet')); };
      document.head.appendChild(js);
    });
    return leafP;
  }
  function makeMap(el, center, zoom) {
    var map = W.L.map(el, { zoomControl: true, attributionControl: true });
    W.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    map.setView(center, zoom);
    return { map: map, layer: W.L.layerGroup().addTo(map), fitted: false };
  }
  function mapHost(id, fallbackMsg, onReady) {
    var el = document.getElementById(id); if (!el) return;
    if (!W.L) {
      el.innerHTML = '<div class="mut sm" style="padding:14px">الخريطة بتتحمل… لو مفيش نت، القائمة تحت بتكفي.</div>';
      loadLeaflet().then(function () { mapHost(id, fallbackMsg, onReady); }).catch(function () { el.innerHTML = '<div class="mut sm" style="padding:14px">' + esc(fallbackMsg) + '</div>'; });
      return;
    }
    return onReady(el);
  }

  /* ============ تبويب المشرف ============ */
  function flStats(d) {
    var s = d.stats;
    return '<div class="fl-chips">' +
      '<span class="chip ok">في الطريق ' + num(s.active) + '</span>' +
      '<span class="chip warn">خارج الخط ' + num(s.off) + '</span>' +
      '<span class="chip red">طوارئ ' + num(s.emergency) + '</span>' +
      '<span class="chip">بلا إشارة ' + num(s.stale) + '</span>' +
      '<span class="chip">لم تبدأ ' + num(s.planned) + '</span></div>';
  }
  function flSos(d) {
    var sos = d.alerts.filter(function (a) { return a.type === 'emergency'; });
    if (!sos.length) return '';
    return sos.map(function (a) {
      return '<div class="fl-sos"><div class="row" style="gap:10px;align-items:flex-start"><span class="fl-dot"></span><div class="grow"><b>طوارئ: ' + esc(a.traderName || a.routeTitle) + '</b>' +
        '<div class="sm">' + esc(a.reason || 'بدون سبب محدد') + ' · ' + ago(a.ts) + '</div>' +
        '<div class="xs mut ltr">' + Number(a.lat).toFixed(5) + ', ' + Number(a.lng).toFixed(5) + '</div></div></div>' +
        '<div class="grid2" style="margin-top:10px"><button class="btn sm gh" data-act="fl_sel" data-id="' + esc(a.routeId) + '">عرض على الخريطة</button><button class="btn sm ok" data-act="fl_resolve" data-id="' + esc(a.id) + '">تم الحل</button></div></div>';
    }).join('');
  }
  function flList(d) {
    if (!d.routes.length) return '<div class="card tc mut">مفيش خطوط نشطة دلوقتي.' + (d.canManage ? ' اضغط «خط سير جديد» وابدأ.' : '') + '</div>';
    return d.routes.map(function (r) {
      var st = statOf(r.status), ended = r.status === 'done' || r.status === 'cancelled';
      var seen = r.lastTs ? (r.stale ? 'بلا إشارة منذ ' + ago(r.lastTs) : 'آخر إشارة ' + ago(r.lastTs)) : (ended ? '' : 'لم يبدأ الإرسال');
      var sel = S.fl.sel === r.id ? ' fl-sel' : '';
      var off = r.status === 'off_route' ? '<div class="sm" style="color:var(--warn);font-weight:700;margin-top:6px">بعيد عن الخط ~' + num(r.lastDist) + ' متر</div>' : '';
      var btns = '<button class="btn xs gh" data-act="fl_sel" data-id="' + esc(r.id) + '">على الخريطة</button>';
      if (d.canManage && !ended) btns += '<button class="btn xs dk" data-act="fl_share" data-id="' + esc(r.id) + '">' + ic('share', 'sm') + 'واتساب</button>';
      if (d.canManage && (r.status === 'planned' || r.status === 'active')) btns += '<button class="btn xs gh" data-act="fl_edit" data-id="' + esc(r.id) + '">تعديل</button>';
      if (d.canManage && !ended) btns += '<button class="btn xs gh" data-act="fl_cancel" data-id="' + esc(r.id) + '">إلغاء</button>';
      return '<div class="card fl-card' + sel + '"><div class="row" style="gap:10px;align-items:flex-start"><span class="fl-dot" style="background:' + st.c + '"></span><div class="grow"><b>' + esc(r.title) + '</b><div class="xs mut">' + esc(r.traderName) + (r.plate ? ' · ' + esc(r.plate) : '') + '</div><div class="xs mut">' + esc(seen) + '</div>' + off + '</div><span class="chip ' + st.cls + '">' + st.t + '</span></div>' +
        (d.canManage && !ended ? '<div class="xs mut" style="margin-top:8px">' + (r.tokenValid ? 'الرابط شغّال للتاجر' : 'لازم تبعت الرابط للتاجر على واتساب') + '</div>' : '') +
        '<div class="fl-btns">' + btns + '</div></div>';
    }).join('');
  }
  function flAlerts(d) {
    var list = d.alerts.filter(function (a) { return a.type !== 'emergency'; });
    if (!list.length) return '<div class="mut sm">مفيش تنبيهات خروج مفتوحة.</div>';
    return list.map(function (a) {
      return '<div class="card fl-card"><div class="row" style="gap:10px"><span class="fl-dot" style="background:#F2A900"></span><div class="grow"><b>خروج عن الخط: ' + esc(a.traderName || a.routeTitle) + '</b><div class="xs mut">بعيد ~' + num(a.dist) + ' متر · ' + ago(a.ts) + '</div></div></div><div class="fl-btns"><button class="btn xs gh" data-act="fl_sel" data-id="' + esc(a.routeId) + '">على الخريطة</button><button class="btn xs ok" data-act="fl_resolve" data-id="' + esc(a.id) + '">تم الحل</button></div></div>';
    }).join('');
  }
  function flBell() {
    var n = S.fl.notes.unread || 0;
    var perm = W.Notification ? Notification.permission : 'unsupported';
    var pbtn = perm === 'default' ? '<button class="btn xs gh" data-act="fl_notif">فعّل إشعارات الجهاز</button>' : (perm === 'granted' ? '<span class="xs mut">إشعارات الجهاز مفعّلة</span>' : '');
    return '<div class="row" style="gap:10px;margin:4px 0"><span class="chip' + (n ? ' red' : '') + '">' + ic('bell', 'sm') + ' ' + num(n) + ' جديد</span><div class="grow"></div>' + pbtn + '</div>';
  }

  A.STABS.splice(4, 0, { id: 'fleet', t: 'الأسطول', i: 'truck' });
  A.staffST.fleet = function () {
    var d = S.fl.data;
    if (!d) return '<div class="spin"></div>';
    var manage = d.canManage ? '<button class="btn dk" data-act="fl_new" style="margin:4px 0">' + ic('plus') + 'خط سير جديد</button>' : '';
    return flBell() + flStats(d) + '<div id="fl-sos">' + flSos(d) + '</div>' +
      '<div class="fl-mapbox"><div id="fmap" class="fmap"></div></div>' +
      '<div class="xs mut" style="margin:4px 2px">اضغط على النقطة الملوّنة لتعرف مكان التاجر. الخط الرمادي المتقطع هو خط السير.</div>' +
      manage + '<div class="sec-t">الخطوط</div><div id="fl-list">' + flList(d) + '</div>' +
      '<div class="sec-t">تنبيهات الخروج</div><div id="fl-alerts">' + flAlerts(d) + '</div>';
  };
  A.staffSP.fleet = function () {
    flStart(); mapFor('fmap', drawFleetMap);
    flLoad(true);
    if (S.fl.notes.list.length && S.fl.notes.unread) markNotesRead();
  };

  function mapFor(id, draw) {
    mapHost(id, 'الخريطة مش متاحة دلوقتي (محتاج إنترنت). القائمة تحت بتكفي.', function (el) {
      if (!A.fleetMap || A.fleetMap.el !== el) {
        if (A.fleetMap && A.fleetMap.m) { try { A.fleetMap.m.map.remove(); } catch (e) { /* ignore */ } }
        var c = (S.fl.data && S.fl.data.center) || [30.0444, 31.2357], z = (S.fl.data && S.fl.data.zoom) || 6;
        A.fleetMap = { el: el, m: makeMap(el, c, z) };
        A.fleetMap.m.map.on('click', function (e) { if (S.fl.addMode) flAddPoint(e.latlng); });
      }
      draw(A.fleetMap.m);
    });
  }
  function colorOfAlert(a) { return a.type === 'emergency' ? '#EA2329' : '#F2A900'; }
  function drawFleetMap(M) {
    var d = S.fl.data; if (!d || !W.L) return;
    M.layer.clearLayers();
    var bounds = [];
    d.routes.forEach(function (r) {
      var st = statOf(r.status), pts = (r.points || []).map(function (p) { return [p.lat, p.lng]; });
      if (pts.length > 1) W.L.polyline(pts, { color: '#8a8a8a', weight: 3, dashArray: '6 6', opacity: .85 }).addTo(M.layer);
      (r.points || []).forEach(function (p, i) {
        W.L.circleMarker([p.lat, p.lng], { radius: 4, color: '#555', weight: 1, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(esc((i + 1) + ') ' + p.name), { direction: 'top' }).addTo(M.layer);
        bounds.push([p.lat, p.lng]);
      });
      if (r.lastTs && (r.lastLat || r.lastLng)) {
        var mk = W.L.circleMarker([r.lastLat, r.lastLng], { radius: S.fl.sel === r.id ? 11 : 9, color: '#fff', weight: 2, fillColor: st.c, fillOpacity: 1 });
        mk.bindTooltip(esc(r.traderName + ' · ' + st.t + ' · ' + (r.stale ? 'بلا إشارة' : ago(r.lastTs))), { direction: 'top' });
        mk.on('click', function () { H.fl_sel({ dataset: { id: r.id } }); });
        mk.addTo(M.layer); bounds.push([r.lastLat, r.lastLng]);
      }
    });
    d.alerts.forEach(function (a) {
      if (a.lat || a.lng) W.L.circleMarker([a.lat, a.lng], { radius: 13, color: colorOfAlert(a), weight: 3, fillColor: '#fff', fillOpacity: .6 }).bindTooltip(esc((a.type === 'emergency' ? 'طوارئ: ' : 'خروج: ') + (a.traderName || a.routeTitle)), { direction: 'top' }).addTo(M.layer);
    });
    if (S.fl.track && S.fl.track.length > 1) {
      W.L.polyline(S.fl.track.map(function (p) { return [p.lat, p.lng]; }), { color: '#242424', weight: 4, opacity: .9 }).addTo(M.layer);
    }
    if (S.fl.draft) {
      var dp = S.fl.draft.points || [];
      if (dp.length > 1) W.L.polyline(dp.map(function (p) { return [p.lat, p.lng]; }), { color: '#EA2329', weight: 3 }).addTo(M.layer);
      dp.forEach(function (p, i) { W.L.circleMarker([p.lat, p.lng], { radius: 6, color: '#EA2329', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(esc((i + 1) + ') ' + p.name), { direction: 'top', permanent: false }).addTo(M.layer); bounds.push([p.lat, p.lng]); });
    }
    if (!M.fitted && bounds.length) { M.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 }); M.fitted = true; }
  }

  /* يحدّث أجزاء الصفحة دون إعادة رسم التبويب كله (حتى لا تضيع المدخلات) */
  function flPaint() {
    var d = S.fl.data; if (!d) return;
    var s = document.getElementById('fl-sos'); if (s) s.innerHTML = flSos(d);
    var l = document.getElementById('fl-list'); if (l) l.innerHTML = flList(d);
    var a = document.getElementById('fl-alerts'); if (a) a.innerHTML = flAlerts(d);
    var c = document.querySelector('#view .fl-chips'); if (c) c.outerHTML = flStats(d);
    if (A.fleetMap && document.getElementById('fmap') === A.fleetMap.el) drawFleetMap(A.fleetMap.m);
  }
  function flOnTab() { return S.stab === 'fleet' && !S.ssub && S.role === 'staff'; }
  function flLoad(quiet) {
    if (!can('fleet')) return Promise.resolve();
    return call('sFleet', {}, { quiet: !!quiet }).then(function (d) {
      if (!d) return;
      S.fl.data = d;
      d.alerts.forEach(function (a) {
        if (a.type === 'emergency' && !S.fl.seenAlerts[a.id]) { S.fl.seenAlerts[a.id] = 1; if (!S.fl.first) flAlarm('طوارئ: ' + (a.traderName || a.routeTitle), a.reason || 'تنبيه طوارئ من تاجر', 'alert_sos'); }
        else if (a.type !== 'emergency' && !S.fl.seenAlerts[a.id]) { S.fl.seenAlerts[a.id] = 1; if (!S.fl.first) flAlarm('خروج عن الخط: ' + (a.traderName || a.routeTitle), 'بعيد حوالي ' + num(a.dist) + ' متر', 'alert_off'); }
      });
      S.fl.first = false;
      if (!flOnTab()) return;
      if (!document.getElementById('fl-list')) { A.sView(true); mapFor('fmap', drawFleetMap); }   // أول تحميل: أعد رسم التبويب كله
      else flPaint();
      if (S.fl.sel && S.fl.trackRoute !== S.fl.sel) loadTrack(S.fl.sel);
    });
  }
  function loadTrack(id) {
    S.fl.trackRoute = id;
    return call('sTrack', { routeId: id }, { quiet: true }).then(function (t) {
      if (!t || S.fl.sel !== id) return;
      S.fl.track = t.pings; if (flOnTab()) mapFor('fmap', drawFleetMap);
    });
  }
  function flStart() {
    if (S.fl.timer) return;
    S.fl.timer = setInterval(function () {
      if (!flOnTab()) { clearInterval(S.fl.timer); S.fl.timer = null; return; }
      flLoad(true);
    }, 15000);
  }
  H.fl_sel = function (el) {
    var id = el.dataset.id;
    S.fl.sel = S.fl.sel === id ? '' : id;
    S.fl.track = null; S.fl.trackRoute = '';
    if (S.fl.sel) loadTrack(S.fl.sel);
    flPaint();
    var m = document.getElementById('fmap'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /* ---------- إنشاء الخط وتعديله ---------- */
  function draftFrom(r) {
    return { id: r ? r.id : '', title: r ? r.title : '', traderId: r ? r.traderId : '', corridorM: r ? r.corridorM : 150, points: r ? (r.points || []).map(function (p) { return { lat: p.lat, lng: p.lng, name: p.name }; }) : [] };
  }
  H.fl_new = function () { S.fl.draft = draftFrom(null); openRouteSheet(); };
  H.fl_edit = function (el) {
    var r = (S.fl.data.routes || []).filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!r) return;
    S.fl.draft = draftFrom(r); openRouteSheet();
  };
  function readDraft() {
    var dft = S.fl.draft || draftFrom(null), t = $('#fl_title'), tr = $('#fl_trader'), c = $('#fl_corr');
    if (t) dft.title = t.value;
    if (tr) dft.traderId = tr.value;
    if (c) dft.corridorM = Number(c.value) || 150;
    var names = document.querySelectorAll('[data-pn]');
    for (var i = 0; i < names.length; i++) { var k = Number(names[i].dataset.pn); if (dft.points[k]) dft.points[k].name = names[i].value; }
    S.fl.draft = dft; return dft;
  }
  function openRouteSheet() {
    var dft = S.fl.draft, d = S.fl.data || { traders: [] };
    var opts = '<option value="">اختر التاجر</option>' + d.traders.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === dft.traderId ? ' selected' : '') + '>' + esc(t.name) + (t.plate ? ' · ' + esc(t.plate) : '') + '</option>'; }).join('');
    var pts = dft.points.length ? dft.points.map(function (p, i) {
      return '<div class="fl-pt"><span class="fl-num">' + (i + 1) + '</span><input class="in grow" data-pn="' + i + '" value="' + esc(p.name) + '" maxlength="40">' +
        '<button class="ib" data-act="fl_pmove" data-i="' + i + '" data-d="-1" aria-label="أعلى">↑</button><button class="ib" data-act="fl_pmove" data-i="' + i + '" data-d="1" aria-label="أسفل">↓</button><button class="ib" data-act="fl_pdel" data-i="' + i + '" aria-label="حذف">✕</button></div>';
    }).join('') : '<div class="mut sm">مفيش نقط بعد. اضغط «أضف محطات على الخريطة» واضغط على كل محطة في الطريق بالترتيب.</div>';
    A.sheet('<h2>' + (dft.id ? 'تعديل خط السير' : 'خط سير جديد') + '</h2>' +
      '<label class="fld"><span>اسم الخط</span><input id="fl_title" class="in" maxlength="60" value="' + esc(dft.title) + '" placeholder="مثال: من البوابة لمزرعة 5"></label>' +
      '<label class="fld"><span>التاجر</span><select id="fl_trader" class="in">' + opts + '</select></label>' +
      '<label class="fld"><span>عرض الممر المسموح (متر)</span><input id="fl_corr" class="in ltr" type="number" min="30" max="1000" value="' + esc(dft.corridorM) + '"><span class="xs mut">لو السيارة خرجت عن الممر ده أكتر من المسموح، يطلع تنبيه.</span></label>' +
      '<div class="sec-t" style="margin-top:6px">المحطات بالترتيب (' + dft.points.length + ')</div><div class="fl-pts">' + pts + '</div>' +
      '<button class="btn gh" data-act="fl_addmode" style="margin-top:8px">' + ic('plus', 'sm') + 'أضف محطات على الخريطة</button>' +
      '<div class="grid2" style="margin-top:12px"><button class="btn dk" data-act="fl_save">حفظ الخط</button><button class="btn gh" data-act="closesheet">إلغاء</button></div>');
  }
  H.fl_pmove = function (el) {
    var dft = readDraft(), i = Number(el.dataset.i), j = i + Number(el.dataset.d);
    if (j < 0 || j >= dft.points.length) return;
    var t = dft.points[i]; dft.points[i] = dft.points[j]; dft.points[j] = t;
    S.fl.draft = dft; A.closeSheet(); openRouteSheet();
  };
  H.fl_pdel = function (el) {
    var dft = readDraft(); dft.points.splice(Number(el.dataset.i), 1);
    S.fl.draft = dft; A.closeSheet(); openRouteSheet();
  };
  H.fl_addmode = function () {
    readDraft(); S.fl.addMode = true; A.closeSheet();
    var bar = document.createElement('div'); bar.id = 'fl-addbar'; bar.className = 'fl-addbar';
    bar.innerHTML = '<span id="fl-addn">اضغط على المحطات بالترتيب على الخريطة</span><button class="btn sm ok" data-act="fl_adddone">تم</button>';
    document.body.appendChild(bar);
    var m = document.getElementById('fmap'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mapFor('fmap', drawFleetMap);
  };
  function flAddPoint(ll) {
    var dft = S.fl.draft || draftFrom(null), n = dft.points.length + 1;
    dft.points.push({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), name: 'محطة ' + n });
    S.fl.draft = dft;
    var lab = document.getElementById('fl-addn'); if (lab) lab.textContent = 'أضفت ' + n + ' محطة · اضغط المحطة التالية أو «تم»';
    if (A.fleetMap) drawFleetMap(A.fleetMap.m);
  }
  H.fl_adddone = function () {
    S.fl.addMode = false;
    var bar = document.getElementById('fl-addbar'); if (bar) bar.parentNode.removeChild(bar);
    openRouteSheet();
  };
  H.fl_save = function () {
    var dft = readDraft();
    var body = { id: dft.id || undefined, title: dft.title, traderId: dft.traderId, corridorM: dft.corridorM, points: dft.points };
    call('sRouteSave', body).then(function (d) {
      if (!d) return;
      S.fl.draft = null; A.closeSheet(); A.toast('اتحفظ الخط', 'ok');
      S.fl.sel = d.route.id; flLoad(true).then(function () { mapFor('fmap', drawFleetMap); });
    });
  };

  /* ---------- الشير على واتساب ---------- */
  H.fl_share = function (el) {
    call('sRouteShare', { id: el.dataset.id }).then(function (d) {
      if (!d) return;
      A.sheet('<h2>أرسل الخط لـ ' + esc(d.traderName) + '</h2>' +
        '<div class="xs mut" style="margin-bottom:8px">الرسالة جاهزة. اضغط «افتح واتساب» وابعتها للتاجر. الرابط صالح لحد ' + esc(new Date(d.expiresTs).toLocaleString('ar-EG')) + '.</div>' +
        '<textarea class="in" readonly rows="8" style="direction:rtl;font-size:14px" onclick="this.select()">' + esc(d.message) + '</textarea>' +
        '<div class="grid2" style="margin-top:12px"><a class="btn ok" href="' + esc(d.waUrl) + '" target="_blank" rel="noopener">' + ic('share', 'sm') + 'افتح واتساب</a><button class="btn gh" data-act="fl_copy" data-t="' + esc(d.link) + '">انسخ الرابط</button></div>' +
        '<div class="xs mut" style="margin-top:10px">لو الرابط اتبعت قبل كده، الرابط القديم بيتوقف فورًا.</div>');
      flLoad(true);
    });
  };
  H.fl_copy = function (el) {
    var t = el.dataset.t;
    try { navigator.clipboard.writeText(t).then(function () { A.toast('اتنسخ الرابط', 'ok'); }, function () { A.toast('انسخه يدويًا من الرسالة', ''); }); }
    catch (e) { A.toast('انسخه يدويًا من الرسالة', ''); }
  };
  H.fl_cancel = function (el) {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'تأكيد الإلغاء'; el.classList.replace('gh', 'dk'); setTimeout(function () { delete el.dataset.armed; el.textContent = 'إلغاء'; el.classList.replace('dk', 'gh'); }, 3500); return; }
    call('sRouteCancel', { id: el.dataset.id }).then(function (d) { if (d) { A.toast('اتلغى الخط', 'ok'); flLoad(true); } });
  };

  /* ---------- حل الطوارئ والتنبيهات ---------- */
  H.fl_resolve = function (el) {
    A.sheet('<h2>تم التأكد من السائق؟</h2><div class="xs mut" style="margin-bottom:8px">اكتب خلاصة سريعة: وصلت له؟ حصل إيه؟ هيتقفل التنبيه ويطمّن السائق.</div>' +
      '<textarea id="fl_note" class="in" rows="3" maxlength="120" placeholder="مثال: وصلنا له، عطل بسيط وتم إصلاحه"></textarea>' +
      '<div class="grid2" style="margin-top:12px"><button class="btn ok" data-act="fl_resolve_go" data-id="' + esc(el.dataset.id) + '">تم الحل وإغلاق التنبيه</button><button class="btn gh" data-act="closesheet">إلغاء</button></div>');
  };
  H.fl_resolve_go = function (el) {
    var n = $('#fl_note');
    call('sAlertResolve', { id: el.dataset.id, note: n ? n.value : '' }).then(function (d) {
      if (!d) return;
      A.closeSheet(); A.toast('اتقفل التنبيه والسائق اتطمّن', 'ok'); flLoad(true);
    });
  };
  H.fl_notif = function () {
    if (!W.Notification) return A.toast('المتصفح ده مش بيدعم إشعارات الجهاز', '');
    Notification.requestPermission().then(function (p) { if (flOnTab()) flPaint(); if (p === 'granted') { A.toast('الإشعارات اتفعّلت', 'ok'); if (A.webPushInit) A.webPushInit(); } });
  };

  /* ---------- تنبيه صوتي واهتزاز وإشعار الجهاز ---------- */
  function beep() {
    try {
      var AC = W.AudioContext || W.webkitAudioContext; if (!AC) return;
      var ctx = S.fl.ac || (S.fl.ac = new AC());
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.25;
      o.connect(g); g.connect(ctx.destination); o.start();
      setTimeout(function () { o.frequency.value = 660; }, 220); setTimeout(function () { try { o.stop(); } catch (e) { /* ignore */ } }, 600);
    } catch (e) { /* الصوت اختياري */ }
  }
  function flAlarm(title, body, kind) {
    beep();
    try { if (navigator.vibrate) navigator.vibrate(kind === 'alert_sos' ? [500, 200, 500, 200, 500] : [300, 150, 300]); } catch (e) { /* ignore */ }
    A.toast(title + ' — ' + body, kind === 'alert_sos' ? 'err' : '');
    try { if (W.Notification && Notification.permission === 'granted') new Notification(title, { body: body, tag: kind, renotify: true }); } catch (e) { /* ignore */ }
  }
  A.fleetAlarm = flAlarm;
  A.flOpenDraft = function () { openRouteSheet(); };   // للاختبار الآلي فقط

  /* ---------- الإشعارات الداخلية (تُستطلع كل 30 ثانية أثناء فتح التطبيق) ---------- */
  function loadNotes() {
    if (!can('fleet')) return;
    call('sNotes', {}, { quiet: true }).then(function (d) {
      if (!d) return;
      var fresh = [];
      d.list.forEach(function (n) { if (!S.fl.seenNotes[n.id]) { S.fl.seenNotes[n.id] = 1; if (!n.read && !S.fl.notesFirst) fresh.push(n); } });
      S.fl.notes = { list: d.list, unread: d.unread };
      S.fl.notesFirst = true;
      fresh.forEach(function (n) { if (n.kind !== 'resolved') flAlarm(n.title, n.body, n.kind); });
      if (S.stab === 'fleet' && S.role === 'staff') { var b = document.querySelector('#view .row .chip'); if (b) b.outerHTML = flBell(); }
      updateTabDot(d.unread);
    });
  }
  function markNotesRead() {
    var ids = S.fl.notes.list.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
    if (!ids.length) return;
    call('sNoteRead', { ids: ids }, { quiet: true }).then(function () { S.fl.notes.unread = 0; S.fl.notes.list.forEach(function (n) { n.read = 1; }); if (flOnTab()) flPaint(); updateTabDot(0); });
  }
  function updateTabDot(n) {
    var b = document.querySelector('nav.tabs button[data-id="fleet"]'); if (!b) return;
    var e = b.querySelector('.tdot'); if (e) e.remove();
    if (n) b.insertAdjacentHTML('beforeend', '<span class="tdot">' + n + '</span>');
  }
  A.fleetNotesStart = function () {
    if (A.pushSync) A.pushSync();
    if (S.fl.notesTimer || !can('fleet')) return;
    loadNotes();
    S.fl.notesTimer = setInterval(function () { if (S.role !== 'staff') { clearInterval(S.fl.notesTimer); S.fl.notesTimer = null; return; } loadNotes(); }, 30000);
  };

  /* ============ تسجيل جهاز الإشعارات (Firebase) ============
     تطبيق أندرويد الأصلي يحصل على رمز FCM ويعطيه للصفحة عبر window.ShareekNative.fcmToken() أو يستدعي
     window.ShareekOnPushToken(رمز). ثم تُسجَّل الرموز في الخادم لتصل الطوارئ والتنبيهات والتطبيق مغلق. */
  var PUSH = { token: '', lastSent: '' };
  function pushToken() {
    if (PUSH.token) return PUSH.token;
    try { var n = W.ShareekNative; if (n && typeof n.fcmToken === 'function') return String(n.fcmToken() || ''); } catch (e) { /* ignore */ }
    return '';
  }
  A.pushSync = function () {
    var t = pushToken();
    if (!t || t.length < 20 || t === PUSH.lastSent) return;
    if (S.role === 'staff' && can('fleet')) {
      call('sPushRegister', { token: t, platform: 'android' }, { quiet: true }).then(function (d) { if (d) PUSH.lastSent = t; });
    } else if (S.role === 'route' && A.routeMode) {
      A.rawCall('routePushRegister', { token: t, platform: 'android' }).then(function (d) { if (d) PUSH.lastSent = t; });
    }
  };
  W.ShareekOnPushToken = function (t) { PUSH.token = String(t || ''); PUSH.lastSent = ''; A.pushSync(); };

  /* تطبيق أندرويد: يتابع الموقع في الخلفية والشاشة مقفولة. على الويب لا يوجد الجسر فلا يحدث شيء */
  function nativeTrack(on) {
    try {
      var n = W.ShareekNative;
      if (!n) return;
      if (on && typeof n.startTracking === 'function' && S.tok) n.startTracking(String(S.tok), String(W.__API_URL || ''));
      if (!on && typeof n.stopTracking === 'function') n.stopTracking();
    } catch (e) { /* الجسر اختياري */ }
  }

  /* ============ شاشة السائق بالرابط ============ */
  var RT = null;
  function rtFix() { return RT && RT.pos ? { lat: RT.pos.lat, lng: RT.pos.lng, acc: RT.pos.acc } : null; }
  A.startRoute = function (token) {
    A.routeMode = true;
    S.tok = token; S.role = 'route'; S.booting = false;
    RT = { d: null, fatal: '', pos: null, gpsErr: '', watch: null, pingT: null, dataT: null, lastSent: 0, state: 'ok', dist: 0, reason: '', sheetOpen: false, endArmed: false, seenNotes: {}, notesReady: false, wake: null, offStart: 0, busy: false, sosDone: false, token: token, consentOk: false, consentGiven: false, resumed: false, savedTok: '' };
    A.screens.route();
    routeLoad();
    if (A.pushSync) A.pushSync();
    RT.dataT = setInterval(function () { routeLoad(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && RT) { wakeLock(); routeLoad(); if (RT.d && RT.d.route.status !== 'planned') sendPing(); } });
  };
  function routeLoad() {
    if (!RT || S.role !== 'route') return Promise.resolve();
    return A.rawCall('routeGet', {}).then(function (r) {
      if (!RT || S.role !== 'route') return;
      if (!r || !r.ok) {
        RT.fatal = r && r.err === 'auth' ? (r.msg || 'الرابط غير صالح أو انتهت صلاحيته، اطلب رابطًا جديدًا من المشرف') : 'تعذّر تحميل الخط، جرّب تحديث الصفحة';
        RT.d = null; A.screens.route(); return;
      }
      RT.d = r.data; RT.fatal = '';
      RT.consentOk = !!(r.data.consent && r.data.consent.ok);
      /* الرحلة النشطة تُحفظ مشفّرة على الجهاز ليكمل السائق بعد إغلاق التطبيق، وتُمسح عند انتهائها */
      if (RT.token && RT.savedTok !== RT.token) {
        RT.savedTok = RT.token;
        if (['done', 'cancelled'].indexOf(r.data.route.status) >= 0) A.secClear('c3a_route'); else A.secSave('c3a_route', RT.token);
      }
      if (RT.consentOk && ['active', 'off_route', 'emergency'].indexOf(r.data.route.status) >= 0 && !RT.resumed) { RT.resumed = true; resumeTrip(); }
      r.data.notes.forEach(function (n) {
        if (RT.seenNotes[n.id]) return;
        RT.seenNotes[n.id] = 1;
        if (RT.notesReady) { beep(); A.toast(n.title + ' — ' + n.body, n.kind === 'resolved' ? 'ok' : 'err'); try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { /* ignore */ } }
      });
      RT.notesReady = true;
      A.screens.route();
    });
  }
  /* استئناف الرحلة بعد إعادة فتح التطبيق: الموقع والنبضات وتتبع الخلفية في الأندرويد */
  function resumeTrip() {
    gpsStart(); startTimers(); nativeTrack(true);
    A.toast('رجعنا الرحلة من حيث وقفت. الموقع بيتبعت تلقائي', 'ok');
  }
  function gpsStart() {
    if (!navigator.geolocation) { RT.gpsErr = 'الموبايل ده مش بيدعم تحديد الموقع'; return; }
    if (RT.watch != null) return;
    RT.watch = navigator.geolocation.watchPosition(function (p) {
      RT.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy || 100, ts: Date.now() };
      RT.gpsErr = ''; updateGpsLine();
    }, function (e) {
      RT.gpsErr = e && e.code === 1 ? 'الموقع مقفول. اسمح للمتصفح بالوصول للموقع من إعدادات الموبايل، وبعدين اضغط تحديث' : 'الموقع مش متاح دلوقتي، هنحاول تاني';
      updateGpsLine();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function waitFix(ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() { if (RT.pos && Date.now() - RT.pos.ts < 30000) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(tick, 800); })();
    });
  }
  function wakeLock() {
    try { if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then(function (l) { RT.wake = l; }, function () { /* اختياري */ }); } catch (e) { /* ignore */ }
  }
  /* شاشة الموافقة على التتبع: تظهر قبل أول بدء للرحلة، ولأي رحلة قديمة بلا موافقة. الطوارئ لا تحتاجها */
  function openConsent(mode) {
    var days = (RT.d && RT.d.consent && RT.d.consent.retainDays) || 0;
    A.sheet('<h2>قبل ما تبدأ الرحلة</h2>' +
      '<div class="col sm" style="gap:8px;margin-bottom:12px">' +
      '<div>• الرحلة دي بتتبع مكانك عشان المشرف يتأكد إنك على الخط، ويلحقك لو حصلت لك مشكلة.</div>' +
      '<div>• الموقع بيتبعت كل 15 ثانية تقريبًا، وبس وانت في الرحلة.</div>' +
      '<div>• اللي يشوف مكانك هم المشرفين والمدير المسؤولين عن الأسطول بس.</div>' +
      '<div>• ' + (days ? 'نقط الحركة بتتمسح تلقائيًا بعد ' + days + ' يوم.' : 'نقط الحركة بتتحفظ للمراجعة وبتتمسح حسب سياسة الإدارة.') + ' الخط نفسه والتنبيهات بيفضلوا محفوظين.</div>' +
      '<div>• زر الطوارئ بيبعت مكانك مرة واحدة حتى لو مش موافق على التتبع.</div>' +
      '<div>• التتبع بيقف أول ما تنهي الرحلة.</div>' +
      '<div>• لو مش موافق، ماتبدأش الرحلة من التطبيق، وكلّم المشرف.</div></div>' +
      '<button class="btn" data-act="rt_consent_ok" data-m="' + mode + '">أوافق وأكمل</button>' +
      '<button class="btn gh" style="margin-top:8px" data-act="closesheet">مش دلوقتي</button>');
  }
  H.rt_consent_open = function () { openConsent('live'); };
  H.rt_consent_ok = function (el) {
    RT.consentGiven = true; A.closeSheet();
    if (el.dataset.m === 'start') return H.rt_start();
    A.rawCall('routeStart', Object.assign({}, rtFix() || {}, { consent: true })).then(function (r) {
      if (!r || !r.ok) { A.toast((r && r.msg) || 'تعذّر تسجيل الموافقة', 'err'); return; }
      RT.consentOk = true; RT.resumed = true; resumeTrip(); routeLoad();
    });
  };
  H.rt_start = function (el) {
    if (!RT.consentOk && !RT.consentGiven) return openConsent('start');
    if (RT.busy) return; RT.busy = true; if (el) el.disabled = true;
    gpsStart(); wakeLock();
    waitFix(20000).then(function (ok) {
      RT.busy = false;
      if (!ok) { RT.gpsErr = RT.gpsErr || 'مش قادر أحدد الموقع. اتأكد إن GPS شغال وإن الشاشة مفتوحة واضغط ابدأ تاني'; A.screens.route(); return; }
      return A.rawCall('routeStart', Object.assign({}, rtFix() || {}, { consent: true })).then(function (r) {
        if (!r || !r.ok) { A.toast((r && r.msg) || 'تعذّر بدء الرحلة', 'err'); return; }
        RT.d = r.data; startTimers(); A.toast('بدأت الرحلة. الموقع بيتبعت تلقائي', 'ok');
        nativeTrack(true);
        A.screens.route(); drawDriverMap();
      });
    });
  };
  function startTimers() {
    if (RT.pingT) return;
    RT.pingT = setInterval(sendPing, 15000);
    setTimeout(sendPing, 1500);
  }
  function sendPing() {
    if (!RT || S.role !== 'route' || !RT.d || ['active', 'off_route', 'emergency'].indexOf(RT.d.route.status) < 0) return;
    var f = rtFix();
    if (!f || Date.now() - RT.pos.ts > 90000) { RT.gpsErr = 'الموقع قديم. تأكد إن GPS شغال والشاشة مفتوحة'; updateGpsLine(); return; }
    A.rawCall('routePing', f).then(function (r) {
      if (!r) return;
      if (!r.ok) { if (r.err === 'state' || r.err === 'consent') routeLoad(); return; }
      var prev = RT.state;
      RT.state = r.data.state; RT.dist = r.data.dist; RT.lastSent = Date.now(); RT.gpsErr = '';
      if (RT.state === 'off' && prev !== 'off') { beep(); try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { /* ignore */ } }
      if (r.data.status !== RT.d.route.status) routeLoad();
      else updateGpsLine();
      drawDriverMap();
    });
  }
  function updateGpsLine() { var el = document.getElementById('rt-gps'); if (el) el.innerHTML = gpsLine(); }
  function gpsLine() {
    if (RT.gpsErr) return '<span class="warn-t">' + esc(RT.gpsErr) + '</span>';
    if (!RT.lastSent) return '<span class="mut">بيتبع الموقع…</span>';
    var s = Math.round((Date.now() - RT.lastSent) / 1000);
    return '<span class="ok-t">الموقع اتبعت</span> <span class="mut">منذ ' + (s < 60 ? s + ' ثانية' : Math.round(s / 60) + ' دقيقة') + '</span>';
  }
  H.rt_reason = function (el) { RT.reason = el.dataset.r; document.querySelectorAll('[data-act="rt_reason"]').forEach(function (b) { b.classList.toggle('sel', b.dataset.r === RT.reason); }); };
  H.rt_sos_open = function () {
    var reasons = (RT.d && RT.d.reasons) || ['أخرى'];
    RT.reason = RT.reason || reasons[0];
    RT.sheetOpen = true;
    A.sheet('<h2>طوارئ — بلّغ المسؤول</h2><div class="xs mut" style="margin-bottom:10px">هيوصل التنبيه للمشرفين فورًا ومعاه مكانك. اختار السبب:</div>' +
      '<div class="fl-chips">' + reasons.map(function (x) { return '<button class="chip' + (x === RT.reason ? ' sel' : '') + '" data-act="rt_reason" data-r="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<button class="btn gh" data-act="rt_sos_go" style="margin-top:14px;background:var(--red);color:#fff;border:0">أرسل الطوارئ الآن</button>' +
      (RT.d && RT.d.hotline ? '<a class="btn dk" href="tel:' + esc(RT.d.hotline) + '" style="margin-top:8px">اتصل بالمسؤول: ' + esc(RT.d.hotline) + '</a>' : '') +
      '<div class="xs mut" style="margin-top:10px">لو الوضع خطر عليك، ابعد عن الخطر الأول. الطوارئ مش بتوقف التتبع.</div>');
  };
  H.rt_sos_go = function () {
    var f = rtFix() || { lat: 0, lng: 0, acc: 1000 };
    if (!rtFix()) { A.toast('الموقع مش متاح، هيتبعت التنبيه من غير مكان دقيق', 'err'); }
    A.rawCall('routeEmergency', Object.assign({}, f, { reason: RT.reason })).then(function (r) {
      if (!r || !r.ok) { A.toast((r && r.msg) || 'تعذّر إرسال الطوارئ، كلّم المسؤول بالتليفون فورًا', 'err'); return; }
      RT.sosDone = true; A.closeSheet(); A.toast('اتبعتت الطوارئ. المسؤول شايف مكانك', 'ok');
      startTimers();
      routeLoad();
    });
  };
  H.rt_end = function (el) {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'تأكيد إنهاء الرحلة'; setTimeout(function () { delete el.dataset.armed; el.textContent = 'إنهاء الرحلة'; }, 3500); return; }
    var f = rtFix() || {};
    A.rawCall('routeEnd', f).then(function (r) {
      if (!r || !r.ok) { A.toast((r && r.msg) || 'تعذّر إنهاء الرحلة', 'err'); return; }
      nativeTrack(false);
      clearInterval(RT.pingT); RT.pingT = null;
      if (RT.watch != null) { navigator.geolocation.clearWatch(RT.watch); RT.watch = null; }
      A.toast('الرحلة اتقفلت. شكرًا', 'ok'); routeLoad();
    });
  };
  H.rt_refresh = function () { gpsStart(); routeLoad(); if (RT.d && RT.d.route.status !== 'planned') sendPing(); };

  var drawn = null;
  function drawDriverMap() {
    if (!RT || !RT.d || !document.getElementById('rmap')) return;
    mapHost('rmap', 'الخريطة مش متاحة دلوقتي. الخط موجود في القائمة.', function (el) {
      if (!drawn || drawn.el !== el) {
        if (drawn && drawn.m) { try { drawn.m.map.remove(); } catch (e) { /* ignore */ } }
        drawn = { el: el, m: makeMap(el, [30.0444, 31.2357], 12), me: null, fitted: false };
      }
      var M = drawn.m; M.layer.clearLayers();
      var pts = (RT.d.route.points || []).map(function (p) { return [p.lat, p.lng]; }), bounds = pts.slice();
      if (pts.length > 1) W.L.polyline(pts, { color: '#EA2329', weight: 4, opacity: .85 }).addTo(M.layer);
      (RT.d.route.points || []).forEach(function (p, i) { W.L.circleMarker([p.lat, p.lng], { radius: 6, color: '#242424', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(esc((i + 1) + ') ' + p.name), { direction: 'top' }).addTo(M.layer); });
      if (RT.pos) { W.L.circleMarker([RT.pos.lat, RT.pos.lng], { radius: 9, color: '#fff', weight: 3, fillColor: RT.state === 'off' ? '#F2A900' : '#2E9E5B', fillOpacity: 1 }).bindTooltip('أنت هنا').addTo(M.layer); bounds.push([RT.pos.lat, RT.pos.lng]); }
      if (!M.fitted && bounds.length) { M.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 }); M.fitted = true; }
    });
  }

  A.screens.route = function () {
    var app = $('#app'); if (!app || !RT || S.role !== 'route') return;
    var body = '';
    if (RT.fatal && !RT.d) {
      body = '<div class="card tc" style="margin-top:20px"><b>' + esc(RT.fatal) + '</b><div class="sm mut" style="margin-top:8px">اطلب من المشرف يبعتلك رابط جديد على واتساب.</div></div>';
    } else if (!RT.d) {
      body = '<div class="spin"></div>';
    } else {
      var r = RT.d.route, st = r.status, live = ['active', 'off_route', 'emergency'].indexOf(st) >= 0;
      var head = '';
      if (st === 'planned') head = '<div class="rt-status"><b>الرحلة لسه ماتبدأتش</b><div class="sm mut">اسمح بالموقع لما يطلب منك، وخلي الشاشة مفتوحة طول الطريق.</div><button class="btn rt-big" data-act="rt_start">ابدأ الرحلة</button>' + (RT.gpsErr ? '<div class="sm warn-t" style="margin-top:8px">' + esc(RT.gpsErr) + '</div>' : '') + '</div>';
      else if (st === 'done') head = '<div class="rt-status"><b>الرحلة انتهت. شكرًا</b><div class="sm mut">متنساش تقفل الصفحة.</div></div>';
      else if (st === 'cancelled') head = '<div class="rt-status"><b>الخط ده اتلغى</b><div class="sm mut">اتصل بالمشرف لو محتاج توضيح.</div></div>';
      else {
        var banner = '';
        if (st === 'emergency') banner = '<div class="rt-alarm">طوارئ مُرسلة. المسؤول شايف مكانك دلوقتي، وتتبعك مستمر لحد ما يتأكد إنك بخير.' + (RT.d.hotline ? ' <a href="tel:' + esc(RT.d.hotline) + '">اتصل بالمسؤول: ' + esc(RT.d.hotline) + '</a>' : '') + '</div>';
        else if (RT.state === 'off' || st === 'off_route') banner = '<div class="rt-warn">أنت خارج خط السير بحوالي ' + num(RT.dist || RT.d.route.lastDist) + ' متر. ارجع للمسار المحدد.</div>';
        else if (RT.d.route.alert && RT.d.route.alert.type === 'emergency') banner = '<div class="rt-alarm">طوارئ مفتوحة عند المسؤول.</div>';
        if (!RT.consentOk) banner += '<div class="rt-warn">لازم توافق على التتبع الأول عشان الموقع يتبعت.<button class="btn sm" style="margin-top:8px" data-act="rt_consent_open">أوافق على التتبع</button></div>';
        head = '<div class="rt-status"><div class="row sp" style="gap:8px"><b>الرحلة شغالة</b><span class="chip ' + statOf(st).cls + '">' + statOf(st).t + '</span></div>' +
          '<div class="sm" id="rt-gps" style="margin-top:6px">' + gpsLine() + '</div>' + banner +
          '<button class="btn dk" data-act="rt_refresh" style="margin-top:10px">تحديث الموقع</button>' +
          '<button class="btn gh" data-act="rt_end" style="margin-top:8px">إنهاء الرحلة</button></div>';
      }
      var stops = (r.stops || []).map(function (n, i) { return '<li><span class="fl-num">' + (i + 1) + '</span>' + esc(n) + '</li>'; }).join('');
      var notes = (RT.d.notes || []).slice(0, 3).map(function (n) { return '<div class="rt-note ' + (n.kind === 'resolved' ? 'ok' : '') + '"><b>' + esc(n.title) + '</b><div class="sm">' + esc(n.body) + '</div><div class="xs mut">' + ago(n.ts) + '</div></div>'; }).join('');
      body = head + (notes ? '<div class="sec-t" style="margin-top:12px">رسايل من المسؤول</div>' + notes : '') +
        '<div class="fl-mapbox" style="margin-top:12px"><div id="rmap" class="fmap"></div></div>' +
        '<div class="sec-t" style="margin-top:12px">محطات الخط</div><ol class="rt-stops">' + stops + '</ol>';
      if (live) body += '<div style="height:90px"></div><button class="rt-sos" data-act="rt_sos_open">طوارئ</button>';
    }
    app.innerHTML = '<header class="hdr"><img class="logo" src="' + A.IMG.wordmark_dark + '" alt="العدو غير المرئي" style="height:34px"><div class="ttl">' + esc(RT.d ? RT.d.route.title : 'خط السير') + '<span class="sub">شريك الدفاع · كايرو ثري ايه</span></div></header><main class="rt-main">' + A.fx(body) + '</main>';
    if (RT.d) drawDriverMap();
  };
})();
