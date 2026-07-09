package com.guber.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground service that:
 *   (a) Shows the required persistent status-bar notification while the worker
 *       is sharing their live location for an active task.
 *   (b) Runs a native FusedLocationProviderClient GPS listener that posts
 *       location batches directly to the server — independently of the WebView
 *       JavaScript layer. This guarantees tracking continues even when the screen
 *       locks and Android throttles WebView JS execution on Samsung/Xiaomi/etc.
 *
 * The JS layer passes a jobId and short-lived Bearer token (from
 * POST /api/auth/bg-location-token) so the service can authenticate with the
 * server without relying on the WebView's session cookie.
 */
public class GuberTrackingService extends Service {

    public static final String ACTION_START     = "com.guber.app.tracking.START";
    public static final String ACTION_STOP      = "com.guber.app.tracking.STOP";
    public static final String EXTRA_TITLE      = "title";
    public static final String EXTRA_TEXT       = "text";
    public static final String EXTRA_JOB_ID     = "job_id";
    public static final String EXTRA_AUTH_TOKEN = "auth_token";
    /** Optional: override the default /api/jobs/{id}/location-batch path. */
    public static final String EXTRA_BATCH_PATH = "batch_path";

    private static final String CHANNEL_ID      = "guber_tracking";
    private static final int    NOTIFICATION_ID = 4711;
    private static final String SERVER_BASE     = "https://guberapp.app";

    private static final long  LOCATION_INTERVAL_MS = 10_000L;
    private static final float MIN_DISPLACEMENT_M   = 20f;
    // Relaxed from 80 m to 2 000 m so the service accepts the coarse cell-tower
    // fixes it receives during GPS warm-up (typically 100-500 m accuracy).
    // Fused Location quickly converges to GPS-accurate fixes (< 20 m) once the
    // radio has a clear sky view; the server stores all points for audit purposes.
    private static final float MAX_ACCURACY_M       = 2000f;
    private static final long  FLUSH_INTERVAL_MS    = 30_000L;
    private static final int   FLUSH_MIN_POINTS     = 5;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback            locationCallback;
    private HandlerThread               handlerThread;
    private Handler                     flushHandler;
    private ExecutorService             httpExecutor;

    private int    activeJobId = -1;
    private String authToken   = null;
    private String batchPath   = null; // null → use default /api/jobs/{id}/location-batch

    private final List<double[]> locationQueue = new ArrayList<>();

    private final Runnable flushRunnable = new Runnable() {
        @Override public void run() {
            flushQueue();
            if (flushHandler != null) flushHandler.postDelayed(this, FLUSH_INTERVAL_MS);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopTracking();
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null
                ? intent.getStringExtra(EXTRA_TITLE) : "GUBER";
        String text  = intent != null && intent.getStringExtra(EXTRA_TEXT) != null
                ? intent.getStringExtra(EXTRA_TEXT)
                : "Sharing your live location for an active task.";

        createChannel();
        Notification notification = buildNotification(title, text);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        int    jobId = intent != null ? intent.getIntExtra(EXTRA_JOB_ID, -1) : -1;
        String token = intent != null ? intent.getStringExtra(EXTRA_AUTH_TOKEN) : null;
        String path  = intent != null ? intent.getStringExtra(EXTRA_BATCH_PATH) : null;
        if (jobId > 0 && token != null && !token.isEmpty()) {
            startTracking(jobId, token, path);
        }

        return START_STICKY;
    }

    private void startTracking(int jobId, String token, String path) {
        stopTracking();

        activeJobId = jobId;
        authToken   = token;
        batchPath   = (path != null && !path.isEmpty()) ? path : null;
        synchronized (locationQueue) { locationQueue.clear(); }

        handlerThread = new HandlerThread("GuberLocationThread");
        handlerThread.start();
        flushHandler = new Handler(handlerThread.getLooper());
        httpExecutor = Executors.newSingleThreadExecutor();

        fusedClient = LocationServices.getFusedLocationProviderClient(this);

        LocationRequest request = new LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS)
                .setMinUpdateDistanceMeters(MIN_DISPLACEMENT_M)
                .setWaitForAccurateLocation(false)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null) return;
                for (Location loc : result.getLocations()) {
                    if (loc.getAccuracy() > MAX_ACCURACY_M) continue;
                    synchronized (locationQueue) {
                        locationQueue.add(new double[]{
                                loc.getLatitude(), loc.getLongitude(), (double) loc.getTime()
                        });
                    }
                    if (locationQueue.size() >= FLUSH_MIN_POINTS) flushQueue();
                }
            }
        };

        try {
            fusedClient.requestLocationUpdates(request, locationCallback,
                    handlerThread.getLooper());
            flushHandler.postDelayed(flushRunnable, FLUSH_INTERVAL_MS);
        } catch (SecurityException e) {
            // Permission not granted at the OS level — native GPS unavailable,
            // but the foreground service still keeps the process alive so the
            // WebView's JS watch can continue while the screen is on.
        }
    }

    private void stopTracking() {
        if (fusedClient != null && locationCallback != null) {
            try { fusedClient.removeLocationUpdates(locationCallback); } catch (Exception ignored) {}
        }
        if (flushHandler != null) {
            flushHandler.removeCallbacks(flushRunnable);
        }
        flushQueue();
        if (httpExecutor != null && !httpExecutor.isShutdown()) {
            httpExecutor.shutdown();
        }
        fusedClient      = null;
        locationCallback = null;
        activeJobId      = -1;
        authToken        = null;
        batchPath        = null;
    }

    private void flushQueue() {
        List<double[]> snapshot;
        synchronized (locationQueue) {
            if (locationQueue.isEmpty()) return;
            snapshot = new ArrayList<>(locationQueue);
            locationQueue.clear();
        }
        final int    jobId = activeJobId;
        final String token = authToken;
        if (jobId <= 0 || token == null) return;
        if (httpExecutor == null || httpExecutor.isShutdown()) return;
        final List<double[]> points = snapshot;
        httpExecutor.execute(() -> postLocationBatch(jobId, token, points));
    }

    private void postLocationBatch(int jobId, String token, List<double[]> points) {
        try {
            JSONArray arr = new JSONArray();
            for (double[] p : points) {
                JSONObject o = new JSONObject();
                o.put("lat", p[0]);
                o.put("lng", p[1]);
                o.put("ts",  (long) p[2]);
                arr.put(o);
            }
            JSONObject body = new JSONObject();
            body.put("points", arr);

            byte[]            bodyBytes = body.toString().getBytes("UTF-8");
            // Use override path if provided (e.g. load board uses /api/load-board/:id/location-batch);
            // otherwise fall back to the regular jobs endpoint.
            String resolvedPath = (batchPath != null) ? batchPath : "/api/jobs/" + jobId + "/location-batch";
            URL               url       = new URL(SERVER_BASE + resolvedPath);
            HttpURLConnection conn      = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(bodyBytes.length);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyBytes);
            }

            int code = conn.getResponseCode();
            if (code == 401 || code == 403 || code == 404) {
                // Server says this job is done or the token expired — stop posting.
                authToken = null;
            }
            conn.disconnect();
        } catch (Exception ignored) {
            // Network error — points are lost but non-critical.
            // The JS layer's own flush timer will catch any remaining queue.
        }
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
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "Live task tracking", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription(
                        "Shows while GUBER is sharing your live location for an active task.");
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
        stopTracking();
        if (handlerThread != null) handlerThread.quit();
        stopForegroundCompat();
        super.onDestroy();
    }

    @Nullable @Override
    public IBinder onBind(Intent intent) { return null; }
}
