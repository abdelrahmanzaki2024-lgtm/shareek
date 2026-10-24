// اختبارات الإصدار: مدير الإدارة يحتفظ بصلاحيات إدارة التجار مهما كانت صلاحيات الفريق المحفوظة
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
const NOW = Date.UTC(2026, 9, 1, 9, 0);
let ctr = 0;
const env = {
  now: () => NOW, secret: () => 'test-secret',
  randHex: (n) => { let s = ''; for (let i = 0; i < n; i++) { ctr++; s += ((ctr * 2654435761 >>> 0) & 15).toString(16) + ((ctr * 40503 >>> 0) & 15).toString(16); } return s; },
  notify: () => true, onError: (e) => { console.log('ERR', e.stack); }
};
const store = C.createMemoryStore({}, null);
C.seedDemo(store, env);
const svc = C.createService(store, env);
const api = (tok, a, p) => svc.api(tok, a, JSON.stringify(p || {}));
const sl = (phone, pin) => api('', 'staffLogin', { phone, pin });

// ---------- 1) مدير بصلاحيات محفوظة قديمة لا تتضمن الحذف ----------
const mgrRow = store.all('Staff').find(s => s.phone === '01000000004');
mgrRow.perms = 'c:gate,farms,dash,traders';            // حفظ قديم قبل إضافة مفاتيح الحذف والتعديل
const tMgr = sl('01000000004', '1234').data.token;
const mp = api(tMgr, 'sMe').data.staff.perms;
ok(mp.includes('traders.delete') && mp.includes('traders.edit') && mp.includes('traders.block'), 'manager keeps trader admin perms with an old custom set', mp);
ok(mp.includes('fleet.manage'), 'manager keeps fleet.manage with an old custom set', mp);

// ---------- 2) مشرف لا يحصل على هذه الصلاحيات تلقائيًا ----------
const supRow = store.all('Staff').find(s => s.phone === '01000000003');
supRow.perms = 'c:dash,traders';
const tSup = sl('01000000003', '1234').data.token;
const sp = api(tSup, 'sMe').data.staff.perms;
ok(!sp.includes('traders.delete') && !sp.includes('traders.edit') && !sp.includes('fleet.manage'), 'supervisor does not get manager-only keys', sp);

// ---------- 3) الحذف يعمل فعلًا للمدير القديم الحفظ ----------
const tr = api(tMgr, 'sTraders', {}).data.list || [];
ok(tr.length > 0, 'trader list visible to manager', tr.length);
const victim = tr[tr.length - 1];
const d = api(tMgr, 'sTraderDelete', { id: victim.id });
ok(d.ok, 'manager with old custom set can delete a trader', d);

console.log(`V2 PASS ${passes} FAIL ${fails}`);
process.exit(fails ? 1 : 0);
