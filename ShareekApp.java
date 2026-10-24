package com.cairo3a.shareek;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/** ينشئ قنوات الإشعارات مرة واحدة. قناة الطوارئ عالية الأهمية بصوت وتنبيه يظهر فوق الشاشة. */
public class ShareekApp extends Application {
    public static final String CH_SOS = "sos_alerts";
    public static final String CH_GENERAL = "general";
    public static final String CH_TRACKING = "tracking";

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel sos = new NotificationChannel(CH_SOS, "طوارئ الأسطول", NotificationManager.IMPORTANCE_HIGH);
        sos.setDescription("حالات الطوارئ وخروج التجار عن خط السير");
        sos.enableVibration(true);
        sos.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 800});
        sos.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        sos.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(sos);

        NotificationChannel general = new NotificationChannel(CH_GENERAL, "إشعارات عامة", NotificationManager.IMPORTANCE_DEFAULT);
        general.setDescription("الرسائل والتذكيرات والتحديثات");
        nm.createNotificationChannel(general);

        NotificationChannel tracking = new NotificationChannel(CH_TRACKING, "متابعة الرحلة", NotificationManager.IMPORTANCE_LOW);
        tracking.setDescription("تُظهر أن الموقع يُرسل أثناء الرحلة");
        nm.createNotificationChannel(tracking);
    }

    /** تخزين صغير خاص بالتطبيق: رمز الإشعارات، ورمز الرحلة الجارية ورابط الخادم */
    static android.content.SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("shareek", Context.MODE_PRIVATE);
    }
}
