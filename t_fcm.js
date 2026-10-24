// اختبارات Firebase (HTTP v1): توقيع JWT بمفتاح RSA حقيقي، بناء الرسالة، تفسير الرد، وتكامل الطوارئ
const crypto = require('crypto');
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }

// ---------- 1) JWT يُوقَّع بمفتاح حساب خدمة حقيقي ويتحقق منه ----------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const sa = { type: 'service_account', project_id: 'shareek-test', client_email: 'push@shareek-test.iam.gserviceaccount.com', private_key: privateKey };
ok(C.fcm.validServiceAccount(sa), 'service account with a PEM key is accepted');
ok(!C.fcm.validServiceAccount({ ...sa, type: 'user' }), 'non service account is refused');
ok(!C.fcm.validServiceAccount({ ...sa, private_key: 'not a key' }), 'malformed key is refused');
const envSign = {
  b64url: (s) => Buffer.from(s, 'utf8').toString('base64url'),
  signRs256: (text, pem) => crypto.sign('sha256', Buffer.from(text, 'utf8'), pem).toString('base64url')
};
const NOWMS = Date.UTC(2026, 9, 24, 12, 0, 0);
const jwt = C.fcm.assertion(sa, NOWMS, envSign);
const parts = jwt.split('.');
ok(parts.length === 3, 'JWT has three parts', parts.length);
const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
ok(head.alg === 'RS256' && head.typ === 'JWT', 'JWT header is RS256', head);
ok(claims.iss === sa.client_email && claims.scope === 'https://www.googleapis.com/auth/firebase.messaging', 'JWT claims name the service account and FCM scope', claims);
ok(claims.aud === 'https://oauth2.googleapis.com/token' && claims.exp - claims.iat === 3600, 'JWT audience is Google token endpoint and lasts one hour', claims);
ok(crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), publicKey, Buffer.from(parts[2], 'base64url')), 'RSA signature verifies with the public key');
const tampered = Buffer.from(JSON.stringify({ ...claims, iss: 'evil@x.iam' })).toString('base64url');
ok(!crypto.verify('sha256', Buffer.from(parts[0] + '.' + tampered), publicKey, Buffer.from(parts[2], 'base64url')), 'changed claims fail verification');

// ---------- 2) بناء الرسالة ----------
const m = C.fcm.message('tok-' + 'a'.repeat(40), { title: 'طوارئ: خط المزرعة 5', body: 'حادثة · بعيد عن الخط', data: { kind: 'alert_sos', routeId: 'RT1', alertId: 'AL1', count: 3, nothing: null }, priority: 'high', tag: 'route-RT1' });
ok(m.message.token.startsWith('tok-'), 'message targets the device token');
ok(m.message.notification.title === 'طوارئ: خط المزرعة 5' && m.message.notification.body.length > 0, 'message carries a visible notification');
ok(Object.values(m.message.data).every(v => typeof v === 'string'), 'every data value is a string (FCM requirement)', m.message.data);
ok(m.message.data.count === '3' && !('nothing' in m.message.data), 'numbers are stringified and nulls dropped', m.message.data);
ok(m.message.data.urgent === '1' && m.message.android.priority === 'HIGH' && m.message.android.notification.channel_id === 'sos_alerts', 'emergency uses high priority and the alarm channel', m.message.android);
const g = C.fcm.message('tok-x', { title: 'تحديث', body: 'عادي', data: {}, priority: 'normal' });
ok(g.message.android.priority === 'NORMAL' && g.message.android.notification.channel_id === 'general' && g.message.data.urgent === '0', 'normal messages use the general channel');
const long = C.fcm.message('tok-x', { title: 'x'.repeat(500), body: 'y'.repeat(900), data: { k: 'z'.repeat(2000) } });
ok(long.message.data.title.length <= 120 && long.message.data.body.length <= 300 && long.message.data.k.length <= 500, 'long text is clipped to FCM-safe sizes');

// ---------- 3) تفسير الرد ----------
ok(C.fcm.interpret(200, '{}').ok === true, 'HTTP 200 is success');
ok(C.fcm.interpret(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}').unregistered === true, 'UNREGISTERED removes the device');
ok(C.fcm.interpret(400, '{"error":{"message":"The registration token is not a valid FCM registration token"}}').unregistered === true, 'invalid registration token removes the device');
ok(!C.fcm.interpret(400, '{"error":{"status":"INVALID_ARGUMENT","message":"Invalid JSON payload"}}').unregistered, 'a malformed message must NOT delete devices');
ok(C.fcm.interpret(401, '{}').auth === true, 'expired token is flagged for a fresh access token');
ok(C.fcm.interpret(429, '{}').retry === true && C.fcm.interpret(503, '').retry === true, 'rate limit and server errors are retryable');
ok(!C.fcm.interpret(429, '{}').unregistered, 'rate limit never deletes a device');

// ---------- 4) تكامل الطوارئ: الإرسال يمر بـ Firebase، والجهاز المرفوض يُفرَّغ ----------
let clock = Date.UTC(2026, 9, 20, 9, 0), ctr = 0;
const env = {
  now: () => clock, secret: () => 'test-secret',
  randHex: (n) => { let s = ''; for (let i = 0; i < n; i++) { ctr++; s += ((ctr * 2654435761 >>> 0) & 15).toString(16) + ((ctr * 40503 >>> 0) & 15).toString(16); } return s; },
  notify: () => true, onError: (e) => { console.log('ERR', e.stack); },
  fcmReady: () => true,
  fcmSend: (msgs) => { sentFcm.push(...msgs); return msgs.map(x => (x.message.token === BAD ? { ok: false, unregistered: true } : { ok: true })); }
};
const sentFcm = [];
const MGR_TOK = 'mgr-' + 'm'.repeat(40), SUP_TOK = 'sup-' + 's'.repeat(40), BAD = 'gone-' + 'g'.repeat(40), A1_TOK = 'a1-' + 'a'.repeat(40);
const store = C.createMemoryStore({}, null);
C.seedDemo(store, env);
const svc = C.createService(store, env);
const api = (tok, a, p) => svc.api(tok, a, JSON.stringify(p || {}));
const sl = (phone, pin) => api('', 'staffLogin', { phone, pin });
const tMgr = sl('01000000004', '1234').data.token, tSup = sl('01000000003', '1234').data.token, tA1 = sl('01000000001', '1234').data.token;
ok(api(tMgr, 'sPushRegister', { token: MGR_TOK, platform: 'android' }).ok, 'manager device registers');
ok(api(tSup, 'sPushRegister', { token: SUP_TOK, platform: 'android' }).ok, 'supervisor device registers');
ok(api(tSup, 'sPushRegister', { token: BAD, platform: 'android' }).ok, 'a device that later uninstalled the app registers');
ok(api(tA1, 'sPushRegister', { token: A1_TOK, platform: 'android' }).ok, 'assistant device registers (must get no fleet alerts)');

const T = store.all('Traders').find(t => t.status === 'active' && t.phone);
const POINTS = [{ lat: 30.0, lng: 31.0, name: 'البوابة' }, { lat: 30.0, lng: 31.01, name: 'المخزن' }];
const RID = api(tMgr, 'sRouteSave', { title: 'خط المزرعة 5', traderId: T.id, points: POINTS }).data.route.id;
const link = api(tMgr, 'sRouteShare', { id: RID }).data.link;
const ROUTE_TOK = link.split('r=')[1];
ok(api(ROUTE_TOK, 'routeStart', { lat: 30.0, lng: 31.0, acc: 10, consent: true }).ok, 'driver starts the trip');
clock += 60000;
const sos = api(ROUTE_TOK, 'routeEmergency', { lat: 30.0, lng: 31.006, acc: 10, reason: 'حادثة' });
ok(sos.ok, 'driver sends an emergency', sos);
ok(sentFcm.length >= 2, 'emergency is sent through Firebase to monitors', sentFcm.length);
const toMgr = sentFcm.filter(x => x.message.token === MGR_TOK), toSup = sentFcm.filter(x => x.message.token === SUP_TOK);
ok(toMgr.length >= 1 && toSup.length >= 1, 'manager and supervisor both receive the emergency');
ok(!sentFcm.some(x => x.message.token === A1_TOK), 'assistant device receives no fleet alert');
ok(sentFcm.every(x => x.message.data.kind === 'alert_sos' && x.message.data.urgent === '1'), 'every emergency message is marked urgent alert_sos');
const wire = JSON.stringify(sentFcm);
ok(!wire.includes(ROUTE_TOK), 'the route token never appears in any push message');
ok(!wire.includes(T.phone) && !wire.includes(T.code), 'no trader phone or code appears in any push message');
const dead = store.all('FleetDevices').filter(d => d.token === '' && d.ownerKind === 'staff');
ok(dead.length === 1, 'exactly the unregistered device is cleared', dead.length);
ok(store.all('FleetDevices').some(d => d.token === MGR_TOK), 'healthy devices keep their token');

// ---------- 5) بلا إعداد FCM لا يُرسل شيء ولا يتعطل الخادم ----------
const env2 = { ...env, fcmReady: () => false, fcmSend: () => { throw new Error('must not be called'); } };
const store2 = C.createMemoryStore({}, null); C.seedDemo(store2, env2);
const svc2 = C.createService(store2, env2);
const a2 = (tok, a, p) => svc2.api(tok, a, JSON.stringify(p || {}));
const tm2 = a2('', 'staffLogin', { phone: '01000000004', pin: '1234' }).data.token;
ok(a2(tm2, 'sPushRegister', { token: MGR_TOK, platform: 'web' }).ok, 'without FCM configured registration still works');

console.log(`FCM PASS ${passes} FAIL ${fails}`);
process.exit(fails ? 1 : 0);
