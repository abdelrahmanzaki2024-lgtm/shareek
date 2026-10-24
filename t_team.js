// اختبارات: نشر المدير المباشر + إدارة الفريق والصلاحيات (ذاكرة)
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
const NOW = Date.UTC(2026, 9, 1, 9, 0);
let ctr = 0; const mails = [];
const env = {
  now: () => NOW, secret: () => 'test-secret',
  randHex: (n) => { let s = ''; for (let i = 0; i < n; i++) { ctr++; s += ((ctr * 2654435761 >>> 0) & 15).toString(16) + ((ctr * 40503 >>> 0) & 15).toString(16); } return s; },
  notify: (to, sub, body, html) => { mails.push({ to, sub, body, html }); return true; }, onError: (e) => { console.log('ERR', e.stack); }
};
const store = C.createMemoryStore({}, null);
C.seedDemo(store, env);
const svc = C.createService(store, env);
const api = (tok, a, p) => svc.api(tok, a, JSON.stringify(p || {}));
const sl = (phone, pin) => api('', 'staffLogin', { phone, pin });
const setCfg = (key, value) => { store.insert('Config', { key, value, note: '' }); svc.resetCfg(); };
const prices = (tok) => api(tok, 'sMarketGet').data.edit.today.prices;

const tSup = sl('01000000003', '1234').data.token;
const tMgr = sl('01000000004', '1234').data.token;
const tAdm = sl('01000000005', '1234').data.token;
const tA1 = sl('01000000001', '1234').data.token;
ok(tSup && tMgr && tAdm && tA1, 'staff logins work');

// ---------- صلاحيات افتراضية حسب الدور ----------
const mp = api(tMgr, 'sMe').data.staff.perms, sp = api(tSup, 'sMe').data.staff.perms, ap = api(tA1, 'sMe').data.staff.perms;
ok(mp.includes('traders.block') && mp.includes('prices.publish') && mp.includes('report'), 'manager default perms', mp);
ok(sp.includes('dash') && !sp.includes('traders.block') && !sp.includes('report'), 'supervisor default perms', sp);
ok(ap.includes('gate') && ap.includes('inbox') && !ap.includes('dash') && !ap.includes('prices.publish'), 'assistant default perms', ap);

// ---------- 1) مدير الإدارة ينشر مباشرة بلا اعتماد أي جهة ----------
let r = api(tMgr, 'sMarketSet', { values: { broiler: 1000 } });
ok(r.ok || r.err === 'jump', 'manager never gets a second-approval error', r);
ok(!store.all('MarketPending').some(x => x.by === 'S-04' && x.status === 'pending'), 'manager never creates a pending price');
r = api(tMgr, 'sMarketSet', { values: { broiler: 1000 }, force: true });
ok(r.ok && !r.data.submitted, 'manager big jump published directly with force', r);
ok(prices(tMgr).broiler === 1000, 'manager price is live at once', prices(tMgr));
ok(api(tMgr, 'sMarketGet').data.direct === true, 'manager market flagged direct');
ok(api(tSup, 'sMarketGet').data.direct === false, 'supervisor market not direct');

// ---------- 2) المشرف يرسل القفزة للاعتماد، ومدير الإدارة يعتمدها ----------
r = api(tSup, 'sMarketSet', { values: { broiler: 5000 }, force: true });
ok(r.ok && r.data.submitted, 'supervisor big jump waits for approval', r);
const pid = r.data.submitted;
ok(prices(tMgr).broiler === 1000, 'supervisor price not live before approval');
r = api(tSup, 'sMarketDecide', { id: pid, decision: 'approve' });
ok(!r.ok && r.err === 'perm', 'proposer cannot approve own price', r);
r = api(tMgr, 'sMarketDecide', { id: pid, decision: 'approve' });
ok(r.ok && prices(tMgr).broiler === 5000, 'manager approves supervisor price', r);

// ---------- 3) الاعتماد الدائم: المدير ينشر مباشرة والمشرف ما زال يحتاج اعتمادًا ----------
setCfg('market.approval', 'always');
r = api(tMgr, 'sMarketSet', { values: { table: 140 } });
ok(r.ok && !r.data.submitted && prices(tMgr).table === 140, 'manager publishes directly even when approval=always', r);
r = api(tSup, 'sMarketSet', { values: { table: 141 } });
ok(r.ok && r.data.submitted, 'supervisor still needs approval when approval=always', r);
setCfg('market.approval', 'jump');

// ---------- 4) فريق العمل: المدير وحده ----------
r = api(tSup, 'sTeamList'); ok(!r.ok && r.err === 'perm', 'supervisor cannot open team', r);
r = api(tAdm, 'sTeamList'); ok(!r.ok && r.err === 'perm', 'system officer cannot open team', r);
r = api(tA1, 'sTeamSave', { name: 'اختبار', title: 'اختبار', phone: '01000000020', role: 'assistant', farmId: '5', pin: '1111' });
ok(!r.ok && r.err === 'perm', 'assistant cannot add staff', r);
r = api(tMgr, 'sTeamList');
ok(r.ok && r.data.list.length >= 5 && r.data.catalog.length >= 10 && r.data.defaults.assistant.includes('gate') && !r.data.defaults.assistant.includes('dash'), 'manager sees list, catalog and role defaults', r.ok && { n: r.data.list.length });

// إضافة مشرف بصلاحيات محددة فقط
r = api(tMgr, 'sTeamSave', { name: 'مشرف تجريبي جديد', title: 'مشرف مزرعة 8', phone: '01000000008', role: 'supervisor', perms: ['report', 'dash', 'hack'], pin: '4321' });
ok(r.ok, 'manager adds a supervisor with chosen perms', r);
const row = store.find('Staff', x => x.phone === '01000000008');
ok(row && row.perms === 'c:dash,report', 'custom perms stored in catalog order, unknown key dropped', row && row.perms);
r = sl('01000000008', '4321');
ok(r.ok && JSON.stringify(r.data.staff.perms) === JSON.stringify(['dash', 'report']), 'new supervisor logs in with exact perms', r.ok && r.data.staff.perms);
const tNew = r.data.token;
ok(api(tNew, 'sStats').ok, 'granted dashboard works');
ok(api(tNew, 'sReport').ok, 'granted weekly report works');
r = api(tNew, 'sTraders'); ok(!r.ok && r.err === 'perm', 'ungranted traders list denied', r);
r = api(tNew, 'sGate', { traderId: 'x' }); ok(!r.ok && r.err === 'perm', 'ungranted gate denied', r);
r = api(tNew, 'sMarketSet', { values: { broiler: 80 } }); ok(!r.ok && r.err === 'perm', 'ungranted publish denied', r);
ok(api(tNew, 'sMe').data.staff.perms.length === 2, 'sMe reflects custom perms');

// تعديل الصلاحيات يسري فورًا وبلا تغيير الرمز
r = api(tMgr, 'sTeamSave', { id: row.id, name: 'مشرف تجريبي جديد', title: 'مشرف مزرعة 8', phone: '01000000008', role: 'supervisor', perms: ['report'], active: 1 });
ok(r.ok, 'manager edits perms without touching PIN', r);
ok(!api(tNew, 'sStats').ok, 'removed dashboard takes effect at once');
ok(sl('01000000008', '4321').ok, 'PIN kept when left empty on edit');

// مساعد بلا أي صلاحية مخصّصة
r = api(tMgr, 'sTeamSave', { name: 'معاون تجريبي', title: 'معاون مزرعة 9', phone: '01000000009', role: 'assistant', farmId: '5', perms: [], pin: '5555' });
ok(r.ok, 'assistant with empty custom perms saved', r);
const tNo = sl('01000000009', '5555').data.token;
ok(!api(tNo, 'sInbox').ok && !api(tNo, 'sFind', { q: 'x' }).ok, 'assistant with no perms is denied inbox and gate search');

// إعادة الصلاحيات إلى قالب الدور تُخزَّن فارغة (تتبع الإعدادات لاحقًا)
r = api(tMgr, 'sTeamSave', { id: row.id, name: 'مشرف تجريبي جديد', title: 'مشرف مزرعة 8', phone: '01000000008', role: 'supervisor', perms: api(tMgr, 'sTeamList').data.defaults.supervisor, active: 1 });
ok(r.ok && store.find('Staff', x => x.id === row.id).perms === '', 'perms equal to role defaults are stored as template', r.ok && store.find('Staff', x => x.id === row.id).perms);

// ---------- 5) تحقّق المدخلات ----------
ok(api(tMgr, 'sTeamSave', { name: 'اسم', title: 'مدير', phone: '01000000010', role: 'manager', pin: '1111' }).err === 'role', 'cannot create another manager');
ok(api(tMgr, 'sTeamSave', { name: 'اسم', title: 'مشرف', phone: '01000000003', role: 'supervisor', pin: '1111' }).err === 'dup', 'duplicate phone rejected');
ok(api(tMgr, 'sTeamSave', { name: 'اسم', title: 'معاون', phone: '01000000011', role: 'assistant', farmId: '99', pin: '1111' }).err === 'farm', 'assistant needs a real farm');
ok(api(tMgr, 'sTeamSave', { name: 'اسم', title: 'مشرف', phone: '01000000012', role: 'supervisor' }).err === 'pin', 'PIN required on create');
ok(api(tMgr, 'sTeamSave', { name: 'اسم', title: 'مشرف', phone: '01000000012', role: 'supervisor', pin: '1111', email: 'bad' }).err === 'email', 'bad email rejected');
ok(api(tMgr, 'sTeamSave', { id: 'S-04', name: 'مدير', title: 'مدير', phone: '01000000004', role: 'supervisor', perms: [] }).err === 'self', 'manager cannot edit own row');
ok(api(tMgr, 'sTeamDelete', { id: 'S-04' }).err === 'self', 'manager cannot delete self');

// ---------- 6) الحذف: إيقاف فوري وإعادة تفعيل ----------
ok(api(tAdm, 'sMe').ok, 'officer works before deletion');
r = api(tMgr, 'sTeamDelete', { id: 'S-05' }); ok(r.ok, 'manager deletes officer', r);
ok(!api(tAdm, 'sMe').ok && api(tAdm, 'sMe').err === 'auth', 'deleted account token revoked at once');
ok(!sl('01000000005', '1234').ok, 'deleted account cannot log in');
r = api(tMgr, 'sTeamSave', { name: 'موظف جديد', title: 'مسؤول', phone: '01000000005', role: 'admin', perms: [], pin: '9999' });
ok(r.err === 'dup' && /موقوف/.test(r.msg), 'phone of a deleted account points to re-activation', r);
r = api(tMgr, 'sTeamSave', { id: 'S-05', name: 'موظف تجريبي ٥', title: 'مسؤول النظام', phone: '01000000005', role: 'admin', perms: [], active: 1, pin: '7777' });
ok(r.ok && sl('01000000005', '7777').ok, 'officer re-activated with a new PIN', r);

// ---------- 7) الناشر البديل ينشر مهما كان دوره ----------
setCfg('market.backup', 'S-02');
const tB = sl('01000000002', '1234').data.token;
r = api(tB, 'sMarketSet', { values: { hatch: 12 } });
ok(r.ok || (r.err !== 'perm'), 'backup assistant can attempt publishing', r);
ok(api(tB, 'sMe').data.staff.perms.includes('prices.publish'), 'backup assistant shows publish perm');

console.log('\nTEAM PASS', passes, 'FAIL', fails);
process.exit(fails ? 1 : 0);
