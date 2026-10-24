package com.cairo3a.shareek;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * يستقبل إشعارات Firebase. والتطبيق مقفول يعرضها النظام نفسه من حمولة notification،
 * وهذه الخدمة تعمل حين يكون التطبيق مفتوحًا أو في الخلفية ومعها بيانات (data).
 */
public class PushService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        ShareekApp.prefs(this).edit().putString("push_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        String title = d.get("title");
        String body = d.get("body");
        if (title == null && msg.getNotification() != null) title = msg.getNotification().getTitle();
        if (body == null && msg.getNotification() != null) body = msg.getNotification().getBody();
        if (title == null) title = getString(R.string.app_name);
        if (body == null) body = "";

        boolean urgent = "1".equals(d.get("urgent")) || "alert_sos".equals(d.get("kind"));
        String channel = urgent ? ShareekApp.CH_SOS : ShareekApp.CH_GENERAL;

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder nb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, channel)
                : new Notification.Builder(this);
        nb.setSmallIcon(R.drawable.ic_notify)
          .setContentTitle(title)
          .setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body))
          .setAutoCancel(true)
          .setContentIntent(pi);
        if (urgent && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) nb.setPriority(Notification.PRIORITY_MAX);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            String tag = d.get("routeId") != null ? d.get("routeId") : "general";
            nm.notify(tag, urgent ? 1001 : 1002, nb.build());
        }
    }
}
