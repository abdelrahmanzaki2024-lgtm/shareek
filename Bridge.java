package com.cairo3a.shareek;

import android.content.Context;
import android.webkit.JavascriptInterface;

/**
 * الجسر بين الصفحة والتطبيق الأصلي: window.ShareekNative.
 * الصفحة تطلب رمز الإشعارات، وتشغّل تتبّع الرحلة في الخلفية حتى والشاشة مقفولة.
 */
public class Bridge {
    private final Context ctx;
    private final SecureStore secure;

    Bridge(Context c) { this.ctx = c; this.secure = new SecureStore(c); }

    /** يحفظ رمزًا في Android Keystore. القيمة الفارغة تحذفه. */
    @JavascriptInterface
    public void saveSecret(String name, String value) {
        try { secure.save(name, value); } catch (Exception e) { /* الصفحة تستخدم التشفير بالمتصفح عند الفشل */ }
    }

    /** يرجع الرمز المحفوظ أو نصًا فارغًا. */
    @JavascriptInterface
    public String readSecret(String name) {
        try { String v = secure.read(name); return v == null ? "" : v; } catch (Exception e) { return ""; }
    }

    @JavascriptInterface
    public String fcmToken() {
        return ShareekApp.prefs(ctx).getString("push_token", "");
    }

    /** يبدأ تتبّع الموقع للرحلة (رمز الخط) مع رابط الخادم. يعيد false إن لم تُمنح صلاحية الموقع */
    @JavascriptInterface
    public boolean startTracking(String routeToken, String apiUrl) {
        if (routeToken == null || routeToken.length() < 16 || apiUrl == null || !apiUrl.startsWith("https://")) return false;
        // بدون صلاحية الموقع لا تُشغَّل الخدمة الأمامية (تنهار على أندرويد الحديث)
        if (ctx.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
        TrackingService.start(ctx, routeToken, apiUrl);
        return true;
    }

    @JavascriptInterface
    public void stopTracking() {
        TrackingService.stop(ctx);
    }

    @JavascriptInterface
    public boolean isTracking() {
        return TrackingService.running;
    }
}
