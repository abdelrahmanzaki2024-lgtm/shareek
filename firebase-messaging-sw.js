/* عامل خدمة لإشعارات الويب (Firebase Cloud Messaging). يُسجَّل في نطاق فرعي (fcm/) حتى لا يتعارض مع sw.js الخاص بالتخزين المؤقت.
   لا يعمل إلا بعد ضبط window.__FCM_WEB في config.js، فالصفحة ترسل الإعداد إليه بعد التسجيل. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

var ready = false;
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'fcm-config' || ready || !d.config) return;
  try {
    firebase.initializeApp(d.config);
    var messaging = firebase.messaging();
    messaging.onBackgroundMessage(function (payload) {
      /* رسالة فيها notification يعرضها Firebase بنفسه؛ نعرض نحن فقط رسائل البيانات حتى لا يتكرر الإشعار */
      if (payload && payload.notification) return;
      var n = payload.notification || {}, data = payload.data || {};
      var title = n.title || data.title || 'شريك الدفاع';
      var opts = {
        body: n.body || data.body || '',
        icon: 'icons/icon-192.png',
        tag: data.tag || 'c3a',
        requireInteraction: data.sos === '1',
        data: { url: data.url || './' }
      };
      return self.registration.showNotification(title, opts);
    });
    ready = true;
  } catch (err) { /* إعداد غير صالح: نبقى بلا إشعارات الخلفية */ }
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.openWindow(url));
});
