const C = require('./dist/core.js'); const U = C.U, L = C.L; const cfg = C.CONFIG;
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
const DAY = 86400000;
const ts = (dk) => Date.parse(dk + 'T09:00:00Z');

// ---------- أسابيع (السبت أول الأسبوع) ----------
ok(U.weekStart('2026-09-05') === '2026-09-05', 'Saturday starts week');
ok(U.weekStart('2026-09-11') === '2026-09-05', 'Friday belongs to previous Saturday');
ok(U.weekStart('2026-10-01') === '2026-09-26', 'Thursday 1 Oct → Sat 26 Sep');
ok(U.addDays('2026-09-30', 2) === '2026-10-02', 'addDays across month');
ok(Math.abs(U.diffDays('2026-10-01', '2026-09-01')) === 30, 'diffDays');

// ---------- المضاعف ----------
[[0, 1], [1, 1], [2, 1.2], [3, 1.2], [4, 1.5], [7, 1.5], [8, 2], [20, 2]].forEach(([w, x]) => ok(L.multiplierFor(w, cfg) === x, 'mult ' + w + 'w = ' + x));

// ---------- السلسلة والإجازات ----------
function mk(created, daysByWeek) { // daysByWeek: { '2026-09-12': 4 ... }
  const st = L.newState(ts(created));
  Object.keys(daysByWeek).forEach(w => { for (let i = 0; i < daysByWeek[w]; i++) L.markActive(st, U.addDays(w, i)); });
  return st;
}
let st = mk('2026-09-05', { '2026-09-12': 4, '2026-09-19': 4 });
let si = L.streakInfo(st, '2026-10-01', cfg);
ok(si.streakDone === 2 && si.mult === 1.2 && si.goalWeeks === 2 && !si.met && si.count === 0, 'two goal weeks → streak 2 ×1.2', si);

st = mk('2026-09-05', { '2026-09-05': 4, '2026-09-12': 4, '2026-09-26': 4 }); // أسبوع 19 فائت → إجازة
si = L.streakInfo(st, '2026-10-01', cfg);
ok(si.streakDone === 2 && si.streak === 3 && si.goalWeeks === 3 && si.freezesLeft === 1, 'one missed week is frozen, streak survives', si);

st = mk('2026-09-05', { '2026-09-05': 4 }); // ثلاث أسابيع فائتة في نفس الشهر لا تكفيها إجازتان
si = L.streakInfo(st, '2026-10-08', cfg);
ok(si.streakDone === 0 && si.mult === 1, 'third miss in the same month breaks streak', si);

st = mk('2026-09-05', { '2026-09-12': 4 }); // أسبوع التسجيل لا يُحاسَب
si = L.streakInfo(st, '2026-09-20', cfg);
ok(si.streakDone === 1 && si.freezesLeft === 2, 'registration week is not charged', si);

st = mk('2026-09-05', { '2026-09-26': 3 });
ok(!L.streakInfo(st, '2026-10-01', cfg).met, '3 days not enough');
L.markActive(st, '2026-10-01');
si = L.streakInfo(st, '2026-10-01', cfg); ok(si.met && si.streak >= 1, '4th day meets goal', si);
ok(!L.markActive(st, '2026-10-01'), 'same day not counted twice');

// ---------- مكافأة الهدف: مرة واحدة ----------
let b1 = L.weekGoalBonus(st, '2026-10-01', cfg), b2 = L.weekGoalBonus(st, '2026-10-02', cfg);
ok(b1 === 25 && b2 === 0 && st.pts === 25, 'week-goal bonus once per week', [b1, b2, st.pts]);

// ---------- النقاط الرقمية: سقف + مضاعف ----------
st = mk('2026-09-05', { '2026-09-12': 4, '2026-09-19': 4 }); // مضاعف 1.2
let a = L.awardDigital(st, 10, '2026-10-01', cfg); ok(a.pts === 12 && a.mult === 1.2 && !a.capped, 'digital ×1.2', a);
a = L.awardDigital(st, 35, '2026-10-01', cfg); ok(a.capped && a.pts === 36 && st.daily.pts === 40, 'daily cap clips to room 30 ×1.2', [a, st.daily]);
a = L.awardDigital(st, 10, '2026-10-01', cfg); ok(a.pts === 0 && a.capped, 'no points beyond cap', a);
a = L.awardDigital(st, 10, '2026-10-02', cfg); ok(a.pts === 12, 'cap resets next day', a);
ok(L.gamePoints(6, 6, cfg) === 30 && L.gamePoints(0, 6, cfg) === 10 && L.gamePoints(3, 6, cfg) === 20 && L.gamePoints(0, 0, cfg) === 0, 'game points 10..30');

// ---------- فحص البوابة ----------
const all = { hands: true, disinfect: true, vehicle: true, shoes: true };
let g = L.gateScore(all); ok(g.clean && !g.violation && L.gatePoints(g, cfg) === 40, 'gate 4/4 clean +40');
g = L.gateScore({ ...all, shoes: false }); ok(!g.clean && !g.violation && L.gatePoints(g, cfg) === 10, 'gate 3/4 = +10, no violation');
g = L.gateScore({ ...all, vehicle: false }); ok(g.violation && g.vehicleFail && L.gatePoints(g, cfg) === 0, 'vehicle fail = violation');
g = L.gateScore({ ...all, hands: false, disinfect: false }); ok(g.violation && L.gatePoints(g, cfg) === 0, '2/4 = violation');
g = L.gateScore({}); ok(g.violation && g.pass === 0, 'empty checks = violation');

// ---------- الرتب ----------
const NOW = ts('2026-10-01'), TODAY = '2026-10-01';
function onboarded(created) { const s = L.newState(created); s.videos.launch = created; s.charter = created; s.baseline = { score: 5, total: 9, ts: created }; return s; }
st = L.newState(NOW - 60 * DAY); ok(L.computeRank(st, cfg, NOW, TODAY) === 0, 'rank 0 before onboarding');
st.videos.launch = 1; st.charter = 1; ok(L.computeRank(st, cfg, NOW, TODAY) === 0, 'rank 0 with 2 of 3 steps');
st.baseline = { score: 1, total: 9, ts: 1 }; ok(L.computeRank(st, cfg, NOW, TODAY) === 1, 'rank 1 after onboarding');
const wk = (n) => { const o = {}; for (let i = 0; i < n; i++) o[U.addDays('2026-09-19', -7 * i)] = 4; return o; };
st = onboarded(ts('2026-07-04')); mk; Object.keys(wk(5)).forEach(w => { for (let i = 0; i < 4; i++) L.markActive(st, U.addDays(w, i)); });
ok(L.computeRank(st, cfg, NOW, TODAY) === 1, 'goal weeks without clean visit → still rank 1');
st.gate.clean = 1; st.gate.cleanRun = 1; ok(L.computeRank(st, cfg, NOW, TODAY) === 2, 'rank 2: 2 goal weeks + 1 clean visit');
st.gate.cleanRun = 3; ok(L.computeRank(st, cfg, NOW, TODAY) === 2, 'rank 3 needs 500 points');
st.pts = 500; ok(L.computeRank(st, cfg, NOW, TODAY) === 3, 'rank 3 reached');
L.applyViolation(st, NOW); ok(st.gate.cleanRun === 0 && st.gate.viol === 1 && L.computeRank(st, cfg, NOW, TODAY) === 3, 'violation stops run but never demotes rank 1–3');
ok(st.pts === 500, 'violation never deducts points');

// ---------- السفراء ----------
st = onboarded(ts('2025-01-01')); st.rankMax = 3; st.amb = { level: 0, since: NOW - 7 * 30.5 * DAY };
ok(L.computeRank(st, cfg, NOW, TODAY) === 4 && st.amb.level === 1, 'ambassador level 1 after 6 months');
st.amb.since = NOW - 13 * 30.5 * DAY; ok(L.computeRank(st, cfg, NOW, TODAY) === 5, 'level 2 after 12 months');
st.amb.since = NOW - 25 * 30.5 * DAY; ok(L.computeRank(st, cfg, NOW, TODAY) === 5, 'elite needs an invited trader');
st.invites.done = 1; ok(L.computeRank(st, cfg, NOW, TODAY) === 6, 'elite after 24 months + 1 invite');
L.applyViolation(st, NOW); ok(st.amb.level === 2 && L.computeRank(st, cfg, NOW, TODAY) === 5, 'violation drops ambassador one level');
ok(st.amb.since === NOW, 'ambassador clock restarts');
let prog = L.nextRankProgress(st, cfg, NOW, TODAY, 5); ok(prog.length >= 1 && prog.some(p => /تجار/.test(p.label)), 'progress to elite lists invites', prog);

// ---------- الجوائز ----------
const rw = (id) => C.REWARDS.find(x => x.id === id);
ok(L.rewardState(rw('badge'), 0, 0, {}, null) === 'locked' && L.rewardState(rw('badge'), 1, 0, {}, null) === 'delivered', 'auto badge at rank 1');
ok(L.rewardState(rw('kit'), 2, 299, {}, null) === 'locked' && L.rewardState(rw('kit'), 2, 300, {}, null) === 'available', 'kit needs rank 2 + 300 pts');
ok(L.rewardState(rw('fast'), 3, 0, {}, null) === 'pending_ops', 'operational perk pending ops approval');
ok(L.rewardState(rw('kit'), 2, 300, {}, { status: 'requested' }) === 'requested', 'claimed reward shows its status');

// ---------- التصعيد ----------
const T = (type, hAgo, extra) => Object.assign({ type, ts: NOW - hAgo * 3600000, level: 0, firstReplyTs: 0 }, extra || {});
ok(L.ticketLevel(T('urgent', 1), NOW, cfg) === 0 && L.ticketLevel(T('urgent', 2), NOW, cfg) === 1 && L.ticketLevel(T('urgent', 6), NOW, cfg) === 2, 'urgent: 2h supervisor, 6h manager');
ok(L.ticketLevel(T('obstacle', 23), NOW, cfg) === 0 && L.ticketLevel(T('obstacle', 24), NOW, cfg) === 1 && L.ticketLevel(T('obstacle', 48), NOW, cfg) === 2, 'obstacle: 24h/48h');
ok(L.ticketLevel(T('complaint', 30), NOW, cfg) === 0 && L.ticketLevel(T('complaint', 48), NOW, cfg) === 2, 'complaint goes straight to supervisor, manager at 48h');
ok(L.ticketLevel(T('urgent', 10, { firstReplyTs: NOW - 9 * 3600000, level: 1 }), NOW, cfg) === 1, 'answered ticket stops escalating');
ok(L.slaMet(T('urgent', 5, { firstReplyTs: NOW - 4 * 3600000 }), cfg) === true && L.slaMet(T('urgent', 5, { firstReplyTs: NOW - 1 * 3600000 }), cfg) === false && L.slaMet(T('urgent', 5), cfg) === null, 'SLA flag');

// ---------- دمج الإعدادات ----------
let m = L.mergeConfig(cfg, [{ key: 'points.round', value: '15' }, { key: 'weekGoalDays', value: 3 }, { key: 'dailyRoundCards', value: 'false' }, { key: 'ticketTypes.urgent.toSup', value: '1' }, { key: '#note', value: 'x' }, { key: 'multipliers', value: '[{"weeks":2,"x":1.1}]' }, { key: 'appName', value: ' اسم جديد ' }]);
ok(m.points.round === 15 && m.weekGoalDays === 3 && m.dailyRoundCards === false && m.ticketTypes.urgent.toSup === 1 && m.multipliers[0].x === 1.1 && m.appName === 'اسم جديد', 'config merge types and paths', m.points);
ok(cfg.points.round === 10 && cfg.weekGoalDays === 4, 'merge does not mutate defaults');

// ---------- تطبيع ----------
ok(U.normPlate('7777 هـ و') === U.normPlate('7777هو'), 'plate tatweel/space insensitive');
ok(U.normPlate('١٢٣٤ أ ب') === U.normPlate('1234 ا ب'), 'plate arabic digits + alef variants');
ok(U.normPhone('+201012345678') === '01012345678' && U.normPhone('٠١٠١٢٣٤٥٦٧٨') === '01012345678' && U.normPhone('1012345678') === '01012345678' && U.normPhone('0311111111') === '', 'phone normalisation');

console.log('\nLOGIC PASS', passes, 'FAIL', fails);
process.exit(fails ? 1 : 0);
