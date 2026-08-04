package com.guber.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.io.PrintWriter;
import java.io.StringWriter;

public class MainActivity extends BridgeActivity {

    private static final String TAG            = "GuberNative";
    static final String PREFS_NAME     = "guber_crash_prefs";
    static final String PREF_CRASH_KEY = "last_crash";

    // Request codes — keep distinct so onRequestPermissionsResult can route correctly.
    private static final int REQUEST_CODE_RECORD_AUDIO  = 1001;
    private static final int REQUEST_CODE_LOCATION      = 1002;
    private static final int REQUEST_CODE_STARTUP_PERMS = 1003;

    /** Holds a pending WebView PermissionRequest for RESOURCE_AUDIO_CAPTURE
     *  while we wait for the Android OS permission dialog result. */
    private PermissionRequest pendingWebViewPermission;

    /** Holds a pending navigator.geolocation callback while we wait for the
     *  Android OS location permission dialog result. */
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ── 1. Install global crash logger FIRST, before anything else ────────
        installCrashLogger();

        // ── 2. Register custom plugins before super.onCreate() ────────────────
        registerPlugin(ForegroundTrackingPlugin.class);

        // ── 3. Capacitor bridge init ──────────────────────────────────────────
        super.onCreate(savedInstanceState);

        // ── 4. Log initial permission state for debugging ─────────────────────
        logPermissionStatus();

        // ── 5. Configure WebView once (NOT in onStart — that fires repeatedly) ─
        setupWebView();

        // ── 6. Only request permissions on first launch, not on config change ──
        if (savedInstanceState == null) {
            requestCriticalPermissionsIfNeeded();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Crash logger
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Installs a Thread.UncaughtExceptionHandler that:
     *   (a) Captures the full stack trace.
     *   (b) Writes it to SharedPreferences so it survives the process restart.
     *   (c) Forwards to the original handler (which triggers the OS crash dialog).
     *
     * The JS diagnostics page reads this via ForegroundTrackingPlugin.getCrashLog().
     */
    private void installCrashLogger() {
        final Thread.UncaughtExceptionHandler defaultHandler =
                Thread.getDefaultUncaughtExceptionHandler();
        final SharedPreferences prefs =
                getApplicationContext().getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                StringWriter sw = new StringWriter();
                PrintWriter  pw = new PrintWriter(sw);
                throwable.printStackTrace(pw);
                String trace = "Thread: " + thread.getName() + "\n" + sw.toString();

                Log.e(TAG, "[CRASH] " + trace);

                prefs.edit()
                     .putString(PREF_CRASH_KEY,
                             java.text.DateFormat.getDateTimeInstance().format(new java.util.Date())
                             + "\n" + trace)
                     .apply();
            } catch (Exception ignored) {
                // Never throw inside a crash handler.
            }
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WebView setup — runs ONCE in onCreate, never again
    // ─────────────────────────────────────────────────────────────────────────

    private void setupWebView() {
        try {
            android.webkit.WebView webView = getBridge().getWebView();

            // Allow WebRTC / ElevenLabs audio to play without requiring a
            // separate user gesture after mic permission has been granted.
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);

            // Replace Capacitor's default BridgeWebChromeClient with our
            // subclass that adds geolocation + mic grant forwarding.
            // Must extend BridgeWebChromeClient so Capacitor's own callbacks
            // (file picker, console.log forwarding, etc.) still work.
            webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {

                // ── getUserMedia / WebRTC microphone ─────────────────────────
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        StringBuilder resLog = new StringBuilder();
                        boolean needsAudio = false;
                        for (String resource : request.getResources()) {
                            resLog.append(resource).append(" ");
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                                needsAudio = true;
                            }
                        }
                        Log.i(TAG, "[MIC] onPermissionRequest origin=" + request.getOrigin()
                                + " resources=" + resLog.toString().trim());

                        if (!needsAudio) {
                            request.grant(request.getResources());
                            return;
                        }

                        boolean nativeGranted = ContextCompat.checkSelfPermission(
                                MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED;
                        Log.i(TAG, "[MIC] RECORD_AUDIO native=" + (nativeGranted ? "GRANTED" : "DENIED"));

                        if (nativeGranted) {
                            request.grant(request.getResources());
                        } else {
                            pendingWebViewPermission = request;
                            ActivityCompat.requestPermissions(
                                    MainActivity.this,
                                    new String[]{Manifest.permission.RECORD_AUDIO},
                                    REQUEST_CODE_RECORD_AUDIO);
                        }
                    });
                }

                // ── navigator.geolocation inside the WebView ─────────────────
                @Override
                public void onGeolocationPermissionsShowPrompt(
                        String origin, GeolocationPermissions.Callback callback) {
                    Log.i(TAG, "[GPS] onGeolocationPermissionsShowPrompt origin=" + origin);

                    boolean nativeGranted = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED;
                    Log.i(TAG, "[GPS] ACCESS_FINE_LOCATION=" + (nativeGranted ? "GRANTED" : "DENIED"));

                    if (nativeGranted) {
                        callback.invoke(origin, true, false);
                    } else {
                        pendingGeoCallback = callback;
                        pendingGeoOrigin   = origin;
                        ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                },
                                REQUEST_CODE_LOCATION);
                    }
                }

                @Override
                public void onGeolocationPermissionsHidePrompt() {
                    Log.i(TAG, "[GPS] onGeolocationPermissionsHidePrompt");
                    super.onGeolocationPermissionsHidePrompt();
                }
            });

            Log.i(TAG, "[SETUP] WebView configured successfully");
        } catch (Exception e) {
            Log.e(TAG, "[SETUP] WebView setup failed: " + e.getMessage(), e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Permission result routing
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        for (int i = 0; i < permissions.length; i++) {
            Log.i(TAG, "[PERM] code=" + requestCode
                    + " perm=" + permissions[i]
                    + " result=" + (grantResults.length > i
                            && grantResults[i] == PackageManager.PERMISSION_GRANTED
                            ? "GRANTED" : "DENIED"));
        }

        // ── Microphone (from WebView getUserMedia flow) ───────────────────────
        if (requestCode == REQUEST_CODE_RECORD_AUDIO && pendingWebViewPermission != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.i(TAG, "[MIC] RECORD_AUDIO granted — forwarding to WebView");
                pendingWebViewPermission.grant(pendingWebViewPermission.getResources());
            } else {
                Log.w(TAG, "[MIC] RECORD_AUDIO denied — denying WebView audio capture");
                pendingWebViewPermission.deny();
            }
            pendingWebViewPermission = null;
        }

        // ── Location (from WebView navigator.geolocation flow) ────────────────
        if (requestCode == REQUEST_CODE_LOCATION && pendingGeoCallback != null) {
            boolean locGranted = false;
            for (int i = 0; i < permissions.length; i++) {
                if (grantResults.length > i
                        && grantResults[i] == PackageManager.PERMISSION_GRANTED
                        && (Manifest.permission.ACCESS_FINE_LOCATION.equals(permissions[i])
                            || Manifest.permission.ACCESS_COARSE_LOCATION.equals(permissions[i]))) {
                    locGranted = true;
                    break;
                }
            }
            Log.i(TAG, "[GPS] location result=" + (locGranted ? "GRANTED" : "DENIED"));
            pendingGeoCallback.invoke(pendingGeoOrigin, locGranted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin   = null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private void logPermissionStatus() {
        String mic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED";
        String fineLoc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED";
        String coarseLoc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED";
        Log.i(TAG, "[STARTUP] RECORD_AUDIO=" + mic
                + " FINE_LOCATION=" + fineLoc
                + " COARSE_LOCATION=" + coarseLoc);
    }

    /**
     * Proactively request mic + location on fresh launches only.
     * Android skips permissions that are already granted.
     */
    private void requestCriticalPermissionsIfNeeded() {
        boolean hasMic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        boolean hasLoc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        if (!hasMic || !hasLoc) {
            java.util.List<String> needed = new java.util.ArrayList<>();
            if (!hasMic) needed.add(Manifest.permission.RECORD_AUDIO);
            if (!hasLoc) {
                needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
                needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
            Log.i(TAG, "[STARTUP] requesting missing permissions: " + needed);
            ActivityCompat.requestPermissions(
                    this,
                    needed.toArray(new String[0]),
                    REQUEST_CODE_STARTUP_PERMS);
        } else {
            Log.i(TAG, "[STARTUP] all critical permissions already granted");
        }
    }
}
