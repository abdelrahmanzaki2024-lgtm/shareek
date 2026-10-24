const vm = require('vm');
const C = require('./dist/core.js');
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }

let NOW = Date.UTC(2026, 9, 1, 9, 0);
const G = require('./t_gas_env.js').make();
const cx = G.ctx, run = (c) => vm.runInContext(c, cx);
cx.__now = () => NOW; run('GAS.setNow(function(){ return __now(); })');
const api = (tok, a, p) => cx.api(tok, a, JSON.stringify(p || {}));

// ---------- الإعداد ----------
run('GAS.setup()');
const names = G.book.getSheets().map(s => s.name);
Object.keys(C.SCHEMA).forEach(t => ok(names.includes(t), 'sheet ' + t));
ok(names.includes('موظفون_جدد') && !names.includes('Sheet1'), 'staff import sheet created, default sheet removed', names);
Object.keys(C.SCHEMA).forEach(t => ok(G.book.getSheetByName(t).getRange(1, 1, 1, C.SCHEMA[t].length).getValues()[0].join('|') === C.SCHEMA[t].map(c => c[0]).join('|'), 'headers ' + t));
ok(G.props.SECRET && G.props.SECRET.length === 64 && G.props.SHEET_ID === 'fake-book', 'secret + sheet id stored');
const secret1 = G.props.SECRET; run('GAS.setup()'); ok(G.props.SECRET === secret1, 'setup idempotent keeps secret');
ok(G.book.getSheetByName('Farms').getLastRow() === 11 && G.book.getSheetByName('Content').getLastRow() === 1 + C.VIDEOS.length, 'seeded farms/content once', [G.book.getSheetByName('Farms').getLastRow(), G.book.getSheetByName('Content').getLastRow()]);
ok(G.book.getSheetByName('Config').getLastRow() > 20, 'config sample rows');
ok(G.book.getSheetByName('MarketItems').getLastRow() === 1 + C.MARKET_ITEMS.length, 'market items seeded once');
{ const cfgRows = (G.book.getSheetByName('Config').getRange(2, 1, G.book.getSheetByName('Config').getLastRow() - 1, 1).getValues()).map(r => r[0]); ok(cfgRows.includes('market.editRole') && cfgRows.filter(k => k === 'market.editRole').length === 1, 'market config rows present once'); }
{ const cr = G.book.getSheetByName('Config').getRange(2, 1, G.book.getSheetByName('Config').getLastRow() - 1, 2).getValues(); const w = {}; cr.forEach(r => { if (/^welcome\./.test(r[0])) w[r[0]] = r[1]; }); ok(Object.keys(w).length === 11 && w['welcome.on'] !== false && /كايرو ثري ايه/.test(w['welcome.sign']) && w['welcome.message'] === '' && [1, 2, 3, 4, 5, 6, 7, 8].every(i => String(w['welcome.t' + i]).length > 30), 'welcome config rows (incl. 8 ready-made lines) seeded once', Object.keys(w).length); }
/* ترقية من إصدار قديم: أوراق السوق غير موجودة → تُنشأ تلقائيًا عند أول استخدام، وإعادة التهيئة تضيف الإعدادات الناقصة فقط */
{
  G.book.deleteSheet(G.book.getSheetByName('MarketDay')); G.book.deleteSheet(G.book.getSheetByName('MarketItems'));
  const n0 = run("GAS.session().store.all('MarketDay').length");
  ok(n0 === 0 && !!G.book.getSheetByName('MarketDay') && G.book.getSheetByName('MarketDay').getRange(1, 1, 1, 5).getValues()[0].join('|') === 'dk|prices|note|by|ts', 'MarketDay self-created on first use');
  run('GAS.setup()'); ok(G.book.getSheetByName('MarketItems').getLastRow() === 1 + C.MARKET_ITEMS.length, 'setup re-seeds missing MarketItems');
  const cs = G.book.getSheetByName('Config'); const before = cs.getLastRow(); run('GAS.setup()'); ok(cs.getLastRow() === before, 'setup does not duplicate config rows');
}

// ---------- استيراد الموظفين ----------
const imp = G.book.getSheetByName('موظفون_جدد');
const put = (r, arr) => arr.forEach((v, j) => imp._put(r, j + 1, v));
put(3, ['سامي أحمد', 'معاون مزرعة 5', 'معاون', '5', '01012345678', 'sami@example.test', '4821', '']);
put(4, ['منى علي', 'مشرف الأمن الحيوي', 'مشرف', '', '01112345678', 'mona@example.test', '5932', '']);
put(5, ['خالد', 'مدير', 'مدير', '', '01212345678', '', '6043', '']);
put(6, ['نادر', 'مسؤول', 'مسؤول', '', '01512345678', '', '7154', '']);
put(7, ['خطأ', 'معاون', 'غير معروف', '', '01012345670', '', '1234', '']);
put(8, ['رقم غلط', 'معاون', 'معاون', '', '0123', '', '1234', '']);
const r1 = run('GAS.importStaff()');
ok(r1.added === 4 && r1.errors === 2 && r1.updated === 0, 'import counts', r1);
ok(imp.getRange(3, 7).getValues()[0][0] === '' && /تم/.test(imp.getRange(3, 8).getValues()[0][0]), 'PIN cleared after import');
ok(/✗/.test(imp.getRange(7, 8).getValues()[0][0]) && /✗/.test(imp.getRange(8, 8).getValues()[0][0]), 'invalid rows flagged');
const staffSheet = G.book.getSheetByName('Staff');
const staffVals = staffSheet.getRange(2, 1, staffSheet.getLastRow() - 1, C.SCHEMA.Staff.length).getValues();
ok(staffVals.length === 4 && staffVals.every(r => typeof r[5] === 'string' && r[5].startsWith('01')), 'staff phones stored as text with leading zero', staffVals.map(r => r[5]));
ok(!JSON.stringify(staffVals).includes('4821') && !JSON.stringify(staffVals).includes('7154'), 'PINs never stored in clear');
ok(staffVals[0][0] === 'S-01' && staffVals[3][0] === 'S-04', 'staff ids sequential');
// تحديث موظف قائم (إعادة تعيين الرمز)
put(9, ['سامي أحمد', 'معاون مزرعة 5', 'معاون', '5', '01012345678', 'sami@example.test', '1111', '']);
const r2 = run('GAS.importStaff()'); ok(r2.updated === 1 && r2.added === 0, 'reimport updates existing', r2);
let r = api('', 'staffLogin', { phone: '01012345678', pin: '4821' }); ok(!r.ok && r.err === 'bad_login', 'old PIN rejected');
r = api('', 'staffLogin', { phone: '01012345678', pin: '1111' }); ok(r.ok && r.data.staff.role === 'assistant' && r.data.staff.farmId === '5', 'new PIN works', r);
const sTok = r.data.token;

// ---------- مسار تاجر كامل مع التخزين في الشيت ----------
r = api('', 'register', { name: 'تاجر شيت', phone: '01299990001', pin: '2468', plate: '1357 أ ب', agree: true }); ok(r.ok, 'register', r);
const tTok = r.data.token, tid = r.data.me.id;
const trSheet = G.book.getSheetByName('Traders'); const tv = trSheet.getRange(2, 1, trSheet.getLastRow() - 1, 16).getValues();
ok(tv.length === 1 && tv[0][3] === '01299990001' && typeof tv[0][3] === 'string', 'trader phone is text in sheet', tv[0] && tv[0][3]);
ok(tv[0][4] && tv[0][4] !== '2468' && tv[0][4].length === 64, 'PIN hash only');
r = api('', 'login', { phone: '01299990001', pin: '2468' }); ok(r.ok && r.data.me.id === tid, 'login after reload from sheet');
r = api(tTok, 'roundSubmit', { answer: true }); ok(r.ok && r.data.pts === 10, 'round via sheet store', r);
const st2 = JSON.parse(trSheet.getRange(2, 15).getValues()[0][0]); ok(st2.pts === 10 && st2.days.length === 1, 'state persisted as JSON', st2.pts);
// حقن معادلة في نص رسالة
r = api(tTok, 'ticketCreate', { type: 'inquiry', subject: '=HYPERLINK("http://x")', body: '=1+1 تفاصيل' }); ok(r.ok, 'ticket with formula-like text', r);
const tk = G.book.getSheetByName('Tickets'); const tm = G.book.getSheetByName('TicketMsgs');
ok(tk.getRange(2, 6).getValues()[0][0].startsWith('=') && G.book.stats.formula === 0, 'formula text kept as plain text, never evaluated');
ok(G.book.stats.autoconv === 0, 'no automatic type conversions anywhere', G.book.stats.autoconv);
ok(G.mails.length >= 1 && G.mails.every(m => !/تفاصيل|1\+1|HYPERLINK/.test(m.body + m.sub)), 'emails carry no message text', G.mails);
ok(G.mails.some(m => m.to[0] === 'sami@example.test'), 'mail to farm-5 assistant');

// ---------- التصعيد من المؤقت ----------
NOW += 3 * 3600000;                           // استفسار: مهلة المشرف 24 ساعة. نضيف عاجلًا
r = api(tTok, 'ticketCreate', { type: 'urgent', subject: 'اشتباه مرض', body: 'نفوق ملحوظ' }); ok(r.ok, 'urgent ticket');
G.mails.length = 0; NOW += 2.5 * 3600000;
let res = run('GAS.tick()'); ok(res.escalated === 1, 'timer escalates overdue urgent ticket', res);
ok(G.mails.some(m => m.to[0] === 'mona@example.test') && !G.mails.some(m => m.to[0] === 'khaled@example.test'), 'escalation mail goes to supervisor only', G.mails.map(m => m.to[0]));
res = run('GAS.tick()'); ok(res.escalated === 0, 'timer idempotent');

// ---------- المؤقت والقفل والصحة ----------
run('GAS.installTriggers()'); run('GAS.installTriggers()'); ok(G.triggers.length === 1 && G.triggers[0].getHandlerFunction() === 'tickJob' && G.triggers[0].n === 15, 'single 15-min trigger');
cx.__lock = true; G.sandbox.__lockHeld = true; r = api(tTok, 'me'); ok(!r.ok && r.err === 'busy', 'busy when lock held'); G.sandbox.__lockHeld = false;
r = api(tTok, 'me'); ok(r.ok, 'lock released');
const h = run('GAS.health()'); ok(h.text.includes('✓') && /مشرف: 1 — مدير: 1/.test(h.text) && /التصعيد التلقائي/.test(h.text), 'health report', h.text);
const hh = run('GAS.health().ok'); ok(hh === false, 'health flags missing videos (not yet linked)');
const home = api(tTok, 'home'); ok(home.ok && home.data.appUrl === 'https://script.google.com/macros/s/FAKE/exec', 'home carries app url');

// ---------- المنطقة الزمنية والتوقيت الصيفي ----------
const tzIn = (ts) => vm.runInContext('C3A.U.dateKey(' + ts + ') + " " + C3A.U.hhmm(' + ts + ')', cx);
const tzRef = (ts) => C.U.dateKey(ts) + ' ' + C.U.hhmm(ts);
[Date.UTC(2026, 9, 1, 21, 30), Date.UTC(2026, 11, 1, 21, 30), Date.UTC(2026, 3, 23, 21, 59), Date.UTC(2026, 3, 23, 22, 1), Date.UTC(2026, 9, 28, 20, 59), Date.UTC(2026, 9, 28, 21, 1), Date.UTC(2027, 0, 5, 0, 0)].forEach(ts => ok(tzIn(ts) === tzRef(ts), 'tz ' + new Date(ts).toISOString() + ' → ' + tzRef(ts), [tzIn(ts), tzRef(ts)]));

// ---------- النمو: أكثر من 1000 صف ----------
const g = run('GAS.session()');
for (let i = 0; i < 1500; i++) g.store.insert('Events', { ts: i + 1, traderId: 'x', type: 't', ref: '', points: 0, meta: '' });
g.store.flush();
ok(G.book.getSheetByName('Events').getLastRow() >= 1500 && G.book.getSheetByName('Events').maxRows >= 1501, 'sheet grows beyond default rows', [G.book.getSheetByName('Events').getLastRow(), G.book.getSheetByName('Events').maxRows]);
const before = { r: G.book.stats.reads, w: G.book.stats.writes };
api(tTok, 'roundGet'); api(tTok, 'home');
console.log('(API calls to Sheets per 2 requests: reads', G.book.stats.reads - before.r, 'writes', G.book.stats.writes - before.w, ')');

// ---------- بيانات تجريبية على جدول غير فارغ ----------
let threw = false; try { run('GAS.seedDemoData()'); } catch (e) { threw = /يوجد/.test(e.message); } ok(threw, 'demo seed refuses non-empty sheet');

// ---------- نقل المفتاح لحساب آخر ----------
const key0 = run('GAS.getKey()'); ok(/^[0-9a-f]{64}$/.test(key0) && key0 === G.props.SECRET, 'export key');
let badKey = 0; ['xyz', '', 'g'.repeat(64), 'a'.repeat(63)].forEach(k => { try { cx.__k = k; run('GAS.setKey(__k)'); } catch (e) { badKey++; } });
ok(badKey === 4 && G.props.SECRET === key0, 'invalid keys rejected, key unchanged');
run('GAS.setKey("' + 'a'.repeat(64) + '")');
r = api('', 'login', { phone: '01299990001', pin: '2468' }); ok(!r.ok, 'different key: PIN hashes no longer match');
r = api(tTok, 'home'); ok(!r.ok, 'different key: old tokens invalid');
run('GAS.setKey("  ' + key0.toUpperCase() + ' ")');
ok(G.props.SECRET === key0, 'key normalized (case/spaces)');
r = api('', 'login', { phone: '01299990001', pin: '2468' }); ok(r.ok, 'restored key: logins work again', r);
r = api(tTok, 'home'); ok(r.ok, 'restored key: old tokens valid again');

// ---------- استيراد الموظفين: تسامح مع المسميات الكاملة والهمزات ورقم المزرعة ----------
put(10, ['مستخدم أ', 'مسؤول الأمن الحيوي', 'مسئول الأمن الحيوي', 'كامل الموقع', '01055550001', '', '2468', '']);
put(11, ['مستخدم ب', 'مشرف الأمن الحيوي', 'مشرف الامن الحيوي', 'كامل الموقع', '01055550002', '', '2468', '']);
put(12, ['مستخدم ج', 'معاون أمن حيوي', 'معاون امن حيوي', 'مزرعة 5', '01055550003', '', '2468', '']);
put(13, ['مستخدم د', 'مدير إدارة', 'مدير ادارة الامن الحيوي', '', '01055550004', '', '2468', '']);
put(14, ['خطأ1', 'معاون مدير', 'معاون مدير', '5', '01055550005', '', '2468', '']);
put(15, ['خطأ2', 'معاون', 'معاون', 'كامل الموقع', '01055550006', '', '2468', '']);
put(16, ['خطأ3', 'معاون', 'معاون', '99', '01055550007', '', '2468', '']);
put(17, ['خطأ4', 'معاون', 'معاون', '5', '01032200', '', '2468', '']);
put(18, ['خطأ5', '', 'xyz', '', '12', 'bad', '12', '']);
put(19, ['مستخدم هـ', 'معاون مزرعة ٣', 'معاون', '٣', '٠١٠٥٥٥٥٠٠٠٦', '', '٢٤٦٨', '']);
const r3 = run('GAS.importStaff()');
ok(r3.added === 5 && r3.errors === 7, 'tolerant import counts (7 = 2 old flagged + 5 new bad)', r3);
const sv = () => { const sh = G.book.getSheetByName('Staff'); return sh.getRange(2, 1, sh.getLastRow() - 1, C.SCHEMA.Staff.length).getValues(); };
const byPhone = (ph) => sv().find(r => r[5] === ph);
ok(byPhone('01055550001')[3] === 'admin' && byPhone('01055550001')[4] === '', 'full title in role cell: مسئول → admin, farm text ignored', byPhone('01055550001'));
ok(byPhone('01055550002')[3] === 'supervisor' && byPhone('01055550002')[4] === '', 'مشرف الامن الحيوي → supervisor');
ok(byPhone('01055550003')[3] === 'assistant' && byPhone('01055550003')[4] === '5', '«مزرعة 5» → farm 5');
ok(byPhone('01055550004')[3] === 'manager', 'مدير ادارة الامن الحيوي → manager');
ok(byPhone('01055550006')[3] === 'assistant' && byPhone('01055550006')[4] === '3', 'Arabic-Indic digits for farm, phone and PIN accepted');
const st = (row) => String(imp.getRange(row, 8).getValues()[0][0]);
ok(/غير واضح/.test(st(14)), 'ambiguous role flagged', st(14));
ok(/رقم المزرعة مطلوب/.test(st(15)), 'assistant without farm number flagged', st(15));
ok(/غير موجودة/.test(st(16)) && /Farms/.test(st(16)), 'unknown farm flagged with how to fix', st(16));
ok(/الموبايل/.test(st(17)), 'short phone flagged', st(17));
ok(/المسمى/.test(st(18)) && /الدور/.test(st(18)) && /الموبايل/.test(st(18)) && /الرمز/.test(st(18)) && /البريد/.test(st(18)), 'all problems of a row listed together', st(18));
ok(/^✓/.test(st(3)), 'earlier imported rows keep ✓ (not re-flagged)', st(3));
const r4 = run('GAS.importStaff()'); ok(r4.added === 0 && r4.updated === 0 && r4.errors === 7, 'second run changes nothing and does not re-flag imported rows', r4);

// ---------- نقطة POST للنسخة المستضافة (GitHub Pages) ----------
{
  const post = (obj) => cx.doPost(obj);
  const parse = (out) => JSON.parse(out.getContent());
  const body = (action, token, payload) => ({ postData: { contents: JSON.stringify({ action, token, payload: JSON.stringify(payload || {}) }) } });
  let out = post(body('staffLogin', '', { phone: '01012345678', pin: '1111' }));
  let res = parse(out);
  ok(out.mime === 'application/json', 'doPost answers JSON');
  ok(res.ok && res.data.token && res.data.staff.role === 'assistant', 'doPost staffLogin returns token', res);
  const stok = res.data.token;
  res = parse(post(body('sMe', stok, {})));
  ok(res.ok && res.data.staff.role === 'assistant' && Array.isArray(res.data.farms), 'doPost sMe with token', res);
  res = parse(post(body('sMe', 'bad-token', {})));
  ok(!res.ok && res.err === 'auth', 'doPost rejects bad token', res);
  res = parse(post({ postData: { contents: '{not json' } }));
  ok(!res.ok && /طلب غير صالح/.test(res.msg), 'doPost malformed body answered politely', res);
  res = parse(post({}));
  ok(!res.ok, 'doPost without body is refused', res);
  res = parse(post(body('home', '', {})));
  ok(res.ok === false || (res.ok && res.data && 'appUrl' in res.data), 'doPost home does not crash', res);
  const sheetRows = G.book.getSheetByName('Staff').getLastRow();
  post(body('staffLogin', '', { phone: '01012345678', pin: '0000' }));
  ok(G.book.getSheetByName('Staff').getLastRow() === sheetRows, 'doPost failed login writes nothing unexpected');
}

console.log('\nGAS PASS', passes, 'FAIL', fails);
process.exit(fails ? 1 : 0);
