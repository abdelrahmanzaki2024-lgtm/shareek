/* عامل الخدمة: يخزّن الواجهة ليفتح التطبيق المثبّت حتى مع ضعف الإنترنت.
   بيانات التجار والأسعار لا تُخزَّن أبدًا: طلبات الخادم كلها POST ولا يتدخل فيها العامل. */
const CACHE = 'c3a-shareek-0971e9db';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  /* الشبكة أولًا حتى تصل التحديثات، ثم النسخة المخزّنة عند انقطاع الإنترنت */
  e.respondWith(fetch(req)
    .then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; })
    .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});

/* إشعارات الدفع: تظهر على الموبايل والتطبيق مقفول أو مفتوح.
   الحمولة من خادم الإرسال (push.relayUrl): { title, body, data:{kind, routeId, alertId}, priority }.
   لا يُرسل داخل الإشعار أي رقم تليفون أو رمز خط السير. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const data = d.data || {};
  const urgent = data.kind === 'alert_sos' || d.priority === 'high';
  const title = String(d.title || 'شريك الدفاع').slice(0, 120);
  const opts = {
    body: String(d.body || '').slice(0, 300),
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.routeId ? 'route-' + String(data.routeId).slice(0, 40) : 'c3a-general',
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [400, 150, 400, 150, 400] : [200, 100, 200],
    data: { url: './' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow('./');
  }));
});
