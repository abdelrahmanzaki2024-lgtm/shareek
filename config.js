/* إعداد الربط بالخادم: مضبوط مسبقًا على رابط تطبيق الويب (Apps Script).
   لا تغيّره إلا عند نشر نسخة خادم جديدة برابط مختلف (Deploy > Manage deployments). */
window.__API_URL = 'https://script.google.com/macros/s/AKfycbylXDoZenlsSS-dGp8IqpiGnsY0PAMGuYwvRS88xUooJk0i3WPmKrKv20N--HsDeRep/exec';

/* إشعارات الويب (Firebase Cloud Messaging) اختيارية: تبقى null حتى تُضبط.
   عند الضبط ضع هنا إعداد تطبيق الويب من Firebase Console (Project settings ← Your apps ← Web app)
   مع مفتاح VAPID من Cloud Messaging ← Web Push certificates. هذه القيم عامة وليست سرية.
   مثال: { apiKey: "...", authDomain: "...", projectId: "...", messagingSenderId: "...", appId: "...", vapidKey: "..." } */
window.__FCM_WEB = null;
