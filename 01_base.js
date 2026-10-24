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
