package com.cairo3a.shareek;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * خدمة أمامية تتبّع موقع السائق أثناء الرحلة وتُرسل كل ~20 ثانية إلى الخادم نفسه الذي تستخدمه الصفحة
 * (action = routePing). تعمل والشاشة مقفولة، وتتوقف عند انتهاء الرحلة أو رفض الخادم للرمز.
 * الإرسال عبر واجهة الخادم نفسها، فلا تُحفظ أي بيانات جديدة في الهاتف.
 */
public class TrackingService extends Service {
    static volatile boolean running = false;
    private static final int NOTIF_ID = 4242;
    private static final long INTERVAL_MS = 20000L;

    private FusedLocationProviderClient fused;
    private LocationCallback callback;
    private String routeToken = "";
    private String apiUrl = "";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    static void start(Context c, String token, String api) {
        Intent i = new Intent(c, TrackingService.class).putExtra("t", token).putExtra("a", api);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i);
        else c.startService(i);
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, TrackingService.class));
    }

    @Override
    public int onStartCommand(Intent in, int flags, int startId) {
        if (in != null && in.hasExtra("t")) {
            routeToken = in.getStringExtra("t");
            apiUrl = in.getStringExtra("a");
            ShareekApp.prefs(this).edit().putString("route_token", routeToken).putString("api_url", apiUrl).apply();
        } else {
            routeToken = ShareekApp.prefs(this).getString("route_token", "");
            apiUrl = ShareekApp.prefs(this).getString("api_url", "");
        }
        if (routeToken == null || routeToken.isEmpty() || apiUrl == null || apiUrl.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(NOTIF_ID, buildNotification());
        running = true;
        startUpdates();
        return START_STICKY;
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder nb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, ShareekApp.CH_TRACKING)
                : new Notification.Builder(this);
        return nb.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("الرحلة شغالة")
                .setContentText("الموقع بيتبعت للإدارة للأمان. اضغط للتطبيق.")
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    private void startUpdates() {
        if (fused != null) return;
        fused = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
                .setMinUpdateIntervalMillis(10000L)
                .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location l = result.getLastLocation();
                if (l != null) send(l);
            }
        };
        try {
            fused.requestLocationUpdates(req, callback, Looper.getMainLooper());
        } catch (SecurityException e) {
            stopSelf();
        }
    }

    private void send(Location l) {
        final String token = routeToken, api = apiUrl;
        final double lat = l.getLatitude(), lng = l.getLongitude();
        final float acc = l.getAccuracy();
        io.execute(() -> {
            try {
                JSONObject p = new JSONObject();
                p.put("lat", lat);
                p.put("lng", lng);
                p.put("acc", acc);
                JSONObject body = new JSONObject();
                body.put("action", "routePing");
                body.put("token", token);
                body.put("payload", p.toString());

                HttpURLConnection c = (HttpURLConnection) new URL(api).openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(15000);
                c.setReadTimeout(20000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
                int code = c.getResponseCode();
                String reply = "";
                try (java.io.InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream()) {
                    if (is != null) {
                        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                        byte[] chunk = new byte[1024];
                        int n;
                        while ((n = is.read(chunk)) > 0) buf.write(chunk, 0, n);
                        reply = new String(buf.toByteArray(), StandardCharsets.UTF_8);
                    }
                }
                c.disconnect();
                // الخادم يرفض الرمز بعد انتهاء الرحلة أو إلغاء الخط: نوقف التتبّع
                if (reply.contains("\"err\":\"auth\"") || reply.contains("\"err\":\"state\"")) {
                    stopTrackingFromWorker();
                }
            } catch (Exception ignored) {
                // انقطاع مؤقت للإنترنت: الموقع التالي يُرسل بعد 20 ثانية
            }
        });
    }

    private void stopTrackingFromWorker() {
        new android.os.Handler(Looper.getMainLooper()).post(this::stopSelf);
    }

    @Override
    public void onDestroy() {
        running = false;
        if (fused != null && callback != null) fused.removeLocationUpdates(callback);
        ShareekApp.prefs(this).edit().remove("route_token").remove("api_url").apply();
        io.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
