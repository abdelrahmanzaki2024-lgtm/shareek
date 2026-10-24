// اختبارات: تعديل بيانات التاجر وتغيير رمزه وحذفه من الإدارة (traders.edit و traders.delete)
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
const NOW = Date.UTC(2026, 9, 1, 9, 0);
let clock = NOW, ctr = 0;
const env = {
  now: () => clock, secret: () => 'test-secret',
  randHex: (n) => { let s = ''; for (let i = 0; i < n; i++) { ctr++; s += ((ctr * 2654435761 >>> 0) & 15).toString(16) + ((ctr * 40503 >>> 0) & 15).toString(16); } return s; },
  notify: () => true, onError: (e) => { console.log('ERR', e.stack); }
};
const store = C.createMemoryStore({}, null);
C.seedDemo(store, env);
const svc = C.createService(store, env);
const api = (tok, a, p) => svc.api(tok, a, JSON.stringify(p || {}));
const sl = (phone, pin) => api('', 'staffLogin', { phone, pin });
const tick = (ms) => { clock += ms || 60000; };

const tSup = sl('01000000003', '1234').data.token;
const tMgr = sl('01000000004', '1234').data.token;
const tAdm = sl('01000000005', '1234').data.token;
const tA1 = sl('01000000001', '1234').data.token;
ok(tSup && tMgr && tAdm && tA1, 'staff logins work');

// ---------- الصلاحيات الافتراضية ----------
const mp = api(tMgr, 'sMe').data.staff.perms, sp = api(tSup, 'sMe').data.staff.perms, ap = api(tA1, 'sMe').data.staff.perms;
ok(mp.includes('traders.edit') && mp.includes('traders.delete'), 'manager gets edit and delete by default', mp);
ok(!sp.includes('traders.edit') && !sp.includes('traders.delete'), 'supervisor does not get edit or delete by default', sp);
ok(!ap.includes('traders.edit') && !ap.includes('traders.delete'), 'assistant does not get edit or delete by default', ap);

const tr1 = store.all('Traders')[0], tr2 = store.all('Traders')[1], tr3 = store.all('Traders')[2];
const id1 = tr1.id, phone1 = tr1.phone;
ok(!!tr1 && !!tr2 && !!tr3, 'seed has at least three traders');

// ---------- المشرف بلا الصلاحية يُمنع ----------
let r = api(tSup, 'sTraderGet', { id: id1 });
ok(!r.ok && r.err === 'perm', 'supervisor cannot read trader for editing', r);
r = api(tSup, 'sTraderSave', { id: id1, name: 'اسم جديد', phone: phone1 });
ok(!r.ok && r.err === 'perm', 'supervisor cannot edit trader', r);
r = api(tSup, 'sTraderDelete', { id: id1 });
ok(!r.ok && r.err === 'perm', 'supervisor cannot delete trader', r);
ok(store.find('Traders', x => x.id === id1).status !== 'deleted', 'denied delete leaves trader active');

// ---------- المدير يقرأ بيانات التاجر للتعديل ----------
const traderTok = api('', 'login', { phone: phone1, pin: '1234' }).data.token;
ok(!!traderTok, 'trader logs in with seed PIN before any change');
r = api(tMgr, 'sTraderGet', { id: id1 });
ok(r.ok && r.data.trader.phone === phone1 && r.data.trader.code === tr1.code && r.data.trader.name === tr1.name, 'manager reads trader details', r);
ok(!('pinHash' in r.data.trader) && !('salt' in r.data.trader), 'trader details never expose PIN material', r.data);

// ---------- تعديل البيانات دون تغيير الرمز ----------
tick();
r = api(tMgr, 'sTraderSave', { id: id1, name: 'اسم معدّل', phone: phone1, plate: '1234 ب س', company: 'شركة تجريبية', pin: '' });
ok(r.ok && store.find('Traders', x => x.id === id1).name === 'اسم معدّل', 'manager edits name', r);
ok(store.find('Traders', x => x.id === id1).company === 'شركة تجريبية', 'manager edits company');
ok(api(traderTok, 'me').ok, 'session survives a data-only edit');
ok(api('', 'login', { phone: phone1, pin: '1234' }).ok, 'old PIN still works after data-only edit');

// ---------- التحقق من المدخلات ----------
r = api(tMgr, 'sTraderSave', { id: id1, name: 'اس', phone: phone1 });
ok(!r.ok && r.err === 'name', 'short name rejected', r);
r = api(tMgr, 'sTraderSave', { id: id1, name: 'اسم صحيح', phone: '123' });
ok(!r.ok && r.err === 'phone', 'invalid phone rejected', r);
r = api(tMgr, 'sTraderSave', { id: id1, name: 'اسم صحيح', phone: tr2.phone });
ok(!r.ok && r.err === 'dup', 'phone of another trader rejected', r);
r = api(tMgr, 'sTraderSave', { id: id1, name: 'اسم صحيح', phone: '01000000003' });
ok(!r.ok && r.err === 'dup', 'phone of a staff account rejected', r);
r = api(tMgr, 'sTraderSave', { id: id1, name: 'اسم صحيح', phone: phone1, pin: '12' });
ok(!r.ok && r.err === 'pin', 'PIN shorter than 4 digits rejected', r);
r = api(tMgr, 'sTraderSave', { id: 'NOPE', name: 'اسم صحيح', phone: phone1 });
ok(!r.ok && r.err === 'nf', 'unknown trader rejected', r);

// ---------- تغيير الرمز: الجلسات القديمة تنتهي والرمز القديم يتوقف ----------
tick();
const oldPhoneFails = api('', 'login', { phone: phone1, pin: '1234' });
r = api(tMgr, 'sTraderSave', { id: id1, name: 'اسم معدّل', phone: phone1, pin: '9876' });
ok(r.ok, 'manager resets trader PIN', r);
ok(!api(traderTok, 'me').ok && api(traderTok, 'me').err === 'auth', 'session issued before PIN reset is ended');
ok(!api('', 'login', { phone: phone1, pin: '1234' }).ok, 'old PIN stops working after reset');
tick();
const newLogin = api('', 'login', { phone: phone1, pin: '9876' });
ok(newLogin.ok && api(newLogin.data.token, 'me').ok, 'new PIN works and opens a new session', newLogin);
ok(!!oldPhoneFails, 'sanity');

// ---------- الحذف: إيقاف كامل مع حفظ السجل ----------
const traderCount = store.all('Traders').length;
r = api(tSup, 'sTraderDelete', { id: tr2.id });
ok(!r.ok && r.err === 'perm', 'supervisor cannot delete', r);
r = api(tMgr, 'sTraderDelete', { id: tr2.id });
ok(r.ok, 'manager deletes a trader', r);
const tok2 = api('', 'login', { phone: tr2.phone, pin: '1234' });
ok(!tok2.ok, 'deleted trader cannot log in with the old PIN');
r = api(tMgr, 'sTraders', { q: '' });
ok(r.ok && !r.data.list.some(x => x.id === tr2.id), 'deleted trader hidden from trader search');
ok(store.all('Traders').length === traderCount && store.find('Traders', x => x.id === tr2.id), 'deleted trader record is kept');
ok(store.find('Traders', x => x.id === tr2.id).status === 'deleted', 'status is deleted');
r = api(tMgr, 'sTraderGet', { id: tr2.id });
ok(!r.ok && r.err === 'nf', 'deleted trader cannot be opened for editing', r);
r = api(tMgr, 'sTraderSave', { id: tr2.id, name: 'اسم', phone: tr2.phone });
ok(!r.ok && r.err === 'nf', 'deleted trader cannot be edited', r);
r = api(tMgr, 'sTraderDelete', { id: tr2.id });
ok(!r.ok && r.err === 'nf', 'deleting twice is refused', r);
r = api(tMgr, 'sBlock', { id: tr2.id, on: false });
ok(!r.ok && r.err === 'nf', 'block toggle cannot revive a deleted trader', r);
ok(store.find('Traders', x => x.id === tr2.id).status === 'deleted', 'status stays deleted after block toggle');
r = api('', 'register', { name: 'اسم جديد', phone: tr2.phone, pin: '1111', agree: true });
ok(!r.ok && r.err === 'phone_exists' && /أُوقف/.test(r.msg), 'phone of a deleted trader points to the officer', r);

// ---------- جلسة تاجر حُذف تنتهي فورًا ----------
tick();
r = api(tMgr, 'sTraderDelete', { id: tr1.id });
ok(r.ok, 'manager deletes the first trader');
ok(api(newLogin.data.token, 'me').err === 'auth', 'deleted trader session is revoked at once');
ok(!api('', 'login', { phone: phone1, pin: '9876' }).ok, 'deleted trader cannot log in with the new PIN');

// ---------- صلاحية التعديل وحدها دون الحذف ----------
tick();
r = api(tMgr, 'sTeamSave', { name: 'مشرف للتعديل', title: 'مشرف', phone: '01000000030', role: 'supervisor', perms: ['traders', 'traders.edit'], pin: '2222' });
ok(r.ok, 'manager grants a supervisor edit only', r);
const tE = sl('01000000030', '2222').data.token;
ok(!!tE, 'edit-only supervisor logs in');
r = api(tE, 'sTraderDelete', { id: tr3.id });
ok(!r.ok && r.err === 'perm', 'edit-only supervisor cannot delete', r);
r = api(tE, 'sTraderSave', { id: tr3.id, name: 'اسم بعد التعديل', phone: tr3.phone });
ok(r.ok && store.find('Traders', x => x.id === tr3.id).name === 'اسم بعد التعديل', 'edit-only supervisor can edit data', r);

// ---------- سجل الأحداث ----------
const evs = store.all('Events').filter(e => e.type === 'trader_edit' || e.type === 'trader_delete');
ok(evs.length >= 3 && evs.every(e => e.traderId === ''), 'edit and delete are logged without trader link', evs.map(e => e.type));
ok(evs.every(e => !/9876|1234/.test(e.meta)), 'log never stores a PIN');

console.log('\nTRADER PASS', passes, 'FAIL', fails);
process.exit(fails ? 1 : 0);
