package com.cairo3a.shareek;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.firebase.messaging.FirebaseMessaging;

/**
 * الصفحة الرئيسية: تعرض تطبيق الويب (GitHub Pages) داخل WebView، وتفتح روابط واتساب والهاتف خارجه.
 * تطلب صلاحيات الموقع والإشعارات، وتحصل على رمز الإشعارات وتعطيه للصفحة.
 */
public class MainActivity extends Activity {
    private static final int REQ_PERMS = 77;
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings st = web.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);
        st.setGeolocationEnabled(true);
        st.setMediaPlaybackRequiresUserGesture(false);
        st.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.addJavascriptInterface(new Bridge(this), "ShareekNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, Uri uri) {
                String url = uri.toString();
                if (url.startsWith(BuildConfig.APP_URL)) return false;
                // واتساب والهاتف والخرائط تفتح في تطبيقها
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, hasLocation(), false);
            }
        });

        askPermissions();
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                ShareekApp.prefs(this).edit().putString("push_token", task.getResult()).apply();
            }
        });

        // رابط السائق من واتساب يفتح مباشرة، وإلا تفتح الصفحة الرئيسية
        Uri data = getIntent() != null ? getIntent().getData() : null;
        String start = data != null && data.toString().startsWith(BuildConfig.APP_URL) ? data.toString() : BuildConfig.APP_URL;
        web.loadUrl(start);
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void askPermissions() {
        java.util.ArrayList<String> need = new java.util.ArrayList<>();
        if (!hasLocation()) need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ_PERMS);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
        }
        super.onDestroy();
    }
}
