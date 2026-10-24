/* ============================================================
   الجزء 3: منطق اللعبة والنقاط والرتب والتصعيد (دوال نقية قابلة للاختبار)
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U;

  /* دمج إعدادات ورقة Config فوق الافتراضي. المفاتيح بنقطة: points.round */
  function mergeConfig(base, rows) {
    var cfg = U.clone(base);
    (rows || []).forEach(function (r) {
      var key = String(r.key || '').trim();
      if (!key || key.charAt(0) === '#') return;
      var raw = r.value;
      var val = raw;
      if (typeof raw === 'string') {
        var t = raw.trim();
        if (t === 'true') val = true; else if (t === 'false') val = false;
        else if (t !== '' && !isNaN(Number(t))) val = Number(t);
        else if (t.charAt(0) === '{' || t.charAt(0) === '[') { try { val = JSON.parse(t); } catch (e) { val = raw; } }
        else val = t;
      }
      var path = key.split('.'), o = cfg;
      for (var i = 0; i < path.length - 1; i++) {
        if (typeof o[path[i]] !== 'object' || o[path[i]] === null) o[path[i]] = {};
        o = o[path[i]];
      }
      o[path[path.length - 1]] = val;
    });
    return cfg;
  }

  function newState(now) {
    return {
      v: 1, pts: 0, created: now,
      daily: { dk: '', pts: 0, round: 0, games: {} },
      days: [], weekBonus: '',
      videos: {}, cards: {}, charter: 0, baseline: null, followup: null, mizan: 0,
      gate: { visits: 0, clean: 0, cleanRun: 0, viol: 0, lastTs: 0, lastViolTs: 0, last: null, perDay: {} },
      rankMax: 0, amb: { level: 0, since: now },
      claims: {}, honor: 0,
      invites: { done: 0, clean: 0 }, invitedBy: '', invitePaid: { done: 0, clean: 0 },
      rated: {}, sugg: 0, seenTs: now
    };
  }

  /* ---------- الأسبوع والسلسلة والمضاعف ---------- */
  function multiplierFor(streak, cfg) {
    var list = (cfg.multipliers || []).slice().sort(function (a, b) { return b.weeks - a.weeks; });
    for (var i = 0; i < list.length; i++) if (streak >= list[i].weeks) return list[i].x;
    return 1;
  }

  function weekCounts(state) {
    var m = {};
    (state.days || []).forEach(function (d) { var w = U.weekStart(d); m[w] = (m[w] || 0) + 1; });
    return m;
  }

  /* يحسب: عدد أيام الأسبوع الحالي، السلسلة (أسابيع متتالية تحقق الهدف مع الإجازات)، المضاعف */
  function streakInfo(state, today, cfg) {
    var goal = cfg.weekGoalDays, counts = weekCounts(state);
    var curW = U.weekStart(today);
    var firstW = U.weekStart(U.dateKey(state.created));
    var streak = 0, used = {}, goalWeeks = 0, w = firstW, i = 0;
    var guard = 0;
    while (w < curW && guard++ < 400) {
      var met = (counts[w] || 0) >= goal;
      if (met) { streak++; goalWeeks++; }
      else if (i === 0) { /* أسبوع التسجيل لا يُحاسَب */ }
      else {
        var mk = w.substring(0, 7);
        used[mk] = used[mk] || 0;
        if (used[mk] < cfg.freezesPerMonth) { used[mk]++; } else { streak = 0; }
      }
      w = U.addDays(w, 7); i++;
    }
    var curCount = counts[curW] || 0, curMet = curCount >= goal;
    var shown = streak + (curMet ? 1 : 0);
    if (curMet) goalWeeks++;
    var curMonth = curW.substring(0, 7);   /* الأسبوع يُنسب لشهر بدايته */
    var freezesLeft = Math.max(0, cfg.freezesPerMonth - (used[curMonth] || 0));
    return {
      weekStart: curW, count: curCount, goal: goal, met: curMet,
      streak: shown, streakDone: streak, goalWeeks: goalWeeks,
      mult: multiplierFor(streak, cfg), freezesLeft: freezesLeft
    };
  }

  function rollDaily(state, dk) {
    if (state.daily.dk !== dk) state.daily = { dk: dk, pts: 0, round: 0, games: {} };
    return state.daily;
  }

  function markActive(state, dk) {
    if (state.days.indexOf(dk) < 0) {
      state.days.push(dk);
      state.days.sort();
      if (state.days.length > 200) state.days = state.days.slice(state.days.length - 200);
      return true;
    }
    return false;
  }

  /* نقاط رقمية: بسقف يومي ومضاعف الانتظام. ترجع النقاط الفعلية */
  function awardDigital(state, base, dk, cfg) {
    var d = rollDaily(state, dk);
    var room = Math.max(0, cfg.dailyDigitalCap - d.pts);
    var capped = Math.min(base, room);
    var mult = streakInfo(state, dk, cfg).mult;
    var pts = Math.round(capped * mult);
    d.pts += capped;
    state.pts += pts;
    return { pts: pts, base: base, capped: capped < base, mult: mult };
  }

  /* مكافأة الهدف الأسبوعي (مرة لكل أسبوع) */
  function weekGoalBonus(state, dk, cfg) {
    var si = streakInfo(state, dk, cfg);
    if (si.met && state.weekBonus !== si.weekStart) {
      state.weekBonus = si.weekStart;
      state.pts += cfg.points.weekGoal;
      return cfg.points.weekGoal;
    }
    return 0;
  }

  function gamePoints(correct, total, cfg) {
    if (!total) return 0;
    return cfg.points.gameBase + Math.round(cfg.points.gameBonus * correct / total);
  }

  /* ---------- البوابة ---------- */
  function gateScore(checks) {
    var items = C.GATE_ITEMS, pass = 0, vehicleFail = false;
    items.forEach(function (it) {
      if (checks && checks[it.id]) pass++;
      else if (it.critical) vehicleFail = true;
    });
    var clean = pass === items.length;
    var violation = pass <= 2 || vehicleFail;
    return { pass: pass, total: items.length, clean: clean, violation: violation, vehicleFail: vehicleFail };
  }
  function gatePoints(gs, cfg) {
    if (gs.violation) return 0;
    if (gs.clean) return cfg.points.gateClean;
    if (gs.pass === 3) return cfg.points.gatePartial;
    return 0;
  }

  /* مخالفة موثّقة: توقف التقدم ولا تخصم؛ السفير ينزل درجة واحدة */
  function applyViolation(state, now) {
    state.gate.cleanRun = 0;
    state.gate.viol++;
    state.gate.lastViolTs = now;
    if (state.amb.level > 0) state.amb.level--;
    state.amb.since = now;
  }

  /* ---------- الرتب ---------- */
  function onboardingDone(state) {
    return !!(state.videos.launch && state.charter && state.baseline);
  }
  function ambAdvance(state, cfg, now, invitesDone) {
    var r = cfg.ranks.amb, t = [0, r.m4, r.m5, r.m6];
    var months = U.monthsBetween(state.amb.since, now);
    var r3ok = state.rankMax >= 3;
    if (!r3ok) return;
    while (state.amb.level < 3) {
      var next = state.amb.level + 1;
      if (months < t[next]) break;
      if (next === 3 && (invitesDone || 0) < r.invitesForElite) break;
      state.amb.level = next;
    }
  }
  function computeRank(state, cfg, now, today) {
    var si = streakInfo(state, today, cfg);
    var r = cfg.ranks, n = 0;
    if (onboardingDone(state)) n = 1;
    if (n >= 1 && si.goalWeeks >= r.r2.goalWeeks && state.gate.clean >= r.r2.cleanVisits) n = 2;
    if (n >= 2 && si.goalWeeks >= r.r3.goalWeeks && state.gate.cleanRun >= r.r3.cleanRun && state.pts >= r.r3.points) n = 3;
    /* الرتب 1–3 لا تنخفض، تتوقف عن التقدم فقط */
    if (n > state.rankMax) state.rankMax = n;
    ambAdvance(state, cfg, now, state.invites.done);
    var out = state.rankMax;
    if (state.rankMax >= 3 && state.amb.level > 0) out = 3 + state.amb.level;
    return out;
  }
  /* ما الذي ينقصني للرتبة التالية؟ */
  function nextRankProgress(state, cfg, now, today, rank) {
    var si = streakInfo(state, today, cfg), r = cfg.ranks, list = [];
    function it(label, have, need) { list.push({ label: label, have: Math.min(have, need), need: need, done: have >= need }); }
    if (rank === 0) {
      list.push({ label: 'شاهد فيديو الإطلاق', done: !!state.videos.launch });
      list.push({ label: 'وقّع ميثاق خط الدفاع الأول', done: !!state.charter });
      list.push({ label: 'أجب الاختبار الأول', done: !!state.baseline });
    } else if (rank === 1) {
      it('أسابيع الهدف المحقق', si.goalWeeks, r.r2.goalWeeks);
      it('زيارة بوابة نظيفة (4 من 4)', state.gate.clean, r.r2.cleanVisits);
    } else if (rank === 2) {
      it('أسابيع الهدف المحقق', si.goalWeeks, r.r3.goalWeeks);
      it('زيارات نظيفة متتالية', state.gate.cleanRun, r.r3.cleanRun);
      it('النقاط', state.pts, r.r3.points);
    } else if (rank >= 3 && rank < 6) {
      var t = [0, r.amb.m4, r.amb.m5, r.amb.m6][state.amb.level + 1];
      it('أشهر التزام كامل بلا مخالفة', U.monthsBetween(state.amb.since, now), t);
      if (state.amb.level + 1 === 3) it('تجار جدد رشّحتهم (اكتمل تسجيلهم)', state.invites.done, r.amb.invitesForElite);
    }
    return list;
  }

  /* ---------- الجوائز ---------- */
  function rewardState(rw, rank, pts, state, claimRow) {
    if (rank < rw.rank || pts < rw.points) return 'locked';
    if (claimRow) return claimRow.status;          // requested | approved | delivered | rejected
    if (rw.auto) return 'delivered';
    if (rw.pendingOps) return 'pending_ops';       // قيد اعتماد التشغيل
    return 'available';
  }

  /* ---------- التصعيد ---------- */
  function ticketLevel(ticket, now, cfg) {
    var tt = cfg.ticketTypes[ticket.type];
    if (!tt) return 0;
    if (ticket.firstReplyTs) return Number(ticket.level) || 0;
    var h = (now - Number(ticket.ts)) / 3600000;
    var lvl = 0;
    if (tt.toSup && h >= tt.toSup) lvl = 1;
    if (tt.toMgr && h >= tt.toMgr) lvl = 2;
    return Math.max(lvl, Number(ticket.level) || 0);
  }
  function slaMet(ticket, cfg) {
    var tt = cfg.ticketTypes[ticket.type];
    if (!tt || !ticket.firstReplyTs) return null;
    return (Number(ticket.firstReplyTs) - Number(ticket.ts)) / 3600000 <= tt.sla;
  }

  /* قوى النص: حماية من الحقن في الجداول والبريد */
  function safeCell(v) {
    if (typeof v !== 'string') return v;
    return /^[=+\-@]/.test(v) ? "'" + v : v;
  }

  C.L = {
    mergeConfig: mergeConfig, newState: newState, multiplierFor: multiplierFor, weekCounts: weekCounts,
    streakInfo: streakInfo, rollDaily: rollDaily, markActive: markActive, awardDigital: awardDigital,
    weekGoalBonus: weekGoalBonus, gamePoints: gamePoints, gateScore: gateScore, gatePoints: gatePoints,
    applyViolation: applyViolation, onboardingDone: onboardingDone, computeRank: computeRank,
    ambAdvance: ambAdvance, nextRankProgress: nextRankProgress, rewardState: rewardState,
    ticketLevel: ticketLevel, slaMet: slaMet, safeCell: safeCell
  };
})(C3A);
