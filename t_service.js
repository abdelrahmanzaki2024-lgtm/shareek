const C = require('./dist/core.js'); const U = C.U, L = C.L;
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) { passes++; } else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b }); }

let NOW = Date.UTC(2026, 9, 1, 9, 0);   // الخميس 1 أكتوبر 2026 12:00 بتوقيت القاهرة
const MODE = process.env.STORE || 'mem';
let ctr = 0; let mails = [];
let store, svc, api, gasEnv = null;
if (MODE === 'gas') {
  gasEnv = require('./t_gas_env.js').make();
  const cx = gasEnv.ctx; mails = gasEnv.mails;
  const vm = require('vm'); const run = (c) => vm.runInContext(c, cx);
  run('GAS.setNow'); cx.__now = () => NOW; run('GAS.setNow(function(){ return __now(); })');
  run('GAS.setup()'); run('GAS.seedDemoData()');
  const sess = () => run('GAS.session()');
  store = {
    find: (t, fn) => sess().store.find(t, fn), filter: (t, fn) => sess().store.filter(t, fn), all: (t) => sess().store.all(t),
    update: (t, k, p) => { const g = sess(); const r = g.store.update(t, k, p); g.store.flush(); return r; }
  };
  api = (tok, a, p) => cx.api(tok, a, JSON.stringify(p || {}));
  svc = { tick: () => run('GAS.tick()') };
} else {
  const env = { now: () => NOW, secret: () => 'test-secret', randHex: (n) => { let s = ''; for (let i = 0; i < n; i++) { ctr++; s += ((ctr * 2654435761 >>> 0) & 15).toString(16) + ((ctr * 40503 >>> 0) & 15).toString(16); } return s.slice(0, n * 2); },
    notify: (to, sub, body, html) => { mails.push({ to, sub, body, html }); return true; }, onError: (e) => { console.log('ERR', e.stack); } };
  store = C.createMemoryStore({}, null);
  C.seedDemo(store, env);
  svc = C.createService(store, env);
  api = (tok, a, p) => svc.api(tok, a, JSON.stringify(p || {}));
}
store.update('Staff', 'S-01', { email: 'a1@example.test' }); store.update('Staff', 'S-03', { email: 'sup@example.test' }); store.update('Staff', 'S-04', { email: 'mgr@example.test' });

// ---------- الدخول ----------
let r = api('', 'login', { phone: '01100000001', pin: '1234' }); ok(r.ok, 'login A', r);
const tA = r.data.token; ok(r.data.me.rank.n === 2, 'A rank 2', r.data.me.rank);
r = api('', 'login', { phone: '01100000001', pin: '9999' }); ok(!r.ok && r.err === 'bad_login', 'bad pin');
r = api('', 'login', { phone: '٠١١٠٠٠٠٠٠٠٢', pin: '١٢٣٤' }); ok(r.ok, 'arabic digits login', r);
for (let i = 0; i < 5; i++) api('', 'login', { phone: '01100000004', pin: '0000' });
r = api('', 'login', { phone: '01100000004', pin: '1234' }); ok(!r.ok && r.err === 'locked', 'lockout after 5 fails', r);
r = api('bad.token', 'me'); ok(!r.ok && r.err === 'auth', 'bad token');
r = api(tA, 'sFind', { q: 'a7k2' }); ok(!r.ok && r.err === 'auth', 'trader token cannot call staff');

// ---------- التسجيل والدعوة ----------
r = api('', 'register', { name: 'تاجر جديد', phone: '01299999999', pin: '4321', plate: '7777 هـ و', agree: true, ref: 'A7K2' }); ok(r.ok, 'register', r);
const tN = r.data.token, idN = r.data.me.id, codeN = r.data.me.code; ok(/^[A-Z2-9]{4}$/.test(codeN), 'code format', codeN);
r = api('', 'register', { name: 'تاجر جديد', phone: '01299999999', pin: '4321', agree: true }); ok(!r.ok && r.err === 'phone_exists', 'dup phone');
r = api('', 'register', { name: 'ب', phone: '01299999998', pin: '4321', agree: true }); ok(!r.ok && r.err === 'name', 'short name');
r = api('', 'register', { name: 'اسم كامل', phone: '012', pin: '4321', agree: true }); ok(!r.ok && r.err === 'phone', 'bad phone');
r = api('', 'register', { name: 'اسم كامل', phone: '01299999997', pin: '12', agree: true }); ok(!r.ok && r.err === 'pin', 'bad pin');
r = api('', 'register', { name: 'اسم كامل', phone: '01299999997', pin: '1234' }); ok(!r.ok && r.err === 'agree', 'need agree');

// ---------- التهيئة: فيديو + ميثاق + اختبار ----------
r = api(tN, 'videoDone', { id: 'launch' }); ok(!r.ok && r.err === 'too_early', 'video before start', r);
api(tN, 'videoStart', { id: 'launch' });
r = api(tN, 'videoDone', { id: 'launch' }); ok(!r.ok && r.err === 'too_early', 'video too early', r);
NOW += 50 * 1000;
r = api(tN, 'videoDone', { id: 'launch' }); ok(r.ok && r.data.pts === 5, 'video ok +5', r);
r = api(tN, 'videoDone', { id: 'launch' }); ok(r.ok && r.data.already, 'video once');
r = api(tN, 'charterSign', {}); ok(r.ok && r.data.pts === 20, 'charter +20', r);
let t = api(tN, 'testGet', { kind: 'baseline' }).data; ok(t.items.length === 9, 'baseline 9 items', t.items.length);
ok(!JSON.stringify(t).includes('"a"') && !JSON.stringify(t).includes('"why"'), 'test has no answer keys');
function answerTest(items, allRight) {
  return items.map(it => {
    if (it.kind === 'tf') { const k = C.GAMES.tf.items.find(x => x.id === it.id); return allRight ? k.a : !k.a; }
    const k = C.GAMES.shoes.items.find(x => x.id === it.id); const want = k.opts[k.a]; const idx = it.opts.indexOf(want); return allRight ? idx : (idx + 1) % 3;
  });
}
r = api(tN, 'testSubmit', { kind: 'baseline', answers: answerTest(t.items, true) }); ok(r.ok && r.data.correct === 9 && r.data.pts === 20, 'baseline perfect', r.data && [r.data.correct, r.data.pts]);
ok(r.data.me.rank.n === 1 && r.data.me.onboarding.done, 'rank 1 after onboarding', r.data.me.rank);
r = api(tN, 'testSubmit', { kind: 'baseline', answers: [] }); ok(!r.ok && r.err === 'done', 'baseline once');
r = api(tN, 'testGet', { kind: 'followup' }); r = api(tN, 'testSubmit', { kind: 'followup', answers: [] }); ok(!r.ok && r.err === 'early', 'followup early');
// الداعي ربح 50
const ptsA = api(tA, 'me').data.pts; ok(ptsA === 410 + 50, 'inviter +50', ptsA);

// ---------- جولة اليوم ----------
r = api(tN, 'roundGet'); ok(r.ok && !r.data.done && r.data.q.q && r.data.card.title, 'round get'); ok(!('a' in r.data.q), 'round has no key');
r = api(tN, 'roundSubmit', { answer: true }); ok(r.ok && r.data.pts === 10, 'round +10', r.data && r.data.pts);
ok(r.data.me.daily.roundDone, 'round flagged');
r = api(tN, 'roundSubmit', { answer: true }); ok(!r.ok && r.err === 'done', 'round once/day');
ok(r.ok === false, 'x');

// ---------- الألعاب: سقف يومي 40 ----------
function playGame(tok, id, perfect) {
  const g = api(tok, 'gameGet', { id }); if (!g.ok) return g;
  const G = C.GAMES[id];
  const ans = g.data.items.map(it => {
    const k = G.items.find(x => x.id === it.id);
    if (G.kind === 'tf') return perfect ? k.a : !k.a;
    if (G.kind === 'order') return perfect ? k.order : it.cards.slice().reverse();
    const idx = it.opts.indexOf(k.opts[k.a]); return perfect ? idx : (idx + 1) % 3;
  });
  return api(tok, 'gameSubmit', { id, answers: ans });
}
let pts0 = api(tN, 'me').data.pts;
r = playGame(tN, 'tf', true); ok(r.ok && r.data.correct === 6 && r.data.pts === 25 && r.data.capped, 'tf perfect = 25 (cap 40 - video 5 - round 10)', r.data && [r.data.correct, r.data.pts, r.data.capped]);
r = playGame(tN, 'steps', true); ok(r.ok && r.data.correct === 3 && r.data.pts === 0 && r.data.capped, 'daily cap reached → 0', r.data && [r.data.pts, r.data.capped]);
r = playGame(tN, 'tf', true); ok(r.ok && r.data.first === false && r.data.pts === 0, 'replay no points');
r = playGame(tN, 'shoes', false); ok(r.ok && r.data.correct === 0 && r.data.res[0].wrong, 'shoes all wrong shows consequences', r.data && r.data.res[0]);
r = playGame(tN, 'defend', true); ok(r.ok && r.data.correct === 6, 'defend perfect');
ok(api(tN, 'me').data.pts - pts0 === 25, 'game points stop at the daily cap (40 total)', api(tN, 'me').data.pts - pts0);
const gtf = api(tN, 'gameGet', { id: 'tf' }).data; ok(!JSON.stringify(gtf).includes('"a":') && !JSON.stringify(gtf).includes('why'), 'game get has no keys');
const gdef = api(tN, 'gameGet', { id: 'defend' }).data; ok(gdef.items.every(i => i.opts.length === 3 && !('a' in i)), 'defend options only');
// الترتيب الخاطئ لا يُحتسب
r = api(tN, 'gameSubmit', { id: 'steps', answers: [['x'], null, 5] }); ok(r.ok && r.data.correct === 0, 'garbage answers → 0');

// ---------- الرسائل والخصوصية ----------
r = api(tA, 'ticketCreate', { type: 'bogus', subject: 'x', body: 'y' }); ok(!r.ok && r.err === 'type', 'bad type');
r = api(tA, 'ticketCreate', { type: 'obstacle', subject: 'ع', body: 'تفاصيل' }); ok(!r.ok && r.err === 'subject', 'short subject');
mails.length = 0;
r = api(tA, 'ticketCreate', { type: 'obstacle', subject: 'مشكلة في التصريح', body: 'التصريح اتأخر ساعتين عند البوابة', farmId: '5' }); ok(r.ok, 'ticket create', r);
const tid = r.data.id; ok(mails.length === 1 && mails[0].to.join() === 'a1@example.test', 'notify only farm-5 assistant', mails);
ok(!mails.some(m => /التصريح/.test(m.body)), 'email has no message text');
const sTok = api('', 'staffLogin', { phone: '01000000001', pin: '1234' }); ok(sTok.ok, 'staff login', sTok); const sT = sTok.data.token;
const inbox = api(sT, 'sInbox', {}).data; ok(inbox.tickets.some(x => x.id === tid), 'assistant 5 sees ticket');
ok(!JSON.stringify(inbox).includes('01100000001'), 'inbox hides trader phone');
// معاون مزرعة 4 لا يرى مزرعة 5
const sT2 = api('', 'staffLogin', { phone: '01000000002', pin: '1234' }).data.token;
ok(!api(sT2, 'sInbox', {}).data.tickets.some(x => x.id === tid), 'assistant 4 cannot see farm 5 ticket');
// شكوى من موظف: تتخطى المعاون
r = api(tA, 'ticketCreate', { type: 'complaint', subject: 'تعامل غير مناسب', body: 'تفاصيل الشكوى هنا', farmId: '5' }); ok(r.ok, 'complaint create');
const cid = r.data.id;
ok(!api(sT, 'sInbox', {}).data.tickets.some(x => x.id === cid), 'complaint hidden from assistant');
r = api(sT, 'sTicket', { id: cid }); ok(!r.ok && r.err === 'nf', 'assistant cannot open complaint');
const sSup = api('', 'staffLogin', { phone: '01000000003', pin: '1234' }).data.token;
ok(api(sSup, 'sInbox', {}).data.tickets.some(x => x.id === cid), 'supervisor sees complaint');
// الرد
r = api(sT, 'sReply', { id: tid, text: 'تم الاطلاع، سنتواصل معك.' }); ok(r.ok, 'staff reply', r);
let tv = api(tA, 'ticketGet', { id: tid }).data; ok(tv.ticket.status === 'answered' && tv.canRate, 'trader sees answered + can rate');
ok(tv.msgs.some(m => m.from === 'staff' && m.who === 'معاون مزرعة 5'), 'staff shown by title');
ok(!JSON.stringify(tv).includes('01000000001') && !JSON.stringify(tv).includes('موظف تجريبي'), 'trader never sees staff phone/name', tv);
const before = api(tA, 'me').data.pts;
r = api(tA, 'ticketRate', { id: tid, stars: 5 }); ok(r.ok && r.data.pts === 2, 'rating +2', r); r = api(tA, 'ticketRate', { id: tid, stars: 5 }); ok(!r.ok, 'rate once');
// طلب اتصال
r = api(sT, 'sCallback', { id: tid }); ok(r.ok && r.data.phone === '01100000001', 'callback reveals trader phone to staff only');
tv = api(tA, 'ticketGet', { id: tid }).data; ok(tv.msgs.some(m => /سيتصل بك/.test(m.text)) && !JSON.stringify(tv).includes('01000000001'), 'callback message to trader, no staff number');
// حد يومي
let lim = null; for (let i = 0; i < 6; i++) { lim = api(tA, 'ticketCreate', { type: 'inquiry', subject: 'سؤال ' + i, body: 'تفاصيل السؤال ' + i }); }
ok(!lim.ok && lim.err === 'limit', 'daily ticket limit', lim);
// اقتراح مقبول
r = api(sSup, 'sAccept', { id: 'T-0003' }); ok(r.ok, 'accept suggestion', r); const b2 = api('', 'login', { phone: '01100000002', pin: '1234' }).data; ok(b2.me.pts === 120 + 100, 'suggestion +100', b2.me.pts);

// ---------- التصعيد ----------
mails.length = 0; let tk = api(sSup, 'sInbox', {}).data.tickets.find(x => x.id === 'T-0002'); ok(tk && tk.level === 1 && tk.overdue, 'T-0002 urgent overdue level1 at view', tk);
let res = svc.tick(); ok(res.escalated >= 1, 'tick escalated', res); ok(mails.length >= 1 && mails.some(m => m.to.indexOf('sup@example.test') >= 0), 'escalation mail to supervisor', mails); ok(store.filter('Notifications', x => true).length >= 2, 'notifications logged'); mails.length = 0;
res = svc.tick(); ok(res.escalated === 0, 'tick idempotent', res);
NOW += 4 * 3600 * 1000; res = svc.tick(); ok(res.escalated >= 1, 'second escalation to manager after 6h', res);
ok(store.find('Tickets', x => x.id === 'T-0002').level === 2, 'level 2');

// ---------- البوابة ----------
const find = api(sT, 'sFind', { q: codeN }).data.list; ok(find.length === 1 && find[0].id === idN, 'find by code');
ok(api(sT, 'sFind', { q: '7777هو' }).data.list.length === 1, 'find by plate');
ok(api(sT, 'sFind', { q: '9999' }).data.list.length === 1, 'find by phone suffix');
const allOk = { hands: true, disinfect: true, vehicle: true, shoes: true };
const pNb = api(tN, 'me').data.pts;
r = api(sT, 'sGate', { traderId: idN, farmId: '5', checks: allOk, waitMin: 12 }); ok(r.ok && r.data.points === 40 && r.data.clean, 'gate clean +40', r);
r = api(sT, 'sGate', { traderId: idN, farmId: '5', checks: allOk }); ok(!r.ok && r.err === 'dup', 'dup gate blocked');
r = api(sT, 'sGate', { traderId: idN, farmId: '4', checks: { hands: true, disinfect: true, vehicle: true, shoes: false } }); ok(r.ok && r.data.points === 10 && !r.data.clean && !r.data.violation, '3/4 → +10', r.data);
r = api(sT, 'sGate', { traderId: idN, farmId: '3', checks: allOk }); ok(r.ok && r.data.points === 0 && r.data.capped, 'daily gate scoring cap', r.data);
const me2 = api(tN, 'me').data; ok(me2.gate.clean === 2 && me2.gate.cleanRun === 1, 'cleanRun reset by partial then restarts at 1', me2.gate);
ok(api(tA, 'me').data.pts === before + 2 + 100 * 0 + 100 /* inviteClean for A */ , 'inviter gets +100 on first clean visit', api(tA, 'me').data.pts);
// مخالفة: العربية
NOW += 3600 * 1000;
r = api(sT, 'sGate', { traderId: 'TR-0003', farmId: '5', checks: { hands: true, disinfect: true, vehicle: false, shoes: true } }); ok(r.ok && r.data.violation && r.data.points === 0, 'vehicle fail = violation, 0 pts', r.data);
const c3 = api('', 'login', { phone: '01100000003', pin: '1234' }).data.me; ok(c3.rank.n === 3 && c3.gate.viol === 1 && c3.gate.cleanRun === 0, 'rank 3 not demoted by violation', [c3.rank, c3.gate]);
r = api(sT, 'sFarm', { farmId: '4', status: 'ready' }); ok(!r.ok && r.err === 'perm', 'assistant can only update own farm');
r = api(sT, 'sFarm', { farmId: '5', status: 'closed', note: 'تنظيف' }); ok(r.ok && r.data.farms.find(f => f.id === '5').status === 'closed', 'farm status update');
r = api(sT, 'sStats', {}); ok(!r.ok && r.err === 'perm', 'stats need supervisor');
const stats = api(sSup, 'sStats', {}).data; ok(stats.traders === 5 && stats.gate.visits >= 5 && stats.tickets.total >= 4, 'stats shape', stats);
// الجوائز
let rw = api(tA, 'rewardsList').data.rewards; ok(rw.find(x => x.id === 'cert').state === 'delivered' && rw.find(x => x.id === 'fast').state === 'locked' && rw.find(x => x.id === 'kit').state === 'available' && rw.find(x => x.id === 'ppe').state === 'locked', 'rewards states A (rank2, 460pts)', rw.map(x => x.id + ':' + x.state));
const cr = api('', 'login', { phone: '01100000003', pin: '1234' }).data.token; rw = api(cr, 'rewardsList').data.rewards;
ok(rw.find(x => x.id === 'fast').state === 'pending_ops' && rw.find(x => x.id === 'ppe').state === 'available', 'rewards C: fast pending_ops, ppe available', rw.map(x => x.id + ':' + x.state));
r = api(cr, 'rewardClaim', { id: 'fast' }); ok(!r.ok, 'cannot claim pending ops');
r = api(cr, 'rewardClaim', { id: 'ppe' }); ok(r.ok && r.data.rewards.find(x => x.id === 'ppe').state === 'requested', 'claim ppe');
const sMgr = api('', 'staffLogin', { phone: '01000000004', pin: '1234' }).data.token;
const rl = api(sMgr, 'sRewards').data.list; ok(rl.length === 2, 'manager sees 2 requests', rl);
r = api(sSup, 'sRewardDecide', { id: rl[0].id, status: 'approved' }); ok(!r.ok, 'supervisor cannot decide'); r = api(sMgr, 'sRewardDecide', { id: rl[0].id, status: 'approved' }); ok(r.ok, 'manager approves');
// الصفحة الرئيسية
const home = api(cr, 'home').data; ok(home.farms.length === 10 && home.collective.target === 200 && home.honor.length >= 1, 'home shape', [home.farms.length, home.collective, home.honor]);
ok(home.band !== null, 'band exists', home.band);
// ميزان
r = api(tN, 'mizanSave', { inputs: { birds: 30000, kg: 2, price: 60, margin: 3, dayCost: 3000, lostDays: 3, share: 50 } }); ok(r.ok && r.data.pts === 5, 'mizan first +5'); r = api(tN, 'mizanSave', { inputs: { birds: 1 } }); ok(r.ok && r.data.pts === 0, 'mizan once');
const mz = C.M.calc({ birds: 30000, kg: 2, price: 60, margin: 3, dayCost: 3000, lostDays: 3, share: 50 }, C.CONFIG.facts);
ok(Math.abs(mz.dropPct - 32.56) < 0.1 && Math.abs(mz.lostKg - 60000 * 0.5 * (1 - 1.373 / 2.036)) < 1e-6, 'mizan math', mz);

// ---------- السوق النهاردة (أسعار منتجات الشركة) ----------
{
  const sA1 = api('', 'staffLogin', { phone: '01000000001', pin: '1234' }).data.token;
  const sSp = api('', 'staffLogin', { phone: '01000000003', pin: '1234' }).data.token;
  const tTr = api('', 'login', { phone: '01100000001', pin: '1234' }).data.token;
  let mk = api(tTr, 'marketGet'); ok(mk.ok, 'marketGet ok', mk); mk = mk.data;
  const it = (m, id) => m.items.find(x => x.id === id);
  ok(mk.state === 'fresh' && mk.items.length === 4 && mk.items[0].id === 'broiler' && mk.items[0].main, 'market shape + order', [mk.state, mk.items.map(x => x.id)]);
  ok(it(mk, 'broiler').price === 72 && it(mk, 'broiler').chg === 1 && it(mk, 'broiler').pct === 1.4 && it(mk, 'broiler').dir === 'up', 'broiler 72 up 1 (1.4%)', it(mk, 'broiler'));
  ok(it(mk, 'hatch').dir === 'flat' && it(mk, 'hatch').chg === 0, 'hatch flat');
  ok(it(mk, 'broiler').series.length === 7 && it(mk, 'broiler').series[6].price === 72 && it(mk, 'broiler').series[0].dk < it(mk, 'broiler').series[6].dk, 'series oldest→newest, 7 pts');
  ok(mk.history.length === 13 && mk.history[0].dk === mk.dk && mk.history[0].vals.broiler === 72, 'history newest first, gap day skipped', mk.history.length);
  ok(typeof mk.disclaimer === 'string' && mk.disclaimer.length > 20 && mk.note.length > 0, 'disclaimer + today note');
  const hm = api(tTr, 'home').data.market; ok(hm && hm.items.length === 4 && hm.state === 'fresh' && !hm.items[0].series && !hm.history, 'home carries brief market (no series)', hm && hm.state);
  ok(!api(tTr, 'sMarketGet').ok && api(tTr, 'sMarketGet').err === 'auth', 'trader cannot read staff market');
// ---------- رسالة الترحيب والتقدير ----------
{
  const hw = api(tTr, 'home').data.welcome;
  ok(hw && hw.on === true && hw.message === '' && /كايرو ثري ايه/.test(hw.sign), 'home carries welcome defaults', hw);
  ok(hw.lines.length === 8 && hw.lines.every(s => typeof s === 'string' && s.length > 30 && s.length <= 240) && new Set(hw.lines).size === 8 && !hw.lines.some(s => /[0-9٠-٩]/.test(s)), 'eight distinct ready-made appreciation lines (no numbers/promises)', hw.lines.length);
  ok(typeof api(tTr, 'home').data.me.joined === 'number' && api(tTr, 'home').data.me.week && api(tTr, 'home').data.me.gate && 'cleanRun' in api(tTr, 'home').data.me.gate, 'profile has the fields the welcome uses');
  if (MODE === 'mem') {
    store.insert('Config', { key: 'welcome.message', value: 'شكرًا يا {name} <b>x</b>' + 'y'.repeat(400), note: '' });
    store.insert('Config', { key: 'welcome.sign', value: 'إدارة الشركة', note: '' });
    svc.resetCfg(); const w2 = api(tTr, 'home').data.welcome;
    ok(w2.message.length === 240 && w2.message.indexOf('{name}') > 0 && w2.sign === 'إدارة الشركة' && w2.on === true, 'custom welcome message/sign applied, capped 240', w2.message.length);
    ok(w2.lines.length === 8, 'message override does not remove the ready-made lines');
    store.insert('Config', { key: 'welcome.t2', value: '', note: '' });
    store.insert('Config', { key: 'welcome.t3', value: 'جملة من الإدارة يا {name}', note: '' });
    svc.resetCfg(); const w3 = api(tTr, 'home').data.welcome;
    ok(w3.lines.length === 7 && w3.lines.indexOf('جملة من الإدارة يا {name}') === 1 && !w3.lines.includes(C.CONFIG.welcome.t2), 'blank line removed, edited line used', w3.lines.length);
    for (let i = 1; i <= 8; i++) store.insert('Config', { key: 'welcome.t' + i, value: '', note: '' });
    svc.resetCfg(); const w4 = api(tTr, 'home').data.welcome;
    ok(w4.lines.length === 8 && w4.lines[0] === C.CONFIG.welcome.t1, 'all lines blank → fall back to defaults', w4.lines.length);
    store.insert('Config', { key: 'welcome.on', value: 'false', note: '' });
    svc.resetCfg(); ok(api(tTr, 'home').data.welcome.on === false, 'welcome can be switched off');
  }
}
  ok(api(tTr, 'sMarketSet', { values: { broiler: 1 } }).err === 'auth', 'trader cannot publish');
  r = api(sA1, 'sMarketGet'); ok(r.ok && r.data.canEdit === false && r.data.edit.today.prices.broiler === 72, 'assistant can view, not edit', r.data && r.data.canEdit);
  r = api(sA1, 'sMarketSet', { values: { broiler: 80 } }); ok(!r.ok && r.err === 'perm', 'assistant cannot publish', r);
  r = api(sSp, 'sMarketGet'); ok(r.ok && r.data.canEdit === true && r.data.editRole, 'supervisor can edit');
  r = api(sSp, 'sMarketSet', { values: { broiler: '٧٥', chick: '32', hatch: '10.5', table: '135' }, note: 'ملاحظة اليوم' });
  ok(r.ok && it(r.data, 'broiler').price === 75 && it(r.data, 'hatch').price === 10.5 && r.data.note === 'ملاحظة اليوم', 'publish (arabic digits) updates today', r.err || r.data);
  ok(it(api(tTr, 'marketGet').data, 'broiler').chg === 4, 'trader sees new price vs yesterday');
  const pub = (tok, body) => { let x = api(tok, 'sMarketSet', body); if (x.ok && x.data.submitted) x = api(sMgr, 'sMarketDecide', { id: x.data.submitted, decision: 'approve' }); return x; };
  r = api(sSp, 'sMarketSet', { values: { broiler: 120, chick: 32, hatch: 10.5, table: 135 } }); ok(!r.ok && r.err === 'jump_ap' && /فراخ حية/.test(r.msg) && /للاعتماد/.test(r.msg), 'big jump asks to send for approval', r);
  /* ---- 1.3: اعتماد ثانٍ عند القفزة الكبيرة ---- */
  mails.length = 0;
  r = api(sSp, 'sMarketSet', { values: { broiler: 120, chick: 32, hatch: 10.5, table: 135 }, force: true });
  const pid = r.ok && r.data.submitted;
  ok(pid && r.data.pending.length === 1 && r.data.pending[0].mine && !r.data.pending[0].canDecide && r.data.pending[0].jumps.length === 1 && it(r.data, 'broiler').price === 75, 'jump + force → sent for approval, not published', r.err || r.data);
  ok(it(api(tTr, 'marketGet').data, 'broiler').price === 75, 'traders still see the old price while pending');
  ok(mails.some(m => /تنتظر اعتمادك/.test(m.sub) && m.to.indexOf('mgr@example.test') >= 0 && m.to.indexOf('sup@example.test') < 0), 'approvers (not the proposer) are emailed', mails.map(m => m.to));
  r = api(sSp, 'sMarketDecide', { id: pid, decision: 'approve' }); ok(!r.ok && r.err === 'perm', 'proposer cannot approve own request', r);
  r = api(sA1, 'sMarketGet'); ok(r.ok && r.data.pending.length === 0, 'assistants do not see pending');
  r = api(sMgr, 'sMarketGet'); ok(r.ok && r.data.pending.length === 1 && r.data.pending[0].canDecide && r.data.pendingCount === 1 && r.data.pending[0].items.some(x => x.id === 'broiler' && x.price === 120), 'manager sees pending and can decide', r.data && r.data.pending);
  ok(api(sMgr, 'sMe').data.mkPending === 1 && api(sSp, 'sMe').data.mkPending === 0, 'sMe carries pending count for the badge');
  mails.length = 0;
  r = api(sMgr, 'sMarketDecide', { id: pid, decision: 'reject', reason: 'رقم الفراخ غير منطقي' }); ok(r.ok && r.data.pending.length === 0 && it(r.data, 'broiler').price === 75, 'reject keeps old price', r.err);
  ok(mails.some(m => /رُفضت/.test(m.sub) && m.to.indexOf('sup@example.test') >= 0 && /غير منطقي/.test(m.body)), 'proposer notified of rejection with reason');
  r = api(sMgr, 'sMarketDecide', { id: pid, decision: 'approve' }); ok(!r.ok && r.err === 'gone', 'decided request cannot be decided again');
  r = api(sSp, 'sMarketSet', { values: { broiler: 120, chick: 32, hatch: 10.5, table: 135 }, force: true }); const pid2 = r.data.submitted;
  r = api(sMgr, 'sMarketDecide', { id: pid2, decision: 'cancel' }); ok(!r.ok && r.err === 'perm', 'only the proposer can withdraw');
  r = api(sSp, 'sMarketDecide', { id: pid2, decision: 'cancel' }); ok(r.ok && r.data.pending.length === 0, 'proposer can withdraw');
  r = api(sSp, 'sMarketSet', { values: { broiler: 120, chick: 32, hatch: 10.5, table: 135 }, force: true }); const pid3 = r.data.submitted;
  r = api(sSp, 'sMarketSet', { values: { broiler: 121, chick: 32, hatch: 10.5, table: 135 }, force: true });
  ok(r.data.pending.length === 1 && r.data.pending[0].id !== pid3, 'a newer request replaces the older one', r.data.pending);
  r = api(sMgr, 'sMarketDecide', { id: r.data.submitted, decision: 'approve' }); ok(r.ok && it(r.data, 'broiler').price === 121 && r.data.pending.length === 0, 'approve publishes the proposed prices', r.err || it(r.data, 'broiler'));
  ok(it(api(tTr, 'marketGet').data, 'broiler').price === 121, 'traders see approved prices');
  r = api(sSp, 'sMarketSet', { values: { broiler: 75, chick: 32, hatch: 10.5, table: 135 } }); ok(r.ok && !r.data.submitted && it(r.data, 'broiler').price === 75, 'small change vs yesterday publishes directly', r.err);
  r = api(sSp, 'sMarketSet', { values: { broiler: 'abc' } }); ok(!r.ok && r.err === 'price', 'bad price rejected', r);
  r = api(sSp, 'sMarketSet', { values: { broiler: 0 } }); ok(!r.ok && r.err === 'price', 'zero price rejected', r.err);
  r = api(sSp, 'sMarketSet', { values: {} }); ok(!r.ok && r.err === 'empty', 'empty rejected', r);
  r = api(sSp, 'sMarketSet', { values: { broiler: 75 }, note: '' }); ok(r.ok && it(r.data, 'chick').fresh === false && it(r.data, 'chick').price === 31 && r.data.note === '', 'form is the truth: blank = removed today (falls back to last price) + note cleared', it(r.data, 'chick'));
  r = api(sSp, 'sMarketSet', { values: { broiler: 75, chick: 32, hatch: 10.5, table: '1,350' }, force: true }); r = r.ok && r.data.submitted ? api(sMgr, 'sMarketDecide', { id: r.data.submitted, decision: 'approve' }) : r; ok(r.ok && it(r.data, 'table').price === 1350, 'thousands separator parsed');
  r = pub(sSp, { values: { broiler: 75, chick: 32, hatch: 10.5, table: 135 }, force: true, note: 'x'.repeat(300) }); ok(r.ok && r.data.note.length === 200, 'note capped 200');
  r = api(sSp, 'sMarketSet', { values: { broiler: 70 }, day: 'yesterday' }); ok(r.ok && r.data.edit.yesterday.prices.broiler === 70 && r.data.edit.yesterday.prices.chick === undefined, 'yesterday editable (form is the truth)', r.data && r.data.edit.yesterday);
  /* أوضاع أخرى للاعتماد + الناشر البديل (تعديل Config في وضع الذاكرة فقط) */
  if (MODE === 'mem') {
    const cfgSet = (k, v) => { store.insert('Config', { key: k, value: v, note: '' }); svc.resetCfg(); };
    const big = { values: { broiler: 150, chick: 32, hatch: 10.5, table: 135 } };
    cfgSet('market.approval', 'always');
    r = api(sSp, 'sMarketSet', { values: { broiler: 76, chick: 32, hatch: 10.5, table: 135 } }); ok(r.ok && r.data.submitted && it(r.data, 'broiler').price === 75, 'always: every publish waits for approval', r.err || r.data);
    r = api(sMgr, 'sMarketDecide', { id: r.data.submitted, decision: 'approve' }); ok(r.ok && it(r.data, 'broiler').price === 76, 'always: approved → published');
    cfgSet('market.approval', 'off');
    r = api(sSp, 'sMarketSet', big); ok(!r.ok && r.err === 'jump' && /أكّد وانشر/.test(r.msg), 'off: old confirm flow', r);
    r = api(sSp, 'sMarketSet', Object.assign({ force: true }, big)); ok(r.ok && !r.data.submitted && it(r.data, 'broiler').price === 150, 'off: force publishes immediately');
    cfgSet('market.approval', 'jump');
    cfgSet('market.backup', 'S-01');
    r = api(sA1, 'sMarketGet'); ok(r.ok && r.data.canEdit === true, 'backup publisher (assistant) can edit', r.data && r.data.canEdit);
    r = api(sA1, 'sMarketSet', { values: { broiler: 77, chick: 32, hatch: 10.5, table: 135 } }); ok(r.ok && it(r.data, 'broiler').price === 77, 'backup publisher publishes a normal change', r.err);
    r = api(sA1, 'sMarketSet', Object.assign({ force: true }, big)); ok(r.ok && r.data.submitted && r.data.pending.length === 1 && !r.data.pending[0].canDecide, 'backup big jump → pending (needs approval)', r.err || r.data);
    r = api(sA1, 'sMarketDecide', { id: r.data.submitted, decision: 'approve' }); ok(!r.ok && r.err === 'perm', 'backup assistant cannot approve');
    r = api(sSp, 'sMarketGet'); api(sMgr, 'sMarketDecide', { id: r.data.pending[0].id, decision: 'reject' });
    cfgSet('market.backup', '01000000002');
    ok(api(sT2, 'sMarketGet').data.canEdit === true, 'backup by phone number works');
    cfgSet('market.backup', '');
    ok(api(sA1, 'sMarketGet').data.canEdit === false, 'backup removed → back to view only');
    /* المعتمد الوحيد يستطيع اعتماد طلبه (لا تعطّل) */
    cfgSet('market.approveRole', 'manager');
    store.update('Staff', 'S-05', { active: 0 });
    r = api(sMgr, 'sMarketSet', Object.assign({ force: true }, big)); ok(r.ok && !r.data.submitted && it(r.data, 'broiler').price === 150, 'sole approver publishes his own change (no deadlock)', r.err || r.data);
    store.update('Staff', 'S-05', { active: 1 });
    cfgSet('market.approveRole', 'supervisor');
    api(sMgr, 'sMarketSet', { values: { broiler: 75, chick: 32, hatch: 10.5, table: 135 } });
  }
  /* منتج مخفي لا يظهر (ويبقى سعره محفوظًا) */
  if (MODE !== 'gas') {
    store.update('MarketItems', 'hatch', { hidden: 1 });
    ok(api(tTr, 'marketGet').data.items.length === 3 && !api(tTr, 'marketGet').data.items.find(x => x.id === 'hatch'), 'hidden item not shown');
    store.update('MarketItems', 'hatch', { hidden: 0 });
    store.update('MarketItems', 'chick', { name: 'كتكوت جديد', order: 9 });
    ok(api(tTr, 'marketGet').data.items[3].id === 'chick', 'order column respected');
    store.update('MarketItems', 'chick', { name: 'كتكوت التسمين عمر يوم (سعر البيع)', order: 2 });
  }
  /* الزمن: التذكير والقِدم */
  pub(sSp, { values: { broiler: 75, chick: 32, hatch: 10.5, table: 135 }, force: true });
  NOW = Date.UTC(2026, 9, 2, 3, 0);   // الجمعة 06:00 القاهرة: قبل ساعة التذكير
  mails.length = 0; let tr = svc.tick(); ok(tr.marketRemind === 0 && !mails.some(m => /السوق النهاردة/.test(m.sub)), 'no reminder before 11:00', tr);
  mk = api(tTr, 'marketGet').data; ok(mk.state === 'old' && mk.ageDays === 1 && it(mk, 'broiler').fresh === false && it(mk, 'broiler').price === 75, 'yesterday prices = old, still shown', [mk.state, mk.ageDays]);
  NOW = Date.UTC(2026, 9, 2, 9, 0);   // 12:00
  mails.length = 0; tr = svc.tick(); ok(tr.marketRemind === 1 && mails.some(m => /السوق النهاردة/.test(m.sub) && m.to.indexOf('sup@example.test') >= 0) && mails.some(m => m.to.indexOf('mgr@example.test') >= 0) && !mails.some(m => m.to.indexOf('a1@example.test') >= 0), 'reminder → supervisor+ only, not assistants', mails.map(m => m.to));
  mails.length = 0; tr = svc.tick(); ok(tr.marketRemind === 0 && mails.length === 0, 'reminder once a day');
  NOW = Date.UTC(2026, 9, 2, 11, 30);   // 14:30: بعد ساعة التصعيد
  mails.length = 0; tr = svc.tick(); ok(tr.marketRemind === 1 && mails.some(m => /تصعيد/.test(m.sub) && m.to.indexOf('mgr@example.test') >= 0) && !mails.some(m => /السوق/.test(m.sub) && m.to.indexOf('sup@example.test') >= 0), 'escalation after 13:00 → managers only', mails.map(m => m.to + ':' + m.sub));
  mails.length = 0; tr = svc.tick(); ok(tr.marketRemind === 0 && mails.length === 0, 'escalation once a day');
  const sSp3 = api('', 'staffLogin', { phone: '01000000003', pin: '1234' }).data.token, sMgr3 = api('', 'staffLogin', { phone: '01000000004', pin: '1234' }).data.token;
  r = api(sSp3, 'sMarketSet', { values: { broiler: 200, chick: 32, hatch: 10.5, table: 135 }, force: true }); const pidT = r.data && r.data.submitted; ok(pidT, 'pending created today', r);
  NOW = Date.UTC(2026, 9, 2, 12, 40);
  mails.length = 0; tr = svc.tick(); ok(tr.marketRemind === 1 && mails.some(m => /ما زالت تنتظر الاعتماد/.test(m.sub) && m.to.indexOf('mgr@example.test') >= 0 && m.to.indexOf('sup@example.test') < 0), 'stale pending → approvers reminded', mails.map(m => m.sub));
  mails.length = 0; tr = svc.tick(); ok(tr.marketRemind === 0, 'pending reminder once');
  r = api(sSp3, 'sMarketDecide', { id: pidT, decision: 'cancel' }); ok(r.ok, 'cancel pending after reminder');
  const sSp2 = api('', 'staffLogin', { phone: '01000000003', pin: '1234' }).data.token;   // الجلسة القديمة انتهت بعد قفزة الزمن
  r = api(sSp2, 'sMarketSet', { values: { broiler: 76, chick: 32, hatch: 10.5, table: 135 }, note: 'جديد' }); ok(r.ok && r.data.state === 'fresh' && it(r.data, 'broiler').price === 76 && it(r.data, 'broiler').chg === 1, 'new day insert (vs previous day)', r.err || (r.data && r.data.state));
  NOW = Date.UTC(2026, 9, 3, 9, 0); mails.length = 0; svc.tick();   // السبت بدون نشر: تذكير جديد
  NOW = Date.UTC(2026, 9, 6, 9, 0);
  mk = api(tTr, 'marketGet').data; ok(mk.state === 'stale' && mk.ageDays >= 3, 'older than staleDays = stale', [mk.state, mk.ageDays]);
  NOW = Date.UTC(2026, 9, 1, 9, 0);
}

/* ============ 1.3: محطات التقدير + التقرير الأسبوعي ============ */
{
  const cfgSet = (k, v) => { store.insert('Config', { key: k, value: v, note: '' }); svc.resetCfg(); };
  NOW = Date.UTC(2026, 9, 1, 9, 0);
  const tM = api('', 'login', { phone: '01100000001', pin: '1234' }).data.token;
  let h = api(tM, 'home').data, ids = [], r;
  ok(h.feat && h.feat.homescreen.on === true && h.feat.voice.on === true && h.feat.cert.on === true && h.feat.cert.title === 'شهادة تقدير' && h.feat.cert.issuer.indexOf('كايرو ثري ايه') >= 0 && h.feat.cert.signer === '', 'home carries feature flags + certificate texts', h.feat);
  ok(h.milestone && h.milestone.id === 'rank:' + h.me.rank.n && h.milestone.text.indexOf('{name}') > 0 && h.milestone.text.indexOf(h.me.rank.name) > 0 && h.milestone.what, 'first milestone = current rank with {name} placeholder', h.milestone);
  for (let i = 0; i < 8 && h.milestone; i++) { ids.push(h.milestone.id); r = api(tM, 'ackMilestone', { id: h.milestone.id }); ok(r.ok, 'ack ok', r); h = api(tM, 'home').data; }
  ok(ids.length >= 2 && new Set(ids).size === ids.length && ids[0].indexOf('rank:') === 0 && h.milestone === null, 'milestones come one at a time, each only once, then none', ids);
  r = api(tM, 'ackMilestone', { id: ids[0] }); ok(r.ok, 'ack is idempotent');
  r = api(tM, 'ackMilestone', { id: 'rank:2;x' }); ok(!r.ok && r.err === 'ms', 'bad milestone id rejected', r);
  r = api(tM, 'ackMilestone', { id: 'zzz:1' }); ok(!r.ok && r.err === 'ms', 'unknown kind rejected');
  if (MODE === 'mem') {
    const tN = api('', 'login', { phone: '01100000003', pin: '1234' }).data.token;
    cfgSet('milestones.on', 'false'); ok(api(tN, 'home').data.milestone === null, 'milestones can be switched off');
    cfgSet('milestones.on', 'true'); cfgSet('milestones.rank', 'مبارك يا {name} على {rank}!');
    const m3 = api(tN, 'home').data.milestone; ok(m3 && /^مبارك يا \{name\} على /.test(m3.text) && m3.text.indexOf('{rank}') < 0, 'milestone text editable from Config', m3);
    cfgSet('certificate.signer', 'م. أحمد'); cfgSet('certificate.signerTitle', 'مدير الإدارة');
    const ft = api(tN, 'home').data.feat.cert; ok(ft.signer === 'م. أحمد' && ft.signerTitle === 'مدير الإدارة', 'certificate signer configurable', ft);
    cfgSet('homescreen.on', 'false'); cfgSet('voice.on', 'false'); cfgSet('certificate.on', 'false');
    const f2 = api(tN, 'home').data.feat; ok(f2.homescreen.on === false && f2.voice.on === false && f2.cert.on === false, 'feature switches work');
    cfgSet('homescreen.on', 'true'); cfgSet('voice.on', 'true'); cfgSet('certificate.on', 'true');
  }
  /* قياس الاستخدام: حدث واحد لكل يوم */
  const ev0 = store.all('Events').filter(e => e.type === 'open').length;
  api(tM, 'home'); api(tM, 'home');
  ok(store.all('Events').filter(e => e.type === 'open').length === ev0, 'open event once per trader per day');

  /* التقرير الأسبوعي */
  const sSpR = api('', 'staffLogin', { phone: '01000000003', pin: '1234' }).data.token, sMgrR = api('', 'staffLogin', { phone: '01000000004', pin: '1234' }).data.token;
  r = api(sSpR, 'sReport', {}); ok(!r.ok && r.err === 'perm', 'report is manager+ only');
  r = api(tM, 'sReport', {}); ok(!r.ok, 'trader cannot read report');
  r = api(sMgrR, 'sReport', {}); ok(r.ok && /التقرير الأسبوعي/.test(r.data.html) && /<table/.test(r.data.html) && /تجار فتحوا التطبيق/.test(r.data.text) && r.data.recipients >= 1, 'manager previews report', r.err);
  ok(!/01\d{9}/.test(r.data.html + r.data.text) && !/TR-\d{4}/.test(r.data.html + r.data.text), 'report is aggregate (no phones / trader ids)');
  mails.length = 0; r = api(sMgrR, 'sReport', { send: true }); ok(r.ok && r.data.sent === 1 && mails.some(m => /التقرير الأسبوعي/.test(m.sub) && m.to.indexOf('mgr@example.test') >= 0 && /<table/.test(m.html || '')), 'send-to-me emails the HTML report', mails.map(m => m.sub));
  NOW = Date.UTC(2026, 9, 4, 4, 0);   // الأحد 07:00 القاهرة: قبل الساعة
  mails.length = 0; let tr2 = svc.tick(); ok(tr2.report === 0 && !mails.some(m => /التقرير الأسبوعي/.test(m.sub)), 'no report before 08:00 on report day', tr2);
  NOW = Date.UTC(2026, 9, 3, 6, 0);   // السبت 09:00: ليس يوم التقرير
  tr2 = svc.tick(); ok(tr2.report === 0, 'no report on other days');
  NOW = Date.UTC(2026, 9, 4, 5, 30);  // الأحد 08:30
  mails.length = 0; tr2 = svc.tick();
  ok(tr2.report === 1 && mails.some(m => /التقرير الأسبوعي/.test(m.sub) && m.to.indexOf('mgr@example.test') >= 0) && !mails.some(m => /التقرير الأسبوعي/.test(m.sub) && m.to.indexOf('sup@example.test') >= 0), 'Sunday 08:30 → weekly report to managers only', mails.map(m => m.to + ':' + m.sub));
  mails.length = 0; tr2 = svc.tick(); ok(tr2.report === 0 && !mails.some(m => /التقرير الأسبوعي/.test(m.sub)), 'report once per day');
  if (MODE === 'mem') {
    cfgSet('report.extraEmails', 'ceo@example.test, bad-email'); cfgSet('report.day', '1');
    NOW = Date.UTC(2026, 9, 5, 5, 30);  // الاثنين 08:30
    mails.length = 0; tr2 = svc.tick(); ok(tr2.report === 1 && mails.some(m => /التقرير الأسبوعي/.test(m.sub) && m.to.indexOf('ceo@example.test') >= 0 && m.to.indexOf('bad-email') < 0), 'extra emails + custom day', mails.map(m => m.to));
    cfgSet('report.on', 'false'); NOW = Date.UTC(2026, 9, 12, 5, 30); cfgSet('report.day', '1');
    mails.length = 0; tr2 = svc.tick(); ok(tr2.report === 0, 'report can be switched off');
    cfgSet('report.on', 'true'); cfgSet('report.day', '0'); cfgSet('report.extraEmails', '');
  }
  NOW = Date.UTC(2026, 9, 1, 9, 0);
}
console.log('\nPASS', passes, 'FAIL', fails);
process.exit(fails ? 1 : 0);
