// اختبارات إعادة التهيئة من البداية: النسخ الاحتياطية، التأكيد، الصلاحيات، والإبقاء على الإعدادات
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
const BASE = Date.UTC(2026, 9, 1, 9, 0);
let T = BASE, ctr = 0;
const env = {
  now: () => T, secret: () => 'test-secret',
  randHex: (n) => { let s = ''; for (let i = 0; i < n; i++) { ctr++; s += ((ctr * 2654435761 >>> 0) & 15).toString(16) + ((ctr * 40503 >>> 0) & 15).toString(16); } return s; },
  notify: () => true, onError: (e) => { console.log('ERR', e.stack); }
};
const store = C.createMemoryStore({}, null);
C.seedDemo(store, env);
const svc = C.createService(store, env);
const api = (tok, a, p) => svc.api(tok, a, JSON.stringify(p || {}));
const sl = (phone, pin) => api('', 'staffLogin', { phone, pin });

const tMgr = sl('01000000004', '1234').data.token;
const tSup = sl('01000000003', '1234').data.token;
const trPhone = store.all('Traders')[0].phone;
store.insert('Config', { key: 'fleet.corridorM', value: '150', note: 'test' });
store.insert('Content', { id: 'L-1', type: 'lesson', title: 'درس', desc: 'وصف' });
ok(tMgr && tSup, 'staff logins work');
const before = { Traders: store.count('Traders'), Staff: store.count('Staff'), Config: store.count('Config'), Content: store.count('Content'), MarketItems: store.count('MarketItems'), Gate: store.count('Gate') };
ok(before.Traders > 0 && before.Staff > 1 && before.Config > 0 && before.Content > 0, 'demo data present before reset', before);

// ---------- معاينة: المدير يرى الأرقام، والمشرف لا يصل إليها ----------
const pv = api(tMgr, 'sResetPreview');
ok(pv.ok && pv.data.phrase === 'أعد التهيئة الكاملة', 'manager can preview the reset', pv);
ok(pv.data.clear.Traders === before.Traders && pv.data.staffRemoved === before.Staff - 1, 'preview counts match data', pv.data);
ok(!api(tSup, 'sResetPreview').ok, 'supervisor cannot preview reset');
ok(!api(tSup, 'sFactoryReset', { phrase: 'أعد التهيئة الكاملة', pin: '1234' }).ok, 'supervisor cannot run reset');

// ---------- التأكيد: العبارة والرمز ----------
let r = api(tMgr, 'sFactoryReset', { phrase: 'اعمل تهيئة', pin: '1234' });
ok(!r.ok && r.err === 'phrase', 'wrong phrase is refused', r);
r = api(tMgr, 'sFactoryReset', { phrase: 'أعد التهيئة الكاملة', pin: '9999' });
ok(!r.ok && r.err === 'bad_login', 'wrong PIN is refused', r);
ok(store.count('Traders') === before.Traders, 'refused attempts delete nothing');

// ---------- التنفيذ ----------
T += 60000;
r = api(tMgr, 'sFactoryReset', { phrase: '  أعد التهيئة الكاملة  ', pin: '1234' });
ok(r.ok && /^R\d{12}$/.test(r.data.backup), 'reset runs with correct phrase and PIN', r);
const label1 = r.data.backup;
ok(store.count('Traders') === 0, 'traders cleared');
ok(store.count('Staff') === 1 && store.all('Staff')[0].id === 'S-04', 'only the acting manager remains in Staff', store.all('Staff').map(s => s.id));
ok(store.count('Gate') === 0 && store.count('Tickets') === 0 && store.count('Rewards') === 0, 'transactional tables cleared');
ok(store.count('Config') === before.Config && store.count('Content') === before.Content && store.count('MarketItems') === before.MarketItems, 'config, content and market items kept');
ok(store.count('Events') === 1 && store.all('Events')[0].type === 'factory_reset', 'only the reset event remains in Events', store.all('Events'));
ok(store.snapshotRows(label1, 'Traders') === before.Traders, 'backup keeps every trader', store.snapshotRows(label1, 'Traders'));
ok(store.snapshotRows(label1, 'Staff') === before.Staff, 'backup keeps every staff row');
ok(store.snapshotRows(label1, 'Gate') === before.Gate, 'backup keeps gate history');
ok(store.snapshotLabels().length === 1, 'one backup set after first reset');

// ---------- بعد التهيئة: المدير يدخل، والتجار والمشرف المحذوف لا يدخلون ----------
ok(sl('01000000004', '1234').ok, 'manager still logs in after reset');
ok(!sl('01000000003', '1234').ok, 'removed supervisor cannot log in');
ok(!api('', 'login', { phone: trPhone, pin: '1234' }).ok, 'trader accounts are gone after reset');
ok(api(sl('01000000004', '1234').data.token, 'sMe').ok, 'manager session works after reset');

// ---------- تهيئات متكررة: تحتفظ بنسختين فقط ----------
T += 60000;
const r2 = api(tMgr, 'sFactoryReset', { phrase: 'أعد التهيئة الكاملة', pin: '1234' });
T += 60000;
const r3 = api(tMgr, 'sFactoryReset', { phrase: 'أعد التهيئة الكاملة', pin: '1234' });
ok(r2.ok && r3.ok && r2.data.backup !== r3.data.backup, 'repeated resets get distinct backup labels');
const labels = store.snapshotLabels();
ok(labels.length === 2 && labels[0] === r3.data.backup && labels[1] === r2.data.backup, 'only the two newest backups are kept', labels);
ok(!labels.includes(label1), 'oldest backup pruned');

console.log(`RESET PASS ${passes} FAIL ${fails}`);
process.exit(fails ? 1 : 0);
