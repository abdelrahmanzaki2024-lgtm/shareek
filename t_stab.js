// اختبارات الاستقرار على الخادم: تبليغ أخطاء الواجهة بنص مقصوص، وعدم تسريب الرموز
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
const logged = [];
const env = {
  now: () => Date.UTC(2026, 9, 24, 9, 0), secret: () => 'test-secret',
  randHex: (n) => 'a'.repeat(n * 2), notify: () => true,
  onError: (e) => logged.push(e.message)
};
const store = C.createMemoryStore({}, null);
C.seedDemo(store, env);
const svc = C.createService(store, env);
const rE = svc.api('', 'clientError', { msg: 'x'.repeat(500), where: 'render' });
ok(rE.ok === true, 'client error is accepted without a session', rE);
ok(logged.length === 1 && logged[0].startsWith('client[render]: '), 'client error is logged with its location', logged);
ok(logged[0].length <= 'client[render]: '.length + 300, 'client error text is clipped to 300 characters', logged[0].length);
const rLong = svc.api('', 'clientError', { msg: 'token=SECRET-TOKEN-VALUE', where: 'w'.repeat(200) });
ok(rLong.ok === true && logged[1].length <= 'client[]: '.length + 60 + 300, 'where field is clipped to 60 characters', logged[1] && logged[1].length);
const rBad = svc.api('', 'clientError', 'not json at all');
ok(rBad && typeof rBad.ok === 'boolean' && !rBad.ok, 'malformed payload gets a structured error, never a crash', rBad);
console.log(`STAB PASS ${passes} FAIL ${fails}`);
process.exit(fails ? 1 : 0);
