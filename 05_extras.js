/* ============================================================
   الجزء 5: مخزن الذاكرة (للتجربة) + ميزان التاجر + مولّد QR
   ============================================================ */
(function (C) {
  'use strict';

  /* ---------- مخزن الذاكرة: نفس واجهة مخزن Sheets ---------- */
  function createMemoryStore(initial, persist) {
    var tables = initial || {};
    Object.keys(C.SCHEMA).forEach(function (t) { if (!tables[t]) tables[t] = []; });
    function norm(t, obj) {
      var o = {};
      C.SCHEMA[t].forEach(function (c) { var v = obj[c[0]]; o[c[0]] = v === undefined || v === null ? (c[1] === 'n' ? 0 : '') : v; });
      return o;
    }
    function keyOf(t) { return C.SCHEMA[t][0][0]; }
    function save() { if (persist) persist(tables); }
    var snaps = {};   // نسخ احتياطية قبل إعادة التهيئة (في الذاكرة للاختبار؛ في الجداول تكون أوراقًا bk_)
    return {
      tables: tables,
      all: function (t) { return tables[t]; },
      find: function (t, fn) { var a = tables[t]; for (var i = 0; i < a.length; i++) if (fn(a[i])) return a[i]; return null; },
      filter: function (t, fn) { return tables[t].filter(fn); },
      insert: function (t, obj) { var r = norm(t, obj); tables[t].push(r); save(); return r; },
      update: function (t, k, patch) {
        var kk = keyOf(t), a = tables[t];
        for (var i = 0; i < a.length; i++) if (a[i][kk] === k) { for (var p in patch) a[i][p] = patch[p]; save(); return a[i]; }
        return null;
      },
      count: function (t) { return tables[t].length; },
      replaceTable: function (t, rows) { tables[t] = rows.slice(); save(); },
      snapshot: function (label, names) {
        snaps[label] = {};
        names.forEach(function (t) { snaps[label][t] = tables[t].map(function (r) { return JSON.parse(JSON.stringify(r)); }); });
        return names;
      },
      snapshotLabels: function (prefix) { return Object.keys(snaps).filter(function (l) { return !prefix || l.charAt(0) === prefix; }).sort().reverse(); },
      snapshotRows: function (label, t) { return snaps[label] && snaps[label][t] ? snaps[label][t].length : -1; },
      pruneSnapshots: function (keep, prefix) {
        var pf = prefix || 'R', drop = Object.keys(snaps).filter(function (l) { return l.charAt(0) === pf; }).sort().reverse().slice(keep);
        drop.forEach(function (l) { delete snaps[l]; });
        return drop.length;
      },
      flush: save
    };
  }

  /* ---------- ميزان التاجر ---------- */
  function mizanCalc(inp, facts) {
    var birds = Math.max(0, +inp.birds || 0), kg = Math.max(0.1, +inp.kg || 2);
    var price = Math.max(0, +inp.price || 0), margin = Math.max(0, +inp.margin || 0);
    var dayCost = Math.max(0, +inp.dayCost || 0), lostDays = Math.max(0, +inp.lostDays || 0);
    var share = Math.min(1, Math.max(0, (+inp.share || 0) / 100));
    var ratio = facts.kgPerChickDisease / facts.kgPerChickHealthy;
    var healthyKg = birds * kg;
    var lostKg = healthyKg * share * (1 - ratio);
    var diseaseKg = healthyKg - lostKg;
    var lostValue = lostKg * price, lostProfit = lostKg * margin, idle = lostDays * dayCost;
    return {
      ratio: ratio, dropPct: (1 - ratio) * 100, healthyKg: healthyKg, diseaseKg: diseaseKg, lostKg: lostKg,
      healthyValue: healthyKg * price, diseaseValue: diseaseKg * price, lostValue: lostValue,
      healthyProfit: healthyKg * margin, diseaseProfit: diseaseKg * margin, lostProfit: lostProfit,
      idle: idle, total: lostProfit + idle
    };
  }

  /* ---------- مولّد QR (وضع بايت، نسخ 1–10، تصحيح M) ---------- */
  var ECC_PER_BLOCK = { L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24], H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28] };
  var NUM_BLOCKS = { L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4], M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5], Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8], H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8] };
  var FMT = { L: 1, M: 0, Q: 3, H: 2 };
  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var na = Math.floor(ver / 7) + 2; r -= (25 * na - 10) * na - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver, e) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * NUM_BLOCKS[e][ver]; }
  function gfMul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function rsDiv(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (var i2 = 0; i2 < deg; i2++) {
      for (var j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
      root = gfMul(root, 2);
    }
    return r;
  }
  function rsRem(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift(); res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }
  function qrMatrix(text, e) {
    e = e || 'M';
    var bytes = C.U.utf8Bytes(text), ver, cap;
    for (ver = 1; ver <= 10; ver++) { cap = dataCodewords(ver, e) * 8; if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap) break; }
    if (ver > 10) throw new Error('qr too long');
    var bits = [];
    function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }
    for (var pad = 0xEC; data.length < cap / 8; pad ^= 0xEC ^ 0x11) data.push(pad);
    /* تقسيم وتصحيح وتشبيك */
    var nb = NUM_BLOCKS[e][ver], eccLen = ECC_PER_BLOCK[e][ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), blocks = [], div = rsDiv(eccLen), p = 0;
    for (var b = 0; b < nb; b++) {
      var dat = data.slice(p, p + shortLen - eccLen + (b < nShort ? 0 : 1)); p += dat.length;
      var ecc = rsRem(dat, div);
      if (b < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (var ii = 0; ii < blocks[0].length; ii++) for (var jj = 0; jj < blocks.length; jj++) if (ii !== shortLen - eccLen || jj >= nShort) all.push(blocks[jj][ii]);
    /* رسم */
    var size = ver * 4 + 17, mod = [], fn = [];
    for (var y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(x, y2, dark) { mod[y2][x] = !!dark; fn[y2][x] = true; }
    function bit(x, i) { return ((x >>> i) & 1) !== 0; }
    for (var t = 0; t < size; t++) { setF(6, t, t % 2 === 0); setF(t, 6, t % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, dist !== 2 && dist !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var pos = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      pos = [6]; for (var ps = size - 7; pos.length < na; ps -= step) pos.splice(1, 0, ps);
      for (var a = 0; a < na; a++) for (var c2 = 0; c2 < na; c2++) {
        if ((a === 0 && c2 === 0) || (a === 0 && c2 === na - 1) || (a === na - 1 && c2 === 0)) continue;
        for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++) setF(pos[a] + dx2, pos[c2] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
      }
    }
    function fmtBits(mask) {
      var d = (FMT[e] << 3) | mask, rem = d;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bt = ((d << 10) | rem) ^ 0x5412;
      for (var i1 = 0; i1 <= 5; i1++) setF(8, i1, bit(bt, i1));
      setF(8, 7, bit(bt, 6)); setF(8, 8, bit(bt, 7)); setF(7, 8, bit(bt, 8));
      for (var i2 = 9; i2 < 15; i2++) setF(14 - i2, 8, bit(bt, i2));
      for (var i3 = 0; i3 < 8; i3++) setF(size - 1 - i3, 8, bit(bt, i3));
      for (var i4 = 8; i4 < 15; i4++) setF(8, size - 15 + i4, bit(bt, i4));
      setF(8, size - 8, true);
    }
    fmtBits(0);
    if (ver >= 7) {
      var rem = ver; for (var q = 0; q < 12; q++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (var q2 = 0; q2 < 18; q2++) { var bt2 = bit(vb, q2), aa = size - 11 + q2 % 3, bb = Math.floor(q2 / 3); setF(aa, bb, bt2); setF(bb, aa, bt2); }
    }
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j2 = 0; j2 < 2; j2++) {
        var x = right - j2, up = ((right + 1) & 2) === 0, y3 = up ? size - 1 - vert : vert;
        if (!fn[y3][x] && idx < all.length * 8) { mod[y3][x] = bit(all[idx >>> 3], 7 - (idx & 7)); idx++; }
      }
    }
    function applyMask(m) {
      for (var y4 = 0; y4 < size; y4++) for (var x4 = 0; x4 < size; x4++) {
        var inv;
        switch (m) {
          case 0: inv = (x4 + y4) % 2 === 0; break; case 1: inv = y4 % 2 === 0; break; case 2: inv = x4 % 3 === 0; break;
          case 3: inv = (x4 + y4) % 3 === 0; break; case 4: inv = (Math.floor(x4 / 3) + Math.floor(y4 / 2)) % 2 === 0; break;
          case 5: inv = x4 * y4 % 2 + x4 * y4 % 3 === 0; break; case 6: inv = (x4 * y4 % 2 + x4 * y4 % 3) % 2 === 0; break;
          default: inv = ((x4 + y4) % 2 + x4 * y4 % 3) % 2 === 0;
        }
        if (!fn[y4][x4] && inv) mod[y4][x4] = !mod[y4][x4];
      }
    }
    function penalty() {
      var score = 0, i, j;
      function runs(get) {
        for (i = 0; i < size; i++) {
          var run = 1, prev = get(i, 0);
          for (j = 1; j < size; j++) {
            var cur = get(i, j);
            if (cur === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else { run = 1; prev = cur; }
          }
        }
      }
      runs(function (a, b) { return mod[a][b]; }); runs(function (a, b) { return mod[b][a]; });
      for (i = 0; i < size - 1; i++) for (j = 0; j < size - 1; j++) { var c = mod[i][j]; if (c === mod[i][j + 1] && c === mod[i + 1][j] && c === mod[i + 1][j + 1]) score += 3; }
      var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      function scan(get) {
        for (i = 0; i < size; i++) for (j = 0; j + 11 <= size; j++) {
          var m1 = true, m2 = true;
          for (var k = 0; k < 11; k++) { var v = get(i, j + k) ? 1 : 0; if (v !== pat1[k]) m1 = false; if (v !== pat2[k]) m2 = false; if (!m1 && !m2) break; }
          if (m1) score += 40; if (m2) score += 40;
        }
      }
      scan(function (a, b) { return mod[a][b]; }); scan(function (a, b) { return mod[b][a]; });
      var dark = 0; for (i = 0; i < size; i++) for (j = 0; j < size; j++) if (mod[i][j]) dark++;
      var tot = size * size, kk = Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1;
      return score + Math.max(0, kk) * 10;
    }
    var best = 0, bestPen = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); fmtBits(m);
      var pen = penalty(); if (pen < bestPen) { bestPen = pen; best = m; }
      applyMask(m);
    }
    applyMask(best); fmtBits(best);
    return { size: size, ver: ver, mod: mod };
  }
  /* يرجع مسار SVG واحدًا لكل الوحدات الداكنة */
  function qrSvg(text, opts) {
    opts = opts || {};
    var q = qrMatrix(text, opts.ecc || 'M'), margin = opts.margin == null ? 3 : opts.margin, d = '';
    for (var y = 0; y < q.size; y++) {
      var x = 0;
      while (x < q.size) {
        if (q.mod[y][x]) { var s = x; while (x < q.size && q.mod[y][x]) x++; d += 'M' + (s + margin) + ',' + (y + margin) + 'h' + (x - s) + 'v1h-' + (x - s) + 'z'; }
        else x++;
      }
    }
    var n = q.size + margin * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#242424"/></svg>';
  }

  C.createMemoryStore = createMemoryStore;
  C.M = { calc: mizanCalc };
  C.QR = { matrix: qrMatrix, svg: qrSvg };
})(C3A);
