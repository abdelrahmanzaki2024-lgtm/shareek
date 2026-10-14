/* عامل الخدمة: يخزّن الواجهة ليفتح التطبيق المثبّت حتى مع ضعف الإنترنت.
   بيانات التجار والأسعار لا تُخزَّن أبدًا: طلبات الخادم كلها POST ولا يتدخل فيها العامل. */
const CACHE = 'c3a-shareek-5b68e3a0';
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
