package com.guber.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Foreground service that keeps a persistent status-bar notification visible
 * while GUBER is sharing the worker's live location for an active task.
 *
 * This service is intentionally NOT a background-location collector: the GPS
 * watch itself runs in the web/JS layer via @capacitor/geolocation while the
 * app is in the foreground. The service exists to (a) show the user-visible
 * ongoing notification Android requires for location use, and (b) keep the
 * process alive so an active task isn't silently dropped. It is started and
 * stopped explicitly by the JS tracking service — never on its own.
 */
public class GuberTrackingService extends Service {
    public static final String ACTION_START = "com.guber.app.tracking.START";
    public static final String ACTION_STOP = "com.guber.app.tracking.STOP";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_TEXT = "text";

    private static final String CHANNEL_ID = "guber_tracking";
    private static final int NOTIFICATION_ID = 4711;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null
                ? intent.getStringExtra(EXTRA_TITLE) : "GUBER";
        String text = intent != null && intent.getStringExtra(EXTRA_TEXT) != null
                ? intent.getStringExtra(EXTRA_TEXT)
                : "Sharing your live location for an active task.";

        createChannel();
        Notification notification = buildNotification(title, text);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // START_STICKY: if the OS kills us under memory pressure, recreate the
        // service so the persistent notification (and the location-use
        // justification it represents) returns alongside the app.
        return START_STICKY;
    }

    private Notification buildNotification(String title, String text) {
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launch, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(contentIntent)
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Live task tracking",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Shows while GUBER is sharing your live location for an active task.");
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            //noinspection deprecation
            stopForeground(true);
        }
    }

    @Override
    public void onDestroy() {
        stopForegroundCompat();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
