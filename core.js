/* ============================================================
   شريك الدفاع — تطبيق التجار | كايرو 3A للدواجن
   الجزء 1: أدوات أساسية (تشفير، تواريخ، مساعدات)
   هذا الملف منطق نقي بلا اعتماد على Apps Script أو المتصفح،
   ويُستخدم كما هو في الخادم (Code.gs) وفي النسخة التجريبية.
   ============================================================ */
var C3A = (typeof C3A !== 'undefined') ? C3A : {};

(function (C) {
  'use strict';

  /* ---------- UTF-8 و Base64 ---------- */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
          c = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
          i++;
        }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function utf8Str(bytes) {
    var s = '', i = 0;
    while (i < bytes.length) {
      var b = bytes[i++];
      if (b < 0x80) s += String.fromCharCode(b);
      else if (b < 0xE0) s += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63));
      else if (b < 0xF0) {
        s += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
      } else {
        var cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
        cp -= 0x10000;
        s += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 1023));
      }
    }
    return s;
  }
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64urlEncode(bytes) {
    var s = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var n1 = bytes[i] << 16;
      s += B64[(n1 >> 18) & 63] + B64[(n1 >> 12) & 63];
    } else if (rest === 2) {
      var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
      s += B64[(n2 >> 18) & 63] + B64[(n2 >> 12) & 63] + B64[(n2 >> 6) & 63];
    }
    return s;
  }
  function b64urlDecode(str) {
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < str.length; i++) {
      var v = B64.indexOf(str[i]);
      if (v < 0) throw new Error('b64');
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }

  /* ---------- SHA-256 / HMAC (متزامن) ---------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length, msg = bytes.slice();
    msg.push(0x80);
    while ((msg.length % 64) !== 56) msg.push(0);
    var hi = Math.floor(l / 0x20000000), lo = (l << 3) >>> 0;
    msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var w = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      var t;
      for (t = 0; t < 16; t++) {
        w[t] = (msg[off + 4 * t] << 24) | (msg[off + 4 * t + 1] << 16) | (msg[off + 4 * t + 2] << 8) | msg[off + 4 * t + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
        var s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    for (var i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
    return out;
  }
  function hmac(keyBytes, msgBytes) {
    var key = keyBytes.length > 64 ? sha256(keyBytes) : keyBytes.slice();
    while (key.length < 64) key.push(0);
    var ipad = [], opad = [];
    for (var i = 0; i < 64; i++) { ipad.push(key[i] ^ 0x36); opad.push(key[i] ^ 0x5c); }
    return sha256(opad.concat(sha256(ipad.concat(msgBytes))));
  }
  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }
  function sha256Hex(str) { return toHex(sha256(utf8Bytes(str))); }
  function hmacHex(secret, str) { return toHex(hmac(utf8Bytes(secret), utf8Bytes(str))); }

  /* تجزئة الرقم السري: تكرار HMAC عدة مرات مع ملح لكل مستخدم */
  function hashPin(pin, salt, secret, rounds) {
    rounds = rounds || 600;
    var key = utf8Bytes(String(secret));
    var cur = utf8Bytes(String(salt) + ':' + String(pin));
    for (var i = 0; i < rounds; i++) cur = hmac(key, cur.concat([i & 255]));
    return toHex(cur);
  }
  function safeEq(a, b) {
    a = String(a); b = String(b);
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  /* رمز الدخول الموقّع (بلا حالة على الخادم) */
  function signToken(payload, secret) {
    var p = b64urlEncode(utf8Bytes(JSON.stringify(payload)));
    var sig = b64urlEncode(hmac(utf8Bytes(secret), utf8Bytes(p)));
    return p + '.' + sig;
  }
  function verifyToken(token, secret, nowMs) {
    if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
    var parts = token.split('.');
    if (parts.length !== 2) return null;
    var good = b64urlEncode(hmac(utf8Bytes(secret), utf8Bytes(parts[0])));
    if (!safeEq(good, parts[1])) return null;
    try {
      var payload = JSON.parse(utf8Str(b64urlDecode(parts[0])));
      if (payload.exp && payload.exp < nowMs) return null;
      return payload;
    } catch (e) { return null; }
  }

  /* ---------- أدوات عامة ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function round1(x) { return Math.round(x * 10) / 10; }
  function toInt(x, d) { var n = parseInt(x, 10); return isNaN(n) ? (d || 0) : n; }
  function toNum(x, d) { var n = parseFloat(x); return isNaN(n) ? (d || 0) : n; }
  function cleanText(s, max) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    return max ? s.substring(0, max) : s;
  }
  function arabicDigitsToLatin(s) {
    return String(s == null ? '' : s)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); });
  }
  /* رقم موبايل مصري: 01xxxxxxxxx */
  function normPhone(p) {
    var s = arabicDigitsToLatin(p).replace(/[^\d+]/g, '');
    if (s.indexOf('+20') === 0) s = '0' + s.substring(3);
    else if (s.indexOf('0020') === 0) s = '0' + s.substring(4);
    else if (s.indexOf('20') === 0 && s.length === 12) s = '0' + s.substring(2);
    else if (s.length === 10 && s[0] === '1') s = '0' + s;
    return /^01[0125]\d{8}$/.test(s) ? s : '';
  }
  function normPin(p) {
    var s = arabicDigitsToLatin(p).replace(/\s/g, '');
    return /^\d{4,6}$/.test(s) ? s : '';
  }
  function normPlate(p) {
    /* يزيل المسافات والتطويل والتشكيل، ويوحّد شكل الهمزة والياء ليسهل البحث بحروف اللوحة */
    return arabicDigitsToLatin(p)
      .replace(/[ـً-ٟ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/[\s\-_.]/g, '').toUpperCase().substring(0, 12);
  }
  function maskPhone(p) {
    p = String(p || '');
    return p.length >= 7 ? p.substring(0, 3) + '****' + p.substring(p.length - 3) : p;
  }

  /* ---------- التاريخ بتوقيت القاهرة ---------- */
  var tzImpl = null;
  function setTz(fn) { tzImpl = fn; }
  var _fmt = null;
  function defaultTz(ts) {
    if (!_fmt) {
      _fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
    }
    var parts = _fmt.formatToParts(new Date(ts)), o = {};
    for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
    var h = parseInt(o.hour, 10); if (h === 24) h = 0;
    return { y: parseInt(o.year, 10), m: parseInt(o.month, 10), d: parseInt(o.day, 10), h: h, mi: parseInt(o.minute, 10) };
  }
  function tzParts(ts) { return (tzImpl || defaultTz)(ts); }
  function dateKey(ts) { var p = tzParts(ts); return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
  function monthKey(ts) { var p = tzParts(ts); return p.y + '-' + pad2(p.m); }
  function dkToUtc(dk) { var a = dk.split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
  function addDays(dk, n) {
    var t = new Date(dkToUtc(dk) + n * 86400000);
    return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
  }
  function dayIndex(dk) { return Math.floor(dkToUtc(dk) / 86400000); }
  function diffDays(a, b) { return dayIndex(b) - dayIndex(a); }
  /* الأسبوع في مصر يبدأ السبت */
  function weekStart(dk) {
    var dow = new Date(dkToUtc(dk)).getUTCDay(); // 0 أحد ... 6 سبت
    return addDays(dk, -((dow + 1) % 7));
  }
  function hhmm(ts) { var p = tzParts(ts); return pad2(p.h) + ':' + pad2(p.mi); }
  function monthsBetween(ts1, ts2) {
    var a = tzParts(ts1), b = tzParts(ts2);
    var m = (b.y - a.y) * 12 + (b.m - a.m);
    if (b.d < a.d) m--;
    return Math.max(0, m);
  }

  /* ---------- Error ---------- */
  function ApiError(code, msg) { this.code = code; this.msg = msg; this.name = 'ApiError'; }
  ApiError.prototype = Object.create(Error.prototype);

  /* ---------- مولّد عشوائي قابل للتكرار (للتبديل اليومي) ---------- */
  function seedFrom(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, seedStr) {
    var rnd = mulberry(seedFrom(seedStr)), a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  C.U = {
    utf8Bytes: utf8Bytes, utf8Str: utf8Str, b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode,
    sha256: sha256, sha256Hex: sha256Hex, hmac: hmac, hmacHex: hmacHex, toHex: toHex,
    hashPin: hashPin, safeEq: safeEq, signToken: signToken, verifyToken: verifyToken,
    clone: clone, pad2: pad2, clamp: clamp, round1: round1, toInt: toInt, toNum: toNum,
    cleanText: cleanText, normPhone: normPhone, normPin: normPin, normPlate: normPlate, maskPhone: maskPhone,
    arabicDigitsToLatin: arabicDigitsToLatin,
    setTz: setTz, tzParts: tzParts, dateKey: dateKey, monthKey: monthKey, addDays: addDays,
    dayIndex: dayIndex, diffDays: diffDays, weekStart: weekStart, hhmm: hhmm, monthsBetween: monthsBetween,
    seedFrom: seedFrom, mulberry: mulberry, shuffled: shuffled
  };
  C.ApiError = ApiError;
})(C3A);
/* ============================================================
   الجزء 2: المحتوى — الإعدادات الافتراضية، الألعاب، البطاقات، الجوائز
   مصدر الألعاب: مفاتيح إجابات «ألعاب الأمن الحيوي» الحلقات 1–4 وسندها العلمي.
   الإعدادات يمكن تعديلها من ورقة Config دون تعديل الكود.
   ============================================================ */
(function (C) {
  'use strict';

  /* ---------- الإعدادات الافتراضية (تُدمج مع ورقة Config) ---------- */
  var CONFIG = {
    appName: 'شريك الدفاع',
    points: {
      round: 10,            // جولة اليوم
      gameBase: 10,         // لعبة: 10 + حتى 20 حسب النتيجة (10 إلى 30)
      gameBonus: 20,
      video: 5,             // مشاهدة فيديو كامل (مرة لكل فيديو)
      card: 2,              // قراءة بطاقة معرفة (مرة لكل بطاقة)
      charter: 20,          // توقيع الميثاق
      baseline: 20,         // الاختبار الأول
      followup: 20,         // اختبار الشهر
      mizan: 5,             // أول استخدام لميزان التاجر
      weekGoal: 25,         // تحقيق الهدف الأسبوعي
      rateReply: 2,         // تقييم رد المسؤول
      suggestionAccepted: 100,
      inviteDone: 50,       // اكتمال تسجيل المدعو ودرسه الأول
      inviteClean: 100,     // أول زيارة بوابة نظيفة للمدعو
      gateClean: 40,        // 4 من 4
      gatePartial: 10       // 3 من 4
    },
    dailyDigitalCap: 40,    // سقف النقاط الرقمية اليومي قبل المضاعف
    gateMaxScoredPerDay: 2, // أقصى عدد زيارات بوابة تُحتسب في اليوم
    weekGoalDays: 4,        // أيام النشاط المطلوبة في الأسبوع
    freezesPerMonth: 2,     // إجازتان شهريًا لا تكسران السلسلة
    multipliers: [          // أسابيع متتالية → مضاعف (للنقاط الرقمية فقط)
      { weeks: 8, x: 2.0 }, { weeks: 4, x: 1.5 }, { weeks: 2, x: 1.2 }
    ],
    ranks: {
      r2: { goalWeeks: 2, cleanVisits: 1 },
      r3: { goalWeeks: 4, cleanRun: 3, points: 500 },
      amb: { m4: 6, m5: 12, m6: 24, invitesForElite: 1 }
    },
    limits: {
      ticketsPerDay: 5, repliesPerDay: 20, loginFails: 5, lockMinutes: 15,
      tokenDays: 30, staffTokenHours: 12, subjectMax: 80, bodyMax: 1200, registerPerDay: 150
    },
    collective: { weeklyTarget: 200 },   // جولات التجار المجمّعة المطلوبة أسبوعيًا لفتح امتياز «حائط الدفاع»
    followupAfterDays: 30,
    farmStaleHours: 24,
    ticketTypes: {          // مهل التصعيد بالساعات: toSup / toMgr (0 = لا يوجد)
      urgent:     { label: 'بلاغ عاجل',       hint: 'اشتباه مرض أو خلل في البوابة',       toSup: 2,  toMgr: 6,  sla: 2,  first: ['assistant', 'supervisor'] },
      obstacle:   { label: 'عائق',            hint: 'انتظار طويل، مشكلة تطهير، تصريح',    toSup: 24, toMgr: 48, sla: 24, first: ['assistant'] },
      inquiry:    { label: 'استفسار',         hint: 'سؤال عن إجراء أو موعد',              toSup: 24, toMgr: 48, sla: 24, first: ['assistant'] },
      complaint:  { label: 'شكوى من موظف',    hint: 'تصل للمشرف مباشرة ولا يراها الموظف', toSup: 0,  toMgr: 48, sla: 48, first: ['supervisor'] },
      suggestion: { label: 'اقتراح',          hint: 'فكرة تحسّن الشغل',                   toSup: 72, toMgr: 0,  sla: 72, first: ['supervisor'] }
    },
    facts: {                // أرقام نسبية فقط — لا مبالغ مالية (بعد اعتماد الإدارة لما يُنشر)
      mortalityDisease: '11.0%', mortalityNormal: '3.2%', febWave: '26.6%',
      kgPerChickHealthy: 2.036, kgPerChickDisease: 1.373,
      tonsPer100kHealthy: 204, tonsPer100kDisease: 137,
      egyptCulled: 'أكثر من 40 مليون طائر', egyptCulledSrc: 'FAO',
      cyclesHealthy: 35, cyclesDisease: 22, cyclesTotal: 90, periodLabel: 'فبراير 2025 – أغسطس 2026'
    },
    farms: 10,
    dailyRoundCards: true,
    market: {               // «السوق النهاردة»: أسعار بيع منتجات الشركة للتجار (يحدّثها الموظفون يوميًا)
      editRole: 'supervisor',   // الافتراضي لصلاحية نشر الأسعار لمن لم يُخصَّص له شيء (الفريق والصلاحيات)
      directRole: 'manager',    // الدور الذي ينشر أسعاره مباشرة بلا اعتماد أي جهة
      remind: true,             // تذكير بريدي للمسؤولين لو لم تُنشر أسعار اليوم
      remindHour: 11,           // الساعة (بتوقيت القاهرة) التي يبدأ بعدها التذكير
      staleDays: 1,             // أقصى عمر للأسعار قبل أن تُعتبر قديمة (بالأيام)
      historyDays: 14,          // عدد أيام السجل الظاهر للتاجر
      maxJumpPct: 20,           // تغيّر أكبر من هذه النسبة عن آخر سعر يحتاج تأكيدًا قبل النشر
      backup: '',               // ناشرون بدلاء: أكواد موظفين (S-05) أو أرقام موبايل مفصولة بفاصلة، يستطيعون النشر مهما كان دورهم
      approval: 'jump',         // jump = اعتماد ثانٍ عند القفزة الكبيرة فقط | always = كل نشر | off = تأكيد من الناشر نفسه فقط
      approveRole: 'supervisor',// أقل دور يستطيع اعتماد الأسعار المعلّقة (من غير الناشر نفسه)
      selfApprove: false,       // true = يستطيع المعتمد اعتماد طلبه بنفسه (يُسمح تلقائيًا لو لا يوجد معتمد آخر)
      approveRemindMin: 60,     // بعد كم دقيقة يُذكَّر المعتمدون بطلب معلّق
      escalate: true,           // تذكير ثانٍ للمديرين لو لم تُنشر الأسعار حتى ساعة التصعيد
      escalateHour: 13,         // ساعة التصعيد (بتوقيت القاهرة)، وتكون بعد ساعة التذكير الأول
      company: 'كايرو ثري ايه',
      disclaimer: 'الأسعار دي أسعار بيع كايرو ثري ايه المعلنة لليوم. أي منتج مش مكتوب هنا اسأل عنه الأول، والسعر النهائي بيتأكد وقت الصفقة.'
    },
    welcome: {              // رسالة الترحيب والتقدير التي تظهر للتاجر عند فتح التطبيق
      on: true,                 // false لإيقافها
      message: '',              // نص واحد يُظهَر دائمًا بدل الجمل أدناه إن كتبته ({name} = اسم التاجر الأول)
      sign: 'شركة كايرو ثري ايه · إدارة الأمن الحيوي',
      /* جمل التقدير الجاهزة (t1..t8): تتبدل يوميًا وتثبت طوال اليوم لنفس التاجر. امسح الخلية في Config لحذف جملة. */
      t1: 'شراكتك معانا بتفرق. التزامك بالأمن الحيوي بيحمي مزرعتك ومزارعنا، وإحنا بنقدّر ده جدًا.',
      t2: 'نجاحنا من نجاحك. وجودك شريك في الحملة بيخلّي سلسلة الإنتاج كلها أمان.',
      t3: 'الشركة بتقدّر وقتك وتعبك. كل خطوة التزام منك بتحمي الطيور وبتحمي رزقك.',
      t4: 'إحنا فخورين إنك معانا. أي ملاحظة أو مشكلة ابعتها من «كلّمنا» وبتوصل لمسؤولين بيتابعوها.',
      t5: 'تقديرنا ليك مش كلام: نقاطك ورتبتك بتتحسب على التزامك الفعلي، ومكافآتك بتستحقها بجهدك.',
      t6: 'كل تاجر شريك عندنا مهم. شكرًا إنك بتاخد الأمن الحيوي بجدية.',
      t7: 'التزامك بخطوات الأمن الحيوي بيطمّنّا عليك وعلى زباينك وعلى كل اللي شغالين معاك، وده بنشكرك عليه.',
      t8: 'شكرًا إنك بتخلّي الأمن الحيوي عادة يومية. فرق صغير منك كل يوم بيعمل فرق كبير لينا كلنا.'
    },
    report: {               // التقرير الأسبوعي للإدارة بالبريد (آخر 7 أيام مقارنة بالسابقة)
      on: true,
      day: 0,                   // يوم الإرسال: 0 الأحد، 1 الاثنين … 6 السبت
      hour: 8,                  // الساعة (بتوقيت القاهرة) التي يُرسَل بعدها
      minRole: 'manager',       // أقل دور يصله التقرير: supervisor | manager | admin
      extraEmails: ''           // بريد إضافي (مثلًا الإدارة العليا) مفصول بفاصلة
    },
    homescreen: {           // بطاقة «ثبّت التطبيق على شاشتك» في تبويب اليوم
      on: true,
      snoozeDays: 14            // بعد كم يوم تعود البطاقة لو أجّلها التاجر
    },
    milestones: {           // لافتة التهنئة بالمحطات داخل نافذة الترحيب. {name} {rank} {n} {period}
      on: true,
      rank: 'مبروك يا {name}! وصلت لرتبة «{rank}». ده بجهدك وانتظامك، والشركة فخورة بيك.',
      gw1: 'مبروك يا {name}! حققت أول هدف أسبوعي ليك. بداية قوية وإحنا بنقدّرها.',
      gw: 'مبروك يا {name}! حققت هدف الأسبوع {n} مرة. التزامك مصدر فخر لينا.',
      clean: 'تسلم إيدك يا {name}! {n} زيارات نظيفة عند البوابة. ده التزام بيحمي الطيور وبيحمي رزقك.',
      since: 'بقالك {period} معانا يا {name}. شكرًا على الشراكة والثقة، وإحنا فخورين بيك.'
    },
    certificate: {          // شهادة التقدير الرقمية التي يحفظها التاجر ويشاركها
      on: true,
      title: 'شهادة تقدير',
      issuer: 'شركة كايرو ثري ايه · إدارة الأمن الحيوي',
      body: 'تقديرًا للالتزام بالأمن الحيوي والحرص على حماية الطيور والشراكة الفعلية مع الشركة.',
      signer: '',               // اسم الموقِّع (اختياري، يظهر أسفل الشهادة)
      signerTitle: ''           // مسماه الوظيفي (اختياري)
    },
    voice: { on: true }     // زر «اسمع الأسعار» (نسخة صوتية عبر صوت الجهاز العربي)
  };

  /* ---------- الرتب ---------- */
  var RANKS = [
    { n: 0, name: 'شريك جديد',   need: 'تبدأ بها فور التسجيل', perk: '' },
    { n: 1, name: 'شريك واعٍ',    need: 'فيديو الإطلاق + توقيع الميثاق + أول اختبار', perk: 'شارة وكود QR' },
    { n: 2, name: 'شريك منتظم',   need: 'أسبوعان هدف محقق + زيارة بوابة نظيفة واحدة', perk: 'اسمك في لوحة شرف الشهر (بإذنك)' },
    { n: 3, name: 'شريك موثوق',   need: '4 أسابيع هدف + 3 زيارات نظيفة متتالية + 500 نقطة', perk: 'دور سريع عند البوابة' },
    { n: 4, name: 'سفير جديد',    need: '6 أشهر التزام كامل بلا مخالفة موثّقة', perk: 'بطاقة سفير + أولوية دخول' },
    { n: 5, name: 'سفير معتمد',   need: '12 شهرًا التزام متواصل', perk: 'موعد تحميل مجدول وإحاطات نصف سنوية' },
    { n: 6, name: 'سفير النخبة',  need: '24 شهرًا + ترشيح تجار جدد', perk: 'مجلس السفراء وتكريم سنوي ومحتوى حصري' }
  ];

  /* ---------- الأيقونات الأربع = فحص البوابة ---------- */
  var GATE_ITEMS = [
    { id: 'hands',    icon: 'icon1', title: 'الأيادي',   ok: 'غسل ومطهّر الأيدي',            bad: 'أيادٍ غير مغسولة',     critical: false },
    { id: 'disinfect',icon: 'icon2', title: 'التطهير',   ok: 'المرور بنقاط التطهير كاملة',    bad: 'تجاهل التطهير',         critical: false },
    { id: 'vehicle',  icon: 'icon3', title: 'العربية',   ok: 'عربية نظيفة ومطهّرة قبل الدخول', bad: 'عربية ملوثة',          critical: true },
    { id: 'shoes',    icon: 'icon4', title: 'الحذاء',    ok: 'حذاء نظيف ومطهّر / حوض القدم',  bad: 'حذاء ملوث',            critical: false }
  ];

  /* ---------- الفيديوهات (روابط Drive تُملأ من ورقة Content) ---------- */
  var VIDEOS = [
    { id: 'launch', title: 'العدو غير المرئي', desc: 'فيديو إطلاق الحملة: فيه عدو… مابيتشافش.', cover: 'cv_shoe', secs: 55, minSec: 45, order: 1, required: true },
    { id: 'virus',  title: 'رحلة الفيروس', desc: 'الفيروس بيمشي معاك من البوابة لحد العنبر… وإنت اللي بتقفل الطريق.', cover: 'cv_wash', secs: 90, minSec: 70, order: 2 },
    { id: 'spot',   title: 'اكتشف الخطأ', desc: 'مشهد من المزرعة… فين الغلط؟ اكتشفه واكسب الجولة.', cover: 'cv_spot', secs: 80, minSec: 60, order: 3 },
    { id: 'tf',     title: 'صح ولا غلط؟', desc: 'اثنا عشر كلامًا بيتقال في المزارع… إيه الصح وإيه الإشاعة؟', cover: 'cv_tf', secs: 182, minSec: 120, order: 4 },
    { id: 'defend', title: 'احمِ العنبر', desc: 'ست هجمات للفيروس من ست طرق… اقفلها كلها.', cover: 'cv_defend', secs: 188, minSec: 120, order: 5 }
  ];

  /* ---------- بطاقات «ليه بنعمل كده؟» ---------- */
  var CARDS = [
    { id: 'c1', tag: 'العربيات', title: 'العربية تتنضف وتتطهر قبل ما تدخل',
      fact: 'إرشادات هابرد: المركبات لازم تتنضف قبل دخول المزرعة، وممنوع دخول أي مركبة غير مصرح بها. وفي دليل كايرو 3A حوض/رشاش التطهير بند حرج.',
      why: 'العجل بيشيل الزرق والطين، والفيروس بيتنقل عليهم.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323', forTrader: true },
    { id: 'c2', tag: 'الأقفاص', title: 'أقفاصك ماتدخلش غير لما تتغسل وتتطهر',
      fact: 'قائمة USDA للأمن الحيوي: الأدوات والمعدات اللي بتدخل المزرعة، ومعدات النقل (عربيات اليد واللوادر والرامبات)، لازم تتنضف وتتطهر كويس قبل الاستخدام. ودراسة ميدانية فرنسية (H5N8، 2017) تناولت غسيل وتطهير أقفاص وعربيات نقل البط.',
      why: 'الزرق والريش اللي على الأقفاص ممكن يجيبوا فيروس من مزرعة تانية.', src: 'USDA APHIS — HPAI Biosecurity Checklist', url: 'https://www.aphis.usda.gov/sites/default/files/HPAIchecklist.pdf', forTrader: true },
    { id: 'c3', tag: 'الأعلاف', title: 'الأعلاف والغاز بتفضل بره السور',
      fact: 'إرشادات هابرد: تأكد إن كل توريدات العلف والغاز بتفضل خارج سور المزرعة.',
      why: 'كل عربية بتعدّي السور بتفتح طريق جديد للفيروس.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323', forTrader: true },
    { id: 'c4', tag: 'الحذاء', title: 'البوت الوسخ بينقل العدوى',
      fact: 'USDA: الناس ممكن تنقل الفيروس من غير قصد على بوت الشغل والهدوم والمعدات والمركبات اللي ماتنضفتش وماتطهرتش كويس.',
      why: 'العدوى ممكن تدخل العنبر في طبقة طين على الجزمة.', src: 'USDA APHIS — How to Protect Your Flock', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/resources/how-protect-your-flock-avian-influenza', forTrader: true },
    { id: 'c5', tag: 'حوض القدم', title: 'حوض القدم للتطهير… مش للتنضيف',
      fact: 'جامعة ديلاوير: أحواض القدم للتطهير وليست للتنضيف، واكشط الطين والزرق من البوت قبل ما تقف في الحوض.',
      why: 'المطهر مايشتغلش على بوت مغطى بطين.', src: 'University of Delaware — Footwear', url: 'https://www.udel.edu/academics/colleges/canr/cooperative-extension/fact-sheets/poultry-biosecurity-footwear/' },
    { id: 'c6', tag: 'المطهر', title: 'تركيز المطهر الأعلى مش دايمًا الأحسن',
      fact: 'جامعة ولاية أوهايو: لازم تتبع تعليمات العبوة بالظبط، وزيادة التركيز بتخلي المطهر مكلف أو كاوي.',
      why: 'الجرعة الصح ووقت التلامس الصح هما اللي بيقتلوا الفيروس.', src: 'Ohio State — Disinfection in On-Farm Biosecurity', url: 'https://ohioline.osu.edu/factsheet/vme-8' },
    { id: 'c7', tag: 'الشتا', title: 'الفيروس بيعيش أطول في البرد',
      fact: 'الوكالة الكندية CFIA: الفيروس بيعيش حوالي 7 أيام في الزرق على 20 درجة، وحوالي 60 يومًا على 4 درجات.',
      why: 'الشتا مش بيقتل الفيروس، بالعكس بيخليه يستنى أطول.', src: 'CFIA — Survival time of avian influenza viruses', url: 'https://inspection.canada.ca/en/animal-health/terrestrial-animals/diseases/reportable/avian-influenza/survival-time-avian-influenza-viruses' },
    { id: 'c8', tag: 'الزوار', title: 'ماتخالطش طيور قبل ما تزور مزرعة',
      fact: 'دليل Cobb: مفيش مخالطة للطيور لمدة 72 ساعة قبل دخول المزرعة. وإرشادات هابرد: الزيارة تتسجل، والدخول على مراحل مع تغيير الهدوم.',
      why: 'طيور السوق والبيت ممكن تشيل فيروس من غير أعراض.', src: 'Cobb — Biosecurity on the farm', url: 'https://www.thepoultrysite.com/articles/cobb-breeder-management-guide-biosecurity-on-the-farm', forTrader: true },
    { id: 'c9', tag: 'الراحة', title: 'فترة الراحة بعد التطهير لازم تتكمّل',
      fact: 'إرشادات هابرد: فترة راحة 10 أيام على الأقل بعد التنضيف والتطهير.',
      why: 'الراحة الكاملة بتقلل الأمراض في الدورة الجاية.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323' },
    { id: 'c10', tag: 'السجل', title: 'سجّل كل زيارة',
      fact: 'إرشادات هابرد: «Keep a record» — سجل الزائرين والتوريد بيساعد يتتبع أي مشكلة لو حصلت.',
      why: 'التسجيل مش روتين… ده اللي بيقصّر وقت الوصول للمصدر.', src: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323', forTrader: true }
  ];

  /* ---------- الألعاب (المفاتيح على الخادم فقط) ---------- */
  var S_HUB = { label: 'Hubbard Biosecurity Guidelines', url: 'https://www.hubbardbreeders.com/library?pdf=9323' };
  var GAMES = {
    tf: {
      id: 'tf', title: 'صح ولا غلط؟', tag: 'الحلقة 4', cover: 'cv_tf', per: 6, secs: 8, kind: 'tf',
      intro: 'كل كارت بيبدأ بـ «سمعت إن…» — قرر في ثواني: صح ولا غلط؟',
      items: [
        { id: 't1', q: 'إنفلونزا الطيور بتتعالج بالمضاد الحيوي.', a: false, why: 'المضادات الحيوية مابتأثرش على الفيروسات (CDC).', src: { label: 'CDC — Antibiotic Use', url: 'https://www.cdc.gov/antibiotic-use/about/index.html' } },
        { id: 't2', q: 'الفيروس ممكن يتنقل على البوت والهدوم وعجل العربيات.', a: true, why: 'USDA: الناس بتنقله من غير قصد على البوت والهدوم والمعدات والمركبات اللي ماتطهرتش.', src: { label: 'USDA APHIS', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/resources/how-protect-your-flock-avian-influenza' } },
        { id: 't3', q: 'أكل الفراخ والبيض المطبوخين كويس آمن.', a: true, why: 'منظمة الصحة العالمية: مفيش دليل على انتقال الفيروس عن طريق دواجن أو بيض متحضّرين ومطبوخين كويس.', src: { label: 'WHO — Influenza (avian)', url: 'https://www.who.int/en/news-room/fact-sheets/detail/influenza-(avian-and-other-zoonotic)' } },
        { id: 't4', q: 'لو الفراخ شكلها سليمة يبقى العنبر مفيهوش عدوى.', a: false, why: 'من العلامات «نفوق مفاجئ من غير أعراض»، والبط ممكن يكون مصاب ومش باين عليه.', src: { label: 'USDA APHIS — Signs of Illness', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/signs-illness' } },
        { id: 't5', q: 'التطعيم لوحده كفاية حتى لو الأمن الحيوي ضعيف.', a: false, why: 'المنظمة العالمية لصحة الحيوان: التطعيم لوحده مش حل مستدام، لازم يكون جزء من استراتيجية كاملة مع الأمن الحيوي.', src: { label: 'WOAH — Avian Influenza', url: 'https://www.woah.org/en/disease/avian-influenza/' } },
        { id: 't6', q: 'الفيروس ممكن يدخل العنبر مع علف أو مية اتلوثوا بزرق طيور.', a: true, why: 'WOAH: الفيروس بيطلع في الزرق وبيتنقل عن طريق العلف والمية الملوثة.', src: { label: 'WOAH — Avian Influenza', url: 'https://www.woah.org/en/disease/avian-influenza/' } },
        { id: 't7', q: 'الفيروس بيموت بسرعة في البرد والشتا.', a: false, why: 'بيعيش حوالي 7 أيام في الزرق على 20 درجة، وحوالي 60 يومًا على 4 درجات (CFIA).', src: { label: 'CFIA — Survival time', url: 'https://inspection.canada.ca/en/animal-health/terrestrial-animals/diseases/reportable/avian-influenza/survival-time-avian-influenza-viruses' } },
        { id: 't8', q: 'إنفلونزا الطيور ممكن تعدي الإنسان.', a: true, why: 'WHO وCDC: ممكن، والنصيحة تجنّب لمس الطيور العيانة أو النافقة واستخدام وسائل الحماية.', src: { label: 'WHO — Influenza (avian)', url: 'https://www.who.int/en/news-room/fact-sheets/detail/influenza-(avian-and-other-zoonotic)' } },
        { id: 't9', q: 'فترة الراحة بعد التنضيف والتطهير بتقلل الأمراض في الدورة الجاية.', a: true, why: 'إرشادات هابرد: راحة 10 أيام على الأقل بعد التنضيف والتطهير.', src: S_HUB },
        { id: 't10', q: 'المطهر كل ما يكون مركّز أكتر يبقى أحسن.', a: false, why: 'لازم تتبع تعليمات العبوة بالظبط، وزيادة التركيز بتخلي المطهر مكلف أو كاوي (Ohio State).', src: { label: 'Ohio State — Ohioline', url: 'https://ohioline.osu.edu/factsheet/vme-8' } },
        { id: 't11', q: 'التراب والريش اللي طالع من عنبر مصاب ممكن يشيلوا الفيروس.', a: true, why: 'دراسة PLOS One: اتلقى أثر الفيروس في عينات هوا لحد 60 متر من العنابر المصابة (ماتعزلش فيروس حي).', src: { label: 'PLOS One 2015', url: 'https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0125401' } },
        { id: 't12', q: 'دبح وأكل الفراخ العيانة أو النافقة آمن طالما هتتطبخ.', a: false, why: 'WHO: الحيوانات اللي نفقت فجأة ماتتاكلش، وتجنّب أي تلامس مع الحيوانات العيانة أو النافقة.', src: { label: 'WHO — Influenza (avian)', url: 'https://www.who.int/en/news-room/fact-sheets/detail/influenza-(avian-and-other-zoonotic)' } }
      ]
    },
    steps: {
      id: 'steps', title: 'رتّب الخطوات', tag: 'الحلقة 2', cover: 'cv_clip', per: 3, secs: 0, kind: 'order',
      intro: 'الكروت متلخبطة. رتّبها من أول خطوة لآخر خطوة.',
      items: [
        { id: 's1', t: 'غسيل الإيد', order: ['بلّ إيدك وحط صابون', 'افرك 20 ثانية (ضهر الإيد وبين الصوابع وتحت الضوافر)', 'اشطف بمية جارية', 'نشّف بفوطة نضيفة'], why: 'CDC: بلّ ← صابون ← فرك 20 ثانية على الأقل ← شطف بمية جارية ← تنشيف بفوطة نضيفة.', src: { label: 'CDC — About Handwashing', url: 'https://www.cdc.gov/clean-hands/about/index.html' } },
        { id: 's2', t: 'حوض القدم', order: ['اكشط الطين والزرق بفرشة البوت', 'اشطف البوت بالمية', 'اقف في الحوض الوقت المكتوب على المطهر', 'طهّر إيدك وادخل'], why: 'الحوض للتطهير مش للتنضيف: الطين لازم يتشال الأول (جامعة ديلاوير وOMAFRA).', src: { label: 'University of Delaware', url: 'https://www.udel.edu/academics/colleges/canr/cooperative-extension/fact-sheets/poultry-biosecurity-footwear/' } },
        { id: 's3', t: 'النافق', order: ['اجمع النافق كل يوم بجوانتي', 'حطه في جردل بغطا محكم', 'خزّنه في فريزر النافق بعيد عن العنابر', 'طهّر الجردل واغسل إيدك'], why: 'النافق يتجمع يوميًا ويتخزن مقفول بعيد عن أماكن الإنتاج (UGA وOMAFRA وهابرد).', src: { label: 'UGA — Biosecurity Basics (B1306)', url: 'https://fieldreport.caes.uga.edu/publications/B1306/biosecurity-basics-for-poultry-growers/' } },
        { id: 's4', t: 'زيارة العنابر', order: ['عنبر الكتاكيت (7 أيام)', 'عنبر 21 يوم', 'عنبر 35 يوم', 'العنبر اللي فيه طيور عيانة'], why: 'الزيارة دايمًا من الأصغر للأكبر ومن السليم للعيان (OMAFRA وCobb).', src: { label: 'Ontario — Biosecurity recommendations', url: 'https://www.ontario.ca/page/biosecurity-recommendations-commercial-poultry-flocks-ontario' } },
        { id: 's5', t: 'محلول المطهر', order: ['اقرا التعليمات (الجرعة ووقت التلامس)', 'البس الجوانتي والنضارة', 'حط المية في الجردل الأول', 'ضيف المطهر بالمكيال وقلّب'], why: 'اقرا العبوة الأول، والبس الحماية، والمادة المركّزة بتتضاف على المية مش العكس.', src: { label: 'Ohio State — Disinfection', url: 'https://ohioline.osu.edu/factsheet/vme-8' } },
        { id: 's6', t: 'قلع لبس الحماية', order: ['اشطف البوت واقلعه', 'اقلع الأوفرول واقلبه لجوّه', 'اقلع النضارة من الأستك', 'اقلع الكمامة من الأستك', 'اقلع الجوانتي واغسل إيدك 20 ثانية'], why: 'CDC: البوت (بعد شطفه) ← الأوفرول ← النضارة ← الكمامة ← الجوانتي ← غسيل الإيد 20 ثانية.', src: { label: 'CDC — Remove PPE Safely', url: 'https://www.cdc.gov/bird-flu/media/pdfs/2024/09/H5-Remove-personal-protective-equipment-safely-09192024-FINAL-CLEAN.pdf' } }
      ]
    },
    shoes: {
      id: 'shoes', title: 'لو كنت مكانه؟', tag: 'الحلقة 3', cover: 'cv_gate', per: 6, secs: 10, kind: 'choice',
      intro: 'سعيد عامل في مزرعة… ومواقف حقيقية بتقابله. لو كنت مكانه هتعمل إيه؟',
      items: [
        { id: 'h1', q: 'سعيد لقى حمامة ميتة جنب بيت العنابر. يعمل إيه؟', opts: ['يمسكها بإيده ويرميها بره السور', 'يلبس جوانتي ويحطها في كيس ويقفله عليها، ويبلّغ المشرف', 'يدفنها جنب العنبر ويكمل شغله'], a: 1, wrong: 'الفيروس ينتقل على إيده وهدومه لجوه العنبر.', why: 'CDC: الطيور الميتة ماتتلمسش بالإيد — استخدم جوانتي أو كيس مقلوب.', src: { label: 'CDC — Preventing Bird Flu', url: 'https://www.cdc.gov/bird-flu/prevention/index.html' } },
        { id: 'h2', q: 'فجأة نفق عدد كبير من الفراخ في عنبر في يوم واحد. سعيد يعمل إيه؟', opts: ['يستنى للصبح يشوف هتزيد ولا لأ', 'يشيل النافق بسرعة ويرميه بعيد من غير ما يقول لحد', 'يبلّغ المشرف والدكتور فورًا، ومفيش حاجة تطلع من العنبر'], a: 2, wrong: 'العدوى تسبقه للعنابر التانية والمزارع اللي حواليه.', why: 'USDA: «نفوق مفاجئ من غير أعراض» من علامات إنفلونزا الطيور، والإبلاغ يكون فورًا.', src: { label: 'USDA APHIS — Signs of Illness', url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/defend-the-flock/signs-illness' } },
        { id: 'h3', q: 'جاره عرض عليه كتاكيت يربيها في بيته. يعمل إيه؟', opts: ['يعتذر: اللي شغال في مزرعة مايربيش طيور في بيته', 'ياخدها ويربيها بعيد عن مكان نومه', 'ياخدها بس يغيّر هدومه قبل ما يدخل المزرعة'], a: 0, wrong: 'أي عدوى تجيل طيور البيت من الطيور البرية أو السوق هتيجي معاه المزرعة كل يوم.', why: 'قائمة USDA: سياسة المزرعة إن العاملين مايربّوش طيور تانية.', src: { label: 'USDA — HPAI Biosecurity Checklist', url: 'https://www.aphis.usda.gov/sites/default/files/HPAIchecklist.pdf' } },
        { id: 'h4', q: 'سعيد حاسس بسخونية وكحة واحمرار في عينه بعد شغل مع الطيور. يعمل إيه؟', opts: ['يقول للمشرف ويروح للدكتور، ويقوله إنه بيشتغل مع طيور', 'ياخد حاجة للسخونية ويكمل شغله عادي', 'يفضل في البيت ومايقولش لحد'], a: 0, wrong: 'المرض ممكن يتأخر اكتشافه — عنده وعند اللي حواليه.', why: 'CDC: لو ظهرت أعراض أثناء الشغل مع طيور مصابة أو مشتبه فيها، قول للمشرف ومقدم الرعاية الصحية.', src: { label: 'CDC — Information for Workers', url: 'https://www.cdc.gov/bird-flu/worker-safety/farm-workers.html' } },
        { id: 'h5', q: 'التاجر وصل بأقفاصه وعاوز يدخلها العنبر. يعمل إيه؟', opts: ['تدخل لأن التاجر معاه تصريح', 'تدخل بس ينفض الريش منها الأول', 'الأقفاص ماتدخلش غير لما تتغسل وتتطهر كويس'], a: 2, wrong: 'الزرق والريش اللي على الأقفاص ممكن يجيبوا فيروس من مزرعة تانية.', why: 'قائمة USDA: الأدوات ومعدات النقل (عربيات اليد واللوادر والرامبات) تتنضف وتتطهر كويس قبل الاستخدام.', src: { label: 'USDA — HPAI Biosecurity Checklist', url: 'https://www.aphis.usda.gov/sites/default/files/HPAIchecklist.pdf' } },
        { id: 'h6', q: 'سعيد عدّى خط الفصل ونسي حاجة في الاستراحة. يعمل إيه؟', opts: ['يعدّي ثواني ويرجع بسرعة', 'يكلّم زميل جوه يقفله، أو يرجع بخطوات الدخول كاملة', 'يعدّي بس يمسح جزمته بالأرض'], a: 1, wrong: 'كل خطوات الدخول اللي اتعملت النهارده تضيع في دقيقة.', why: 'خط الفصل: قبل العبور تقلع لبس وجزمة الشارع وتنضف إيدك، وبعده تلبس لبس وجزمة المكان — في كل مرة.', src: { label: 'Healthy Farms — Line of Separation', url: 'https://www.healthyagriculture.org/prevent/traffic-control/line-of-separation/' } }
      ]
    },
    defend: {
      id: 'defend', title: 'احمِ العنبر', tag: 'الحلقة 1', cover: 'cv_defend', per: 6, secs: 8, kind: 'choice',
      intro: 'الفيروس بيهجم على العنبر من ست طرق. كل إجابة صح بتبني درع. عندك ثواني!',
      items: [
        { id: 'd1', tag: 'هجمة من ناحية العربيات', q: 'عربية علف وصلت بوابة المزرعة. إزاي نقفل طريق الفيروس؟', opts: ['تدخل على طول لحد باب العنبر — الحمولة مستعجلة', 'تعدّي في حوض العجل وقوس الرش، وتفضل بره منطقة العنابر', 'السواق ينفض الطين بإيده وتدخل'], a: 1, why: 'هابرد: العربيات تتنضف قبل دخول المزرعة، ومفيش مركبة غير مصرح بها.', src: S_HUB },
        { id: 'd2', tag: 'هجمة من ناحية العمال', q: 'عامل جاي الشغل الصبح. إيه الطريق الصح لحد العنبر؟', opts: ['يدخل على طول بهدومه', 'يلبس بوت المزرعة بس ويدخل', 'حوض القدم ← مطهر الإيد ← شاور ← لبس وبوت المزرعة'], a: 2, why: 'هابرد: الدخول على مراحل مع تغيير الهدوم والبوت. وThe Poultry Site: حوض القدم ومطهر الإيد قبل ملامسة الطيور.', src: S_HUB },
        { id: 'd3', tag: 'هجمة من ناحية الطيور البرية', q: 'عصافير وحمام برّي بيقرّبوا من العنبر. نعمل إيه؟', opts: ['تصليح الشبك وقفل أي فتحة، ومفيش أكل ولا مية مكشوفة حوالين العنبر', 'نسيب الأكل المدلوق للعصافير تاكله بعيد عن الباب', 'نطردها بالصوت وبس'], a: 0, why: 'هابرد: منع الطيور البرية. وMSU: العلف المدلوق بيتشال ومانحطّش أكل للطيور البرية جنب المزرعة.', src: S_HUB },
        { id: 'd4', tag: 'هجمة من ناحية الفيران', q: 'علامات فيران حوالين العنبر. الحل؟', opts: ['نسيب قطة تتجول في العنابر تصطادهم', 'محطات طُعم ثابتة حوالين العنبر، وتنضيف العلف المدلوق والحشايش', 'نسيب العلف المدلوق والحشايش طالما فيه طُعم'], a: 1, why: 'هابرد: طُعم منتظم للقوارض. وMSU: شريط نضيف حوالين العنبر. وThe Poultry Site: ممنوع دخول الحيوانات الأليفة العنابر.', src: S_HUB },
        { id: 'd5', tag: 'هجمة من ناحية المية', q: 'خزان المية بتاع العنابر. إزاي نحميه؟', opts: ['غطا محكم للخزان، ومية من مصدر نضيف ومتعالجة بالكلور', 'نسيب الخزان مفتوح عشان التهوية', 'نغيّر المية كل أسبوع بس من غير كلور'], a: 0, why: 'ولاية ميسيسيبي: مفيش طيور برية أو فيران توصل لمية الشرب. وهابرد: الكلور حوالي 1 ppm في آخر الخط، والمقبول 0.5–3 ppm.', src: { label: 'Hubbard — Water Quality', url: 'https://www.hubbardbreeders.com/library?pdf=4003' } },
        { id: 'd6', tag: 'هجمة من ناحية الزوار', q: 'زائر وصل البوابة وعاوز يدخل. إيه الصح؟', opts: ['يدخل لو معاه تصريح من حد من الإدارة', 'يدخل بس يطهّر إيده', 'تسجيل، ولو خالط طيور خلال 72 ساعة مايدخلش، وإلا شاور ولبس المزرعة'], a: 2, why: 'Cobb: مفيش مخالطة للطيور 72 ساعة قبل الدخول. وهابرد: السجلات والدخول على مراحل مع تغيير الهدوم.', src: { label: 'Cobb — Biosecurity on the farm', url: 'https://www.thepoultrysite.com/articles/cobb-breeder-management-guide-biosecurity-on-the-farm' } }
      ]
    }
  };

  /* اختبارات قياس: أول مرة وبعد 30 يومًا (أسئلة مختلفة) */
  var PLACEMENT = {
    baseline: { title: 'الاختبار الأول', tf: ['t2', 't4', 't6', 't9', 't10', 't1'], shoes: ['h1', 'h2', 'h5'] },
    followup: { title: 'اختبار الشهر', tf: ['t3', 't5', 't7', 't8', 't11', 't12'], shoes: ['h3', 'h4', 'h6'] }
  };

  /* ---------- كتالوج الجوائز: بالاستحقاق لا بالسحب ---------- */
  var REWARDS = [
    { id: 'badge',   kind: 'symbolic',    title: 'شارة «شريك الدفاع»',               rank: 1, points: 0,   auto: true,  pendingOps: false, desc: 'تظهر على بطاقتك الرقمية.' },
    { id: 'cert',    kind: 'symbolic',    title: 'شهادة «حارس الأمن الحيوي» الرقمية', rank: 2, points: 0,   auto: true,  pendingOps: false, desc: 'شهادة تقدير باسمك تقدر تشاركها.' },
    { id: 'honor',   kind: 'symbolic',    title: 'اسمك في لوحة شرف الشهر',            rank: 2, points: 0,   auto: false, pendingOps: false, desc: 'بإذنك فقط. الأسماء بالترتيب الأبجدي، بدون ترتيب بالنقاط.' },
    { id: 'kit',     kind: 'gift',        title: 'مستلزمات تطهير للعربية',             rank: 2, points: 300, auto: false, pendingOps: false, desc: 'مطهّر ومرش لعربيتك.' },
    { id: 'fast',    kind: 'operational', title: 'دور سريع عند البوابة',               rank: 3, points: 0,   auto: false, pendingOps: true,  desc: 'أولوية في الدخول لو سجلك نظيف.' },
    { id: 'ppe',     kind: 'gift',        title: 'طقم حماية شخصية',                    rank: 3, points: 800, auto: false, pendingOps: false, desc: 'أوفرول وكمامة وجوانتي.' },
    { id: 'sign',    kind: 'gift',        title: 'لافتة «شريك الدفاع» للعربية',        rank: 4, points: 0,   auto: false, pendingOps: false, desc: 'تعرّف الكل إن عربيتك من شركاء الأمن الحيوي.' },
    { id: 'slot',    kind: 'operational', title: 'موعد تحميل مجدول',                   rank: 5, points: 0,   auto: false, pendingOps: true,  desc: 'موعد مضمون وإحاطات نصف سنوية.' },
    { id: 'annual',  kind: 'annual',      title: 'درع وتكريم في الملتقى السنوي',       rank: 6, points: 0,   auto: false, pendingOps: false, desc: 'تكريم سنوي لسفراء النخبة.' }
  ];

  /* ---------- منتجات الشركة التي تظهر أسعارها في «السوق النهاردة» (تُعدَّل من ورقة MarketItems) ---------- */
  var MARKET_ITEMS = [
    { id: 'broiler', name: 'فراخ التسمين الحية (سعر البيع)', short: 'فراخ حية',   unit: 'جنيه/كجم',    dec: 1, order: 1, main: 1, hidden: 0 },
    { id: 'chick',   name: 'كتكوت التسمين عمر يوم (سعر البيع)', short: 'كتكوت',   unit: 'جنيه/كتكوت',  dec: 1, order: 2, main: 0, hidden: 0 },
    { id: 'hatch',   name: 'بيض التفريخ (سعر البيع)',          short: 'بيض تفريخ', unit: 'جنيه/بيضة',   dec: 2, order: 3, main: 0, hidden: 0 },
    { id: 'table',   name: 'بيض المائدة (سعر البيع)',          short: 'بيض مائدة', unit: 'جنيه/كرتونة', dec: 0, order: 4, main: 0, hidden: 0 }
  ];

  var FARM_STATUS = {
    ready:   { label: 'جاهزة للتحميل', tone: 'good' },
    limited: { label: 'تحميل محدود',   tone: 'warn' },
    closed:  { label: 'لا تحميل اليوم', tone: 'bad' },
    unknown: { label: 'غير محدّث',     tone: 'mute' }
  };

  C.CONFIG = CONFIG;
  C.RANKS = RANKS;
  C.GATE_ITEMS = GATE_ITEMS;
  C.VIDEOS = VIDEOS;
  C.CARDS = CARDS;
  C.GAMES = GAMES;
  C.PLACEMENT = PLACEMENT;
  C.REWARDS = REWARDS;
  C.FARM_STATUS = FARM_STATUS;
  C.MARKET_ITEMS = MARKET_ITEMS;
})(C3A);
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
/* ============================================================
   الجزء 4: طبقة الخدمة (api) — تعمل فوق أي مخزن (Sheets أو ذاكرة)
   store: all/find/filter/insert/update/count   |   env: now/secret/randHex/notify
   كل مفاتيح الإجابات وأرقام المسؤولين تبقى هنا (الخادم) ولا تصل للهاتف.
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U, L = C.L, ApiError = C.ApiError;

  /* مخطط الجداول: العمود الأول هو المفتاح. s نص | n رقم | j JSON كنص */
  C.SCHEMA = {
    Traders: [['id', 's'], ['code', 's'], ['name', 's'], ['phone', 's'], ['pinHash', 's'], ['salt', 's'], ['plate', 's'], ['company', 's'], ['farmId', 's'], ['status', 's'], ['created', 'n'], ['lastLogin', 'n'], ['fails', 'n'], ['lockUntil', 'n'], ['state', 'j'], ['mizan', 'j']],
    Staff: [['id', 's'], ['name', 's'], ['title', 's'], ['role', 's'], ['farmId', 's'], ['phone', 's'], ['email', 's'], ['pinHash', 's'], ['salt', 's'], ['active', 'n'], ['fails', 'n'], ['lockUntil', 'n'], ['perms', 's']],
    Gate: [['id', 's'], ['ts', 'n'], ['traderId', 's'], ['farmId', 's'], ['staffId', 's'], ['checks', 'j'], ['pass', 'n'], ['clean', 'n'], ['violation', 'n'], ['waitMin', 'n'], ['note', 's'], ['points', 'n']],
    Tickets: [['id', 's'], ['ts', 'n'], ['traderId', 's'], ['farmId', 's'], ['type', 's'], ['subject', 's'], ['status', 's'], ['level', 'n'], ['lastTs', 'n'], ['firstReplyTs', 'n'], ['resolvedTs', 'n'], ['stars', 'n'], ['unreadTrader', 'n'], ['unreadStaff', 'n'], ['lastStaffId', 's'], ['accepted', 'n']],
    TicketMsgs: [['id', 's'], ['ticketId', 's'], ['ts', 'n'], ['from', 's'], ['staffId', 's'], ['text', 's']],
    Events: [['ts', 'n'], ['traderId', 's'], ['type', 's'], ['ref', 's'], ['points', 'n'], ['meta', 's']],
    Rewards: [['id', 's'], ['ts', 'n'], ['traderId', 's'], ['rewardId', 's'], ['status', 's'], ['decidedBy', 's'], ['decidedTs', 'n'], ['note', 's']],
    Farms: [['id', 's'], ['name', 's'], ['status', 's'], ['note', 's'], ['ts', 'n'], ['by', 's']],
    Notifications: [['ts', 'n'], ['to', 's'], ['channel', 's'], ['subject', 's'], ['ok', 'n']],
    Counters: [['key', 's'], ['value', 'n']],
    Config: [['key', 's'], ['value', 's'], ['note', 's']],
    Content: [['id', 's'], ['type', 's'], ['title', 's'], ['desc', 's'], ['driveId', 's'], ['cover', 's'], ['minSec', 'n'], ['order', 'n'], ['active', 'n']],
    MarketItems: [['id', 's'], ['name', 's'], ['short', 's'], ['unit', 's'], ['dec', 'n'], ['order', 'n'], ['main', 'n'], ['hidden', 'n']],
    MarketDay: [['dk', 's'], ['prices', 'j'], ['note', 's'], ['by', 's'], ['ts', 'n']],
    MarketPending: [['id', 's'], ['dk', 's'], ['prices', 'j'], ['note', 's'], ['by', 's'], ['ts', 'n'], ['jumps', 's'], ['status', 's'], ['decidedBy', 's'], ['decidedTs', 'n'], ['reason', 's']]
  };

  var ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var STAFF_ROLES = { assistant: 1, supervisor: 2, manager: 3, admin: 4 };
  var ROLE_LABEL = { assistant: 'معاون موقع', supervisor: 'مشرف الأمن الحيوي', manager: 'مدير الإدارة', admin: 'مسؤول النظام' };
  /* صلاحيات الموظفين. كل صلاحية مفتاح ثابت؛ الدور يعطي مجموعة افتراضية (انظر defaultPerms)، والمدير يخصّص لكل موظف ما يناسبه */
  var PERMS = [
    { key: 'gate', label: 'تسجيل زيارات البوابة', group: 'الميدان' },
    { key: 'farms', label: 'تحديث حالة المزرعة', group: 'الميدان' },
    { key: 'inbox', label: 'الرد على رسائل التجار', group: 'الرسائل' },
    { key: 'suggest.accept', label: 'قبول اقتراح التاجر وإضافة نقاطه', group: 'الرسائل' },
    { key: 'prices.publish', label: 'نشر أسعار «السوق النهاردة»', group: 'السوق' },
    { key: 'prices.approve', label: 'اعتماد الأسعار المعلّقة (القفزات الكبيرة)', group: 'السوق' },
    { key: 'dash', label: 'لوحة المؤشرات', group: 'الإدارة' },
    { key: 'traders', label: 'البحث في قائمة التجار', group: 'الإدارة' },
    { key: 'traders.block', label: 'إيقاف حساب تاجر أو تفعيله', group: 'الإدارة' },
    { key: 'traders.edit', label: 'تعديل بيانات التاجر وتغيير رمزه السري', group: 'الإدارة' },
    { key: 'traders.delete', label: 'حذف التاجر (يوقف حسابه ويحفظ سجله)', group: 'الإدارة' },
    { key: 'rewards', label: 'عرض طلبات الجوائز', group: 'الإدارة' },
    { key: 'rewards.approve', label: 'اعتماد الجوائز وتسليمها', group: 'الإدارة' },
    { key: 'report', label: 'التقرير الأسبوعي للإدارة', group: 'الإدارة' },
    { key: 'fleet', label: 'متابعة الأسطول: الخريطة والطوارئ والتنبيهات', group: 'الأسطول' },
    { key: 'fleet.manage', label: 'إنشاء خطوط السير ومشاركتها عبر واتساب', group: 'الأسطول' }
  ];
  var PERM_KEYS = PERMS.map(function (p) { return p.key; });
  var PERM_MIN = { gate: 1, farms: 1, inbox: 1, 'suggest.accept': 2, dash: 2, traders: 2, 'traders.block': 3, 'traders.edit': 3, 'traders.delete': 3, rewards: 2, 'rewards.approve': 3, 'fleet': 2, 'fleet.manage': 3 };
  var MANAGER_ALWAYS = ['traders.edit', 'traders.delete', 'traders.block', 'fleet', 'fleet.manage'];   // لا تُسحب من مدير الإدارة
  /* إعادة التهيئة من البداية: تُفرَّغ هذه الجداول، وتُحفظ نسخة منها أولًا. الإعدادات والمحتوى وقائمة الأسعار تبقى */
  var RESET_CLEAR = ['Traders', 'Gate', 'Tickets', 'TicketMsgs', 'Events', 'Rewards', 'Notifications', 'Counters', 'Farms', 'MarketDay', 'MarketPending', 'FleetRoutes', 'FleetPings', 'FleetAlerts', 'FleetNotes', 'FleetDevices', 'FleetConsents', 'ErrLog', 'HealthLog'];
  var RESET_KEEP = ['Config', 'Content', 'MarketItems'];
  var RESET_PHRASE = 'أعد التهيئة الكاملة';
  var RESET_KEEP_BACKUPS = 2;

  function createService(store, env) {
    var _cfg = null;
    function cfg() { if (!_cfg) _cfg = L.mergeConfig(C.CONFIG, store.all('Config')); return _cfg; }
    function now() { return env.now(); }
    function today() { return U.dateKey(now()); }
    function err(code, msg) { return new ApiError(code, msg); }
    function jparse(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }

    /* ---------- عدادات وأرقام ---------- */
    function counter(key) {
      var row = store.find('Counters', function (r) { return r.key === key; });
      if (!row) { store.insert('Counters', { key: key, value: 1 }); return 1; }
      var v = Number(row.value) + 1; store.update('Counters', key, { value: v }); return v;
    }
    function peek(key) {
      var row = store.find('Counters', function (r) { return r.key === key; });
      return row ? Number(row.value) : 0;
    }
    function addCounter(key, by) {
      var row = store.find('Counters', function (r) { return r.key === key; });
      if (!row) { store.insert('Counters', { key: key, value: by }); return by; }
      var v = Number(row.value) + by; store.update('Counters', key, { value: v }); return v;
    }
    function nextId(prefix, width) {
      var n = counter('id:' + prefix), s = String(n);
      while (s.length < (width || 4)) s = '0' + s;
      return prefix + '-' + s;
    }
    function genCode() {
      for (var tries = 0; tries < 60; tries++) {
        var h = env.randHex(8), code = '';
        for (var i = 0; i < 4; i++) code += ALPHA[parseInt(h.substr(i * 2, 2), 16) % ALPHA.length];
        if (!store.find('Traders', function (r) { return r.code === code; })) return code;
      }
      throw err('code', 'تعذّر إنشاء كود، حاول مرة أخرى');
    }
    function log(traderId, type, ref, points, meta) {
      store.insert('Events', { ts: now(), traderId: traderId || '', type: type, ref: ref || '', points: points || 0, meta: meta ? JSON.stringify(meta).substring(0, 400) : '' });
    }

    /* ---------- مصادقة ---------- */
    function issue(sub, role, hours) {
      return U.signToken({ sub: sub, role: role, exp: now() + hours * 3600000, iat: now() }, env.secret());
    }
    /* الحسابات المحذوفة تُستبعد من كل القوائم والمؤشرات. وتغيير الرمز من الإدارة يُنهي الجلسات الأقدم منه (sessAt في الحالة) */
    function liveTraders() { return store.all('Traders').filter(function (r) { return r.status !== 'deleted'; }); }
    function whoTrader(token) {
      var p = U.verifyToken(token, env.secret(), now());
      if (!p || p.role !== 'trader') throw err('auth', 'سجّل دخولك من جديد');
      var row = store.find('Traders', function (r) { return r.id === p.sub; });
      if (!row || row.status === 'blocked' || row.status === 'deleted') throw err('auth', 'الحساب غير متاح، تواصل مع المعاون');
      var st = jparse(row.state, null);
      if (st && st.sessAt && (Number(p.iat) || 0) < Number(st.sessAt)) throw err('auth', 'انتهت جلستك، سجّل دخولك بالرمز الجديد');
      return row;
    }
    function whoStaff(token, minRole) {
      var p = U.verifyToken(token, env.secret(), now());
      if (!p || p.role !== 'staff') throw err('auth', 'سجّل دخولك من جديد');
      var row = store.find('Staff', function (r) { return r.id === p.sub; });
      if (!row || !Number(row.active)) throw err('auth', 'الحساب غير متاح');
      if (minRole && STAFF_ROLES[row.role] < STAFF_ROLES[minRole]) throw err('perm', 'الصلاحية غير كافية');
      return row;
    }
    function checkPin(row, pin, kind) {
      var lim = cfg().limits;
      if (Number(row.lockUntil) > now()) throw err('locked', 'محاولات كثيرة. جرّب بعد ' + Math.ceil((Number(row.lockUntil) - now()) / 60000) + ' دقيقة');
      var ok = U.safeEq(U.hashPin(pin, row.salt, env.secret()), row.pinHash);
      if (!ok) {
        var f = Number(row.fails) + 1, patch = { fails: f };
        if (f >= lim.loginFails) { patch.fails = 0; patch.lockUntil = now() + lim.lockMinutes * 60000; }
        store.update(kind, row.id, patch);
        throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      }
      if (Number(row.fails)) store.update(kind, row.id, { fails: 0 });
    }

    /* ---------- حالة التاجر ---------- */
    function stateOf(row) {
      var s = jparse(row.state, null);
      if (!s) s = L.newState(Number(row.created) || now());
      if (!s.stats) s.stats = { games: 0, perfect: 0, rounds: 0 };
      if (!s.vStart) s.vStart = {};
      return s;
    }
    function save(row, st) {
      var patch = { state: JSON.stringify(st) };
      store.update('Traders', row.id, patch);
      row.state = patch.state;
    }
    function rankOf(row, st) {
      return L.computeRank(st, cfg(), now(), today());
    }

    /* ---------- الشارات ---------- */
    function badgesOf(st, rank) {
      var si = L.streakInfo(st, today(), cfg()), vids = C.VIDEOS.length, seen = Object.keys(st.videos).length;
      return [
        { id: 'b1', title: 'أول جولة', earned: st.days.length >= 1 },
        { id: 'b2', title: 'أسبوع كامل', earned: si.goalWeeks >= 1 },
        { id: 'b3', title: 'قنّاص الأخطاء', earned: st.stats.perfect >= 1 },
        { id: 'b4', title: 'حارس البوابة', earned: st.gate.clean >= 1 },
        { id: 'b5', title: 'خمس زيارات نظيفة', earned: st.gate.clean >= 5 },
        { id: 'b6', title: 'مشاهد متابع', earned: seen >= vids },
        { id: 'b7', title: 'صاحب رأي', earned: Object.keys(st.rated).length >= 1 || st.sugg >= 1 },
        { id: 'b8', title: 'شريك مرشِّح', earned: st.invites.done >= 1 }
      ];
    }

    /* ---------- ملف التاجر العام ---------- */
    function profile(row, st) {
      var c = cfg(), t = today(), rank = rankOf(row, st);
      var si = L.streakInfo(st, t, c), d = L.rollDaily(st, t);
      var rinfo = C.RANKS[rank];
      var unread = store.filter('Tickets', function (x) { return x.traderId === row.id && Number(x.unreadTrader); }).length;
      var followupDue = !!(st.baseline && !st.followup && (now() - st.baseline.ts) >= c.followupAfterDays * 86400000);
      return {
        id: row.id, code: row.code, name: row.name, plate: row.plate, company: row.company, farmId: row.farmId,
        pts: st.pts, rank: { n: rank, name: rinfo.name, perk: rinfo.perk },
        next: rank < 6 ? { n: rank + 1, name: C.RANKS[rank + 1].name, need: C.RANKS[rank + 1].need, items: L.nextRankProgress(st, c, now(), t, rank) } : null,
        week: { count: si.count, goal: si.goal, met: si.met, streak: si.streak, mult: si.mult, freezesLeft: si.freezesLeft, goalWeeks: si.goalWeeks, days: weekDays(st, si.weekStart) },
        daily: { roundDone: !!d.round, pts: d.pts, cap: c.dailyDigitalCap, games: d.games },
        onboarding: { launch: !!st.videos.launch, charter: !!st.charter, baseline: !!st.baseline, done: L.onboardingDone(st) },
        followupDue: followupDue,
        gate: { visits: st.gate.visits, clean: st.gate.clean, cleanRun: st.gate.cleanRun, viol: st.gate.viol, last: st.gate.last },
        honor: !!st.honor, unread: unread, badges: badgesOf(st, rank),
        invites: st.invites, baseline: st.baseline, followup: st.followup,
        mizanDone: !!st.mizan, joined: row.created
      };
    }
    function weekDays(st, ws) {
      var out = [];
      for (var i = 0; i < 7; i++) { var dk = U.addDays(ws, i); out.push({ dk: dk, on: st.days.indexOf(dk) >= 0 }); }
      return out;
    }

    /* ---------- التسجيل والدخول ---------- */
    function doRegister(p, assistedBy) {
      var name = U.cleanText(p.name, 40), phone = U.normPhone(p.phone), pin = U.normPin(p.pin);
      if (name.length < 3) throw err('name', 'اكتب اسمك بالكامل (3 حروف على الأقل)');
      if (!phone) throw err('phone', 'رقم الموبايل غير صحيح (مثال: 01001234567)');
      if (!pin) throw err('pin', 'الرمز السري من 4 إلى 6 أرقام');
      if (!assistedBy && !p.agree) throw err('agree', 'وافق على شروط الاستخدام والخصوصية');
      var dupTrader = store.find('Traders', function (r) { return r.phone === phone; });
      if (dupTrader) throw err('phone_exists', dupTrader.status === 'deleted' ? 'الحساب ده أُوقف. كلّم المعاون لمراجعة الموضوع' : 'الرقم ده مسجّل قبل كده — سجّل دخولك');
      if (!assistedBy) { /* حماية من التسجيل الآلي: حد يومي عام */
        if (peek('reg:' + today()) >= cfg().limits.registerPerDay) throw err('busy', 'التسجيل مزدحم الآن، جرّب بعد قليل أو اطلب من المعاون تسجيلك');
        addCounter('reg:' + today(), 1);
      }
      var salt = env.randHex(8), id = nextId('TR', 4), t = now();
      var st = L.newState(t);
      var farm = U.cleanText(p.farmId, 8);
      if (p.ref) {
        var inv = store.find('Traders', function (r) { return r.code === String(p.ref).toUpperCase().trim(); });
        if (inv) st.invitedBy = inv.id;
      }
      var row = {
        id: id, code: genCode(), name: name, phone: phone, pinHash: U.hashPin(pin, salt, env.secret()), salt: salt,
        plate: U.normPlate(p.plate), company: U.cleanText(p.company, 40), farmId: farm, status: 'active',
        created: t, lastLogin: t, fails: 0, lockUntil: 0, state: JSON.stringify(st), mizan: ''
      };
      store.insert('Traders', row);
      log(id, 'register', assistedBy || '', 0, null);
      return row;
    }
    function register(token, p) {
      var row = doRegister(p, '');
      return { token: issue(row.id, 'trader', cfg().limits.tokenDays * 24), me: profile(row, stateOf(row)) };
    }
    function login(token, p) {
      var phone = U.normPhone(p.phone), pin = U.normPin(p.pin);
      if (!phone || !pin) throw err('bad_login', 'اكتب رقم الموبايل والرمز السري');
      var row = store.find('Traders', function (r) { return r.phone === phone; });
      if (!row) throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      if (row.status === 'deleted') throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      if (row.status === 'blocked') throw err('auth', 'الحساب غير متاح، تواصل مع المعاون');
      checkPin(row, pin, 'Traders');
      store.update('Traders', row.id, { lastLogin: now() });
      return { token: issue(row.id, 'trader', cfg().limits.tokenDays * 24), me: profile(row, stateOf(row)) };
    }
    function staffLogin(token, p) {
      var phone = U.normPhone(p.phone), pin = U.normPin(p.pin);
      if (!phone || !pin) throw err('bad_login', 'اكتب رقم الموبايل والرمز السري');
      var row = store.find('Staff', function (r) { return r.phone === phone; });
      if (!row || !Number(row.active)) throw err('bad_login', 'الرقم أو الرمز غير صحيح');
      checkPin(row, pin, 'Staff');
      return { token: issue(row.id, 'staff', cfg().limits.staffTokenHours), staff: staffPublic(row) };
    }
    function staffPublic(s) {
      return { id: s.id, name: s.name, title: s.title, role: s.role, roleLabel: ROLE_LABEL[s.role], farmId: s.farmId, perms: permsOf(s) };
    }

    /* ---------- محتوى ---------- */
    function contentMap() {
      var rows = store.all('Content'), m = {};
      rows.forEach(function (r) { m[r.id] = r; });
      return m;
    }
    function videosList(st) {
      var cm = contentMap(), c = cfg();
      return C.VIDEOS.map(function (v) {
        var r = cm[v.id] || {};
        if (r.active === 0 || r.active === '0') return null;
        return {
          id: v.id, title: r.title || v.title, desc: r.desc || v.desc, cover: r.cover || v.cover,
          driveId: r.driveId || '', secs: v.secs, minSec: Number(r.minSec) || v.minSec, required: !!v.required,
          watched: !!st.videos[v.id], pts: c.points.video, order: Number(r.order) || v.order
        };
      }).filter(Boolean).sort(function (a, b) { return a.order - b.order; });
    }
    function cardsList(st) {
      return C.CARDS.map(function (k) {
        return { id: k.id, tag: k.tag, title: k.title, fact: k.fact, why: k.why, src: k.src, url: k.url, forTrader: !!k.forTrader, read: !!st.cards[k.id] };
      });
    }
    function content(row) {
      var st = stateOf(row);
      return { videos: videosList(st), cards: cardsList(st), cardPts: cfg().points.card };
    }

    function videoStart(row, p) {
      var v = C.VIDEOS.filter(function (x) { return x.id === p.id; })[0];
      if (!v) throw err('video', 'فيديو غير موجود');
      var st = stateOf(row); st.vStart[v.id] = now(); save(row, st);
      return { started: true };
    }
    function videoDone(row, p) {
      var v = C.VIDEOS.filter(function (x) { return x.id === p.id; })[0];
      if (!v) throw err('video', 'فيديو غير موجود');
      var st = stateOf(row), c = cfg();
      var cm = contentMap(), minSec = (cm[v.id] && Number(cm[v.id].minSec)) || v.minSec;
      if (st.videos[v.id]) return { pts: 0, already: true, me: profile(row, st) };
      var started = st.vStart[v.id] || 0;
      if (!started || (now() - started) < minSec * 800) throw err('too_early', 'كمّل الفيديو للآخر الأول');
      st.videos[v.id] = now();
      var a = L.awardDigital(st, c.points.video, today(), c);
      log(row.id, 'video', v.id, a.pts, null);
      afterProgress(row, st);
      save(row, st);
      return { pts: a.pts, capped: a.capped, mult: a.mult, me: profile(row, st) };
    }
    function cardRead(row, p) {
      var k = C.CARDS.filter(function (x) { return x.id === p.id; })[0];
      if (!k) throw err('card', 'بطاقة غير موجودة');
      var st = stateOf(row), c = cfg();
      if (st.cards[k.id]) return { pts: 0, already: true, me: profile(row, st) };
      st.cards[k.id] = now();
      var a = L.awardDigital(st, c.points.card, today(), c);
      log(row.id, 'card', k.id, a.pts, null);
      save(row, st);
      return { pts: a.pts, capped: a.capped, mult: a.mult, me: profile(row, st) };
    }

    /* ---------- جولة اليوم ---------- */
    function traderSeed(row) { return U.seedFrom(row.id) % 997; }
    function roundPick(row) {
      var di = U.dayIndex(today()), ts = traderSeed(row);
      var card = C.CARDS[(di + ts) % C.CARDS.length];
      var tf = C.GAMES.tf.items, q = tf[(di * 5 + ts) % tf.length];
      return { card: card, q: q };
    }
    function roundGet(row) {
      var st = stateOf(row), d = L.rollDaily(st, today()), pick = roundPick(row);
      return {
        done: !!d.round,
        card: { id: pick.card.id, tag: pick.card.tag, title: pick.card.title, fact: pick.card.fact, why: pick.card.why, src: pick.card.src, url: pick.card.url },
        q: { id: pick.q.id, q: pick.q.q }
      };
    }
    function roundSubmit(row, p) {
      var st = stateOf(row), c = cfg(), t = today(), d = L.rollDaily(st, t);
      if (d.round) throw err('done', 'خلّصت جولة النهارده. نشوفك بكرة!');
      var pick = roundPick(row);
      var correct = (p.answer === true || p.answer === 'true') === pick.q.a;
      d.round = 1;
      L.markActive(st, t);
      st.stats.rounds++;
      if (!st.cards[pick.card.id]) st.cards[pick.card.id] = now();
      var a = L.awardDigital(st, c.points.round, t, c);
      var bonus = L.weekGoalBonus(st, t, c);
      addCounter('rounds:' + L.streakInfo(st, t, c).weekStart, 1);
      log(row.id, 'round', pick.q.id, a.pts + bonus, { ok: correct ? 1 : 0 });
      afterProgress(row, st);
      save(row, st);
      return {
        correct: correct, answer: pick.q.a, why: pick.q.why, src: pick.q.src, pts: a.pts, mult: a.mult, capped: a.capped,
        weekBonus: bonus, me: profile(row, st)
      };
    }

    /* ---------- الألعاب ---------- */
    function gameSet(id, row) {
      var g = C.GAMES[id];
      if (!g) throw err('game', 'لعبة غير موجودة');
      var t = today(), di = U.dayIndex(t), items;
      if (id === 'tf') items = U.shuffled(g.items, 'tf:' + t).slice(0, g.per);
      else if (id === 'steps') { var s0 = (di * g.per) % g.items.length; items = []; for (var i = 0; i < g.per; i++) items.push(g.items[(s0 + i) % g.items.length]); }
      else items = U.shuffled(g.items, id + ':' + t).slice(0, g.per);
      return { g: g, items: items, t: t };
    }
    function optsShuffled(item, t) {
      var idx = item.opts.map(function (_, i) { return i; });
      var order = U.shuffled(idx, 'o:' + item.id + ':' + t);
      return order; // order[k] = index الأصلي للخيار المعروض k
    }
    function gameGet(row, p) {
      var set = gameSet(p.id, row), g = set.g, st = stateOf(row), d = L.rollDaily(st, today());
      var items = set.items.map(function (it) {
        if (g.kind === 'tf') return { id: it.id, q: it.q };
        if (g.kind === 'order') return { id: it.id, t: it.t, cards: U.shuffled(it.order, 'k:' + it.id + ':' + set.t) };
        var ord = optsShuffled(it, set.t);
        return { id: it.id, tag: it.tag || '', q: it.q, opts: ord.map(function (k) { return it.opts[k]; }) };
      });
      return {
        id: g.id, title: g.title, tag: g.tag, intro: g.intro, kind: g.kind, secs: g.secs, items: items,
        playedToday: !!d.games[g.id], pts: cfg().points.gameBase + '–' + (cfg().points.gameBase + cfg().points.gameBonus)
      };
    }
    function scoreGame(id, items, answers, t) {
      var g = C.GAMES[id], res = [], correct = 0;
      items.forEach(function (it, i) {
        var a = answers ? answers[i] : null, ok = false, shown = '';
        if (g.kind === 'tf') {
          ok = (a === true || a === 'true') ? it.a === true : (a === false || a === 'false') ? it.a === false : false;
          shown = it.a ? 'صح' : 'غلط';
        } else if (g.kind === 'order') {
          ok = Array.isArray(a) && a.length === it.order.length && a.every(function (x, k) { return x === it.order[k]; });
          shown = it.order.join(' ← ');
        } else {
          var ord = optsShuffled(it, t), pick = (typeof a === 'number' && a >= 0 && a < ord.length) ? ord[a] : -1;
          ok = pick === it.a; shown = it.opts[it.a];
        }
        if (ok) correct++;
        res.push({ id: it.id, ok: ok, answer: shown, why: it.why || '', wrong: it.wrong || '', src: it.src || null, q: it.q || it.t || '' });
      });
      return { correct: correct, total: items.length, res: res };
    }
    function gameSubmit(row, p) {
      var set = gameSet(p.id, row), g = set.g, st = stateOf(row), c = cfg(), t = set.t;
      var sc = scoreGame(g.id, set.items, p.answers, t), d = L.rollDaily(st, t);
      var pts = 0, a = null, first = !d.games[g.id];
      st.stats.games++;
      if (sc.correct === sc.total) st.stats.perfect++;
      if (first) {
        d.games[g.id] = sc.correct;
        a = L.awardDigital(st, L.gamePoints(sc.correct, sc.total, c), t, c);
        pts = a.pts;
      }
      log(row.id, 'game', g.id, pts, { s: sc.correct + '/' + sc.total });
      save(row, st);
      return { correct: sc.correct, total: sc.total, res: sc.res, pts: pts, first: first, capped: a ? a.capped : false, mult: a ? a.mult : 1, me: profile(row, st) };
    }

    /* ---------- الميثاق والاختبارات ---------- */
    function charterSign(row, p) {
      var st = stateOf(row), c = cfg();
      if (st.charter) return { pts: 0, me: profile(row, st) };
      st.charter = now();
      st.pts += c.points.charter;
      log(row.id, 'charter', '', c.points.charter, null);
      afterProgress(row, st);
      save(row, st);
      return { pts: c.points.charter, me: profile(row, st) };
    }
    function testItems(kind) {
      var pl = C.PLACEMENT[kind]; if (!pl) throw err('test', 'اختبار غير موجود');
      var items = [];
      pl.tf.forEach(function (id) { var it = C.GAMES.tf.items.filter(function (x) { return x.id === id; })[0]; items.push({ k: 'tf', it: it }); });
      pl.shoes.forEach(function (id) { var it = C.GAMES.shoes.items.filter(function (x) { return x.id === id; })[0]; items.push({ k: 'choice', it: it }); });
      return items;
    }
    function testGet(row, p) {
      var st = stateOf(row), kind = p.kind === 'followup' ? 'followup' : 'baseline';
      var items = testItems(kind).map(function (x) {
        if (x.k === 'tf') return { id: x.it.id, kind: 'tf', q: x.it.q };
        var ord = optsShuffled(x.it, 'test');
        return { id: x.it.id, kind: 'choice', q: x.it.q, opts: ord.map(function (k) { return x.it.opts[k]; }) };
      });
      return { kind: kind, title: C.PLACEMENT[kind].title, items: items, done: !!st[kind], result: st[kind] };
    }
    function testSubmit(row, p) {
      var st = stateOf(row), c = cfg(), kind = p.kind === 'followup' ? 'followup' : 'baseline';
      if (st[kind]) throw err('done', 'خلّصت الاختبار ده قبل كده');
      if (kind === 'followup' && !st.baseline) throw err('order', 'ابدأ بالاختبار الأول');
      if (kind === 'followup' && (now() - st.baseline.ts) < c.followupAfterDays * 86400000) throw err('early', 'اختبار الشهر بيفتح بعد ' + c.followupAfterDays + ' يوم');
      var items = testItems(kind), correct = 0, res = [];
      items.forEach(function (x, i) {
        var a = p.answers ? p.answers[i] : null, ok = false, shown;
        if (x.k === 'tf') { ok = (a === true || a === 'true') ? x.it.a === true : (a === false || a === 'false') ? x.it.a === false : false; shown = x.it.a ? 'صح' : 'غلط'; }
        else { var ord = optsShuffled(x.it, 'test'); var pick = (typeof a === 'number' && a >= 0 && a < ord.length) ? ord[a] : -1; ok = pick === x.it.a; shown = x.it.opts[x.it.a]; }
        if (ok) correct++;
        res.push({ id: x.it.id, ok: ok, answer: shown, why: x.it.why, q: x.it.q });
      });
      st[kind] = { score: correct, total: items.length, ts: now() };
      var pts = kind === 'baseline' ? c.points.baseline : c.points.followup;
      st.pts += pts;
      log(row.id, 'test', kind, pts, { s: correct + '/' + items.length });
      afterProgress(row, st);
      save(row, st);
      return { correct: correct, total: items.length, res: res, pts: pts, me: profile(row, st) };
    }

    /* مكافآت الدعوة تُمنح عند اكتمال المدعو وعند أول زيارة نظيفة */
    function afterProgress(row, st) {
      if (st.invitedBy && !st.invitePaid.done && L.onboardingDone(st)) {
        var inv = store.find('Traders', function (r) { return r.id === st.invitedBy; });
        if (inv) {
          var ist = stateOf(inv), c = cfg();
          ist.pts += c.points.inviteDone; ist.invites.done++;
          st.invitePaid.done = 1;
          log(inv.id, 'invite_done', row.id, c.points.inviteDone, null);
          save(inv, ist);
        }
      }
    }
    function payInviteClean(row, st) {
      if (st.invitedBy && !st.invitePaid.clean) {
        var inv = store.find('Traders', function (r) { return r.id === st.invitedBy; });
        if (inv) {
          var ist = stateOf(inv), c = cfg();
          ist.pts += c.points.inviteClean; ist.invites.clean++;
          st.invitePaid.clean = 1;
          log(inv.id, 'invite_clean', row.id, c.points.inviteClean, null);
          save(inv, ist);
        }
      }
    }

    /* ---------- ميزان التاجر (حفظ المدخلات) ---------- */
    function mizanSave(row, p) {
      var inp = p.inputs || {}, clean = {};
      ['birds', 'kg', 'price', 'margin', 'trips', 'dayCost', 'lostDays', 'share'].forEach(function (k) { clean[k] = Math.max(0, Math.min(1e9, U.toNum(inp[k], 0))); });
      store.update('Traders', row.id, { mizan: JSON.stringify(clean) });
      var st = stateOf(row), pts = 0;
      if (!st.mizan) { st.mizan = now(); pts = cfg().points.mizan; st.pts += pts; log(row.id, 'mizan', '', pts, null); }
      save(row, st);
      return { pts: pts, me: profile(row, st) };
    }
    function mizanGet(row) { return { inputs: jparse(row.mizan, null) }; }

    /* ---------- الرسائل (كلّمنا) ---------- */
    function roleStaff(roles, farmId) {
      return store.filter('Staff', function (s) {
        if (!Number(s.active) || roles.indexOf(s.role) < 0 || !can(s, 'inbox')) return false;
        if (s.role === 'assistant') return !farmId || !s.farmId || s.farmId === farmId;
        return true;
      });
    }
    function notifyMail(list, subject, body) {
      var emails = [];
      list.forEach(function (s) { if (s.email && emails.indexOf(s.email) < 0) emails.push(s.email); });
      var ok = 0;
      if (emails.length) {
        try { ok = env.notify(emails, subject, body) ? 1 : 0; } catch (e) { ok = 0; }
      }
      store.insert('Notifications', { ts: now(), to: list.map(function (s) { return s.id; }).join(','), channel: 'email', subject: subject, ok: ok });
    }
    function notifyStaffList(list, ticket, why) {
      var tt = cfg().ticketTypes[ticket.type];
      var subject = '[' + cfg().appName + '] ' + why + ' رقم ' + ticket.id + (ticket.type === 'urgent' ? ' (عاجل)' : '');
      var body = why + ' رقم ' + ticket.id + ' — النوع: «' + tt.label + '». افتح التطبيق للاطلاع والرد. هذا البريد لا يتضمن نص الرسالة.';
      notifyMail(list, subject, body);
    }
    function ticketCreate(row, p) {
      var c = cfg(), lim = c.limits, tt = c.ticketTypes[p.type];
      if (!tt) throw err('type', 'اختر نوع الرسالة');
      var subject = U.cleanText(p.subject, lim.subjectMax), body = U.cleanText(p.body, lim.bodyMax);
      if (subject.length < 3) throw err('subject', 'اكتب عنوانًا قصيرًا للرسالة');
      if (body.length < 5) throw err('body', 'اكتب تفاصيل الرسالة');
      var dk = today();
      var cnt = store.filter('Tickets', function (x) { return x.traderId === row.id && U.dateKey(Number(x.ts)) === dk; }).length;
      if (cnt >= lim.ticketsPerDay) throw err('limit', 'وصلت للحد اليومي للرسائل (' + lim.ticketsPerDay + '). جرّب بكرة.');
      var t = now(), id = nextId('T', 4);
      var farm = U.cleanText(p.farmId, 8) || row.farmId || '';
      var tk = { id: id, ts: t, traderId: row.id, farmId: farm, type: p.type, subject: subject, status: 'open', level: 0, lastTs: t, firstReplyTs: 0, resolvedTs: 0, stars: 0, unreadTrader: 0, unreadStaff: 1, lastStaffId: '', accepted: 0 };
      store.insert('Tickets', tk);
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: id, ts: t, from: 'trader', staffId: '', text: body });
      log(row.id, 'ticket', id, 0, { type: p.type });
      notifyStaffList(roleStaff(tt.first, farm), tk, 'لديك رسالة جديدة');
      return { id: id, ticket: ticketPublic(tk) };
    }
    function ticketPublic(tk) {
      var tt = cfg().ticketTypes[tk.type] || {};
      return { id: tk.id, type: tk.type, typeLabel: tt.label || tk.type, subject: tk.subject, status: tk.status, ts: Number(tk.ts), lastTs: Number(tk.lastTs), unread: !!Number(tk.unreadTrader), stars: Number(tk.stars), farmId: tk.farmId, callback: false };
    }
    function msgsOf(id, forTrader) {
      var staffMap = {};
      store.all('Staff').forEach(function (s) { staffMap[s.id] = s; });
      return store.filter('TicketMsgs', function (m) { return m.ticketId === id; }).sort(function (a, b) { return Number(a.ts) - Number(b.ts); }).map(function (m) {
        var s = m.staffId ? staffMap[m.staffId] : null;
        var o = { ts: Number(m.ts), from: m.from, text: m.text };
        if (m.from === 'staff') o.who = s ? s.title : 'فريق الأمن الحيوي';
        if (!forTrader && s) o.whoName = s.name;
        return o;
      });
    }
    function ticketList(row) {
      var list = store.filter('Tickets', function (x) { return x.traderId === row.id; }).sort(function (a, b) { return Number(b.lastTs) - Number(a.lastTs); });
      return { tickets: list.map(ticketPublic), types: typesPublic() };
    }
    function typesPublic() {
      var t = cfg().ticketTypes, out = [];
      Object.keys(t).forEach(function (k) { out.push({ id: k, label: t[k].label, hint: t[k].hint, sla: t[k].sla }); });
      return out;
    }
    function ticketGet(row, p) {
      var tk = store.find('Tickets', function (x) { return x.id === p.id && x.traderId === row.id; });
      if (!tk) throw err('nf', 'الرسالة غير موجودة');
      if (Number(tk.unreadTrader)) store.update('Tickets', tk.id, { unreadTrader: 0 });
      var o = ticketPublic(tk); o.unread = false;
      return { ticket: o, msgs: msgsOf(tk.id, true), canRate: !!(Number(tk.firstReplyTs) && !Number(tk.stars)) };
    }
    function ticketReply(row, p) {
      var tk = store.find('Tickets', function (x) { return x.id === p.id && x.traderId === row.id; });
      if (!tk) throw err('nf', 'الرسالة غير موجودة');
      var text = U.cleanText(p.text, cfg().limits.bodyMax);
      if (text.length < 2) throw err('body', 'اكتب ردك');
      var dk = today(), myIds = {};
      store.filter('Tickets', function (x) { return x.traderId === row.id; }).forEach(function (x) { myIds[x.id] = 1; });
      var mine = store.filter('TicketMsgs', function (m) { return m.from === 'trader' && myIds[m.ticketId] && U.dateKey(Number(m.ts)) === dk; }).length;
      if (mine >= cfg().limits.repliesPerDay + cfg().limits.ticketsPerDay) throw err('limit', 'وصلت للحد اليومي للرسائل');
      var t = now();
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: t, from: 'trader', staffId: '', text: text });
      var reopened = tk.status !== 'open';
      store.update('Tickets', tk.id, { status: 'open', lastTs: t, unreadStaff: 1, resolvedTs: 0 });
      if (reopened) {
        var target = tk.lastStaffId ? store.filter('Staff', function (s) { return s.id === tk.lastStaffId && Number(s.active); }) : [];
        if (!target.length) target = roleStaff(cfg().ticketTypes[tk.type].first, tk.farmId);
        notifyStaffList(target, tk, 'رد جديد من التاجر على الرسالة');
      }
      return ticketGet(row, { id: tk.id });
    }
    function ticketRate(row, p) {
      var tk = store.find('Tickets', function (x) { return x.id === p.id && x.traderId === row.id; });
      if (!tk) throw err('nf', 'الرسالة غير موجودة');
      if (!Number(tk.firstReplyTs)) throw err('early', 'استنى رد المسؤول الأول');
      if (Number(tk.stars)) throw err('done', 'قيّمت الرد قبل كده');
      var stars = U.clamp(U.toInt(p.stars, 0), 1, 5), st = stateOf(row), c = cfg();
      store.update('Tickets', tk.id, { stars: stars });
      st.rated[tk.id] = stars; st.pts += c.points.rateReply;
      log(row.id, 'rate', tk.id, c.points.rateReply, { stars: stars });
      save(row, st);
      return { pts: c.points.rateReply, me: profile(row, st) };
    }

    /* ---------- الجوائز ---------- */
    function myClaims(row) {
      var m = {};
      store.filter('Rewards', function (r) { return r.traderId === row.id; }).forEach(function (r) { m[r.rewardId] = r; });
      return m;
    }
    function rewardsList(row) {
      var st = stateOf(row), rank = rankOf(row, st), claims = myClaims(row);
      return {
        rewards: C.REWARDS.map(function (rw) {
          var sv = L.rewardState(rw, rank, st.pts, st, claims[rw.id]);
          if (rw.id === 'honor' && sv === 'available' && st.honor) sv = 'delivered';
          return { id: rw.id, kind: rw.kind, title: rw.title, desc: rw.desc, rank: rw.rank, points: rw.points, state: sv };
        }),
        pts: st.pts, rank: rank
      };
    }
    function rewardClaim(row, p) {
      var rw = C.REWARDS.filter(function (x) { return x.id === p.id; })[0];
      if (!rw) throw err('nf', 'جائزة غير موجودة');
      var st = stateOf(row), rank = rankOf(row, st), claims = myClaims(row);
      var sv = L.rewardState(rw, rank, st.pts, st, claims[rw.id]);
      if (sv !== 'available') throw err('state', sv === 'locked' ? 'لسه ماوصلتش لشروطها' : sv === 'pending_ops' ? 'قيد اعتماد إدارة التشغيل' : 'تم طلبها قبل كده');
      if (rw.id === 'honor') { st.honor = 1; save(row, st); }
      var status = rw.id === 'honor' ? 'delivered' : 'requested';
      store.insert('Rewards', { id: nextId('R', 4), ts: now(), traderId: row.id, rewardId: rw.id, status: status, decidedBy: '', decidedTs: 0, note: '' });
      log(row.id, 'reward_claim', rw.id, 0, null);
      return rewardsList(row);
    }
    function honorSet(row, p) {
      var st = stateOf(row); st.honor = p.on ? 1 : 0; save(row, st);
      return { honor: !!st.honor };
    }

    /* ---------- الرئيسية ---------- */
    function farmsList() {
      var c = cfg(), t = now();
      return store.all('Farms').map(function (f) {
        var st = f.status || 'unknown';
        if (!f.ts || (t - Number(f.ts)) > c.farmStaleHours * 3600000) st = 'unknown';
        return { id: f.id, name: f.name, status: st, label: C.FARM_STATUS[st].label, tone: C.FARM_STATUS[st].tone, note: st === 'unknown' ? '' : f.note, ts: Number(f.ts) };
      });
    }
    function collective() {
      var c = cfg(), ws = U.weekStart(today());
      var n = peek('rounds:' + ws);
      return { count: n, target: c.collective.weeklyTarget, reached: n >= c.collective.weeklyTarget };
    }
    function bandOf(row, st) {
      var all = [];
      liveTraders().forEach(function (r) { var s = jparse(r.state, null); if (s && s.pts > 0) all.push(s.pts); });
      if (!all.length || st.pts <= 0) return null;
      var higher = all.filter(function (x) { return x > st.pts; }).length;
      var pct = higher / all.length;
      return pct <= 0.1 ? 10 : pct <= 0.25 ? 25 : pct <= 0.5 ? 50 : 100;
    }
    function honorBoard() {
      var out = [];
      liveTraders().forEach(function (r) {
        var s = jparse(r.state, null);
        if (s && s.honor && s.rankMax >= 2) out.push(r.name);
      });
      out.sort(function (a, b) { return a < b ? -1 : 1; });
      return out.slice(0, 30);
    }
    function home(row) {
      var st = stateOf(row);
      var pr = profile(row, st), mk = mkSafe(), tk = today();
      /* قياس الاستخدام للتقرير الأسبوعي: أول فتح في اليوم، وأول مرة يصله فيها سعر اليوم (حدث واحد لكل منهما يوميًا) */
      if (st.openDk !== tk) { st.openDk = tk; log(row.id, 'open', tk, 0, null); }
      if (mk && mk.state === 'fresh' && st.pvDk !== tk) { st.pvDk = tk; log(row.id, 'pview', tk, 0, null); }
      save(row, st); // يثبّت أعلى رتبة وصل لها
      return { me: pr, farms: farmsList(), collective: collective(), band: bandOf(row, st), honor: honorBoard(), facts: cfg().facts, appName: cfg().appName, market: mk, welcome: welcomeCfg(), milestone: milestoneOf(row, st, pr), feat: featCfg() };
    }
    /* رسالة الترحيب والتقدير: نص وتوقيع وتشغيل فقط (التخصيص بالاسم والإنجاز يتم في الواجهة من بيانات التاجر نفسه) */
    function welcomeCfg() {
      var w = cfg().welcome || {}, d = C.CONFIG.welcome, lines = [], defs = [], i;
      for (i = 1; i <= 8; i++) {
        var v = U.cleanText(w['t' + i] == null ? '' : w['t' + i], 240);
        if (v) lines.push(v);
        defs.push(d['t' + i]);
      }
      return {
        on: !(w.on === false || w.on === 'false' || w.on === 0),
        message: U.cleanText(w.message == null ? '' : w.message, 240),
        sign: U.cleanText(w.sign == null || w.sign === '' ? d.sign : w.sign, 80),
        lines: lines.length ? lines : defs     // لو مُسحت كل الجمل نرجع للجمل الجاهزة بدل رسالة فارغة
      };
    }
    function visits(row) {
      var list = store.filter('Gate', function (g) { return g.traderId === row.id; }).sort(function (a, b) { return Number(b.ts) - Number(a.ts); }).slice(0, 40);
      var farms = {}; store.all('Farms').forEach(function (f) { farms[f.id] = f.name; });
      return {
        visits: list.map(function (g) {
          return { ts: Number(g.ts), farm: farms[g.farmId] || g.farmId, checks: jparse(g.checks, {}), pass: Number(g.pass), clean: !!Number(g.clean), violation: !!Number(g.violation), points: Number(g.points) };
        })
      };
    }
    function inviteInfo(row) {
      var st = stateOf(row);
      return { code: row.code, done: st.invites.done, clean: st.invites.clean, ptsDone: cfg().points.inviteDone, ptsClean: cfg().points.inviteClean };
    }

    /* ---------- السوق النهاردة: أسعار بيع منتجات الشركة للتجار ---------- */
    function mkCfg() {
      var m = cfg().market || {}, d = C.CONFIG.market;
      function n(v, def, lo, hi) { v = Number(v); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); }
      return {
        editRole: STAFF_ROLES[m.editRole] ? m.editRole : d.editRole,
        directRole: STAFF_ROLES[m.directRole] ? m.directRole : d.directRole,
        remind: !(m.remind === false || m.remind === 'false' || m.remind === 0),
        remindHour: Math.round(n(m.remindHour, d.remindHour, 0, 23)),
        staleDays: Math.round(n(m.staleDays, d.staleDays, 0, 30)),
        historyDays: Math.round(n(m.historyDays, d.historyDays, 3, 60)),
        maxJumpPct: n(m.maxJumpPct, d.maxJumpPct, 1, 500),
        backup: String(m.backup == null ? '' : m.backup).split(/[,،;\s]+/).map(function (x) { x = x.trim(); return /^1\d{9}$/.test(x) ? '0' + x : x; }).filter(Boolean),
        approval: ['jump', 'always', 'off'].indexOf(String(m.approval)) >= 0 ? String(m.approval) : d.approval,
        approveRole: STAFF_ROLES[m.approveRole] ? m.approveRole : d.approveRole,
        selfApprove: m.selfApprove === true || m.selfApprove === 'true' || m.selfApprove === 1,
        approveRemindMin: Math.round(n(m.approveRemindMin, d.approveRemindMin, 5, 1440)),
        escalate: !(m.escalate === false || m.escalate === 'false' || m.escalate === 0),
        escalateHour: Math.round(n(m.escalateHour, d.escalateHour, 1, 23)),
        company: String(m.company || d.company),
        disclaimer: String(m.disclaimer || d.disclaimer)
      };
    }
    /* منتجات السوق من ورقة MarketItems (وإن كانت فارغة تمامًا نستخدم الافتراضي) */
    function mkItems() {
      var rows = store.all('MarketItems'), out = [], seen = {}, hasMain = false;
      rows.forEach(function (r, i) {
        var id = String(r.id == null ? '' : r.id).trim();
        if (!/^[A-Za-z0-9_]{1,20}$/.test(id) || seen[id]) return;
        var name = U.cleanText(r.name, 60);
        if (!name || Number(r.hidden)) return;
        seen[id] = 1;
        var main = Number(r.main) && !hasMain ? 1 : 0; if (main) hasMain = true;
        out.push({ id: id, name: name, short: U.cleanText(r.short, 20) || name, unit: U.cleanText(r.unit, 20), dec: U.clamp(U.toInt(r.dec, 0), 0, 3), order: Number(r.order) || 0, main: main, i: i });
      });
      if (!out.length && !rows.length) {
        C.MARKET_ITEMS.forEach(function (x, i) { out.push({ id: x.id, name: x.name, short: x.short, unit: x.unit, dec: x.dec, order: x.order, main: x.main && !hasMain ? 1 : 0, i: i }); hasMain = hasMain || !!x.main; });
      }
      out.sort(function (a, b) { return a.order - b.order || a.i - b.i; });
      if (out.length && !hasMain) out[0].main = 1;
      return out;
    }
    function normDk(v) { var s = String(v == null ? '' : v).trim().substring(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
    function mkPrice(v) { v = Number(v); return v > 0 && v < 1e7 ? v : 0; }
    /* أيام الأسعار الأحدث أولًا (تتجاهل أي تاريخ مستقبلي أو غير مفهوم) */
    function mkDays() {
      var t = today(), out = [];
      store.all('MarketDay').forEach(function (r) {
        var dk = normDk(r.dk); if (!dk || dk > t) return;
        var pr = jparse(r.prices, {}); if (!pr || typeof pr !== 'object') pr = {};
        out.push({ dk: dk, prices: pr, note: String(r.note || ''), ts: Number(r.ts) || 0, by: r.by, raw: r });
      });
      out.sort(function (a, b) { return a.dk < b.dk ? 1 : a.dk > b.dk ? -1 : 0; });
      return out;
    }
    function mkBuild(full) {
      var c = mkCfg(), items = mkItems(), days = mkDays(), t = today();
      var priced = days.filter(function (d) { return items.some(function (it) { return mkPrice(d.prices[it.id]); }); });
      var last = priced[0] || null, age = last ? U.diffDays(last.dk, t) : -1;
      var state = !last ? 'empty' : age === 0 ? 'fresh' : age <= c.staleDays ? 'old' : 'stale';
      var list = items.map(function (it) {
        var pts = [];
        for (var i = 0; i < days.length && pts.length < 8; i++) { var p = mkPrice(days[i].prices[it.id]); if (p) pts.push({ dk: days[i].dk, price: p }); }
        var cur = pts[0] || null, prev = pts[1] || null;
        var chg = cur && prev ? Math.round((cur.price - prev.price) * 1000) / 1000 : null;
        var pct = chg !== null ? Math.round(chg * 1000 / prev.price) / 10 : null;
        var o = {
          id: it.id, name: it.name, short: it.short, unit: it.unit, dec: it.dec, main: !!it.main,
          price: cur ? cur.price : null, dk: cur ? cur.dk : '', fresh: !!cur && cur.dk === t,
          prev: prev ? prev.price : null, prevDk: prev ? prev.dk : '', chg: chg, pct: pct, dir: chg === null ? '' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat'
        };
        if (full) o.series = pts.slice(0, 7).reverse();
        return o;
      });
      var res = { state: state, dk: t, lastDk: last ? last.dk : '', ageDays: age, ts: last ? last.ts : 0, note: last ? last.note : '', items: list, company: c.company };
      if (full) {
        res.disclaimer = c.disclaimer;
        res.history = priced.slice(0, c.historyDays).map(function (d) {
          var vals = {}; items.forEach(function (it) { var p = mkPrice(d.prices[it.id]); vals[it.id] = p || null; });
          return { dk: d.dk, vals: vals, note: d.note };
        });
      }
      return res;
    }
    function mkSafe() { try { return mkBuild(false); } catch (e) { onErr(e, 'market'); return null; } }
    function marketGet() { return mkBuild(true); }
    function parsePrice(raw) {
      var t = U.arabicDigitsToLatin(String(raw)).replace(/[\s ]/g, '').replace(/٫/g, '.').replace(/٬/g, ',');
      if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');     // فاصل آلاف
      else t = t.replace(/,/g, '.');                                           // فاصلة عشرية
      return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
    }
    function mkPricesOf(day, items) {
      var o = {}; if (!day) return o;
      items.forEach(function (it) { var p = mkPrice(day.prices[it.id]); if (p) o[it.id] = p; });
      return o;
    }
    /* ---- الناشرون والمعتمدون ---- */
    function isBackup(s) { return mkCfg().backup.some(function (x) { return x === s.id || x === s.phone; }); }
    function mkCanEdit(s) { return can(s, 'prices.publish'); }
    function staffName(id) { var r = store.find('Staff', function (x) { return x.id === id; }); return r ? r.name : ''; }
    function mkPublishers() {
      var c = mkCfg();
      return store.filter('Staff', function (x) { return Number(x.active) && can(x, 'prices.publish'); });
    }
    function mkApprovers(exceptId) {
      var c = mkCfg();
      return store.filter('Staff', function (x) { return Number(x.active) && can(x, 'prices.approve') && x.id !== exceptId; });
    }
    /* لا يعتمد الناشرُ طلبه بنفسه إلا بإعداد selfApprove أو لو لا يوجد معتمد آخر (حتى لا يتعطل النشر) */
    function mkCanSelfApprove(s) {
      var c = mkCfg();
      return can(s, 'prices.approve') && (c.selfApprove || mkApprovers(s.id).length === 0);
    }
    /* مدير الإدارة ينشر أسعاره مباشرة بلا اعتماد أي جهة (market.directRole) */
    function mkIsDirect(s) { return mkCanEdit(s) && s.role === mkCfg().directRole; }
    function mkCanDecide(s, pend) {
      if (!can(s, 'prices.approve')) return false;
      return s.id !== pend.by || mkCanSelfApprove(s);
    }
    function mkPendingRows() {
      var t = today(), y = U.addDays(t, -1);
      return store.filter('MarketPending', function (r) { return r.status === 'pending' && (r.dk === t || r.dk === y); }).sort(function (a, b) { return Number(b.ts) - Number(a.ts); });
    }
    function mkPendingPublic(r, s, items) {
      var pr = jparse(r.prices, {}), list = [];
      items.forEach(function (it) { var p = mkPrice(pr[it.id]); if (p) list.push({ id: it.id, short: it.short, unit: it.unit, dec: it.dec, price: p }); });
      return { id: r.id, dk: r.dk, by: r.by, byName: staffName(r.by), mine: r.by === s.id, ts: Number(r.ts), jumps: r.jumps ? String(r.jumps).split(' | ') : [], items: list, note: r.note, canDecide: mkCanDecide(s, r) };
    }
    function mkPendingFor(s) {
      return mkPendingRows().filter(function (r) { return mkCanDecide(s, r); }).length;
    }
    function s_marketGet(s) {
      var c = mkCfg(), d = mkBuild(true), days = mkDays(), items = mkItems(), t = today(), y = U.addDays(t, -1);
      function one(dk) { var day = days.filter(function (x) { return x.dk === dk; })[0] || null; return { dk: dk, prices: mkPricesOf(day, items), note: day ? day.note : '', ts: day ? day.ts : 0 }; }
      var canEdit = mkCanEdit(s), canApprove = can(s, 'prices.approve');
      d.canEdit = canEdit; d.editRole = ROLE_LABEL[c.editRole]; d.maxJumpPct = c.maxJumpPct; d.direct = mkIsDirect(s); d.directRole = ROLE_LABEL[c.directRole];
      d.approval = { mode: c.approval, role: ROLE_LABEL[c.approveRole] };
      d.edit = { today: one(t), yesterday: one(y) };
      d.pending = canEdit || canApprove ? mkPendingRows().map(function (r) { return mkPendingPublic(r, s, items); }) : [];
      d.pendingCount = d.pending.filter(function (x) { return x.canDecide; }).length;
      return d;
    }
    function mkWrite(dk, prices, note, by) {
      var existing = mkDays().filter(function (x) { return x.dk === dk; })[0] || null;
      var patch = { prices: JSON.stringify(prices), note: note, by: by, ts: now() };
      if (existing) store.update('MarketDay', existing.raw.dk, patch);
      else store.insert('MarketDay', { dk: dk, prices: patch.prices, note: note, by: by, ts: patch.ts });
      store.filter('MarketPending', function (r) { return r.status === 'pending' && r.dk === dk; }).forEach(function (r) {
        store.update('MarketPending', r.id, { status: 'replaced', decidedTs: now() });
      });
    }
    function s_marketSet(s, p) {
      var c = mkCfg();
      if (!mkCanEdit(s)) throw err('perm', 'ليس لديك صلاحية نشر الأسعار. يحدّدها مدير الإدارة من «الفريق والصلاحيات»');
      var items = mkItems(), days = mkDays(), t = today(), dk = p.day === 'yesterday' ? U.addDays(t, -1) : t;
      var vals = p.values || {}, prices = {}, n = 0, jumps = [];
      var existing = days.filter(function (x) { return x.dk === dk; })[0] || null, ex = existing ? existing.prices : {};
      items.forEach(function (it) {
        var raw = vals[it.id];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        var num = parsePrice(raw);
        if (!(num > 0) || num >= 1e7) throw err('price', 'سعر «' + it.short + '» غير صحيح. اكتب رقمًا أكبر من صفر.');
        num = Math.round(num * 1000) / 1000;
        prices[it.id] = num; n++;
        if (mkPrice(ex[it.id]) !== num) {
          var prev = 0;
          for (var i = 0; i < days.length; i++) { if (days[i].dk < dk && mkPrice(days[i].prices[it.id])) { prev = mkPrice(days[i].prices[it.id]); break; } }
          if (prev) { var pc = Math.round((num - prev) * 1000 / prev) / 10; if (Math.abs(pc) > c.maxJumpPct) jumps.push(it.short + ': ' + prev + ' ← ' + num + ' (' + (pc > 0 ? '+' : '') + pc + '%)'); }
        }
      });
      if (!n) throw err('empty', 'اكتب سعر منتج واحد على الأقل');
      var direct = mkIsDirect(s);
      var big = jumps.length > 0, needs = !direct && (c.approval === 'always' || (c.approval === 'jump' && big)), self = mkCanSelfApprove(s);
      if (big && !p.force && (direct || c.approval !== 'always')) {
        if (needs && !self) throw err('jump_ap', 'تغيّر كبير عن آخر سعر: ' + jumps.join('، ') + '. لو الأرقام صحيحة اضغط «أرسل للاعتماد»، وهيحتاج اعتماد «' + ROLE_LABEL[c.approveRole] + '» آخر قبل ما يظهر للتجار.');
        throw err('jump', 'تغيّر كبير عن آخر سعر: ' + jumps.join('، ') + '. لو الأرقام صحيحة اضغط «أكّد وانشر».');
      }
      Object.keys(ex).forEach(function (k) { if (!items.some(function (it) { return it.id === k; }) && mkPrice(ex[k])) prices[k] = ex[k]; });   // أسعار منتجات مخفية تبقى كما هي
      var note = p.note === undefined || p.note === null ? (existing ? existing.note : '') : U.cleanText(p.note, 200);
      if (needs && !self) {
        store.filter('MarketPending', function (r) { return r.status === 'pending' && r.dk === dk; }).forEach(function (r) { store.update('MarketPending', r.id, { status: 'replaced', decidedBy: s.id, decidedTs: now() }); });
        var pid = nextId('MP', 4);
        store.insert('MarketPending', { id: pid, dk: dk, prices: JSON.stringify(prices), note: note, by: s.id, ts: now(), jumps: jumps.join(' | '), status: 'pending', decidedBy: '', decidedTs: 0, reason: '' });
        log('', 'market_pending', dk, 0, { id: pid, by: s.id, j: jumps.length });
        notifyMail(mkApprovers(s.id), '[' + cfg().appName + '] أسعار «السوق النهاردة» تنتظر اعتمادك', 'اقترح ' + s.name + ' تحديث أسعار «السوق النهاردة»' + (big ? ' وفيها تغيّر كبير عن آخر سعر' : '') + '، وهي تنتظر اعتمادك قبل أن تظهر للتجار. افتح التطبيق ← تبويب «السوق» ← راجع الأسعار ثم اعتمد أو ارفض.');
        var res = s_marketGet(s); res.submitted = pid; return res;
      }
      mkWrite(dk, prices, note, s.id);
      log('', 'market', dk, 0, { n: n, by: s.id, direct: direct ? 1 : 0 });
      return s_marketGet(s);
    }
    /* اعتماد أو رفض الأسعار المعلّقة، أو سحبها من صاحبها */
    function s_marketDecide(s, p) {
      var r = store.find('MarketPending', function (x) { return x.id === String(p.id) && x.status === 'pending'; });
      if (!r) throw err('gone', 'الطلب غير موجود أو سبق البتّ فيه');
      var dec = String(p.decision);
      if (dec === 'cancel') {
        if (r.by !== s.id) throw err('perm', 'سحب الطلب لصاحبه فقط');
        store.update('MarketPending', r.id, { status: 'cancelled', decidedBy: s.id, decidedTs: now() });
        return s_marketGet(s);
      }
      if (dec !== 'approve' && dec !== 'reject') throw err('decision', 'قرار غير مفهوم');
      if (!mkCanDecide(s, r)) throw err('perm', 'ليس لديك صلاحية اعتماد الأسعار، أو أنت مقدّم الطلب نفسه');
      var t = today();
      if (r.dk !== t && r.dk !== U.addDays(t, -1)) { store.update('MarketPending', r.id, { status: 'expired', decidedBy: s.id, decidedTs: now() }); throw err('gone', 'انتهت صلاحية الطلب. اطلب من الناشر إرسال الأسعار من جديد.'); }
      var by = store.find('Staff', function (x) { return x.id === r.by; });
      if (dec === 'approve') {
        var pr = jparse(r.prices, {});
        mkWrite(r.dk, pr, r.note || '', r.by);
        store.update('MarketPending', r.id, { status: 'approved', decidedBy: s.id, decidedTs: now() });
        log('', 'market', r.dk, 0, { n: Object.keys(pr).length, by: r.by, ok: s.id });
      } else {
        store.update('MarketPending', r.id, { status: 'rejected', decidedBy: s.id, decidedTs: now(), reason: U.cleanText(p.reason, 120) });
        log('', 'market_reject', r.dk, 0, { id: r.id, by: s.id });
      }
      OPS.audit(s, dec === 'approve' ? 'market_approve' : 'market_reject', r.id, { dk: r.dk, by: r.by });
      if (by) notifyMail([by], '[' + cfg().appName + '] ' + (dec === 'approve' ? 'تم اعتماد أسعار «السوق النهاردة» ونُشرت' : 'رُفضت أسعار «السوق النهاردة» المقترحة'), (dec === 'approve' ? 'اعتمد ' + s.name + ' الأسعار التي أرسلتها، وهي الآن ظاهرة للتجار.' : 'رفض ' + s.name + ' الأسعار التي أرسلتها' + (p.reason ? ': ' + U.cleanText(p.reason, 120) : '') + '. راجعها وأرسلها من جديد.'));
      return s_marketGet(s);
    }

    /* =================== الموظفون =================== */
    function scopeTickets(s) {
      return store.filter('Tickets', function (t) {
        if (s.role === 'assistant') {
          if (t.type === 'complaint') return false;
          return !s.farmId || !t.farmId || t.farmId === s.farmId;
        }
        return true;
      });
    }
    function traderBrief(r) {
      var st = stateOf(r), rank = L.computeRank(st, cfg(), now(), today()), dk = today();
      return {
        id: r.id, code: r.code, name: r.name, plate: r.plate, company: r.company, farmId: r.farmId,
        rank: { n: rank, name: C.RANKS[rank].name }, cleanRun: st.gate.cleanRun, visitsToday: st.gate.perDay[dk] || 0,
        last: st.gate.last, status: r.status
      };
    }
    function s_find(s, p) {
      if (!can(s, 'gate')) throw err('perm', 'غير مصرح');
      var q = U.arabicDigitsToLatin(U.cleanText(p.q, 30)).toUpperCase();
      if (q.length < 2) return { list: [] };
      var qp = U.normPlate(q), digits = q.replace(/\D/g, '');
      var list = store.filter('Traders', function (r) {
        if (r.status === 'blocked' || r.status === 'deleted') return false;
        if (r.code === q) return true;
        if (qp.length >= 3 && r.plate && r.plate.indexOf(qp) >= 0) return true;
        if (digits.length >= 4 && r.phone && r.phone.slice(-digits.length) === digits) return true;
        return q.length >= 3 && r.name.toUpperCase().indexOf(q) >= 0;
      }).slice(0, 8).map(traderBrief);
      return { list: list };
    }
    function s_gate(s, p) {
      if (!can(s, 'gate')) throw err('perm', 'غير مصرح');
      var r = store.find('Traders', function (x) { return x.id === p.traderId; });
      if (!r) throw err('nf', 'التاجر غير موجود');
      var idem = p.clientId ? 'idem:' + String(p.clientId).replace(/[^A-Za-z0-9_-]/g, '').substring(0, 40) : '';
      if (idem && peek(idem)) return { trader: r.name, dup: true, pass: 0, total: 0, clean: false, violation: false, points: 0, weekBonus: 0, capped: false, rankBefore: '', rankAfter: '', ranked: false, cleanRun: 0 };
      var c = cfg(), t = now(), dk = today(), farm = U.cleanText(p.farmId, 8) || s.farmId || r.farmId || '';
      var recent = store.filter('Gate', function (g) { return g.traderId === r.id && g.farmId === farm && (t - Number(g.ts)) < 10 * 60000; });
      if (recent.length) throw err('dup', 'تم تسجيل زيارة لهذا التاجر قبل دقائق');
      var checks = {};
      C.GATE_ITEMS.forEach(function (it) { checks[it.id] = !!(p.checks && p.checks[it.id]); });
      var gs = L.gateScore(checks);
      var st = stateOf(r), before = L.computeRank(st, c, t, dk);
      var scored = st.gate.perDay[dk] || 0, pts = 0, capped = false;
      if (scored >= c.gateMaxScoredPerDay) capped = true;
      else pts = L.gatePoints(gs, c);
      st.gate.visits++;
      st.gate.perDay = (function (o) { var n = {}; n[dk] = (o[dk] || 0) + 1; return n; })(st.gate.perDay);
      st.gate.lastTs = t;
      st.gate.last = { ts: t, pass: gs.pass, clean: gs.clean, violation: gs.violation };
      if (gs.clean) { st.gate.clean++; st.gate.cleanRun++; }
      else if (gs.violation) L.applyViolation(st, t);
      else st.gate.cleanRun = 0;
      L.markActive(st, dk);
      st.pts += pts;
      var bonus = L.weekGoalBonus(st, dk, c);
      if (gs.clean) payInviteClean(r, st);
      var wait = U.clamp(U.toInt(p.waitMin, 0), 0, 600);
      var gid = nextId('G', 5);
      store.insert('Gate', { id: gid, ts: t, traderId: r.id, farmId: farm, staffId: s.id, checks: JSON.stringify(checks), pass: gs.pass, clean: gs.clean ? 1 : 0, violation: gs.violation ? 1 : 0, waitMin: wait, note: U.cleanText(p.note, 200), points: pts });
      log(r.id, 'gate', gid, pts + bonus, { pass: gs.pass, v: gs.violation ? 1 : 0 });
      if (idem) addCounter(idem, 1);
      var after = L.computeRank(st, c, t, dk);
      save(r, st);
      return { trader: r.name, pass: gs.pass, total: gs.total, clean: gs.clean, violation: gs.violation, points: pts, weekBonus: bonus, capped: capped, rankBefore: C.RANKS[before].name, rankAfter: C.RANKS[after].name, ranked: after > before, cleanRun: st.gate.cleanRun };
    }
    function ticketStaffView(tk, nm) {
      var tt = cfg().ticketTypes[tk.type] || {}, t = now();
      var lvl = L.ticketLevel(tk, t, cfg());
      var hours = Number(tk.firstReplyTs) ? (Number(tk.firstReplyTs) - Number(tk.ts)) / 3600000 : (t - Number(tk.ts)) / 3600000;
      var tr = nm[tk.traderId] || {};
      return {
        id: tk.id, type: tk.type, typeLabel: tt.label, subject: tk.subject, status: tk.status, level: lvl,
        ts: Number(tk.ts), lastTs: Number(tk.lastTs), unread: !!Number(tk.unreadStaff), farmId: tk.farmId,
        trader: tr.name || '—', plate: tr.plate || '', hours: Math.round(hours * 10) / 10,
        overdue: !Number(tk.firstReplyTs) && tt.sla && hours > tt.sla, stars: Number(tk.stars)
      };
    }
    function nameMap() {
      var m = {}; store.all('Traders').forEach(function (r) { m[r.id] = r; }); return m;
    }
    function s_inbox(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var nm = nameMap(), list = scopeTickets(s);
      var f = p && p.filter;
      if (f === 'open') list = list.filter(function (x) { return x.status === 'open'; });
      else if (f === 'done') list = list.filter(function (x) { return x.status !== 'open'; });
      var out = list.map(function (x) { return ticketStaffView(x, nm); });
      out.sort(function (a, b) {
        var oa = a.status === 'open' ? 0 : 1, ob = b.status === 'open' ? 0 : 1;
        if (oa !== ob) return oa - ob;
        if (b.level !== a.level) return b.level - a.level;
        return b.lastTs - a.lastTs;
      });
      return { tickets: out.slice(0, 80), unread: out.filter(function (x) { return x.unread; }).length };
    }
    function s_ticket(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var tk = scopeTickets(s).filter(function (x) { return x.id === p.id; })[0];
      if (!tk) throw err('nf', 'الرسالة غير موجودة أو خارج نطاقك');
      var nm = nameMap(), tr = nm[tk.traderId] || {};
      if (Number(tk.unreadStaff)) store.update('Tickets', tk.id, { unreadStaff: 0 });
      return {
        ticket: ticketStaffView(tk, nm), msgs: msgsOf(tk.id, false),
        trader: { name: tr.name, plate: tr.plate, company: tr.company, code: tr.code },
        canAccept: tk.type === 'suggestion' && !Number(tk.accepted) && can(s, 'suggest.accept')
      };
    }
    function s_reply(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var tk = scopeTickets(s).filter(function (x) { return x.id === p.id; })[0];
      if (!tk) throw err('nf', 'الرسالة غير موجودة أو خارج نطاقك');
      var text = U.cleanText(p.text, cfg().limits.bodyMax);
      if (text.length < 2) throw err('body', 'اكتب الرد');
      var t = now();
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: t, from: 'staff', staffId: s.id, text: text });
      var patch = { status: p.resolve ? 'resolved' : 'answered', lastTs: t, unreadTrader: 1, unreadStaff: 0, lastStaffId: s.id };
      if (!Number(tk.firstReplyTs)) patch.firstReplyTs = t;
      if (p.resolve) patch.resolvedTs = t;
      store.update('Tickets', tk.id, patch);
      log(tk.traderId, 'staff_reply', tk.id, 0, { by: s.id });
      return s_ticket(s, { id: tk.id });
    }
    function s_callback(s, p) {
      if (!can(s, 'inbox')) throw err('perm', 'غير مصرح');
      var tk = scopeTickets(s).filter(function (x) { return x.id === p.id; })[0];
      if (!tk) throw err('nf', 'الرسالة غير موجودة أو خارج نطاقك');
      var tr = store.find('Traders', function (r) { return r.id === tk.traderId; });
      var t = now();
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: t, from: 'staff', staffId: s.id, text: 'سيتصل بك ' + s.title + ' على رقمك المسجّل. لو الوقت مش مناسب رد علينا هنا.' });
      var patch = { lastTs: t, unreadTrader: 1, lastStaffId: s.id, status: tk.status === 'open' ? 'answered' : tk.status };
      if (!Number(tk.firstReplyTs)) patch.firstReplyTs = t;
      store.update('Tickets', tk.id, patch);
      log(tr.id, 'callback', tk.id, 0, { by: s.id });
      return { phone: tr.phone, name: tr.name };
    }
    function s_accept(s, p) {
      if (!can(s, 'suggest.accept')) throw err('perm', 'غير مصرح');
      var tk = store.find('Tickets', function (x) { return x.id === p.id; });
      if (!tk || tk.type !== 'suggestion') throw err('nf', 'اقتراح غير موجود');
      if (Number(tk.accepted)) throw err('done', 'تم قبوله قبل كده');
      var r = store.find('Traders', function (x) { return x.id === tk.traderId; }), st = stateOf(r), c = cfg();
      st.pts += c.points.suggestionAccepted; st.sugg++;
      save(r, st);
      store.update('Tickets', tk.id, { accepted: 1 });
      store.insert('TicketMsgs', { id: nextId('M', 5), ticketId: tk.id, ts: now(), from: 'staff', staffId: s.id, text: 'تم قبول اقتراحك. شكرًا لك — أضفنا ' + c.points.suggestionAccepted + ' نقطة لرصيدك.' });
      store.update('Tickets', tk.id, { unreadTrader: 1, lastTs: now() });
      log(r.id, 'suggestion_accepted', tk.id, c.points.suggestionAccepted, { by: s.id });
      return s_ticket(s, { id: tk.id });
    }
    function s_farm(s, p) {
      if (!can(s, 'farms')) throw err('perm', 'غير مصرح');
      var f = store.find('Farms', function (x) { return x.id === p.farmId; });
      if (!f) throw err('nf', 'مزرعة غير موجودة');
      if (s.role === 'assistant' && s.farmId && s.farmId !== f.id) throw err('perm', 'تحديث مزرعتك فقط');
      if (!C.FARM_STATUS[p.status] || p.status === 'unknown') throw err('status', 'حالة غير صحيحة');
      store.update('Farms', f.id, { status: p.status, note: U.cleanText(p.note, 80), ts: now(), by: s.id });
      return { farms: farmsList() };
    }
    function s_register(s, p) {
      if (!can(s, 'gate')) throw err('perm', 'غير مصرح');
      var row = doRegister(p, s.id);
      return { trader: traderBrief(row), message: 'تم التسجيل. كود التاجر: ' + row.code };
    }
    function s_rewards(s) {
      if (!can(s, 'rewards')) throw err('perm', 'غير مصرح');
      var nm = nameMap();
      var list = store.all('Rewards').filter(function (r) { return r.status === 'requested' || r.status === 'approved'; }).map(function (r) {
        var rw = C.REWARDS.filter(function (x) { return x.id === r.rewardId; })[0], tr = nm[r.traderId] || {};
        return { id: r.id, ts: Number(r.ts), trader: tr.name, plate: tr.plate, reward: rw ? rw.title : r.rewardId, status: r.status };
      }).sort(function (a, b) { return b.ts - a.ts; });
      return { list: list };
    }
    function s_rewardDecide(s, p) {
      if (!can(s, 'rewards.approve')) throw err('perm', 'اعتماد الجوائز غير متاح لصلاحياتك');
      var r = store.find('Rewards', function (x) { return x.id === p.id; });
      if (!r) throw err('nf', 'طلب غير موجود');
      if (['approved', 'delivered', 'rejected'].indexOf(p.status) < 0) throw err('status', 'حالة غير صحيحة');
      store.update('Rewards', r.id, { status: p.status, decidedBy: s.id, decidedTs: now(), note: U.cleanText(p.note, 120) });
      OPS.audit(s, 'reward_' + p.status, r.id, { traderId: r.traderId });
      return s_rewards(s);
    }
    function s_traders(s, p) {
      if (!can(s, 'traders')) throw err('perm', 'غير مصرح');
      var q = U.cleanText(p && p.q, 30).toUpperCase();
      var list = liveTraders().filter(function (r) { return !q || r.name.toUpperCase().indexOf(q) >= 0 || r.code === q || (r.plate || '').indexOf(U.normPlate(q)) >= 0; });
      return { total: list.length, list: list.slice(0, 40).map(function (r) { var b = traderBrief(r); b.pts = stateOf(r).pts; return b; }) };
    }
    function s_block(s, p) {
      if (!can(s, 'traders.block')) throw err('perm', 'غير مصرح');
      var row = editableTrader(p);
      store.update('Traders', row.id, { status: p.on ? 'blocked' : 'active' });
      OPS.audit(s, p.on ? 'trader_block' : 'trader_unblock', row.id, {});
      return { ok: true };
    }

    /* ---------- تعديل بيانات التاجر وحذفه (صلاحيتا traders.edit و traders.delete) ---------- */
    function traderFull(r) {
      return { id: r.id, code: r.code, name: r.name, phone: r.phone, plate: r.plate || '', company: r.company || '', status: r.status || 'active' };
    }
    /* «الحذف» إيقاف مع حفظ السجل: الرسائل والنقاط والأسعار السابقة مرتبطة بالحساب */
    function editableTrader(p) {
      var row = store.find('Traders', function (x) { return x.id === String(p.id || ''); });
      if (!row || row.status === 'deleted') throw err('nf', 'التاجر غير موجود');
      return row;
    }
    function s_traderGet(s, p) {
      if (!can(s, 'traders.edit')) throw err('perm', 'تعديل بيانات التجار غير متاح لصلاحياتك');
      return { trader: traderFull(editableTrader(p)) };
    }
    function s_traderSave(s, p) {
      if (!can(s, 'traders.edit')) throw err('perm', 'تعديل بيانات التجار غير متاح لصلاحياتك');
      var row = editableTrader(p);
      var name = U.cleanText(p.name, 40), phone = U.normPhone(p.phone), plate = U.normPlate(p.plate || ''), company = U.cleanText(p.company, 60);
      if (name.length < 3) throw err('name', 'اكتب اسم التاجر بالكامل (3 حروف على الأقل)');
      if (!phone) throw err('phone', 'رقم الموبايل غير صحيح (مثال: 01001234567)');
      var taken = store.find('Traders', function (x) { return x.id !== row.id && x.phone === phone; }) || store.find('Staff', function (x) { return x.phone === phone; });
      if (taken) throw err('dup', 'الرقم ده مسجّل على حساب تاجر أو موظف آخر');
      var patch = { name: name, phone: phone, plate: plate, company: company };
      var pinRaw = String(p.pin || '');
      if (pinRaw) {
        var pin = U.normPin(pinRaw);
        if (!pin) throw err('pin', 'الرمز السري من 4 إلى 6 أرقام');
        var salt = env.randHex(8), st = stateOf(row);
        st.sessAt = now();   // الجلسات القديمة تنتهي، ويدخل التاجر بالرمز الجديد
        patch.salt = salt; patch.pinHash = U.hashPin(pin, salt, env.secret()); patch.fails = 0; patch.lockUntil = 0; patch.state = JSON.stringify(st);
      }
      store.update('Traders', row.id, patch);
      log('', 'trader_edit', row.id, 0, { by: s.id, pin: !!pinRaw });
      OPS.audit(s, 'trader_edit', row.id, { pin: !!pinRaw, fields: Object.keys(patch).filter(function (k) { return ['pinHash', 'salt', 'state', 'fails', 'lockUntil'].indexOf(k) < 0; }).join(',') });
      return { ok: true, trader: traderFull(store.find('Traders', function (x) { return x.id === row.id; })) };
    }
    function s_traderDelete(s, p) {
      if (!can(s, 'traders.delete')) throw err('perm', 'حذف التجار غير متاح لصلاحياتك');
      var row = editableTrader(p);
      store.update('Traders', row.id, { status: 'deleted' });
      log('', 'trader_delete', row.id, 0, { by: s.id });
      OPS.audit(s, 'trader_delete', row.id, {});
      return { ok: true };
    }

    /* ---------- إعادة التهيئة من البداية (مدير الإدارة فقط) ---------- */
    function s_resetPreview(s) {
      needManager(s);
      var clear = {};
      RESET_CLEAR.forEach(function (t) { clear[t] = store.count(t); });
      var keep = {};
      RESET_KEEP.forEach(function (t) { keep[t] = store.count(t); });
      return {
        phrase: RESET_PHRASE, clear: clear, keep: keep,
        staffKept: 1, staffRemoved: Math.max(0, store.count('Staff') - 1),
        backupsNow: store.snapshotLabels('R').length, keepBackups: RESET_KEEP_BACKUPS,
        keeper: { name: s.name, phone: s.phone }
      };
    }
    function s_factoryReset(s, p) {
      needManager(s);
      if (String(p.phrase || '').trim() !== RESET_PHRASE) throw err('phrase', 'اكتب العبارة بالضبط: ' + RESET_PHRASE);
      checkPin(s, String(p.pin || ''), 'Staff');
      var stamp = 'R' + new Date(now()).toISOString().replace(/\D/g, '').slice(0, 12);   // R + yyyymmddhhmm (UTC)
      var names = RESET_CLEAR.concat(['Staff'], RESET_KEEP).filter(function (t) { return store.count(t) > 0; });
      store.snapshot(stamp, names);
      store.pruneSnapshots(RESET_KEEP_BACKUPS, 'R');
      RESET_CLEAR.forEach(function (t) { store.replaceTable(t, []); });
      var me = store.find('Staff', function (r) { return r.id === s.id; });
      store.replaceTable('Staff', me ? [me] : []);
      log('', 'factory_reset', stamp, 0, { by: s.id });
      OPS.audit(s, 'factory_reset', stamp, { staffKept: 1 });
      return { ok: true, backup: stamp, staffKept: 1 };
    }

    /* ---------- مؤشرات لوحة الإدارة ---------- */
    function s_stats(s) {
      if (!can(s, 'dash')) throw err('perm', 'لوحة المؤشرات غير متاحة لصلاحياتك');
      return OPS.memo('stats', 60, function () { var v = statsBuild(); v.asOf = now(); return v; });
    }
    function statsBuild() {
      var c = cfg(), t = now(), dk = today(), d7 = U.addDays(dk, -6), d30 = t - 30 * 86400000;
      var traders = liveTraders(), states = traders.map(function (r) { return { r: r, st: stateOf(r) }; });
      var total = traders.length, active2 = 0, onboard = 0, amb = [0, 0, 0, 0];
      var base = [], fol = [];
      states.forEach(function (x) {
        var n7 = x.st.days.filter(function (d) { return d >= d7; }).length;
        if (n7 >= 2) active2++;
        if (L.onboardingDone(x.st)) onboard++;
        var rk = L.computeRank(x.st, c, t, dk);
        if (rk >= 3) amb[Math.min(3, rk - 3)]++;
        if (x.st.baseline && x.st.followup) { base.push(x.st.baseline.score / x.st.baseline.total); fol.push(x.st.followup.score / x.st.followup.total); }
      });
      var gates = store.filter('Gate', function (g) { return Number(g.ts) >= d30; });
      var cleanN = gates.filter(function (g) { return Number(g.clean); }).length, violN = gates.filter(function (g) { return Number(g.violation); }).length;
      var waits = gates.map(function (g) { return Number(g.waitMin); }).filter(function (x) { return x > 0; });
      var tks = store.all('Tickets'), answered = tks.filter(function (x) { return Number(x.firstReplyTs); });
      var resp = answered.map(function (x) { return (Number(x.firstReplyTs) - Number(x.ts)) / 3600000; });
      var slaOk = answered.filter(function (x) { return L.slaMet(x, c); }).length;
      var byType = {};
      tks.forEach(function (x) { byType[x.type] = (byType[x.type] || 0) + 1; });
      var openN = tks.filter(function (x) { return x.status === 'open'; }), esc = openN.filter(function (x) { return L.ticketLevel(x, t, c) > 0; });
      var recentObs = tks.filter(function (x) { return x.type === 'obstacle' || x.type === 'suggestion'; }).sort(function (a, b) { return Number(b.ts) - Number(a.ts); }).slice(0, 6).map(function (x) { return { id: x.id, type: c.ticketTypes[x.type].label, subject: x.subject }; });
      function avg(a) { return a.length ? a.reduce(function (p, q) { return p + q; }, 0) / a.length : null; }
      var pendingRewards = store.filter('Rewards', function (r) { return r.status === 'requested'; }).length;
      return {
        traders: total, onboarded: onboard, active2: active2, activePct: total ? Math.round(active2 * 100 / total) : 0,
        gate: { visits: gates.length, cleanPct: gates.length ? Math.round(cleanN * 100 / gates.length) : null, violPer100: gates.length ? Math.round(violN * 1000 / gates.length) / 10 : null, avgWait: waits.length ? Math.round(avg(waits)) : null },
        quiz: { pairs: base.length, baseline: base.length ? Math.round(avg(base) * 100) : null, followup: fol.length ? Math.round(avg(fol) * 100) : null },
        tickets: { total: tks.length, open: openN.length, escalated: esc.length, avgHours: avg(resp) === null ? null : Math.round(avg(resp) * 10) / 10, slaPct: answered.length ? Math.round(slaOk * 100 / answered.length) : null, byType: Object.keys(byType).map(function (k) { return { type: c.ticketTypes[k] ? c.ticketTypes[k].label : k, n: byType[k] }; }), recent: recentObs },
        ambassadors: { r3: amb[0], r4: amb[1], r5: amb[2], r6: amb[3] },
        pendingRewards: pendingRewards, collective: collective()
      };
    }

    /* =================== محطات التقدير: أحدث محطة لم يُحتفَ بها بعد =================== */
    var GW_STEPS = [1, 4, 12, 26, 52], CLEAN_STEPS = [5, 10, 25, 50], SINCE_STEPS = [1, 3, 6, 12, 24];
    function periodTxt(m) { return m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m < 11 ? m + ' شهور' : m === 12 ? 'سنة' : m === 24 ? 'سنتين' : m + ' شهر'; }
    function topStep(steps, v) { var r = 0; steps.forEach(function (x) { if (v >= x) r = x; }); return r; }
    function milestoneOf(row, st, pr) {
      var m = cfg().milestones || {}, d = C.CONFIG.milestones;
      if (m.on === false || m.on === 'false' || m.on === 0) return null;
      var seen = st.ms || {};
      function T(k) { var v = m[k]; return U.cleanText(v == null || v === '' ? d[k] : v, 240); }
      var cands = [], n;
      if (pr.rank.n >= 2) cands.push({ id: 'rank:' + pr.rank.n, kind: 'rank', n: pr.rank.n, title: 'رتبة جديدة', text: T('rank').replace(/\{rank\}/g, pr.rank.name), what: 'بلوغ رتبة «' + pr.rank.name + '»' });
      n = topStep(GW_STEPS, pr.week.goalWeeks || 0);
      if (n) cands.push({ id: 'gw:' + n, kind: 'gw', n: n, title: n === 1 ? 'أول هدف أسبوعي' : 'هدف الأسبوع', text: T(n === 1 ? 'gw1' : 'gw').replace(/\{n\}/g, n), what: n === 1 ? 'تحقيق أول هدف أسبوعي' : 'تحقيق هدف الأسبوع ' + n + ' مرة' });
      n = topStep(CLEAN_STEPS, pr.gate.clean || 0);
      if (n) cands.push({ id: 'clean:' + n, kind: 'clean', n: n, title: 'زيارات نظيفة', text: T('clean').replace(/\{n\}/g, n), what: n + ' زيارات نظيفة عند البوابة' });
      n = topStep(SINCE_STEPS, U.monthsBetween(Number(row.created) || now(), now()));
      if (n) cands.push({ id: 'since:' + n, kind: 'since', n: n, title: 'شريك معانا', text: T('since').replace(/\{period\}/g, periodTxt(n)), what: 'الشراكة مع الشركة لمدة ' + periodTxt(n) });
      for (var i = 0; i < cands.length; i++) if (!seen[cands[i].id]) return cands[i];
      return null;
    }
    function ackMilestone(row, p) {
      var id = String(p.id || '');
      if (!/^(rank|gw|clean|since):\d{1,3}$/.test(id)) throw err('ms', 'محطة غير معروفة');
      var st = stateOf(row); if (!st.ms) st.ms = {};
      if (!st.ms[id]) {
        st.ms[id] = now(); log(row.id, 'milestone', id, 0, null);
        var keys = Object.keys(st.ms); if (keys.length > 60) { keys.sort(function (a, b) { return st.ms[a] - st.ms[b]; }); for (var i = 0; i < keys.length - 60; i++) delete st.ms[keys[i]]; }
        save(row, st);
      }
      return { ok: 1 };
    }
    /* إعدادات الميزات الظاهرة للواجهة: بطاقة الشاشة الرئيسية، الشهادة، الصوت */
    function featCfg() {
      var c = cfg(), h = c.homescreen || {}, ce = c.certificate || {}, v = c.voice || {}, dc = C.CONFIG.certificate;
      function on(x) { return !(x === false || x === 'false' || x === 0); }
      function t(k, n) { var x = ce[k]; return U.cleanText(x == null || x === '' ? dc[k] : x, n); }
      return {
        homescreen: { on: on(h.on), snoozeDays: Math.max(1, Math.min(90, Math.round(Number(h.snoozeDays) || C.CONFIG.homescreen.snoozeDays))) },
        voice: { on: on(v.on), respell: U.cleanText(v.respell == null ? '' : String(v.respell), 4000), baseUrl: /^https:\/\//.test(String(v.baseUrl || '')) ? String(v.baseUrl).slice(0, 300) : '' },
        cert: { on: on(ce.on), title: t('title', 40), issuer: t('issuer', 80), body: t('body', 160), signer: U.cleanText(ce.signer == null ? '' : ce.signer, 60), signerTitle: U.cleanText(ce.signerTitle == null ? '' : ce.signerTitle, 60) }
      };
    }

    /* =================== التقرير الأسبوعي للإدارة =================== */
    function repCfg() {
      var r = cfg().report || {}, d = C.CONFIG.report;
      function n(v, def, lo, hi) { v = Number(v); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); }
      return {
        on: !(r.on === false || r.on === 'false' || r.on === 0),
        day: Math.round(n(r.day, d.day, 0, 6)), hour: Math.round(n(r.hour, d.hour, 0, 23)),
        minRole: STAFF_ROLES[r.minRole] ? r.minRole : d.minRole,
        extra: String(r.extraEmails == null ? '' : r.extraEmails).split(/[,،;\s]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); })
      };
    }
    function dowOf(dk) { var a = dk.split('-'); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay(); }
    function repMetrics(f, tt, traders, states, ev) {
      var c = cfg();
      function inR(ts) { var dk = U.dateKey(Number(ts)); return dk >= f && dk <= tt; }
      function evSet(type) { var o = {}, k = 0; ev.forEach(function (e) { if (e.type === type && e.traderId && inR(e.ts)) { o[e.traderId] = 1; k++; } }); return { u: Object.keys(o).length, n: k }; }
      function evN(type) { var k = 0; ev.forEach(function (e) { if (e.type === type && inR(e.ts)) k++; }); return k; }
      var goal = Number(c.weekGoalDays) || 4, met = 0;
      states.forEach(function (x) { if (x.st.days.filter(function (d) { return d >= f && d <= tt; }).length >= goal) met++; });
      var gates = store.filter('Gate', function (g) { return inR(g.ts); });
      var clean = gates.filter(function (g) { return Number(g.clean); }).length, viol = gates.filter(function (g) { return Number(g.violation); }).length;
      var tks = store.filter('Tickets', function (x) { return inR(x.ts); }), ans = tks.filter(function (x) { return Number(x.firstReplyTs); });
      var hrs = ans.map(function (x) { return (Number(x.firstReplyTs) - Number(x.ts)) / 3600000; });
      var items = mkItems(), mdays = mkDays().filter(function (d) { return d.dk >= f && d.dk <= tt && items.some(function (it) { return mkPrice(d.prices[it.id]); }); });
      var hh = mdays.filter(function (d) { return d.ts; }).map(function (d) { var p = U.tzParts(d.ts); return p.h + p.mi / 60; });
      var op = evSet('open'), pv = evSet('pview'), rd = evSet('round');
      return {
        newTraders: traders.filter(function (r) { return inR(r.created); }).length,
        openU: op.u, openN: op.n, pviewU: pv.u, goalMet: met, rounds: rd.n, milestones: evN('milestone'),
        gate: gates.length, gateClean: gates.length ? Math.round(clean * 100 / gates.length) : null, gateViol: viol,
        tickets: tks.length, replyH: hrs.length ? Math.round(hrs.reduce(function (a, b) { return a + b; }, 0) / hrs.length * 10) / 10 : null,
        slaPct: ans.length ? Math.round(ans.filter(function (x) { return L.slaMet(x, c); }).length * 100 / ans.length) : null,
        mkDays: mdays.length, mkHour: hh.length ? Math.round(hh.reduce(function (a, b) { return a + b; }, 0) / hh.length * 10) / 10 : null,
        mkPend: evN('market_pending'), mkRej: evN('market_reject'),
        rewards: store.filter('Rewards', function (r) { return inR(r.ts); }).length,
        fl: OPS.fleetWindow(f, tt)
      };
    }
    function repBuild() {
      var c = cfg(), t = now(), td = today(), to = U.addDays(td, -1), from = U.addDays(td, -7), pto = U.addDays(td, -8), pfrom = U.addDays(td, -14);
      var traders = liveTraders().filter(function (r) { return r.status !== 'blocked'; });
      var states = traders.map(function (r) { return { r: r, st: stateOf(r) }; }), ev = store.all('Events');
      var cur = repMetrics(from, to, traders, states, ev), prv = repMetrics(pfrom, pto, traders, states, ev);
      var amb = 0; states.forEach(function (x) { if (L.computeRank(x.st, c, t, td) >= 3) amb++; });
      var openTk = store.filter('Tickets', function (x) { return x.status === 'open'; });
      var esc2 = openTk.filter(function (x) { return L.ticketLevel(x, t, c) > 0; }).length;
      var R = { from: from, to: to, total: traders.length, amb: amb, cur: cur, prv: prv, openTickets: openTk.length, escalated: esc2, noOpenData: !cur.openN && !prv.openN };
      /* ملاحظات تلقائية للمدير */
      var ins = [];
      function add(tone, tx) { if (ins.length < 5) ins.push({ tone: tone, text: tx }); }
      if (cur.mkDays < 5) add('warn', 'أسعار «السوق النهاردة» نُشرت في ' + cur.mkDays + ' أيام فقط من 7. التجار يفتحون التطبيق للسعر، فانتظام النشر يحافظ على عودتهم.');
      else add('good', 'أسعار «السوق النهاردة» نُشرت في ' + cur.mkDays + ' أيام من 7' + (cur.mkHour !== null ? ' (متوسط وقت النشر ' + hourTxt(cur.mkHour) + ').' : '.'));
      if (cur.gate && prv.gate && cur.gateClean !== null && prv.gateClean !== null && cur.gateClean - prv.gateClean <= -10) add('warn', 'نسبة الزيارات النظيفة عند البوابة انخفضت من ' + prv.gateClean + '% إلى ' + cur.gateClean + '%. تستحق مراجعة مع معاوني البوابات.');
      else if (cur.gate && prv.gate && cur.gateClean !== null && prv.gateClean !== null && cur.gateClean - prv.gateClean >= 10) add('good', 'نسبة الزيارات النظيفة عند البوابة ارتفعت من ' + prv.gateClean + '% إلى ' + cur.gateClean + '%.');
      if (cur.gateViol > 0) add('warn', 'سُجّلت ' + cur.gateViol + ' مخالفة عند البوابات هذا الأسبوع.');
      if (esc2 > 0) add('warn', esc2 + ' رسالة من التجار متأخرة ولم يُرد عليها بعد (مصعّدة).');
      if (cur.slaPct !== null && cur.slaPct < 80) add('warn', 'الالتزام بمهلة الرد على التجار ' + cur.slaPct + '% (المستهدف 80% أو أكثر).');
      if (!R.noOpenData && prv.openU && cur.openU > prv.openU) add('good', 'عدد التجار الذين فتحوا التطبيق ارتفع من ' + prv.openU + ' إلى ' + cur.openU + '.');
      if (!R.noOpenData && prv.openU && cur.openU < prv.openU) add('warn', 'عدد التجار الذين فتحوا التطبيق انخفض من ' + prv.openU + ' إلى ' + cur.openU + '.');
      if (cur.fl.sos) add('warn', 'سُجّلت ' + cur.fl.sos + ' تنبيهات طوارئ للأسطول هذا الأسبوع. راجعها من «الأسطول» وتأكد من غلقها.');
      if (cur.fl.off > prv.fl.off && cur.fl.off - prv.fl.off >= 3) add('warn', 'تنبيهات الخروج عن الخط زادت من ' + prv.fl.off + ' إلى ' + cur.fl.off + ' هذا الأسبوع. راجع الخطوط المتكررة في تحليلات الأسطول.');
      if (cur.mkPend) add('good', 'مرّت ' + cur.mkPend + ' طلبات اعتماد ثانٍ على أسعار بها تغيّر كبير' + (cur.mkRej ? '، رُفض منها ' + cur.mkRej : '') + '.');
      R.insights = ins;
      return R;
    }
    function hourTxt(h) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh++; mm = 0; } return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }
    function xe(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function dkAr(dk) { var a = dk.split('-'); var M = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']; return Number(a[2]) + ' ' + M[Number(a[1])]; }
    /* صفوف التقرير: [القسم، العنوان، الحالي، السابق، وحدة، الأفضل: up|down|none] */
    function repRows(R) {
      var a = R.cur, b = R.prv, nod = R.noOpenData;
      return [
        ['التجار', 'تجار مسجّلون (إجمالي)', R.total, null, '', 'none'],
        ['التجار', 'تجار جدد هذا الأسبوع', a.newTraders, b.newTraders, '', 'up'],
        ['التجار', 'تجار فتحوا التطبيق (مختلفون)', nod ? null : a.openU, nod ? null : b.openU, '', 'up'],
        ['التجار', 'متوسط الفتح اليومي', nod ? null : Math.round(a.openN / 7 * 10) / 10, nod ? null : Math.round(b.openN / 7 * 10) / 10, '', 'up'],
        ['التجار', 'شاهدوا أسعار اليوم (مختلفون)', nod ? null : a.pviewU, nod ? null : b.pviewU, '', 'up'],
        ['التجار', 'حققوا هدف الأسبوع', a.goalMet, b.goalMet, '', 'up'],
        ['التجار', 'جولات اليوم المكتملة', a.rounds, b.rounds, '', 'up'],
        ['التجار', 'تجار بلغوا رتبة سفير فأعلى (إجمالي)', R.amb, null, '', 'none'],
        ['التجار', 'محطات احتُفي بها', a.milestones, b.milestones, '', 'up'],
        ['البوابة', 'زيارات مسجّلة', a.gate, b.gate, '', 'none'],
        ['البوابة', 'نسبة الزيارات النظيفة', a.gateClean, b.gateClean, '%', 'up'],
        ['البوابة', 'مخالفات موثّقة', a.gateViol, b.gateViol, '', 'down'],
        ['الرسائل', 'رسائل جديدة من التجار', a.tickets, b.tickets, '', 'none'],
        ['الرسائل', 'متوسط زمن أول رد', a.replyH, b.replyH, ' س', 'down'],
        ['الرسائل', 'الالتزام بمهلة الرد', a.slaPct, b.slaPct, '%', 'up'],
        ['الرسائل', 'مفتوحة الآن', R.openTickets, null, '', 'none'],
        ['الرسائل', 'مصعّدة ولم يُرد عليها', R.escalated, null, '', 'down'],
        ['السوق', 'أيام نشر الأسعار (من 7)', a.mkDays, b.mkDays, '', 'up'],
        ['السوق', 'طلبات اعتماد ثانٍ (قفزات كبيرة)', a.mkPend, b.mkPend, '', 'none'],
        ['الجوائز', 'طلبات جوائز جديدة', a.rewards, b.rewards, '', 'none'],
        ['الأسطول', 'رحلات بدأت', a.fl.trips, b.fl.trips, '', 'up'],
        ['الأسطول', 'متوسط زمن الرحلة', a.fl.avgMin, b.fl.avgMin, ' د', 'none'],
        ['الأسطول', 'تنبيهات خروج عن الخط', a.fl.off, b.fl.off, '', 'down'],
        ['الأسطول', 'تنبيهات طوارئ', a.fl.sos, b.fl.sos, '', 'down']
      ];
    }
    function fmtV(v, u) { return v === null || v === undefined ? '—' : v + u; }
    function repText(R) {
      var out = ['التقرير الأسبوعي — شريك الدفاع', 'من ' + dkAr(R.from) + ' إلى ' + dkAr(R.to), ''];
      var sec = '';
      repRows(R).forEach(function (r) {
        if (r[0] !== sec) { sec = r[0]; out.push('[' + sec + ']'); }
        out.push('- ' + r[1] + ': ' + fmtV(r[2], r[4]) + (r[3] !== null && r[3] !== undefined ? '  (الأسبوع السابق: ' + fmtV(r[3], r[4]) + ')' : ''));
      });
      if (R.insights.length) { out.push('', 'ملاحظات:'); R.insights.forEach(function (i) { out.push('- ' + i.text); }); }
      if (R.noOpenData) out.push('', 'ملاحظة: قياس فتح التطبيق وأسعار اليوم يبدأ من أول فتح بعد ترقية الإصدار 1.3.');
      out.push('', 'هذا التقرير مجمّع ولا يتضمن أسماء تجار ولا نصوص رسائل.');
      return out.join('\n');
    }
    function repHtml(R) {
      var C1 = '#EA2329', rows = repRows(R), sec = '', body = '';
      rows.forEach(function (r) {
        if (r[0] !== sec) { sec = r[0]; body += '<tr><td colspan="4" style="background:#242424;color:#fff;font-weight:bold;padding:8px 12px;font-size:14px">' + xe(sec) + '</td></tr>'; }
        var d = '', col = '#6D6E71';
        if (r[2] !== null && r[3] !== null && r[3] !== undefined && r[2] !== r[3]) {
          var up = r[2] > r[3], good = r[5] === 'none' ? null : (r[5] === 'up' ? up : !up);
          col = good === null ? '#6D6E71' : good ? '#1E8E4E' : '#C0392B';
          d = '<span style="color:' + col + ';font-weight:bold">' + (up ? '▲' : '▼') + ' ' + Math.abs(Math.round((r[2] - r[3]) * 10) / 10) + r[4] + '</span>';
        } else if (r[3] !== null && r[3] !== undefined) d = '<span style="color:#6D6E71">—</span>';
        body += '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px">' + xe(r[1]) + '</td><td style="padding:8px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;font-size:15px">' + xe(fmtV(r[2], r[4])) + '</td><td style="padding:8px 8px;border-bottom:1px solid #eee;text-align:center;color:#6D6E71;font-size:13px">' + (r[3] === null || r[3] === undefined ? '' : xe(fmtV(r[3], r[4]))) + '</td><td style="padding:8px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px">' + d + '</td></tr>';
      });
      var ins = R.insights.map(function (i) { return '<div style="padding:8px 12px;margin:6px 0;border-radius:8px;background:' + (i.tone === 'warn' ? '#FDF1D8' : '#E5F5EC') + ';font-size:14px;line-height:1.7">' + (i.tone === 'warn' ? '⚠ ' : '✓ ') + xe(i.text) + '</div>'; }).join('');
      return '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:640px;margin:auto;color:#242424;text-align:right">' +
        '<div style="background:' + C1 + ';color:#fff;padding:18px 20px;border-radius:12px 12px 0 0"><div style="font-size:13px;opacity:.9">كايرو ثري ايه · إدارة الأمن الحيوي</div><div style="font-size:21px;font-weight:bold;margin-top:2px">التقرير الأسبوعي — شريك الدفاع</div><div style="font-size:13px;margin-top:4px">من ' + xe(dkAr(R.from)) + ' إلى ' + xe(dkAr(R.to)) + '</div></div>' +
        '<div style="border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:14px 12px">' +
        (ins ? '<div style="margin-bottom:10px"><div style="font-weight:bold;font-size:15px;margin:2px 4px 4px">أبرز ما يستحق الانتباه</div>' + ins + '</div>' : '') +
        '<table dir="rtl" style="width:100%;border-collapse:collapse;margin-top:6px"><tr style="background:#f4f4f5;font-size:12px;color:#6D6E71"><td style="padding:6px 12px">المؤشر</td><td style="text-align:center">هذا الأسبوع</td><td style="text-align:center">السابق</td><td style="text-align:center">التغيّر</td></tr>' + body + '</table>' +
        (R.noOpenData ? '<div style="font-size:12px;color:#6D6E71;margin-top:10px">قياس فتح التطبيق ومشاهدة أسعار اليوم يبدأ من أول فتح بعد ترقية الإصدار 1.3، لذلك تظهر «—» في الأسبوع الأول.</div>' : '') +
        '<div style="font-size:12px;color:#6D6E71;margin-top:12px">تقرير مجمّع لا يتضمن أسماء تجار ولا نصوص رسائلهم. تُضبط الأيام والمستلمون من ورقة Config (report.*).</div></div></div>';
    }
    function repSend(emails, R) {
      if (!emails.length) return 0;
      var subject = '[' + cfg().appName + '] التقرير الأسبوعي — ' + dkAr(R.from) + ' إلى ' + dkAr(R.to), ok = 0;
      try { ok = env.notify(emails, subject, repText(R), repHtml(R)) ? 1 : 0; } catch (e) { ok = 0; }
      store.insert('Notifications', { ts: now(), to: 'report:' + emails.length, channel: 'email', subject: subject, ok: ok });
      return ok;
    }
    function repRecipients() {
      var c = repCfg(), em = [];
      store.filter('Staff', function (x) { return Number(x.active) && can(x, 'report') && x.email; }).forEach(function (x) { if (em.indexOf(x.email) < 0) em.push(x.email); });
      c.extra.forEach(function (x) { if (em.indexOf(x) < 0) em.push(x); });
      return em;
    }
    /* من المؤقت: مرة واحدة يوم التقرير بعد الساعة المحددة */
    function reportTick() {
      var c = repCfg(), dk = today();
      if (!c.on || dowOf(dk) !== c.day || U.tzParts(now()).h < c.hour || peek('rep:' + dk)) return 0;
      addCounter('rep:' + dk, 1);
      var ok = repSend(repRecipients(), repBuild());
      log('', 'report', dk, 0, { ok: ok });
      return ok ? 1 : 0;
    }
    function s_report(s, p) {
      if (!can(s, 'report')) throw err('perm', 'التقرير الأسبوعي غير متاح لصلاحياتك');
      var R = repBuild(), out = { html: repHtml(R), text: repText(R), from: R.from, to: R.to, auto: repCfg(), recipients: repRecipients().length };
      if (p && p.send) {
        if (!s.email) throw err('email', 'لا يوجد بريد مسجّل لحسابك في ورقة Staff');
        out.sent = repSend([s.email], R) ? 1 : 0;
      }
      return out;
    }

    /* ---------- تصعيد دوري (يُستدعى بمؤقت كل 15 دقيقة) ---------- */
    function tick() {
      var c = cfg(), t = now(), n = 0;
      store.filter('Tickets', function (x) { return x.status === 'open' && !Number(x.firstReplyTs); }).forEach(function (tk) {
        var lvl = L.ticketLevel(tk, t, c);
        if (lvl > Number(tk.level)) {
          store.update('Tickets', tk.id, { level: lvl });
          var roles = lvl === 1 ? ['supervisor'] : ['manager', 'admin'];
          var why = lvl === 1 ? 'رسالة متأخرة تحتاج رد' : 'رسالة متأخرة جدًا (تصعيد للمدير)';
          notifyStaffList(roleStaff(roles, tk.farmId), tk, why);
          log('', 'escalate', tk.id, 0, { lvl: lvl });
          n++;
        }
      });
      var mr = marketRemind();
      var rp = 0; try { rp = reportTick(); } catch (e) { onErr(e, 'report'); }
      var ox = {}; try { ox = OPS.tick(today(), U.tzParts(t).h); } catch (e2) { onErr(e2, 'ops'); }
      return { escalated: n, marketRemind: mr, report: rp, ops: ox };
    }
    /* تذكيرات السوق: (1) أول تذكير للناشرين والبدلاء بعد ساعة التذكير، (2) تصعيد للمديرين بعد ساعة التصعيد،
       (3) تذكير المعتمدين بطلب معلّق مرّت عليه مدة. كل واحد مرة واحدة فقط. تُرجع عدد الرسائل المرسلة */
    function marketRemind() {
      var c = mkCfg(), t = now(), dk = today(), h = U.tzParts(t).h, sent = 0;
      if (!c.remind) return 0;
      var items = mkItems(), day = mkDays().filter(function (x) { return x.dk === dk; })[0];
      var published = !!(day && items.some(function (it) { return mkPrice(day.prices[it.id]); }));
      var pends = mkPendingRows();
      pends.forEach(function (r) {
        if (t - Number(r.ts) < c.approveRemindMin * 60000 || peek('mkp:' + r.id)) return;
        addCounter('mkp:' + r.id, 1);
        notifyMail(mkApprovers(r.by), '[' + cfg().appName + '] أسعار «السوق النهاردة» ما زالت تنتظر الاعتماد', 'اقترح ' + staffName(r.by) + ' أسعارًا جديدة ولم يُبتّ فيها بعد، والتجار يرون السعر السابق حتى تُعتمد. افتح التطبيق ← «السوق» ← اعتمد أو ارفض.');
        log('', 'market_remind', r.id, 0, { k: 'pending' });
        sent++;
      });
      if (published) return sent;
      var hasPend = pends.some(function (r) { return r.dk === dk; });
      if (h >= c.remindHour && !peek('mkt:' + dk)) {
        addCounter('mkt:' + dk, 1);
        if (hasPend) notifyMail(mkApprovers(''), '[' + cfg().appName + '] أسعار اليوم مقترحة وتنتظر الاعتماد', 'أُرسلت أسعار «السوق النهاردة» لليوم ولم تُعتمد بعد، فلا يراها التجار. افتح التطبيق ← «السوق» ← اعتمد.');
        else notifyMail(mkPublishers(), '[' + cfg().appName + '] لم تُنشر أسعار «السوق النهاردة» حتى الآن', 'لم يتم نشر أسعار منتجات الشركة لليوم بعد. افتح التطبيق ← تبويب «السوق» ← اكتب الأسعار واضغط «انشر». التجار بيشوفوها أول ما يفتحوا التطبيق.');
        log('', 'market_remind', dk, 0, null);
        sent++;
      }
      if (c.escalate && h >= Math.max(c.escalateHour, c.remindHour + 1) && !peek('mkt2:' + dk)) {
        addCounter('mkt2:' + dk, 1);
        var boss = store.filter('Staff', function (x) { return Number(x.active) && (STAFF_ROLES[x.role] >= STAFF_ROLES.manager || mkCfg().backup.some(function (b) { return b === x.id || b === x.phone; })); });
        notifyMail(boss, '[' + cfg().appName + '] تصعيد: أسعار «السوق النهاردة» لم تُنشر حتى الآن', 'مضت الساعة ' + c.escalateHour + ' ولم تظهر أسعار اليوم للتجار' + (hasPend ? ' (توجد أسعار مقترحة لم تُعتمد)' : '') + '. افتح التطبيق ← «السوق» لنشرها أو اعتمادها، أو كلّف الناشر البديل.');
        log('', 'market_escalate', dk, 0, null);
        sent++;
      }
      return sent;
    }

    /* =================== الصلاحيات وفريق العمل =================== */
    /* عمود perms في Staff: فارغ = صلاحيات دور الموظف الافتراضية (تتبع إعدادات الدور)، و«c:» + المفاتيح = مخصّصة (وتبقى «c:» وحدها لو لم تُمنح شيئًا) */
    function defaultPerms(role) {
      var r = STAFF_ROLES[role] || 0, c = mkCfg(), rep = repCfg(), out = [];
      PERMS.forEach(function (p) {
        var min = PERM_MIN[p.key];
        if (p.key === 'prices.publish') min = STAFF_ROLES[c.editRole] || 2;
        if (p.key === 'prices.approve') min = STAFF_ROLES[c.approveRole] || 2;
        if (p.key === 'report') min = STAFF_ROLES[rep.minRole] || 3;
        if (r >= min) out.push(p.key);
      });
      return out;
    }
    function permsOf(s) {
      var raw = String(s.perms || ''), out;
      if (raw.indexOf('c:') === 0) out = raw.substring(2).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return PERM_KEYS.indexOf(x) >= 0; });
      else out = defaultPerms(s.role);
      if (isBackup(s) && out.indexOf('prices.publish') < 0) out.push('prices.publish');   // الناشر البديل ينشر مهما كان دوره (market.backup)
      /* مدير الإدارة يحتفظ دائمًا بصلاحيات إدارة التجار والأسطول مهما كانت صلاحيات الفريق المحفوظة قبل إضافتها */
      if (s.role === 'manager') MANAGER_ALWAYS.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
      return out;
    }
    function can(s, key) { return permsOf(s).indexOf(key) >= 0; }

    var TEAM_ROLES = ['assistant', 'supervisor', 'admin'];   // مدير الإدارة لا يُنشأ حساب مدير آخر من الشاشة
    function needManager(s) { if (s.role !== 'manager') throw err('perm', 'إدارة الفريق والصلاحيات لمدير الإدارة فقط'); }
    function teamRow(r, s) {
      return {
        id: r.id, name: r.name, title: r.title, role: r.role, roleLabel: ROLE_LABEL[r.role] || r.role, phone: r.phone, email: r.email || '',
        farmId: r.farmId || '', active: Number(r.active) ? 1 : 0, custom: String(r.perms || '').indexOf('c:') === 0, perms: permsOf(r),
        locked: r.id === s.id || r.role === 'manager'
      };
    }
    function teamList(s) {
      var defaults = {};
      TEAM_ROLES.forEach(function (ro) { defaults[ro] = defaultPerms(ro); });
      var list = store.all('Staff').map(function (r) { return teamRow(r, s); });
      list.sort(function (a, b) { return (b.active - a.active) || ((STAFF_ROLES[b.role] || 0) - (STAFF_ROLES[a.role] || 0)) || (a.name < b.name ? -1 : 1); });
      return {
        me: s.id, list: list, catalog: PERMS, defaults: defaults,
        roles: TEAM_ROLES.map(function (ro) { return { id: ro, label: ROLE_LABEL[ro] }; }),
        farms: farmsList().map(function (f) { return { id: f.id, name: f.name }; })
      };
    }
    /* رقم موظف جديد لا يتكرر مع أي رقم موجود (العدّاد لا يعرف الأرقام التي أُدخلت يدويًا) */
    function newStaffId() {
      var id;
      do { id = nextId('S', 2); } while (store.find('Staff', function (x) { return x.id === id; }));
      return id;
    }
    function s_teamSave(s, p) {
      needManager(s);
      var id = String(p.id || ''), row = null;
      if (id) {
        row = store.find('Staff', function (x) { return x.id === id; });
        if (!row) throw err('nf', 'الحساب غير موجود');
        if (row.id === s.id) throw err('self', 'حسابك لا يُعدَّل من هذه الشاشة');
        if (row.role === 'manager') throw err('perm', 'لا يُعدَّل حساب مدير الإدارة من هنا');
      }
      var name = U.cleanText(p.name, 40), title = U.cleanText(p.title, 40);
      if (name.length < 2) throw err('name', 'اكتب اسم الموظف');
      if (title.length < 2) throw err('title', 'اكتب المسمى الوظيفي (يظهر للتاجر)');
      var phone = U.normPhone(String(p.phone || ''));
      if (!phone) throw err('phone', 'رقم الموبايل غير صحيح: 11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015');
      var other = store.find('Staff', function (x) { return x.phone === phone && x.id !== id; });
      if (other) throw err('dup', Number(other.active) ? 'الرقم ده مسجّل على حساب موظف آخر' : 'الرقم ده مسجّل على حساب موقوف (' + other.name + '). افتحه من القائمة لإعادة تفعيله');
      var email = String(p.email || '').trim().toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('email', 'البريد غير صحيح');
      var role = String(p.role || '');
      if (TEAM_ROLES.indexOf(role) < 0) throw err('role', 'الدور غير صحيح: معاون أو مشرف أو مسؤول نظام');
      var farmId = '';
      if (role === 'assistant') {
        farmId = String(p.farmId || '');
        if (!farmId || !store.find('Farms', function (f) { return String(f.id) === farmId; })) throw err('farm', 'اختر المزرعة التي يعمل بها المعاون');
      }
      var given = Array.isArray(p.perms) ? p.perms : [];
      var picked = PERM_KEYS.filter(function (k) { return given.indexOf(k) >= 0; });
      var defs = defaultPerms(role);
      var sameAsRole = picked.length === defs.length && picked.every(function (k) { return defs.indexOf(k) >= 0; });
      var pin = U.normPin(String(p.pin || ''));
      if (!row && !pin) throw err('pin', 'اكتب رمزًا سريًا من 4 إلى 6 أرقام للموظف');
      if (p.pin && !pin) throw err('pin', 'الرمز السري من 4 إلى 6 أرقام');
      var patch = {
        name: name, title: title, phone: phone, email: email, role: role, farmId: farmId,
        perms: sameAsRole ? '' : 'c:' + picked.join(','), active: row ? (Number(p.active) ? 1 : 0) : 1
      };
      if (pin) { var salt = env.randHex(8); patch.salt = salt; patch.pinHash = U.hashPin(pin, salt, env.secret()); patch.fails = 0; patch.lockUntil = 0; }
      var target;
      if (row) { store.update('Staff', row.id, patch); target = row.id; }
      else { target = newStaffId(); store.insert('Staff', Object.assign({ id: target, fails: 0, lockUntil: 0 }, patch)); }
      log('', 'team_save', target, 0, { by: s.id, role: role, custom: !sameAsRole });
      OPS.audit(s, 'team_save', target, { role: role, custom: !sameAsRole, pin: !!pin });
      return teamList(s);
    }
    /* «الحذف» إيقاف دائم: يُقفل الدخول فورًا وتختفي من القوائم، ويبقى السجل لأن أرقامها مرتبطة برسائل وأسعار سابقة */
    function s_teamDelete(s, p) {
      needManager(s);
      var id = String(p.id || ''), row = store.find('Staff', function (x) { return x.id === id; });
      if (!row) throw err('nf', 'الحساب غير موجود');
      if (row.id === s.id) throw err('self', 'لا يمكنك حذف حسابك');
      if (row.role === 'manager') throw err('perm', 'لا يُحذف حساب مدير الإدارة من هنا');
      store.update('Staff', row.id, { active: 0, lockUntil: 0, fails: 0 });
      log('', 'team_delete', row.id, 0, { by: s.id });
      OPS.audit(s, 'team_delete', row.id, {});
      return teamList(s);
    }

    /* =================== التوجيه =================== */
    /* خطأ من الواجهة (بلا اسم ولا رمز): نص مقصوص يُسجَّل في LAST_ERR ليعرف المسؤول أين تعثّر التطبيق */
    function clientError(token, p) {
      var msg = String((p && p.msg) || '').substring(0, 300), where = String((p && p.where) || '').substring(0, 60);
      onErr(new Error('client[' + where + ']: ' + msg), 'client');
      return { ok: true };
    }
    var PUBLIC = { register: register, login: login, staffLogin: staffLogin, clientError: clientError };
    var TRADER = {
      me: function (r) { return profile(r, stateOf(r)); },
      home: home, content: content, videoStart: videoStart, videoDone: videoDone, cardRead: cardRead,
      roundGet: roundGet, roundSubmit: roundSubmit, gameGet: gameGet, gameSubmit: gameSubmit,
      charterSign: charterSign, testGet: testGet, testSubmit: testSubmit, mizanSave: mizanSave, mizanGet: mizanGet,
      ticketCreate: ticketCreate, ticketList: ticketList, ticketGet: ticketGet, ticketReply: ticketReply, ticketRate: ticketRate,
      rewardsList: rewardsList, rewardClaim: rewardClaim, honorSet: honorSet, visits: visits, inviteInfo: inviteInfo,
      marketGet: marketGet, ackMilestone: ackMilestone
    };
    var STAFF = {
      sMe: function (s) { return { staff: staffPublic(s), farms: farmsList(), gateItems: C.GATE_ITEMS, ticketTypes: typesPublic(), mkPending: mkPendingFor(s) }; },
      sFind: s_find, sGate: s_gate, sInbox: s_inbox, sTicket: s_ticket, sReply: s_reply, sCallback: s_callback,
      sAccept: s_accept, sFarm: s_farm, sRegister: s_register, sRewards: s_rewards, sRewardDecide: s_rewardDecide,
      sTraders: s_traders, sBlock: s_block, sTraderGet: s_traderGet, sTraderSave: s_traderSave, sTraderDelete: s_traderDelete, sStats: s_stats, sMarketGet: s_marketGet, sMarketSet: s_marketSet, sMarketDecide: s_marketDecide, sReport: s_report,
      sTeamList: function (s) { needManager(s); return teamList(s); }, sTeamSave: s_teamSave, sTeamDelete: s_teamDelete,
      sResetPreview: s_resetPreview, sFactoryReset: s_factoryReset
    };
    var WRITE = { register: 1, login: 1, staffLogin: 1 };
    /* أسطول التجار: إجراءات المشرفين، وإجراءات السائق التي يحميها رمز الخط نفسه */
    var FL = C.fleetActions({ store: store, env: env, cfg: cfg, err: err, now: now, can: can, log: log, jparse: jparse, liveTraders: liveTraders });
    /* العمليات: سجل الأخطاء والصحة والنسخ والتدقيق والتصدير والتخزين المؤقت (انظر 04d_ops.js) */
    var OPS = C.opsActions({
      store: store, env: env, cfg: cfg, err: err, now: now, can: can, log: log, jparse: jparse, peek: peek, addCounter: addCounter,
      liveTraders: liveTraders, stateOf: stateOf, needManager: needManager,
      notify: function (subject, body) { var list = repRecipients(); if (list.length) env.notify(list, subject, body, ''); },
      reportRows: function () { return repRows(repBuild()); }
    });
    /* كل خطأ غير متوقع يُسجَّل في LAST_ERR (للفريق الفني) وفي سجل الأخطاء داخل التطبيق */
    function onErr(e, where) {
      try { if (env.onError) env.onError(e); } catch (x) { /* ignore */ }
      try { OPS.recordErr(e, where); } catch (y) { /* ignore */ }
    }
    /* حدّ معدل الطلبات لكل مستخدم في الدقيقة */
    function rate(sub) { if (!OPS.rateOk(sub)) throw err('rate', 'طلبات كثيرة في وقت قصير، استنى دقيقة وجرّب تاني'); }

    function dispatch(token, action, payload) {
      payload = payload || {};
      if (PUBLIC[action]) return PUBLIC[action](token, payload);
      if (TRADER[action]) { var tr = whoTrader(token); rate(tr.id); return TRADER[action](tr, payload); }
      if (STAFF[action] || OPS.STAFF[action] || FL.STAFF[action]) {
        var sf = whoStaff(token); rate(sf.id);
        if (STAFF[action]) return STAFF[action](sf, payload);
        if (OPS.STAFF[action]) return OPS.STAFF[action](sf, payload);
        return FL.STAFF[action](sf, payload);
      }
      if (FL.ROUTE[action]) { var rt = FL.routeOf(token); rate('r:' + rt.id); return FL.ROUTE[action](rt, payload); }
      throw err('action', 'طلب غير معروف');
    }
    /* واجهة الاستدعاء الوحيدة. يرجع دائمًا {ok:true,data} أو {ok:false,err,msg} */
    function api(token, action, payloadJson) {
      try {
        var payload = typeof payloadJson === 'string' ? (payloadJson ? JSON.parse(payloadJson) : {}) : (payloadJson || {});
        return { ok: true, data: dispatch(token, String(action), payload) };
      } catch (e) {
        if (e instanceof ApiError) return { ok: false, err: e.code, msg: e.msg };
        onErr(e, 'api');
        return { ok: false, err: 'server', msg: 'حصل خطأ غير متوقع، جرّب تاني بعد لحظات' };
      }
    }

    return {
      api: api, tick: tick, reportNow: function () { var R = repBuild(); return repSend(repRecipients(), R) ? repRecipients().length : 0; }, cfg: cfg, resetCfg: function () { _cfg = null; },
      _internal: { stateOf: stateOf, save: save, profile: profile, nextId: nextId, farmsList: farmsList }
    };
  }

  C.createService = createService;
  C.ROLE_LABEL = ROLE_LABEL;
  C.STAFF_ROLES = STAFF_ROLES;
})(C3A);
/* ============================================================
   الجزء 4ب: أسطول التجار — خطوط السير والتتبع والطوارئ والإشعارات
   - الخط يُرسل للتاجر على واتساب برابط فيه رمز سري للخط. الخادم يخزّن بصمة الرمز فقط (HMAC) ولا يخزّنه كما هو.
   - السائق يرسل موقعه من الصفحة وهي مفتوحة. الخادم يحسب الخروج عن الممر ويعيد الحالة للهاتف.
   - الخروج عن الخط (بعد نبضتين متتاليتين) والطوارئ يسجّلان تنبيهًا ويصلان لكل من له صلاحية «fleet».
   - الإشعار والتطبيق مغلق يمر عبر خادم دفع خارجي (push.relayUrl)، وإن لم يُضبط يبقى التنبيه داخل التطبيق والبريد.
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U;

  /* الجداول الجديدة. لا تغيّر أي جدول قديم، والأوراق تُنشأ تلقائيًا عند أول استخدام أو عند التهيئة */
  C.SCHEMA.FleetRoutes = [['id', 's'], ['title', 's'], ['status', 's'], ['traderId', 's'], ['points', 'j'], ['corridorM', 'n'], ['createdBy', 's'], ['createdTs', 'n'], ['updatedTs', 'n'], ['startedTs', 'n'], ['endedTs', 'n'], ['tokenHash', 's'], ['tokenExp', 'n'], ['lastTs', 'n'], ['lastLat', 'n'], ['lastLng', 'n'], ['lastAcc', 'n'], ['lastDist', 'n'], ['offCount', 'n'], ['lastStoredTs', 'n'], ['lastState', 's']];
  C.SCHEMA.FleetPings = [['id', 's'], ['routeId', 's'], ['ts', 'n'], ['lat', 'n'], ['lng', 'n'], ['acc', 'n'], ['dist', 'n'], ['state', 's']];
  C.SCHEMA.FleetAlerts = [['id', 's'], ['ts', 'n'], ['routeId', 's'], ['traderId', 's'], ['type', 's'], ['status', 's'], ['lat', 'n'], ['lng', 'n'], ['acc', 'n'], ['dist', 'n'], ['reason', 's'], ['resolvedBy', 's'], ['resolvedTs', 'n'], ['note', 's']];
  C.SCHEMA.FleetNotes = [['id', 's'], ['ts', 'n'], ['toStaffId', 's'], ['toRoute', 's'], ['kind', 's'], ['title', 's'], ['body', 's'], ['routeId', 's'], ['alertId', 's'], ['read', 'n']];
  C.SCHEMA.FleetDevices = [['id', 's'], ['ts', 'n'], ['ownerKind', 's'], ['ownerId', 's'], ['token', 's'], ['platform', 's']];
  /* موافقة السائق على التتبع: صف واحد لكل خط (المفتاح = رقم الخط). تغيير نص الموافقة يرفع رقم الإصدار فتُطلب من جديد */
  C.SCHEMA.FleetConsents = [['id', 's'], ['ts', 'n'], ['ver', 's'], ['traderId', 's']];
  C.FLEET_CONSENT_VER = 'v1';

  /* قيم افتراضية؛ تُغيَّر من ورقة Config بالمفاتيح fleet.* و push.* */
  C.CONFIG.fleet = Object.assign({
    corridorM: 150,            // عرض الممر المسموح حول الخط بالمتر
    offConfirm: 2,             // عدد النبضات المتتالية خارج الممر قبل إصدار التنبيه (يمنع الإنذار الكاذب من GPS)
    trackEverySec: 60,         // كل كم ثانية تُحفظ نقطة في سجل الحركة (والطوارئ 15 ثانية)
    pingMinSec: 8,             // أقل فاصل بين نبضتين تُحفظان
    staleMin: 10,              // بعد كم دقيقة بدون إشارة يظهر السائق «بلا إشارة»
    tokenHours: 72,            // صلاحية رابط الخط بالساعات
    center: [30.0444, 31.2357],
    zoom: 6,
    hotline: '',               // رقم المسؤول المباشر يظهر للسائق عند الطوارئ
    linkBase: '',              // رابط صفحة السائق (GitHub Pages غالبًا). فارغ = رابط التطبيق العام
    reasons: ['عطل في العربية', 'حادثة', 'مريض أو إصابة', 'ضياع في الطريق', 'أخرى'],
    retainDays: 90             // مدة الاحتفاظ بنقاط الحركة بالأيام، ثم تُحذف تلقائيًا (0 = بلا حذف)
  }, C.CONFIG.fleet || {});
  C.CONFIG.push = Object.assign({ relayUrl: '' }, C.CONFIG.push || {});   // سرّ الخادم الخارجي في Script Properties، لا في الجدول

  /* ---------- هندسة: المسافة من نقطة إلى الخط (تقريب مستوٍ محلي، دقيق للمسافات القصيرة) ---------- */
  var EARTH = 6371000, DEG = Math.PI / 180;
  function distPointSeg(p, a, b) {
    var k = EARTH * DEG, c = Math.cos(p.lat * DEG);
    var ax = (a.lng - p.lng) * k * c, ay = (a.lat - p.lat) * k;
    var bx = (b.lng - p.lng) * k * c, by = (b.lat - p.lat) * k;
    var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    var t = len2 ? -(ax * dx + ay * dy) / len2 : 0;      // موضع أقرب نقطة على AB (الموقع عند الأصل)
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var cx = ax + t * dx, cy = ay + t * dy;
    return Math.sqrt(cx * cx + cy * cy);
  }
  function distToRoute(p, pts) {
    if (!pts || !pts.length) return Infinity;
    if (pts.length === 1) return distPointSeg(p, pts[0], pts[0]);
    var best = Infinity;
    for (var i = 0; i + 1 < pts.length; i++) { var d = distPointSeg(p, pts[i], pts[i + 1]); if (d < best) best = d; }
    return best;
  }
  C.fleetGeo = { distToRoute: distToRoute, distPointSeg: distPointSeg };

  var ACTIVE = { planned: 1, active: 1, off_route: 1, emergency: 1 };
  var LIVE = { active: 1, off_route: 1, emergency: 1 };   // الرحلة جارية وتستقبل النبضات

  /* ctx من createService: store, env, cfg, err, now, can, log, jparse, liveTraders */
  C.fleetActions = function (ctx) {
    var store = ctx.store, env = ctx.env, cfg = ctx.cfg, err = ctx.err, now = ctx.now, can = ctx.can, log = ctx.log, jparse = ctx.jparse, liveTraders = ctx.liveTraders;
    function fc() { return cfg().fleet || C.CONFIG.fleet; }
    function need(s, key) { if (!can(s, key)) throw err('perm', 'الصلاحية غير كافية'); }
    function rid(prefix) { return prefix + env.randHex(5).toUpperCase(); }
    /* موافقة السائق على التتبع لهذا الخط (بالإصدار الحالي من النص) */
    function consentOf(r) { var c = store.find('FleetConsents', function (x) { return x.id === r.id; }); return c && c.ver === C.FLEET_CONSENT_VER ? c : null; }
    function giveConsent(r) {
      var t = now(), c = store.find('FleetConsents', function (x) { return x.id === r.id; });
      if (c) store.update('FleetConsents', r.id, { ts: t, ver: C.FLEET_CONSENT_VER, traderId: r.traderId });
      else store.insert('FleetConsents', { id: r.id, ts: t, ver: C.FLEET_CONSENT_VER, traderId: r.traderId });
    }

    function cleanPoints(list) {
      if (!Array.isArray(list) || list.length < 2 || list.length > 60) throw err('points', 'الخط لازم يكون فيه نقطتين على الأقل، وحد أقصى 60 نقطة');
      return list.map(function (p, i) {
        var lat = Number(p && p.lat), lng = Number(p && p.lng);
        if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw err('points', 'إحداثيات النقطة ' + (i + 1) + ' غير صحيحة');
        return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), name: U.cleanText(String((p && p.name) || ('محطة ' + (i + 1))), 40) || ('محطة ' + (i + 1)) };
      });
    }
    /* موقع الهاتف: الدقة الأسوأ من 1000 متر مرفوضة، والدقة المفقودة تُعامل كـ 100 متر */
    function fixOf(p) {
      var lat = Number(p && p.lat), lng = Number(p && p.lng), acc = Number(p && p.acc);
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      if (!isFinite(acc) || acc < 0) acc = 100;
      if (acc > 1000) return null;
      return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.round(acc) };
    }
    function tokenHashOf(token) { return U.hmacHex(env.secret(), 'route:' + String(token)); }
    function routeOf(token) {
      var t = String(token || '');
      if (t.length < 16 || t.length > 80) throw err('auth', 'الرابط غير صالح');
      var h = tokenHashOf(t);
      var r = store.find('FleetRoutes', function (x) { return x.tokenHash === h; });
      if (!r || r.status === 'cancelled' || !r.tokenExp || now() > Number(r.tokenExp)) throw err('auth', 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من المشرف');
      return r;
    }
    function routeById(id) { return store.find('FleetRoutes', function (x) { return x.id === id; }); }
    function traderOf(r) { return store.find('Traders', function (x) { return x.id === r.traderId; }); }
    function isStale(r) { return !!(LIVE[r.status] && r.lastTs && now() - Number(r.lastTs) > Number(fc().staleMin) * 60000); }

    /* الشكل الذي يراه المشرف (فيه اسم التاجر ولوحته) */
    function staffView(r) {
      var pts = jparse(r.points, []), t = traderOf(r);
      return {
        id: r.id, title: r.title, status: r.status, traderId: r.traderId, traderName: t ? t.name : '—', plate: t ? (t.plate || '') : '',
        points: pts, corridorM: Number(r.corridorM) || fc().corridorM, startedTs: Number(r.startedTs) || 0, endedTs: Number(r.endedTs) || 0,
        tokenValid: !!(r.tokenHash && r.tokenExp && now() <= Number(r.tokenExp) && ACTIVE[r.status]),
        lastTs: Number(r.lastTs) || 0, lastLat: Number(r.lastLat) || 0, lastLng: Number(r.lastLng) || 0, lastAcc: Number(r.lastAcc) || 0,
        lastDist: Number(r.lastDist) || 0, offCount: Number(r.offCount) || 0, stale: isStale(r)
      };
    }
    /* الشكل الذي يراه السائق: بلا بيانات التاجر ولا المشرفين */
    function driverView(r, alert) {
      var pts = jparse(r.points, []);
      return {
        id: r.id, title: r.title, status: r.status, stops: pts.map(function (p) { return p.name; }), points: pts,
        corridorM: Number(r.corridorM) || fc().corridorM, startedTs: Number(r.startedTs) || 0, endedTs: Number(r.endedTs) || 0,
        lastDist: Number(r.lastDist) || 0, serverTs: now(),
        alert: alert ? { type: alert.type, ts: Number(alert.ts) || 0, reason: alert.reason || '' } : null
      };
    }
    function openAlertOf(routeId, type) {
      return store.find('FleetAlerts', function (a) { return a.routeId === routeId && a.status === 'open' && (!type || a.type === type); });
    }

    /* ---------- الإشعارات ---------- */
    function fleetStaff() { return store.filter('Staff', function (s) { return Number(s.active) && can(s, 'fleet'); }); }
    function devicesOf(kind, ids) {
      return store.filter('FleetDevices', function (d) { return d.ownerKind === kind && ids.indexOf(d.ownerId) >= 0; });
    }
    /* الإرسال: أولًا Firebase مباشرة إن ضُبط FCM_SERVICE_ACCOUNT، ثم خادم الدفع الخارجي إن ضُبط push.relayUrl.
       لا يحمل أي رقم هاتف ولا رمز خط. الجهاز الذي يرفض Firebase رمزه (لم يعد مسجّلًا) يُفرَّغ رمزه ولا يُرسل له بعد ذلك */
    function pushTo(devs, title, body, data) {
      var list = devs.filter(function (d) { return d.token; });
      if (!list.length) return 0;
      var sent = 0, urgent = !!(data && data.kind === 'alert_sos');
      var tag = data && data.routeId ? 'route-' + data.routeId : 'c3a-general';
      if (env.fcmReady && env.fcmSend && env.fcmReady()) {
        try {
          var batch = list.slice(0, C.fcm.MAX_BATCH);
          var msgs = batch.map(function (d) {
            return C.fcm.message(d.token, { title: title, body: body, data: data || {}, priority: urgent ? 'high' : 'normal', tag: tag });
          });
          var res = env.fcmSend(msgs) || [];
          res.forEach(function (r, i) {
            if (!r) return;
            if (r.ok) sent++;
            else if (r.unregistered) store.update('FleetDevices', batch[i].id, { token: '' });
          });
        } catch (e) { if (env.onError) env.onError(e); }
      }
      var c = cfg().push || {};
      if (c.relayUrl && env.push) {
        try {
          env.push(String(c.relayUrl), env.pushAuth ? String(env.pushAuth() || '') : '', {
            tokens: list.map(function (d) { return d.token; }), title: title, body: body, data: data || {}, priority: urgent ? 'high' : 'normal'
          });
          sent += list.length;
        } catch (e) { /* ignore: الرسالة تبقى داخل التطبيق والبريد */ }
      }
      return sent;
    }
    function notifyFleet(title, body, meta) {
      var list = fleetStaff(), t = now();
      list.forEach(function (s) {
        store.insert('FleetNotes', { id: rid('N'), ts: t, toStaffId: s.id, toRoute: '', kind: meta.kind, title: title, body: body, routeId: meta.routeId || '', alertId: meta.alertId || '', read: 0 });
      });
      var emails = [];
      list.forEach(function (s) { if (s.email && emails.indexOf(s.email) < 0) emails.push(s.email); });
      if (emails.length && env.notify) { try { env.notify(emails, '[' + cfg().appName + '] ' + title, body); } catch (e) { /* البريد اختياري */ } }
      pushTo(devicesOf('staff', list.map(function (s) { return s.id; })), title, body, meta);
    }
    function noteRoute(r, kind, title, body) {
      store.insert('FleetNotes', { id: rid('N'), ts: now(), toStaffId: '', toRoute: r.id, kind: kind, title: title, body: body, routeId: r.id, alertId: '', read: 0 });
      pushTo(devicesOf('route', [r.id]), title, body, { kind: kind, routeId: r.id });
    }
    function notesForRoute(routeId, n) {
      return store.filter('FleetNotes', function (x) { return x.toRoute === routeId; })
        .sort(function (a, b) { return b.ts - a.ts; }).slice(0, n).map(function (x) { return { id: x.id, ts: x.ts, kind: x.kind, title: x.title, body: x.body }; });
    }

    /* ---------- التنبيهات ---------- */
    function openAlert(r, type, f, dist, reason) {
      var id = rid('AL'), t = now();
      store.insert('FleetAlerts', { id: id, ts: t, routeId: r.id, traderId: r.traderId, type: type, status: 'open', lat: f ? f.lat : (Number(r.lastLat) || 0), lng: f ? f.lng : (Number(r.lastLng) || 0), acc: f ? f.acc : 0, dist: Math.round(dist || 0), reason: reason || '', resolvedBy: '', resolvedTs: 0, note: '' });
      var tr = traderOf(r), who = (tr ? tr.name : '') || r.title;
      if (type === 'emergency') {
        notifyFleet('طوارئ: ' + r.title, 'حالة طوارئ عند ' + who + ' — ' + reason + '. افتح تبويب «الأسطول» وتابع المكان.', { kind: 'alert_sos', routeId: r.id, alertId: id });
      } else {
        notifyFleet('خروج عن خط السير: ' + r.title, who + ' خرج عن الخط بحوالي ' + Math.round(dist || 0) + ' متر. افتح «الأسطول» لمتابعة المكان.', { kind: 'alert_off', routeId: r.id, alertId: id });
        noteRoute(r, 'alert_off', 'أنت خارج خط السير', 'ارجع للمسار المحدد. المشرف شايف مكانك دلوقتي.');
      }
      return id;
    }
    function closeAlerts(routeId, type, status, note, by) {
      var t = now(), n = 0;
      store.filter('FleetAlerts', function (a) { return a.routeId === routeId && a.type === type && a.status === 'open'; }).forEach(function (a) {
        store.update('FleetAlerts', a.id, { status: status, resolvedTs: t, resolvedBy: by || '', note: note || '' }); n++;
      });
      return n;
    }

    /* ---------- نبضة الموقع: قلب الخدمة ---------- */
    function applyPing(r, f) {
      var pts = jparse(r.points, []), corridor = Number(r.corridorM) || fc().corridorM, t = now();
      var d = distToRoute(f, pts), eff = Math.max(0, d - Math.min(f.acc, 100));
      var off = eff > corridor, state = off ? 'off' : 'ok';
      var lastTs = Number(r.lastTs) || 0, prevState = r.lastState || '';
      if (t - lastTs < Number(fc().pingMinSec) * 1000 && state === prevState) return { state: state, dist: Math.round(d), saved: false };

      var offCount = off ? (Number(r.offCount) || 0) + 1 : 0;
      var status = r.status;
      if (status === 'active' || status === 'off_route') status = offCount >= Number(fc().offConfirm || 2) ? 'off_route' : 'active';
      var patch = { lastTs: t, lastLat: f.lat, lastLng: f.lng, lastAcc: f.acc, lastDist: Math.round(d), offCount: offCount, lastState: state, updatedTs: t, status: status };

      var every = (status === 'emergency' ? 15 : Number(fc().trackEverySec)) * 1000;
      var stored = false;
      if (t - (Number(r.lastStoredTs) || 0) >= every || state !== prevState) {
        store.insert('FleetPings', { id: rid('P'), routeId: r.id, ts: t, lat: f.lat, lng: f.lng, acc: f.acc, dist: Math.round(d), state: state });
        patch.lastStoredTs = t; stored = true;
      }
      if (status === 'off_route' && r.status !== 'off_route') openAlert(r, 'off_route', f, eff, 'خارج الممر المسموح');
      if (r.status === 'off_route' && status === 'active') {
        closeAlerts(r.id, 'off_route', 'auto', 'عاد إلى خط السير', '');
        noteRoute(r, 'back_on_route', 'رجعت للخط', 'ممتاز، كمّل على نفس الخط.');
      }
      store.update('FleetRoutes', r.id, patch);
      return { state: state, dist: Math.round(d), saved: stored, status: status };
    }

    /* ---------- أفعال الدخول بالرابط (السائق) ---------- */
    var ROUTE = {
      routeGet: function (r) {
        var a = openAlertOf(r.id, '');
        return { route: driverView(r, a), notes: notesForRoute(r.id, 5), reasons: fc().reasons, hotline: fc().hotline || '', consent: { ok: !!consentOf(r), ver: C.FLEET_CONSENT_VER, retainDays: Number(fc().retainDays) || 0 } };
      },
      routeStart: function (r, p) {
        if (r.status === 'done') throw err('state', 'الرحلة انتهت بالفعل');
        if (!consentOf(r)) {
          if (!(p && p.consent === true)) throw err('consent', 'وافق على التتبع أولًا قبل بدء الرحلة');
          giveConsent(r);
        }
        var t = now(), patch = { status: r.status === 'planned' ? 'active' : r.status, startedTs: Number(r.startedTs) || t, updatedTs: t };
        store.update('FleetRoutes', r.id, patch);
        var fresh = routeById(r.id), f = fixOf(p);
        if (r.status === 'planned') log('', 'route_start', r.id, 0, { route: r.title });
        if (f && LIVE[fresh.status]) applyPing(fresh, f);
        return ROUTE.routeGet(routeById(r.id));
      },
      routePing: function (r, p) {
        if (!LIVE[r.status]) throw err('state', r.status === 'planned' ? 'لازم تبدأ الرحلة الأول' : 'الرحلة انتهت');
        if (!consentOf(r)) throw err('consent', 'وافق على التتبع من الشاشة أولًا');
        var f = fixOf(p);
        if (!f) throw err('pos', 'الموقع غير متاح، تأكد إن GPS شغال ومسموح للتطبيق');
        var res = applyPing(r, f);
        return { state: res.state, dist: res.dist, status: routeById(r.id).status, corridorM: Number(r.corridorM) || fc().corridorM };
      },
      routeEmergency: function (r, p) {
        if (r.status === 'done') throw err('state', 'الرحلة انتهت');
        var reasons = fc().reasons || [], reason = U.cleanText(String((p && p.reason) || ''), 60);
        if (reasons.indexOf(reason) < 0) reason = reasons[reasons.length - 1] || 'أخرى';
        var f = fixOf(p), t = now();
        var open = openAlertOf(r.id, 'emergency');
        if (open) {
          if (f) store.update('FleetAlerts', open.id, { lat: f.lat, lng: f.lng, acc: f.acc, ts: t });
          store.update('FleetRoutes', r.id, { status: 'emergency', lastTs: f ? t : r.lastTs, lastLat: f ? f.lat : r.lastLat, lastLng: f ? f.lng : r.lastLng, lastAcc: f ? f.acc : r.lastAcc, updatedTs: t, startedTs: Number(r.startedTs) || t });
          return { ok: true, alertId: open.id, repeated: true };
        }
        var fresh = routeById(r.id);
        store.update('FleetRoutes', r.id, { status: 'emergency', startedTs: Number(r.startedTs) || t, updatedTs: t, lastState: fresh.lastState || '', lastTs: f ? t : r.lastTs, lastLat: f ? f.lat : r.lastLat, lastLng: f ? f.lng : r.lastLng, lastAcc: f ? f.acc : r.lastAcc });
        if (f) store.insert('FleetPings', { id: rid('P'), routeId: r.id, ts: t, lat: f.lat, lng: f.lng, acc: f.acc, dist: Math.round(Number(r.lastDist) || 0), state: 'sos' });
        var alertId = openAlert(routeById(r.id), 'emergency', f, 0, reason);
        log('', 'route_sos', r.id, 0, { reason: reason, fix: !!f });
        return { ok: true, alertId: alertId, repeated: false, hotline: fc().hotline || '' };
      },
      routeEnd: function (r, p) {
        if (r.status === 'done') return { ok: true };
        var t = now(), f = fixOf(p);
        var hadEmergency = !!openAlertOf(r.id, 'emergency');
        store.update('FleetRoutes', r.id, { status: 'done', endedTs: t, updatedTs: t, lastState: '', lastTs: f ? t : r.lastTs, lastLat: f ? f.lat : r.lastLat, lastLng: f ? f.lng : r.lastLng });
        log('', 'route_end', r.id, 0, { emergencyOpen: hadEmergency });
        if (hadEmergency) notifyFleet('انتهت الرحلة والطوارئ ما زالت مفتوحة: ' + r.title, 'السائق أنهى الرحلة وتنبيه الطوارئ لم يُغلق بعد. تأكد من حالته ثم اضغط «تم الحل» في «الأسطول».', { kind: 'alert_sos', routeId: r.id, alertId: (openAlertOf(r.id, 'emergency') || {}).id || '' });
        return { ok: true };
      },
      routePushRegister: function (r, p) {
        var tok = String((p && p.token) || '');
        if (tok.length < 20 || tok.length > 4096) throw err('token', 'رمز الإشعارات غير صالح');
        var old = store.find('FleetDevices', function (d) { return d.ownerKind === 'route' && d.ownerId === r.id && d.token === tok; });
        if (!old) store.insert('FleetDevices', { id: rid('D'), ts: now(), ownerKind: 'route', ownerId: r.id, token: tok, platform: U.cleanText(String((p && p.platform) || 'web'), 12) });
        return { ok: true };
      }
    };

    /* ---------- أفعال المشرفين ---------- */
    function s_fleet(s) {
      need(s, 'fleet');
      var t = now(), rows = store.all('FleetRoutes'), out = [];
      rows.forEach(function (r) {
        var recent = (r.status === 'done' || r.status === 'cancelled') && Number(r.endedTs || r.updatedTs) > t - 12 * 3600000;
        if (ACTIVE[r.status] || recent) out.push(staffView(r));
      });
      var rank = { emergency: 0, off_route: 1, active: 2, planned: 3, done: 4, cancelled: 5 };
      out.sort(function (a, b) { return (rank[a.status] - rank[b.status]) || (b.lastTs - a.lastTs); });
      var alerts = store.filter('FleetAlerts', function (a) { return a.status === 'open'; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 50).map(function (a) {
        var r = routeById(a.routeId), tr = store.find('Traders', function (x) { return x.id === a.traderId; });
        return { id: a.id, ts: a.ts, routeId: a.routeId, routeTitle: r ? r.title : '', traderName: tr ? tr.name : '', type: a.type, lat: a.lat, lng: a.lng, acc: a.acc, dist: a.dist, reason: a.reason };
      });
      var stats = { active: 0, off: 0, emergency: 0, stale: 0, planned: 0 };
      out.forEach(function (x) { if (x.status === 'active') stats.active++; if (x.status === 'off_route') stats.off++; if (x.status === 'emergency') stats.emergency++; if (x.status === 'planned') stats.planned++; if (x.stale) stats.stale++; });
      var manage = can(s, 'fleet.manage');
      var traders = manage ? liveTraders().filter(function (x) { return x.status === 'active'; }).map(function (x) { return { id: x.id, name: x.name, plate: x.plate || '' }; }).slice(0, 400) : [];
      return { routes: out.slice(0, 80), alerts: alerts, stats: stats, canManage: manage, traders: traders, now: t, staleMin: Number(fc().staleMin), offConfirm: Number(fc().offConfirm), center: fc().center, zoom: fc().zoom, reasons: fc().reasons };
    }
    function s_track(s, p) {
      need(s, 'fleet');
      var id = String((p && p.routeId) || '');
      var pings = store.filter('FleetPings', function (x) { return x.routeId === id; }).sort(function (a, b) { return a.ts - b.ts; });
      return { routeId: id, pings: pings.slice(-200).map(function (x) { return { ts: x.ts, lat: x.lat, lng: x.lng, state: x.state }; }) };
    }
    function s_routeSave(s, p) {
      need(s, 'fleet.manage');
      var title = U.cleanText(String((p && p.title) || ''), 60);
      if (title.length < 3) throw err('title', 'اكتب اسم الخط (3 حروف على الأقل)');
      var points = cleanPoints(p && p.points);
      var corridor = Math.round(Number(p && p.corridorM) || fc().corridorM);
      if (corridor < 30 || corridor > 1000) throw err('corridor', 'عرض الممر بين 30 و 1000 متر');
      var t = now(), r = p && p.id ? routeById(String(p.id)) : null;
      if (r && (r.status === 'done' || r.status === 'cancelled')) throw err('state', 'الخط انتهى أو أُلغي ولا يُعدَّل');
      var tr = store.find('Traders', function (x) { return x.id === String((p && p.traderId) || ''); });
      if (!tr || tr.status !== 'active') throw err('trader', 'اختر تاجرًا فعّالًا للخط');
      if (r) {
        store.update('FleetRoutes', r.id, { title: title, points: JSON.stringify(points), corridorM: corridor, traderId: tr.id, updatedTs: t });
        log('', 'route_edit', r.id, 0, { by: s.id });
        return { route: staffView(routeById(r.id)) };
      }
      var id = rid('RT');
      store.insert('FleetRoutes', { id: id, title: title, status: 'planned', traderId: tr.id, points: JSON.stringify(points), corridorM: corridor, createdBy: s.id, createdTs: t, updatedTs: t });
      log('', 'route_new', id, 0, { by: s.id });
      return { route: staffView(routeById(id)) };
    }
    /* يُصدر رمزًا جديدًا ويبني رسالة واتساب جاهزة. الرمز القديم يتوقف فورًا */
    function s_routeShare(s, p) {
      need(s, 'fleet.manage');
      var r = routeById(String((p && p.id) || ''));
      if (!r || !ACTIVE[r.status]) throw err('nf', 'الخط غير موجود أو انتهى');
      var tr = traderOf(r);
      if (!tr || tr.status !== 'active') throw err('trader', 'تاجر الخط غير فعّال');
      var phone = U.normPhone(tr.phone);
      if (!phone) throw err('phone', 'رقم موبايل التاجر غير مسجّل');
      var token = env.randHex(16), t = now(), exp = t + Number(fc().tokenHours) * 3600000;
      store.update('FleetRoutes', r.id, { tokenHash: tokenHashOf(token), tokenExp: exp, updatedTs: t });
      var base = [fc().linkBase, cfg().appUrl, env.serviceUrl ? env.serviceUrl() : ''].map(function (x) { return String(x || ''); }).filter(function (x) { return /^https?:\/\//.test(x); })[0] || '';
      var link = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'r=' + token;
      var pts = jparse(r.points, []);
      var stops = pts.map(function (x, i) { return (i + 1) + ') ' + x.name; }).join('\n');
      var message = 'أهلًا ' + tr.name + '،\n' +
        'ده خط السير بتاعك من شركة كايرو ثري ايه: ' + r.title + '\n' +
        'المحطات:\n' + stops + '\n\n' +
        'افتح الرابط ده واضغط «ابدأ الرحلة»، وخلي الشاشة مفتوحة طول الطريق:\n' + link + '\n\n' +
        'لو حصلت أي مشكلة اضغط زر «طوارئ» في الصفحة فورًا.';
      log(tr.id, 'route_share', r.id, 0, { by: s.id });
      return { link: link, message: message, waPhone: '20' + phone.substring(1), waUrl: 'https://wa.me/20' + phone.substring(1) + '?text=' + encodeURIComponent(message), expiresTs: exp, traderName: tr.name };
    }
    function s_routeCancel(s, p) {
      need(s, 'fleet.manage');
      var r = routeById(String((p && p.id) || ''));
      if (!r || r.status === 'done' || r.status === 'cancelled') throw err('nf', 'الخط غير موجود أو انتهى');
      store.update('FleetRoutes', r.id, { status: 'cancelled', tokenHash: '', tokenExp: 0, updatedTs: now() });
      closeAlerts(r.id, 'off_route', 'auto', 'أُلغي الخط', s.id);
      /* تنبيه الطوارئ يبقى مفتوحًا حتى يتابعه أحد المسؤولين ويغلقه بنفسه */
      log('', 'route_cancel', r.id, 0, { by: s.id, emergencyOpen: !!openAlertOf(r.id, 'emergency') });
      return { ok: true };
    }
    function s_alertResolve(s, p) {
      need(s, 'fleet');
      var a = store.find('FleetAlerts', function (x) { return x.id === String((p && p.id) || ''); });
      if (!a) throw err('nf', 'التنبيه غير موجود');
      if (a.status !== 'open') return { ok: true, already: true };
      var t = now(), note = U.cleanText(String((p && p.note) || ''), 120);
      store.update('FleetAlerts', a.id, { status: 'resolved', resolvedBy: s.id, resolvedTs: t, note: note });
      var r = routeById(a.routeId);
      if (r) {
        var stillEmergency = !!openAlertOf(r.id, 'emergency');
        var next = r.status;
        if (a.type === 'emergency' && !stillEmergency) next = r.endedTs ? 'done' : (Number(r.startedTs) ? 'active' : 'planned');
        if (a.type === 'off_route' && r.status === 'off_route') next = 'active';
        if (next !== r.status) store.update('FleetRoutes', r.id, { status: next, updatedTs: t });
        noteRoute(r, 'resolved', 'تم التأكد من حالتك', 'المشرف تابع مكانك وحالتك. كمّل بأمان، وخلي الشاشة مفتوحة.');
      }
      log('', 'alert_resolve', a.id, 0, { by: s.id, type: a.type });
      return { ok: true };
    }
    function s_notes(s) {
      need(s, 'fleet');
      var list = store.filter('FleetNotes', function (x) { return x.toStaffId === s.id; }).sort(function (a, b) { return b.ts - a.ts; });
      return { list: list.slice(0, 40).map(function (x) { return { id: x.id, ts: x.ts, kind: x.kind, title: x.title, body: x.body, routeId: x.routeId, alertId: x.alertId, read: Number(x.read) ? 1 : 0 }; }), unread: list.filter(function (x) { return !Number(x.read); }).length };
    }
    function s_noteRead(s, p) {
      need(s, 'fleet');
      var ids = Array.isArray(p && p.ids) ? p.ids.map(String) : [];
      var n = 0;
      store.filter('FleetNotes', function (x) { return x.toStaffId === s.id && ids.indexOf(x.id) >= 0 && !Number(x.read); }).forEach(function (x) { store.update('FleetNotes', x.id, { read: 1 }); n++; });
      return { marked: n };
    }
    function s_pushRegister(s, p) {
      var tok = String((p && p.token) || '');
      if (tok.length < 20 || tok.length > 4096) throw err('token', 'رمز الإشعارات غير صالح');
      var old = store.find('FleetDevices', function (d) { return d.ownerKind === 'staff' && d.ownerId === s.id && d.token === tok; });
      if (!old) store.insert('FleetDevices', { id: rid('D'), ts: now(), ownerKind: 'staff', ownerId: s.id, token: tok, platform: U.cleanText(String((p && p.platform) || 'web'), 12) });
      return { ok: true };
    }

    var STAFF = {
      sFleet: s_fleet, sTrack: s_track, sRouteSave: s_routeSave, sRouteShare: s_routeShare, sRouteCancel: s_routeCancel,
      sAlertResolve: s_alertResolve, sNotes: s_notes, sNoteRead: s_noteRead, sPushRegister: s_pushRegister
    };
    return { ROUTE: ROUTE, STAFF: STAFF, routeOf: routeOf };
  };
})(C3A);
/* ============================================================
   الجزء 4ج: إشعارات Firebase Cloud Messaging (واجهة HTTP v1)
   - الخادم يوقّع JWT بمفتاح حساب الخدمة (Script Property: FCM_SERVICE_ACCOUNT)،
     ويطلب به رمز وصول من Google، ثم يرسل رسالة لكل جهاز مسجّل.
   - هذا الملف منطق نقي: بناء الرسالة والتوقيع وتفسير الرد. الاتصال الفعلي في 07_gas.js،
     وفي الاختبار يُستبدل بنسخة محلية. لا يُرسل أي رقم هاتف أو رمز خط سير داخل الإشعار.
   ============================================================ */
(function (C) {
  'use strict';

  var SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
  var TOKEN_URL = 'https://oauth2.googleapis.com/token';
  var MAX_BATCH = 200;

  function clip(s, n) { return String(s === undefined || s === null ? '' : s).substring(0, n); }

  /* حساب خدمة سليم؟ يُفحص قبل أي إرسال حتى لا يُحذف جهاز بسبب إعداد خاطئ */
  function validServiceAccount(sa) {
    return !!(sa && sa.type === 'service_account' && sa.project_id && sa.client_email &&
      sa.private_key && /BEGIN (RSA )?PRIVATE KEY/.test(sa.private_key));
  }

  /* JWT لطلب رمز الوصول. env.b64url(text) يعيد base64url، و env.signRs256(text, pem) يعيد توقيع RS256 بصيغة base64url */
  function assertion(sa, nowMs, env) {
    var iat = Math.floor(nowMs / 1000);
    var head = env.b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    var claims = env.b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: iat, exp: iat + 3600 }));
    var unsigned = head + '.' + claims;
    return unsigned + '.' + env.signRs256(unsigned, sa.private_key);
  }

  /* رسالة لجهاز واحد. كل قيم data نصوص (شرط FCM). priority: high للطوارئ */
  function message(token, n) {
    var urgent = n.priority === 'high';
    var data = {};
    Object.keys(n.data || {}).forEach(function (k) {
      if (n.data[k] !== undefined && n.data[k] !== null) data[clip(k, 40)] = clip(n.data[k], 500);
    });
    data.title = clip(n.title || 'شريك الدفاع', 120);
    data.body = clip(n.body || '', 300);
    data.urgent = urgent ? '1' : '0';
    return {
      message: {
        token: String(token),
        notification: { title: data.title, body: data.body },   /* يظهر على أندرويد حتى والتطبيق مقفول */
        data: data,                                              /* يصل للتطبيق ليعرض التفاصيل ويُشغّل الصوت */
        android: {
          priority: urgent ? 'HIGH' : 'NORMAL',
          ttl: urgent ? '600s' : '3600s',
          notification: {
            channel_id: urgent ? 'sos_alerts' : 'general',
            tag: clip(n.tag || 'c3a', 60),
            notification_priority: urgent ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT',
            default_sound: true, default_vibrate_timings: true
          }
        },
        webpush: { headers: { Urgency: urgent ? 'high' : 'normal', TTL: urgent ? '600' : '3600' } }
      }
    };
  }

  /* تفسير رد FCM. لا يُحذف جهاز إلا عند UNREGISTERED أو رمز غير صالح صراحةً، حتى لا يُحذف الكل بسبب خطأ في الرسالة */
  function interpret(code, text) {
    var t = String(text || ''), j = {};
    try { j = JSON.parse(t); } catch (e) { j = {}; }
    var err = j.error || {}, status = String(err.status || ''), errCode = '';
    (err.details || []).forEach(function (d) { if (d && d.errorCode) errCode = String(d.errorCode); });
    if (code === 200) return { ok: true };
    if (code === 404 || errCode === 'UNREGISTERED' || status === 'NOT_FOUND') return { ok: false, unregistered: true };
    if (code === 400 && /registration token/i.test(t)) return { ok: false, unregistered: true };
    if (code === 401 || code === 403) return { ok: false, auth: true };
    return { ok: false, retry: code === 429 || code >= 500, code: code, error: clip(status || errCode || t, 120) };
  }

  C.fcm = {
    SCOPE: SCOPE, TOKEN_URL: TOKEN_URL, MAX_BATCH: MAX_BATCH,
    validServiceAccount: validServiceAccount, assertion: assertion, message: message, interpret: interpret
  };
})(C3A);
/* ============================================================
   الجزء 4د: العمليات — سجل الأخطاء، فحص الصحة اليومي، النسخ الاحتياطي الأسبوعي،
   سجل التدقيق، تحليلات الأسطول، التصدير CSV، استرجاع التاجر، حدّ معدل الطلبات، والتخزين المؤقت للقراءات الثقيلة.
   كل ما هنا يعمل فوق المخزن نفسه (Sheets أو الذاكرة في الاختبار)، ولا يحمل أي رمز أو مفتاح.
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U;

  C.SCHEMA.ErrLog = [['id', 's'], ['key', 's'], ['where', 's'], ['msg', 's'], ['count', 'n'], ['firstTs', 'n'], ['lastTs', 'n']];
  C.SCHEMA.HealthLog = [['id', 's'], ['ts', 'n'], ['ok', 'n'], ['summary', 's'], ['checks', 's'], ['by', 's']];
  C.SCHEMA.AuditLog = [['id', 's'], ['ts', 'n'], ['staffId', 's'], ['staffName', 's'], ['action', 's'], ['target', 's'], ['detail', 's']];
  C.CONFIG.backup = Object.assign({ on: true, day: 0, hour: 3, keep: 4 }, C.CONFIG.backup || {});
  C.CONFIG.health = Object.assign({ on: true, hour: 6 }, C.CONFIG.health || {});

  var ERR_KEEP = 200, HEALTH_KEEP = 60, EXPORT_MAX = 5000, RATE_MAX = 240, DAYS = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];
  /* جداول النسخة الأسبوعية: كل ما يُعاد بناؤه من الإدخال. FleetPings (نقاط الحركة) لا تُنسخ أسبوعيًا لحجمها، وتخضع لسياسة الاحتفاظ */
  var BACKUP_TABLES = ['Traders', 'Staff', 'Config', 'Content', 'MarketItems', 'MarketDay', 'MarketPending', 'Gate', 'Tickets', 'TicketMsgs', 'Events', 'Rewards', 'Farms', 'FleetRoutes', 'FleetAlerts', 'FleetNotes', 'FleetConsents', 'AuditLog'];

  function num(v, d) { if (v === '' || v === null || v === undefined) return d; var n = Number(v); return isNaN(n) ? d : n; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function pct(a, b) { return b ? Math.round(a * 1000 / b) / 10 : null; }
  function trim(s, n) { return String(s === null || s === undefined ? '' : s).substring(0, n); }
  function labelMs(label) {
    var s = String(label).substring(1);
    return Date.UTC(+s.substr(0, 4), +s.substr(4, 2) - 1, +s.substr(6, 2), +s.substr(8, 2), +s.substr(10, 2));
  }
  function dowOf(dk) { var a = dk.split('-'); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay(); }
  function bool(v, d) { if (v === undefined || v === null || v === '') return d; return !(v === false || v === 'false' || v === 0 || v === '0'); }

  /* ctx من createService: store, env, cfg, err, now, can, log, jparse, peek, addCounter, liveTraders, stateOf, needManager, notify, reportRows */
  C.opsActions = function (ctx) {
    var store = ctx.store, env = ctx.env, cfg = ctx.cfg, err = ctx.err, now = ctx.now, can = ctx.can, jparse = ctx.jparse;

    /* أدوات العمليات: مدير الإدارة ومسؤول النظام (الفني) فقط */
    function needOps(s) { if (!s || (s.role !== 'manager' && s.role !== 'admin')) throw err('perm', 'هذه الشاشة للمدير ومسؤول النظام فقط'); }
    function rid(p) { return p + now().toString(36).toUpperCase() + env.randHex(3).toUpperCase(); }
    function audit(s, action, target, detail) {
      store.insert('AuditLog', { id: rid('A'), ts: now(), staffId: s ? s.id : '', staffName: s ? s.name : '', action: trim(action, 40), target: trim(target, 60), detail: trim(detail ? JSON.stringify(detail) : '', 300) });
    }
    function pickAudit(x) { return { id: x.id, ts: Number(x.ts), staff: x.staffName || '—', action: x.action, target: x.target, detail: x.detail }; }

    /* ---------- سجل الأخطاء: يُجمَع بالنص والموضع، ويُحسب التكرار بدل تكرار الصفوف ---------- */
    function recordErr(e, where) {
      var msg = trim((e && e.message) || e || '', 300), w = trim(where || '', 60), key = w + '|' + msg.substring(0, 140), t = now();
      var row = store.find('ErrLog', function (r) { return r.key === key; });
      if (row) store.update('ErrLog', row.id, { count: Number(row.count) + 1, lastTs: t, msg: msg });
      else store.insert('ErrLog', { id: rid('E'), key: key, where: w, msg: msg, count: 1, firstTs: t, lastTs: t });
      if (store.count('ErrLog') > ERR_KEEP) store.replaceTable('ErrLog', store.all('ErrLog').slice().sort(function (a, b) { return b.lastTs - a.lastTs; }).slice(0, ERR_KEEP));
    }
    function sErrors(s) {
      needOps(s);
      var t = now(), rows = store.all('ErrLog').slice().sort(function (a, b) { return b.lastTs - a.lastTs; });
      var total = rows.reduce(function (a, x) { return a + Number(x.count); }, 0);
      var today = rows.filter(function (x) { return Number(x.lastTs) >= t - 86400000; }).reduce(function (a, x) { return a + Number(x.count); }, 0);
      return {
        asOf: t, total: total, today: today, distinct: rows.length,
        list: rows.slice(0, 60).map(function (x) { return { id: x.id, where: x.where || '—', msg: x.msg, count: Number(x.count), firstTs: Number(x.firstTs), lastTs: Number(x.lastTs) }; })
      };
    }
    function sErrorsClear(s) {
      needOps(s);
      var n = store.count('ErrLog');
      store.replaceTable('ErrLog', []);
      audit(s, 'errors_clear', '', { removed: n });
      return { ok: true, removed: n };
    }

    /* ---------- فحص الصحة: مرة يوميًا بعد الساعة المحددة، وعند الطلب من لوحة المدير ---------- */
    function healthCfg() { var h = cfg().health || C.CONFIG.health; return { on: bool(h.on, true), hour: Math.min(23, Math.max(0, Math.round(num(h.hour, 6)))) }; }
    function healthRun(by) {
      var t = now(), checks = [], c = cfg();
      function chk(name, ok, note) { checks.push({ n: name, ok: ok !== false, skip: ok === null, note: trim(note, 120) }); }
      try { ['Traders', 'Staff', 'Config', 'Events', 'Tickets'].forEach(function (tb) { store.count(tb); }); chk('قراءة الجداول', true, 'الجداول الأساسية تُقرأ'); }
      catch (e) { chk('قراءة الجداول', false, e.message); }
      try {
        var before = ctx.peek('health:probe'); ctx.addCounter('health:probe', 1);
        chk('كتابة الجداول', ctx.peek('health:probe') === before + 1, 'كتابة واسترجاع سليمة');
      } catch (e2) { chk('كتابة الجداول', false, e2.message); }
      var trg = env.triggerOk ? env.triggerOk() : undefined;
      chk('التصعيد التلقائي', trg === undefined ? null : !!trg, trg === undefined ? 'لا يُفحص خارج الجدول' : (trg ? 'مفعّل كل 15 دقيقة' : 'غير مفعّل: شغّل «٣) تفعيل التصعيد التلقائي»'));
      var q = env.mailQuota ? env.mailQuota() : null;
      chk('حصة البريد', q === null || q === undefined ? null : q > 0, q === null || q === undefined ? '' : 'المتبقي اليوم: ' + q);
      var fcm = env.fcmReady ? env.fcmReady() : undefined;
      chk('إشعارات الهاتف (FCM)', null, fcm === undefined ? '' : (fcm ? 'مفعّلة' : 'غير مفعّلة بعد (اختياري)'));
      var bk = backupCfg(), weekly = store.snapshotLabels('W');
      if (!bk.on) chk('النسخ الأسبوعي', null, 'موقوف من Config');
      else if (!weekly.length) chk('النسخ الأسبوعي', null, 'أول نسخة تُؤخذ يوم ' + DAYS[bk.day]);
      else chk('النسخ الأسبوعي', t - labelMs(weekly[0]) < 8 * 86400000, 'آخر نسخة: ' + weekly[0].substring(1, 11));
      var recent = store.all('ErrLog').filter(function (x) { return Number(x.lastTs) >= t - 86400000; }).reduce(function (a, x) { return a + Number(x.count); }, 0);
      chk('أخطاء آخر 24 ساعة', recent < 25, recent + ' خطأ');
      var bad = checks.filter(function (x) { return !x.ok; });
      var summary = bad.length ? bad.length + ' مشكلة: ' + bad.map(function (x) { return x.n; }).join('، ') : 'كل الفحوص سليمة';
      store.insert('HealthLog', { id: rid('H'), ts: t, ok: bad.length ? 0 : 1, summary: summary, checks: JSON.stringify(checks).substring(0, 2000), by: trim(by || 'auto', 20) });
      if (store.count('HealthLog') > HEALTH_KEEP) store.replaceTable('HealthLog', store.all('HealthLog').slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, HEALTH_KEEP));
      if (bad.length && by === 'auto' && ctx.notify) {
        ctx.notify('[' + c.appName + '] فحص الصحة اليومي: ' + bad.length + ' مشكلة تحتاج متابعة',
          'وجد الفحص اليومي ما يحتاج متابعة:\n' + bad.map(function (x) { return '- ' + x.n + (x.note ? ' (' + x.note + ')' : ''); }).join('\n') +
          '\n\nافتح التطبيق ← لوحة الإدارة ← «السجلات والصحة» للتفاصيل. هذه الرسالة لا تحمل أي بيانات تجار.');
      }
      return { ok: !bad.length, summary: summary, checks: checks };
    }
    function sHealth(s, p) {
      needOps(s);
      var ran = !!(p && p.run), last = ran ? healthRun(s.id) : null;
      var list = store.all('HealthLog').slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 10).map(function (x) {
        return { id: x.id, ts: Number(x.ts), ok: Number(x.ok) ? 1 : 0, summary: x.summary, checks: jparse(x.checks, []), by: x.by };
      });
      return { ran: ran, last: last, list: list, cfg: healthCfg() };
    }

    /* ---------- النسخ الاحتياطي الأسبوعي (ورقات مخفية بادئة W) ---------- */
    function backupCfg() {
      var b = cfg().backup || C.CONFIG.backup;
      return { on: bool(b.on, true), day: Math.min(6, Math.max(0, Math.round(num(b.day, 0)))), hour: Math.min(23, Math.max(0, Math.round(num(b.hour, 3)))), keep: Math.min(12, Math.max(1, Math.round(num(b.keep, 4)))) };
    }
    function backupRun(by) {
      var t = now(), label = 'W' + new Date(t).toISOString().replace(/\D/g, '').slice(0, 12), bk = backupCfg();
      var names = BACKUP_TABLES.filter(function (tb) { return store.count(tb) > 0; });
      store.snapshot(label, names);
      store.pruneSnapshots(bk.keep, 'W');
      return { label: label, tables: names.length, keep: bk.keep, by: by };
    }
    function sBackupNow(s) {
      needOps(s);
      var r = backupRun(s.id);
      audit(s, 'backup_now', r.label, { tables: r.tables });
      return { ok: true, label: r.label, tables: r.tables, keep: r.keep };
    }
    function sBackups(s) {
      needOps(s);
      var labels = store.snapshotLabels();
      return { weekly: labels.filter(function (l) { return l.charAt(0) === 'W'; }).slice(0, 12).map(function (l) { return l.substring(1); }), factory: labels.filter(function (l) { return l.charAt(0) === 'R'; }).slice(0, 5).map(function (l) { return l.substring(1); }), cfg: backupCfg() };
    }

    /* ---------- سياسة الاحتفاظ بنقاط الحركة: fleet.retainDays (0 = بلا حذف) ---------- */
    function purgePings() {
      var days = Math.round(num(cfg().fleet && cfg().fleet.retainDays, 90));
      if (!days || days < 0) return 0;
      days = Math.min(365, Math.max(7, days));
      var cut = now() - days * 86400000, all = store.all('FleetPings');
      var keep = all.filter(function (p) { return Number(p.ts) >= cut; });
      if (keep.length === all.length) return 0;
      store.replaceTable('FleetPings', keep);
      return all.length - keep.length;
    }

    /* ---------- مهام دورية: تُستدعى من tick كل 15 دقيقة، وكل مهمة مرة واحدة في اليوم ---------- */
    function tickOps(dk, h) {
      var out = {}, hc = healthCfg(), bk = backupCfg();
      if (hc.on && h >= hc.hour && !ctx.peek('hc:' + dk)) { ctx.addCounter('hc:' + dk, 1); out.health = healthRun('auto').ok ? 1 : 0; }
      if (bk.on && dowOf(dk) === bk.day && h >= bk.hour && !ctx.peek('bk:' + dk)) { ctx.addCounter('bk:' + dk, 1); out.backup = backupRun('auto').label; }
      if (!ctx.peek('purge:' + dk)) { ctx.addCounter('purge:' + dk, 1); out.purged = purgePings(); }
      return out;
    }

    /* ---------- سجل التدقيق: كل تعديل أو حذف أو إعادة تهيئة يُسجَّل بمن نفّذه ---------- */
    function sAudit(s, p) {
      needOps(s);
      var f = trim(p && p.action, 40), list = store.all('AuditLog').slice().sort(function (a, b) { return b.ts - a.ts; });
      if (f) list = list.filter(function (x) { return String(x.action).indexOf(f) === 0; });
      return { list: list.slice(0, 200).map(pickAudit) };
    }

    /* ---------- تحليلات الأسطول ---------- */
    function fleetStatsBuild(days) {
      var t = now(), from = t - days * 86400000;
      var routes = store.all('FleetRoutes').filter(function (r) { return Number(r.createdTs) >= from || Number(r.startedTs) >= from; });
      var byId = {}; routes.forEach(function (r) { byId[r.id] = r; });
      var names = {}; store.all('Traders').forEach(function (x) { names[x.id] = x.name; });
      var pings = store.all('FleetPings').filter(function (p) { return Number(p.ts) >= from && byId[p.routeId]; });
      var alerts = store.all('FleetAlerts').filter(function (a) { return Number(a.ts) >= from; });
      var drivers = {};
      function drv(id) { if (!drivers[id]) drivers[id] = { traderId: id, name: names[id] || '—', routes: 0, trips: 0, minutes: 0, pings: 0, off: 0, alerts: 0 }; return drivers[id]; }
      var mins = [];
      routes.forEach(function (r) {
        var d = drv(r.traderId); d.routes++;
        if (r.status === 'done' && Number(r.startedTs) && Number(r.endedTs) > Number(r.startedTs)) { var m = (Number(r.endedTs) - Number(r.startedTs)) / 60000; d.trips++; d.minutes += m; mins.push(m); }
      });
      var offP = 0;
      pings.forEach(function (p) { var d = drv(byId[p.routeId].traderId); d.pings++; if (p.state === 'off') { d.off++; offP++; } });
      var offA = 0, sosA = 0, openA = 0, perRoute = {};
      alerts.forEach(function (a) {
        if (a.type === 'off_route') offA++; else if (a.type === 'emergency') sosA++;
        if (a.status === 'open') openA++;
        if (a.traderId) drv(a.traderId).alerts++;
        perRoute[a.routeId] = (perRoute[a.routeId] || 0) + 1;
      });
      var list = Object.keys(drivers).map(function (k) {
        var d = drivers[k];
        return { traderId: d.traderId, name: d.name, routes: d.routes, trips: d.trips, avgMin: d.trips ? r1(d.minutes / d.trips) : null, pings: d.pings, offPct: pct(d.off, d.pings), alerts: d.alerts };
      });
      list.sort(function (a, b) { return ((b.offPct === null ? -1 : b.offPct) - (a.offPct === null ? -1 : a.offPct)) || (b.alerts - a.alerts) || (b.routes - a.routes); });
      var repeats = Object.keys(perRoute).filter(function (k) { return perRoute[k] >= 2; }).sort(function (a, b) { return perRoute[b] - perRoute[a]; }).slice(0, 5).map(function (k) {
        var rr = byId[k] || store.find('FleetRoutes', function (x) { return x.id === k; });
        return { title: rr ? rr.title : '—', count: perRoute[k] };
      });
      return {
        days: days, asOf: t, routes: routes.length, trips: mins.length, avgMin: mins.length ? r1(mins.reduce(function (a, b) { return a + b; }, 0) / mins.length) : null,
        pings: pings.length, offPct: pct(offP, pings.length), alerts: { off: offA, sos: sosA, open: openA },
        drivers: list.slice(0, 15), repeats: repeats
      };
    }
    function sFleetStats(s, p) {
      if (!can(s, 'fleet')) throw err('perm', 'متابعة الأسطول غير متاحة لصلاحياتك');
      var days = Math.min(90, Math.max(7, Math.round(num(p && p.days, 30))));
      return memo('fstats:' + days, 90, function () { return fleetStatsBuild(days); });
    }
    /* ملخص نافذة زمنية (من تاريخ dk إلى dk) للتقرير الأسبوعي */
    function fleetWindow(f, tt) {
      function inR(ts) { var dk = U.dateKey(Number(ts)); return dk >= f && dk <= tt; }
      var trips = 0, mins = [], off = 0, sos = 0;
      store.all('FleetRoutes').forEach(function (r) {
        if (Number(r.startedTs) && inR(r.startedTs)) { trips++; if (r.status === 'done' && Number(r.endedTs) > Number(r.startedTs)) mins.push((Number(r.endedTs) - Number(r.startedTs)) / 60000); }
      });
      store.all('FleetAlerts').forEach(function (a) { if (!inR(a.ts)) return; if (a.type === 'off_route') off++; else if (a.type === 'emergency') sos++; });
      return { trips: trips, avgMin: mins.length ? r1(mins.reduce(function (a, b) { return a + b; }, 0) / mins.length) : null, off: off, sos: sos };
    }

    /* ---------- استرجاع التاجر المحذوف ---------- */
    function sDeletedTraders(s) {
      if (!can(s, 'traders.delete')) throw err('perm', 'استرجاع التجار غير متاح لصلاحياتك');
      var events = store.all('Events').filter(function (e) { return e.type === 'trader_delete'; });
      return {
        list: store.all('Traders').filter(function (x) { return x.status === 'deleted'; }).map(function (x) {
          var last = 0; events.forEach(function (e) { if (e.ref === x.id && Number(e.ts) > last) last = Number(e.ts); });
          return { id: x.id, name: x.name, code: x.code, company: x.company || '', plate: x.plate || '', deletedTs: last };
        })
      };
    }
    function sTraderRestore(s, p) {
      if (!can(s, 'traders.delete')) throw err('perm', 'استرجاع التجار غير متاح لصلاحياتك');
      var id = String((p && p.id) || ''), row = store.find('Traders', function (x) { return x.id === id && x.status === 'deleted'; });
      if (!row) throw err('nf', 'التاجر المحذوف غير موجود');
      store.update('Traders', id, { status: 'active' });
      ctx.log('', 'trader_restore', id, 0, { by: s.id });
      audit(s, 'trader_restore', id, {});
      return { ok: true, name: row.name };
    }

    /* ---------- تصدير CSV (يفتح في Excel مباشرة بترميز UTF-8 والـBOM) ---------- */
    function csvOf(head, rows) {
      function cell(v) {
        var s = v === null || v === undefined ? '' : String(v);
        if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s;   // منع تنفيذ المعادلات عند فتح الملف
        if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }
      return '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
    }
    function dkTime(ts) { var p = U.tzParts(Number(ts)); return U.dateKey(Number(ts)) + ' ' + (p.h < 10 ? '0' : '') + p.h + ':' + (p.mi < 10 ? '0' : '') + p.mi; }
    function sExport(s, p) {
      var kind = String((p && p.kind) || ''), dk = U.dateKey(now()), out = null, label = '';
      if (kind === 'traders') {
        if (!can(s, 'traders')) throw err('perm', 'التصدير غير متاح لصلاحياتك');
        label = 'التجار';
        out = { head: ['الكود', 'الاسم', 'الموبايل', 'رقم اللوحة', 'الشركة', 'الحالة', 'تاريخ التسجيل', 'آخر دخول', 'النقاط'], rows: ctx.liveTraders().slice(0, EXPORT_MAX).map(function (x) {
          var st = ctx.stateOf(x);
          return [x.code, x.name, x.phone, x.plate || '', x.company || '', x.status === 'blocked' ? 'موقوف' : 'نشط', dkTime(x.created), Number(x.lastLogin) ? dkTime(x.lastLogin) : '', st.pts || 0];
        }) };
      } else if (kind === 'fleet') {
        if (!can(s, 'fleet')) throw err('perm', 'التصدير غير متاح لصلاحياتك');
        label = 'الأسطول';
        var days = Math.min(90, Math.max(7, Math.round(num(p && p.days, 30)))), from = now() - days * 86400000;
        var names = {}; store.all('Traders').forEach(function (x) { names[x.id] = x.name; });
        var offBy = {}; store.all('FleetAlerts').forEach(function (a) { if (Number(a.ts) >= from && a.type === 'off_route') offBy[a.routeId] = (offBy[a.routeId] || 0) + 1; });
        var sosBy = {}; store.all('FleetAlerts').forEach(function (a) { if (Number(a.ts) >= from && a.type === 'emergency') sosBy[a.routeId] = (sosBy[a.routeId] || 0) + 1; });
        out = { head: ['الخط', 'التاجر', 'الحالة', 'بدأت', 'انتهت', 'المدة بالدقيقة', 'تنبيهات الخروج عن الخط', 'تنبيهات الطوارئ'], rows: store.all('FleetRoutes').filter(function (r) { return Number(r.createdTs) >= from || Number(r.startedTs) >= from; }).slice(0, EXPORT_MAX).map(function (r) {
          var mins = r.status === 'done' && Number(r.endedTs) > Number(r.startedTs) ? Math.round((Number(r.endedTs) - Number(r.startedTs)) / 60000) : '';
          return [r.title, names[r.traderId] || '', r.status, Number(r.startedTs) ? dkTime(r.startedTs) : '', Number(r.endedTs) ? dkTime(r.endedTs) : '', mins, offBy[r.id] || 0, sosBy[r.id] || 0];
        }) };
      } else if (kind === 'audit') {
        needOps(s); label = 'سجل-التدقيق';
        out = { head: ['التاريخ والوقت', 'الموظف', 'الإجراء', 'الهدف', 'تفاصيل'], rows: store.all('AuditLog').slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, EXPORT_MAX).map(function (x) { return [dkTime(x.ts), x.staffName, x.action, x.target, x.detail]; }) };
      } else if (kind === 'errors') {
        needOps(s); label = 'الأخطاء';
        out = { head: ['آخر حدوث', 'أول حدوث', 'عدد المرات', 'الموضع', 'الرسالة'], rows: store.all('ErrLog').slice().sort(function (a, b) { return b.lastTs - a.lastTs; }).slice(0, EXPORT_MAX).map(function (x) { return [dkTime(x.lastTs), dkTime(x.firstTs), x.count, x.where, x.msg]; }) };
      } else if (kind === 'report') {
        if (!can(s, 'report')) throw err('perm', 'التقرير غير متاح لصلاحياتك');
        label = 'التقرير-الأسبوعي';
        var rows = ctx.reportRows();
        out = { head: ['القسم', 'المؤشر', 'هذا الأسبوع', 'الأسبوع السابق', 'الوحدة'], rows: rows.map(function (r) { return [r[0], r[1], r[2] === null ? '' : r[2], r[3] === null || r[3] === undefined ? '' : r[3], r[4] || '']; }) };
      } else throw err('kind', 'نوع التصدير غير معروف');
      audit(s, 'export', kind, { rows: out.rows.length });
      return { filename: 'شريك-الدفاع-' + label + '-' + dk + '.csv', csv: csvOf(out.head, out.rows), count: out.rows.length };
    }

    /* ---------- حدّ معدل الطلبات لكل مستخدم في الدقيقة (يتطلب CacheService؛ بدونه لا يُطبَّق) ---------- */
    function rateOk(sub) {
      var cache = env.cache;
      if (!cache || !cache.get || !cache.put) return true;
      var k = 'rl:' + trim(sub, 40) + ':' + Math.floor(now() / 60000);
      try { var n = Number(cache.get(k)) || 0; if (n >= RATE_MAX) return false; cache.put(k, String(n + 1), 90); }
      catch (e) { return true; }
      return true;
    }
    /* تخزين مؤقت للقراءات الثقيلة (لوحة المؤشرات، إحصاءات الأسطول). يُعاد الحساب بعد انتهاء المدة */
    function memo(key, ttl, fn) {
      var cache = env.cache;
      if (cache && cache.get) { try { var hit = cache.get(key); if (hit) return JSON.parse(hit); } catch (e) { /* ignore */ } }
      var v = fn();
      if (cache && cache.put) { try { var js = JSON.stringify(v); if (js.length < 90000) cache.put(key, js, ttl); } catch (e2) { /* ignore */ } }
      return v;
    }

    var STAFF = {
      sErrors: sErrors, sErrorsClear: sErrorsClear, sHealth: sHealth, sBackupNow: sBackupNow, sBackups: sBackups, sAudit: sAudit,
      sFleetStats: sFleetStats, sExport: sExport, sDeletedTraders: sDeletedTraders, sTraderRestore: sTraderRestore
    };
    return { audit: audit, recordErr: recordErr, rateOk: rateOk, memo: memo, healthRun: healthRun, backupRun: backupRun, purgePings: purgePings, tick: tickOps, fleetWindow: fleetWindow, STAFF: STAFF };
  };
})(C3A);
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
/* ============================================================
   الجزء 6: بيانات تجريبية (للنسخة التجريبية ولاختبار الأداء). أسماء وأرقام وهمية.
   ============================================================ */
(function (C) {
  'use strict';
  var U = C.U, L = C.L;

  function seedFarms(store, now, withStatus) {
    var n = C.CONFIG.farms;
    for (var i = 1; i <= n; i++) {
      var st = '', ts = 0, note = '';
      if (withStatus) {
        st = i <= 4 ? 'ready' : i === 5 ? 'limited' : i === 6 ? 'closed' : i <= 8 ? 'ready' : '';
        ts = st ? now - (i % 4) * 3600000 : 0;
        note = i === 5 ? 'تحميل بعد الثانية ظهرًا' : i === 6 ? 'تطهير عنبر' : '';
      }
      store.insert('Farms', { id: String(i), name: 'مزرعة ' + i, status: st, note: note, ts: ts, by: '' });
    }
  }

  /* أسعار «السوق النهاردة» التجريبية: أرقام وهمية لتجربة الشاشة فقط */
  function seedMarket(store, now) {
    var DAY = 86400000, HR = 3600000, dk0 = U.dateKey(now);
    if (!store.count('MarketItems')) C.MARKET_ITEMS.forEach(function (it) {
      store.insert('MarketItems', { id: it.id, name: it.name, short: it.short, unit: it.unit, dec: it.dec, order: it.order, main: it.main, hidden: 0 });
    });
    var series = {   // الأقدم ← اليوم (14 يومًا)
      broiler: [66, 66, 67, 68, 67, 66.5, 67, 69, 70, 70, 71, 70.5, 71, 72],
      chick: [27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 31, 31, 32],
      hatch: [8.5, 8.5, 8.5, 9, 9, 9, 9, 9.5, 9.5, 9.5, 9.5, 10, 10, 10],
      table: [118, 118, 120, 120, 122, 122, 122, 125, 125, 128, 128, 130, 130, 132]
    };
    var notes = { 0: 'أسعار تجريبية للعرض فقط. هنا هتظهر ملاحظة اليوم من فريق الأمن الحيوي.', 2: 'تعديل بسيط في سعر الفراخ مع زيادة الطلب.' };
    for (var k = 13; k >= 0; k--) {
      if (k === 4) continue;   // يوم بلا نشر ليظهر الفراغ في السجل
      var pr = {}, i = 13 - k;
      Object.keys(series).forEach(function (id) { pr[id] = series[id][i]; });
      store.insert('MarketDay', { dk: U.addDays(dk0, -k), prices: JSON.stringify(pr), note: notes[k] || '', by: 'S-03', ts: now - k * DAY - 2 * HR });
    }
  }

  function seedStaffRow(store, env, id, name, title, role, farm, phone, pin, email) {
    var salt = env.randHex(8);
    store.insert('Staff', { id: id, name: name, title: title, role: role, farmId: farm, phone: phone, email: email || '', pinHash: U.hashPin(pin, salt, env.secret()), salt: salt, active: 1, fails: 0, lockUntil: 0 });
  }

  /* يملأ جداول فارغة ببيانات عرض واقعية. كلها وهمية. */
  function seedDemo(store, env) {
    var now = env.now(), DAY = 86400000, HR = 3600000;
    var dk0 = U.dateKey(now);
    seedFarms(store, now, true);
    seedMarket(store, now);
    seedStaffRow(store, env, 'S-01', 'موظف تجريبي ١', 'معاون مزرعة 5', 'assistant', '5', '01000000001', '1234');
    seedStaffRow(store, env, 'S-02', 'موظف تجريبي ٢', 'معاون مزرعة 4', 'assistant', '4', '01000000002', '1234');
    seedStaffRow(store, env, 'S-03', 'موظف تجريبي ٣', 'مشرف الأمن الحيوي', 'supervisor', '', '01000000003', '1234');
    seedStaffRow(store, env, 'S-04', 'موظف تجريبي ٤', 'مدير إدارة الأمن الحيوي', 'manager', '', '01000000004', '1234');
    seedStaffRow(store, env, 'S-05', 'موظف تجريبي ٥', 'مسؤول النظام', 'admin', '', '01000000005', '1234');

    function trader(id, code, name, phone, plate, company, farm, createdAgo) {
      var salt = env.randHex(8), created = now - createdAgo * DAY;
      var st = L.newState(created);
      var row = store.insert('Traders', { id: id, code: code, name: name, phone: phone, pinHash: U.hashPin('1234', salt, env.secret()), salt: salt, plate: U.normPlate(plate), company: company, farmId: farm, status: 'active', created: created, lastLogin: now, fails: 0, lockUntil: 0, state: '', mizan: '' });
      return { row: row, st: st };
    }
    function finish(t) { t.row.state = JSON.stringify(t.st); }
    function daysPattern(st, from, to, skipMod) {
      for (var d = from; d <= to; d++) {
        if (d % 7 === skipMod || d % 7 === (skipMod + 3) % 7) continue;
        L.markActive(st, U.addDays(dk0, -d));
      }
    }
    function onboard(st, ts) {
      st.videos.launch = ts; st.charter = ts; st.baseline = { score: 5, total: 9, ts: ts };
    }
    function gateRow(gid, ts, tid, farm, staff, pass, wait) {
      var checks = { hands: true, disinfect: true, vehicle: true, shoes: true };
      if (pass < 4) checks.shoes = false;
      if (pass < 3) checks.hands = false;
      var gs = L.gateScore(checks);
      store.insert('Gate', { id: gid, ts: ts, traderId: tid, farmId: farm, staffId: staff, checks: JSON.stringify(checks), pass: gs.pass, clean: gs.clean ? 1 : 0, violation: gs.violation ? 1 : 0, waitMin: wait, note: '', points: L.gatePoints(gs, C.CONFIG) });
    }

    /* أ: شريك منتظم (رتبة 2) */
    var A = trader('TR-0001', 'A7K2', 'محمود السيد (تجريبي)', '01100000001', '1234 أ ب ج', 'تجارة الواحات', '5', 30);
    onboard(A.st, now - 28 * DAY); daysPattern(A.st, 1, 24, 0);
    A.st.pts = 410; A.st.rankMax = 2; A.st.stats = { games: 9, perfect: 1, rounds: 18 };
    A.st.gate = { visits: 4, clean: 3, cleanRun: 2, viol: 0, lastTs: now - 2 * DAY, lastViolTs: 0, last: { ts: now - 2 * DAY, pass: 4, clean: true, violation: false }, perDay: {} };
    A.st.honor = 1; A.st.cards = { c1: 1, c2: 1, c4: 1 }; A.st.mizan = now - 10 * DAY;
    A.row.mizan = JSON.stringify({ birds: 30000, kg: 2, price: 60, margin: 3, dayCost: 2000, lostDays: 2, share: 30 });
    finish(A);
    /* ب: شريك واعٍ (رتبة 1) */
    var B = trader('TR-0002', 'B4M9', 'عمرو فتحي (تجريبي)', '01100000002', '5678 س ع د', '', '4', 9);
    onboard(B.st, now - 8 * DAY); daysPattern(B.st, 1, 6, 2); B.st.pts = 120; B.st.rankMax = 1; finish(B);
    /* ج: شريك موثوق (رتبة 3) بسلسلة 8 أسابيع */
    var Cc = trader('TR-0003', 'C8P3', 'عبد الله حسن (تجريبي)', '01100000003', '9012 ح م ن', 'نقل الدواجن', '5', 75);
    onboard(Cc.st, now - 72 * DAY); daysPattern(Cc.st, 1, 66, 9);
    Cc.st.pts = 920; Cc.st.rankMax = 3; Cc.st.honor = 1; Cc.st.stats = { games: 40, perfect: 6, rounds: 55 };
    Cc.st.gate = { visits: 12, clean: 10, cleanRun: 6, viol: 0, lastTs: now - 1 * DAY, lastViolTs: 0, last: { ts: now - 1 * DAY, pass: 4, clean: true, violation: false }, perDay: {} };
    Cc.st.videos.virus = now - 60 * DAY; Cc.st.invites = { done: 1, clean: 1 };
    Cc.st.baseline = { score: 6, total: 9, ts: now - 72 * DAY }; Cc.st.followup = { score: 8, total: 9, ts: now - 40 * DAY };
    finish(Cc);
    /* د: جديد تمامًا (رتبة 0) */
    var D = trader('TR-0004', 'D5R6', 'إبراهيم رضا (تجريبي)', '01100000004', '3456 ك ل م', '', '', 1);
    finish(D);

    /* زيارات البوابة */
    var g = 0;
    [[1, 'TR-0003', '5', 'S-01', 4, 12], [2, 'TR-0001', '5', 'S-01', 4, 25], [3, 'TR-0003', '4', 'S-02', 4, 10], [5, 'TR-0001', '5', 'S-01', 3, 35],
      [6, 'TR-0003', '5', 'S-01', 4, 15], [9, 'TR-0001', '5', 'S-01', 4, 40], [12, 'TR-0003', '4', 'S-02', 2, 20], [15, 'TR-0003', '5', 'S-01', 4, 18]].forEach(function (x) {
      g++; gateRow('G-' + ('0000' + g).slice(-5), now - x[0] * DAY, x[1], x[2], x[3], x[4], x[5]);
    });

    /* رسائل */
    var m = 0;
    function msg(tid, ts, from, staff, text) { m++; store.insert('TicketMsgs', { id: 'M-' + ('00000' + m).slice(-5), ticketId: tid, ts: ts, from: from, staffId: staff, text: text }); }
    store.insert('Tickets', { id: 'T-0001', ts: now - 26 * HR, traderId: 'TR-0003', farmId: '5', type: 'obstacle', subject: 'انتظار طويل عند بوابة المزرعة 5', status: 'answered', level: 1, lastTs: now - 22 * HR, firstReplyTs: now - 22 * HR, resolvedTs: 0, stars: 0, unreadTrader: 1, unreadStaff: 0, lastStaffId: 'S-01', accepted: 0 });
    msg('T-0001', now - 26 * HR, 'trader', '', 'استنيت قرابة ساعة ونص عند البوابة قبل ما العربية تدخل التحميل. ممكن نعمل ميعاد مسبق؟');
    msg('T-0001', now - 22 * HR, 'staff', 'S-01', 'شكرًا لتنبيهك. رتبنا دور أسرع للعربيات اللي سجلها نظيف. لو حصل تأخير تاني ابعتلنا الوقت.');
    store.insert('Tickets', { id: 'T-0002', ts: now - 3 * HR, traderId: 'TR-0001', farmId: '5', type: 'urgent', subject: 'اشتباه نفوق في دفعة اشتريتها', status: 'open', level: 0, lastTs: now - 3 * HR, firstReplyTs: 0, resolvedTs: 0, stars: 0, unreadTrader: 0, unreadStaff: 1, lastStaffId: '', accepted: 0 });
    msg('T-0002', now - 3 * HR, 'trader', '', 'الدفعة اللي استلمتها الصبح فيها نفوق ملحوظ في الطريق وفيه كام طائر مش بياكل.');
    store.insert('Tickets', { id: 'T-0003', ts: now - 5 * DAY, traderId: 'TR-0002', farmId: '4', type: 'suggestion', subject: 'مواعيد حجز للتحميل من التطبيق', status: 'answered', level: 0, lastTs: now - 4 * DAY, firstReplyTs: now - 4 * DAY, resolvedTs: 0, stars: 0, unreadTrader: 1, unreadStaff: 0, lastStaffId: 'S-03', accepted: 0 });
    msg('T-0003', now - 5 * DAY, 'trader', '', 'يا ريت نقدر نحجز ميعاد التحميل من التطبيق قبلها بيوم.');
    msg('T-0003', now - 4 * DAY, 'staff', 'S-03', 'اقتراح ممتاز، رفعناه لإدارة التشغيل للدراسة.');
    store.insert('Tickets', { id: 'T-0004', ts: now - 9 * DAY, traderId: 'TR-0003', farmId: '4', type: 'inquiry', subject: 'مدة صلاحية المطهر في حوض العجل', status: 'resolved', level: 0, lastTs: now - 9 * DAY + 3 * HR, firstReplyTs: now - 9 * DAY + 3 * HR, resolvedTs: now - 9 * DAY + 3 * HR, stars: 5, unreadTrader: 0, unreadStaff: 0, lastStaffId: 'S-02', accepted: 0 });
    msg('T-0004', now - 9 * DAY, 'trader', '', 'كل قد إيه بيتغير المطهر في حوض العجل؟');
    msg('T-0004', now - 9 * DAY + 3 * HR, 'staff', 'S-02', 'بيتغير حسب تعليمات العبوة وعدد العربيات، وغالبًا يوميًا. المعاون بيقيس التركيز قبل الشغل.');

    /* مكافآت وعدادات */
    store.insert('Rewards', { id: 'R-0001', ts: now - 3 * DAY, traderId: 'TR-0003', rewardId: 'kit', status: 'requested', decidedBy: '', decidedTs: 0, note: '' });
    [['id:TR', 4], ['id:T', 4], ['id:M', m], ['id:G', g], ['id:R', 1]].forEach(function (c) { store.insert('Counters', { key: c[0], value: c[1] }); });
    store.insert('Counters', { key: 'rounds:' + U.weekStart(dk0), value: 120 });
    return true;
  }

  C.seedDemo = seedDemo;
  C.seedFarms = seedFarms;
  C.seedMarket = seedMarket;
  C.seedStaffRow = seedStaffRow;
})(C3A);
;if (typeof module!=='undefined') module.exports = C3A;
