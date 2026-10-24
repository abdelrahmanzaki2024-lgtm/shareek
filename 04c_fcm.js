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
