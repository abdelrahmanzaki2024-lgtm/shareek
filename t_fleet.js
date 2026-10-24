// اختبارات أسطول التجار: خطوط السير والتتبع وكشف الخروج والطوارئ والإشعارات (ذاكرة)
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
const NOW = Date.UTC(2026, 9, 20, 9, 0);
let clock = NOW, ctr = 0;
const mails = [], pushes = [];
const env = {
  now: () => clock, secret: () => 'test-secret',
  randHex: (n) => { ctr++; return ctr.toString(16).padStart(n * 2, '0'); },   // فريد دائمًا (المعرّفات لا تتكرر في الاختبار)
  notify: (to, sub, body) => { mails.push({ to, sub, body }); return true; },
  push: (url, auth, body) => { pushes.push({ url, auth, body }); },
  pushAuth: () => 'relay-secret',
  serviceUrl: () => 'https://script.google.com/macros/s/TEST/exec',
  onError: (e) => { console.log('ERR', e.stack); }
};
const store = C.createMemoryStore({}, null);
C.seedDemo(store, env);
const svc = C.createService(store, env);
const api = (tok, a, p) => svc.api(tok, a, JSON.stringify(p || {}));
const sl = (phone, pin) => api('', 'staffLogin', { phone, pin });
const tick = (ms) => { clock += ms || 60000; };
const sRow = (phone) => store.find('Staff', s => s.phone === phone);

const tSup = sl('01000000003', '1234').data.token;
const tMgr = sl('01000000004', '1234').data.token;
const tA1 = sl('01000000001', '1234').data.token;
const supRow = sRow('01000000003'), mgrRow = sRow('01000000004'), a1Row = sRow('01000000001');
ok(tSup && tMgr && tA1, 'staff logins work');

// ---------- الهندسة ----------
const G = C.fleetGeo, seg = [{ lat: 30, lng: 31 }, { lat: 30, lng: 31.01 }];
ok(G.distToRoute({ lat: 30, lng: 31.005 }, seg) < 0.01, 'point on the segment is at zero distance');
const dNorth = G.distToRoute({ lat: 30.001, lng: 31.005 }, seg);
ok(Math.abs(dNorth - 111.2) < 2, 'one thousandth of a degree north is about 111 m', dNorth);
const dPastEnd = G.distToRoute({ lat: 30, lng: 31.02 }, seg), expectPastEnd = 0.01 * (6371000 * Math.PI / 180) * Math.cos(30 * Math.PI / 180);
ok(Math.abs(dPastEnd - expectPastEnd) < 5, 'point beyond the end uses the end point', dPastEnd);

// ---------- الصلاحيات ----------
const mp = api(tMgr, 'sMe').data.staff.perms, sp = api(tSup, 'sMe').data.staff.perms, ap = api(tA1, 'sMe').data.staff.perms;
ok(mp.includes('fleet') && mp.includes('fleet.manage'), 'manager gets fleet and fleet.manage', mp);
ok(sp.includes('fleet') && !sp.includes('fleet.manage'), 'supervisor watches the fleet but cannot create routes', sp);
ok(!ap.includes('fleet') && !ap.includes('fleet.manage'), 'assistant gets no fleet access', ap);

// ---------- إنشاء الخط ----------
const T = store.all('Traders').find(t => t.status === 'active' && t.phone);
const POINTS = [{ lat: 30.0, lng: 31.0, name: 'البوابة' }, { lat: 30.0, lng: 31.01, name: 'المخزن' }, { lat: 30.01, lng: 31.01, name: 'المزرعة 5' }];
let r = api(tSup, 'sRouteSave', { title: 'خط المزرعة 5', traderId: T.id, points: POINTS });
ok(!r.ok && r.err === 'perm', 'supervisor cannot create a route', r);
r = api(tMgr, 'sRouteSave', { title: 'خط المزرعة 5', traderId: 'NOPE', points: POINTS });
ok(!r.ok && r.err === 'trader', 'unknown trader rejected', r);
r = api(tMgr, 'sRouteSave', { title: 'خط المزرعة 5', traderId: T.id, points: [POINTS[0]] });
ok(!r.ok && r.err === 'points', 'a route needs at least two points', r);
r = api(tMgr, 'sRouteSave', { title: 'خط المزرعة 5', traderId: T.id, points: [{ lat: 95, lng: 31 }, { lat: 30, lng: 31 }] });
ok(!r.ok && r.err === 'points', 'latitude out of range rejected', r);
r = api(tMgr, 'sRouteSave', { title: 'خط المزرعة 5', traderId: T.id, points: POINTS, corridorM: 5 });
ok(!r.ok && r.err === 'corridor', 'corridor below 30 m rejected', r);
r = api(tMgr, 'sRouteSave', { title: 'خط المزرعة 5', traderId: T.id, points: POINTS, corridorM: 150 });
ok(r.ok && r.data.route.status === 'planned' && r.data.route.points.length === 3, 'manager creates a planned route', r);
const RID = r.data.route.id;

// ---------- رابط الخط ----------
r = api(tSup, 'sRouteShare', { id: RID });
ok(!r.ok && r.err === 'perm', 'supervisor cannot share a route', r);
r = api(tMgr, 'sRouteShare', { id: RID });
ok(r.ok && /^https:\/\/script\.google\.com\/macros\/s\/TEST\/exec\?r=[0-9a-f]{32}$/.test(r.data.link), 'share returns a link with a 32-hex route token', r.ok && r.data.link);
const TOKEN = r.data.link.split('r=')[1];
ok(r.data.waPhone === '20' + T.phone.substring(1) && r.data.waUrl.indexOf('https://wa.me/' + r.data.waPhone + '?text=') === 0, 'WhatsApp link targets the trader in international format');
ok(r.data.message.indexOf('خط المزرعة 5') >= 0 && r.data.message.indexOf(TOKEN) >= 0 && r.data.message.indexOf('المزرعة 5') >= 0, 'message carries the route title, the stops and the link');
ok(JSON.stringify(store.tables).indexOf(TOKEN) < 0, 'the raw route token is stored nowhere (only its HMAC)');

// ---------- الدخول بالرابط ----------
ok(api('', 'routeGet').err === 'auth', 'route action without a token is refused');
ok(api('short', 'routeGet').err === 'auth', 'short token refused');
ok(api('0'.repeat(32), 'routeGet').err === 'auth', 'unknown token refused');
ok(api(tMgr, 'routeGet').err === 'auth', 'a staff session cannot act as a route');
ok(api(TOKEN, 'home').err === 'auth' && api(TOKEN, 'me').err === 'auth', 'a route token cannot act as a trader');
let g = api(TOKEN, 'routeGet');
ok(g.ok && g.data.route.title === 'خط المزرعة 5' && g.data.route.stops.length === 3 && g.data.route.status === 'planned', 'driver reads the route', g);
ok(!('traderName' in g.data.route) && !('plate' in g.data.route) && !JSON.stringify(g.data).includes(T.name), 'driver view carries no trader identity');

// ---------- التتبع قبل البدء ----------
let p = api(TOKEN, 'routePing', { lat: 30.0, lng: 31.005, acc: 10 });
ok(!p.ok && p.err === 'state', 'pings before the trip starts are refused', p);
tick(); p = api(TOKEN, 'routeStart', { lat: 30.0, lng: 31.0, acc: 10 }); ok(p.err === 'consent', 'trip start needs driver consent first', p); p = api(TOKEN, 'routeStart', { lat: 30.0, lng: 31.0, acc: 10, consent: true });
ok(p.ok && p.data.route.status === 'active' && p.data.route.startedTs === clock, 'starting the trip activates the route', p);

// ---------- داخل الممر ----------
tick(); p = api(TOKEN, 'routePing', { lat: 30.0, lng: 31.005, acc: 10 });
ok(p.ok && p.data.state === 'ok' && p.data.status === 'active', 'on-route ping is ok', p);
ok(store.all('FleetAlerts').length === 0, 'no alert while on route');

// ---------- خروج عن الخط: نبضة واحدة لا تكفي، والثانية تفتح التنبيه ----------
tick(); p = api(TOKEN, 'routePing', { lat: 30.002, lng: 31.005, acc: 10 });
ok(p.data.state === 'off' && p.data.status === 'active', 'a single off-route ping is not yet an alert', p.data);
ok(store.all('FleetAlerts').length === 0, 'one off-route ping opens no alert');
store.find('Staff', x => x.id === mgrRow.id).email = 'manager.test@example.test';
store.find('Staff', x => x.id === supRow.id).email = 'supervisor.test@example.test';
const mailsBefore = mails.length;
tick(); p = api(TOKEN, 'routePing', { lat: 30.002, lng: 31.005, acc: 10 });
ok(p.data.status === 'off_route', 'second consecutive off-route ping marks the route off_route', p.data);
let al = store.all('FleetAlerts');
ok(al.length === 1 && al[0].type === 'off_route' && al[0].status === 'open', 'one open off_route alert', al);
ok(al[0].dist >= 200 && al[0].dist <= 240, 'alert carries the distance from the route', al[0] && al[0].dist);
const staffNotes = store.all('FleetNotes').filter(n => n.toStaffId);
ok(staffNotes.some(n => n.toStaffId === mgrRow.id) && staffNotes.some(n => n.toStaffId === supRow.id), 'alert reaches managers and supervisors who hold fleet');
ok(!staffNotes.some(n => n.toStaffId === a1Row.id), 'alert never reaches an assistant without fleet');
ok(store.all('FleetNotes').some(n => n.toRoute === RID && n.kind === 'alert_off'), 'the driver device is told too');
ok(mails.length > mailsBefore && mails[mails.length - 1].sub.indexOf('خروج') >= 0, 'an email goes to fleet staff');
ok(pushes.length === 0, 'no push is sent while the relay is not configured');

// ---------- دقة GPS السيئة لا تُطلق إنذارًا كاذبًا ----------
tick(); p = api(TOKEN, 'routePing', { lat: 30.002, lng: 31.005, acc: 100 });
ok(p.data.state === 'ok', 'poor GPS accuracy (100 m) gives the benefit of the doubt', p.data);
ok(store.all('FleetAlerts')[0].status === 'auto', 'a noisy fix still counts as on route and closes the alert');
// اغلاق التنبيه تلقائيًا بعد العودة إلى الخط
tick(); p = api(TOKEN, 'routePing', { lat: 30.0, lng: 31.006, acc: 10 });
ok(p.data.status === 'active' && store.all('FleetAlerts')[0].status === 'auto', 'alert closes automatically back on the route', store.all('FleetAlerts')[0]);

// ---------- الطوارئ ----------
tick(); const sos = api(TOKEN, 'routeEmergency', { lat: 30.0, lng: 31.006, acc: 10, reason: 'حادثة' });
ok(sos.ok && !sos.data.repeated && sos.data.alertId, 'emergency is accepted', sos);
ok(store.find('FleetRoutes', x => x.id === RID).status === 'emergency', 'route becomes emergency');
let em = store.all('FleetAlerts').filter(a => a.type === 'emergency');
ok(em.length === 1 && em[0].reason === 'حادثة' && em[0].status === 'open', 'one open emergency alert with the chosen reason', em);
ok(store.all('FleetNotes').some(n => n.toStaffId === supRow.id && n.kind === 'alert_sos'), 'emergency reaches supervisors at once');
tick(); const sos2 = api(TOKEN, 'routeEmergency', { lat: 30.0, lng: 31.007, acc: 10, reason: 'مريض أو إصابة' });
em = store.all('FleetAlerts').filter(a => a.type === 'emergency');
ok(sos2.data.repeated && em.length === 1 && em[0].lng === 31.007, 'pressing again updates the same open alert', em[0]);
tick(20000); p = api(TOKEN, 'routePing', { lat: 30.0, lng: 31.008, acc: 10 });
ok(p.ok && p.data.status === 'emergency', 'pings continue during an emergency and the route stays in emergency', p.data);
ok(store.all('FleetPings').some(x => x.routeId === RID && x.state === 'sos'), 'the emergency position is recorded');

// ---------- لوحة المشرف ----------
const fv = api(tSup, 'sFleet', {});
ok(fv.ok && fv.data.routes[0].id === RID && fv.data.routes[0].status === 'emergency', 'emergency routes come first in the fleet view', fv.data && fv.data.routes[0]);
ok(fv.data.stats.emergency === 1 && fv.data.alerts.some(a => a.type === 'emergency'), 'fleet view counts the emergency and lists it');
ok(!fv.data.canManage && fv.data.traders.length === 0, 'supervisor sees no trader list and cannot manage');
const fvJson = JSON.stringify(fv.data);
ok(!/"phone"|tokenHash|"token"/.test(fvJson) && fvJson.indexOf(TOKEN) < 0 && fvJson.indexOf(T.phone) < 0, 'fleet view never carries a phone or any token');
const fm = api(tMgr, 'sFleet', {});
ok(fm.data.canManage && fm.data.traders.length > 0 && JSON.stringify(fm.data.traders).indexOf(T.phone) < 0, 'manager gets the trader list without phone numbers');
ok(api(tA1, 'sFleet', {}).err === 'perm', 'assistant cannot open the fleet view');
const tk = api(tSup, 'sTrack', { routeId: RID });
ok(tk.ok && tk.data.pings.length >= 3 && tk.data.pings.every((x, i, a) => i === 0 || a[i - 1].ts <= x.ts), 'track is returned oldest first', tk.data && tk.data.pings.length);
ok(api(tA1, 'sTrack', { routeId: RID }).err === 'perm', 'assistant cannot read a track');

// ---------- حل الطوارئ ----------
ok(api(tA1, 'sAlertResolve', { id: em[0].id }).err === 'perm', 'assistant cannot resolve an emergency');
let rs = api(tSup, 'sAlertResolve', { id: em[0].id, note: 'وصلنا للسائق واطمأننا' });
ok(rs.ok && em[0].status === 'resolved' && em[0].resolvedBy === supRow.id && em[0].note.indexOf('اطمأننا') >= 0, 'supervisor resolves the emergency with a note', em[0]);
ok(store.find('FleetRoutes', x => x.id === RID).status === 'active', 'route goes back to active after the emergency is resolved');
ok(store.all('FleetNotes').some(n => n.toRoute === RID && n.kind === 'resolved'), 'driver is told the situation is confirmed');
ok(api(tSup, 'sAlertResolve', { id: em[0].id }).data.already === true, 'resolving twice is harmless');
g = api(TOKEN, 'routeGet');
ok(g.data.notes.some(n => n.kind === 'resolved'), 'driver sees the confirmation on the route page');

// سبب غير معروف يُستبدل بالسبب الأخير «أخرى»
tick(); const sosBad = api(TOKEN, 'routeEmergency', { lat: 30.0, lng: 31.007, acc: 10, reason: 'سبب مكتوب من عندي' });
const lastEm = store.all('FleetAlerts').filter(a => a.type === 'emergency' && a.status === 'open')[0];
ok(sosBad.ok && lastEm.reason === 'أخرى', 'unknown emergency reason falls back to the last preset', lastEm && lastEm.reason);
rs = api(tMgr, 'sAlertResolve', { id: lastEm.id });
ok(rs.ok, 'manager closes it');

// ---------- بلا إشارة ----------
tick(11 * 60000);
const stale = api(tSup, 'sFleet', {}).data.routes.find(x => x.id === RID);
ok(stale && stale.stale === true, 'a route silent for more than 10 minutes is flagged stale', stale && stale.stale);
tick(); api(TOKEN, 'routePing', { lat: 30.0, lng: 31.005, acc: 10 });
ok(api(tSup, 'sFleet', {}).data.routes.find(x => x.id === RID).stale === false, 'a fresh ping clears the stale flag');

// ---------- إسكات التكرار: نبضتان في أقل من 8 ثوان ----------
const pingCount = store.all('FleetPings').length;
tick(2000); p = api(TOKEN, 'routePing', { lat: 30.0, lng: 31.005, acc: 10 });
ok(p.ok && store.all('FleetPings').length === pingCount, 'a ping within 8 seconds of the last one stores no extra row');

// ---------- الإشعارات بالدفع الخارجي ----------
store.insert('Config', { key: 'push.relayUrl', value: 'https://relay.example.test/send', note: '' });
svc.resetCfg();
ok(api(tMgr, 'sPushRegister', { token: 'x'.repeat(40), platform: 'android' }).ok, 'staff device registers for push');
ok(api(TOKEN, 'routePushRegister', { token: 'y'.repeat(40), platform: 'android' }).ok, 'route device registers for push');
ok(api(TOKEN, 'routePushRegister', { token: 'short' }).err === 'token', 'short push token refused');
ok(api(tA1, 'sPushRegister', { token: 'z'.repeat(40) }).ok, 'assistant may register a device but gets no fleet alerts');

// ---------- إنهاء الرحلة ----------
tick(); const e = api(TOKEN, 'routeEnd', { lat: 30.01, lng: 31.01, acc: 10 });
ok(e.ok && store.find('FleetRoutes', x => x.id === RID).status === 'done' && store.find('FleetRoutes', x => x.id === RID).endedTs === clock, 'ending the trip marks it done', e);
ok(api(TOKEN, 'routePing', { lat: 30.0, lng: 31.005, acc: 10 }).err === 'state', 'pings after the trip ends are refused');
ok(api(TOKEN, 'routeGet').ok, 'driver can still open the ended route until the link expires');
ok(api(tMgr, 'sRouteShare', { id: RID }).err === 'nf', 'a finished route cannot be shared again');
ok(api(tMgr, 'sRouteSave', { id: RID, title: 'تعديل', traderId: T.id, points: POINTS }).err === 'state', 'a finished route cannot be edited');

// ---------- إلغاء الخط يُبطل الرابط فورًا ----------
r = api(tMgr, 'sRouteSave', { title: 'خط ثاني', traderId: T.id, points: POINTS });
const R2 = r.data.route.id;
const sh2 = api(tMgr, 'sRouteShare', { id: R2 });
const TOKEN2 = sh2.data.link.split('r=')[1];
ok(api(TOKEN2, 'routeGet').ok, 'second route link works before cancel');
ok(api(tSup, 'sRouteCancel', { id: R2 }).err === 'perm', 'supervisor cannot cancel a route');
ok(api(tMgr, 'sRouteCancel', { id: R2 }).ok, 'manager cancels the route');
ok(api(TOKEN2, 'routeGet').err === 'auth', 'cancelled route link stops working at once');

// ---------- انتهاء صلاحية الرابط ----------
tick(73 * 3600000);
ok(api(TOKEN, 'routeGet').err === 'auth', 'driver link expires after the configured hours');

console.log('\nFLEET PASS', passes, 'FAIL', fails);
process.exit(fails ? 1 : 0);
