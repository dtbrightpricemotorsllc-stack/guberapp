package com.guber.app;

import android.Manifest;
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

public class MainActivity extends BridgeActivity {

    private static final String TAG = "GuberNative";

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
        registerPlugin(ForegroundTrackingPlugin.class);
        super.onCreate(savedInstanceState);

        // Log initial permission state for debugging.
        logPermissionStatus();

        // Ask for mic + location up-front so the user sees the system dialog
        // before they reach a feature that needs them.  If already granted the
        // call is a no-op (Android skips already-granted permissions silently).
        requestCriticalPermissionsIfNeeded();
    }

    @Override
    public void onStart() {
        super.onStart();

        // ── WebView media settings ────────────────────────────────────────────
        // Allow WebRTC / ElevenLabs audio to play without requiring an
        // additional user gesture after the mic permission has been granted.
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);

        // ── Custom WebChromeClient ────────────────────────────────────────────
        // Must extend BridgeWebChromeClient (not override the whole bridge) so
        // Capacitor's own callbacks (file picker, console.log, etc.) still work.
        getBridge().getWebView().setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {

                // ── getUserMedia / WebRTC microphone ─────────────────────────
                /**
                 * Called by the WebView when page JS calls getUserMedia() for
                 * RESOURCE_AUDIO_CAPTURE (and/or RESOURCE_VIDEO_CAPTURE).
                 *
                 * Flow:
                 *   1. If Android RECORD_AUDIO is already granted → grant WebView immediately.
                 *   2. Otherwise  → ask Android OS; stash `request` and grant/deny
                 *      once the OS dialog resolves (see onRequestPermissionsResult).
                 *
                 * Without this override Capacitor's default BridgeWebChromeClient
                 * denies all getUserMedia calls silently.
                 */
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        // Log every resource being requested.
                        StringBuilder resLog = new StringBuilder();
                        boolean needsAudio = false;
                        for (String resource : request.getResources()) {
                            resLog.append(resource).append(" ");
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                                needsAudio = true;
                            }
                        }
                        Log.i(TAG, "[MIC] WebView.onPermissionRequest"
                                + " origin=" + request.getOrigin()
                                + " resources=" + resLog.toString().trim());

                        if (!needsAudio) {
                            // Video-only or other resource — grant directly (no native perm needed).
                            Log.i(TAG, "[MIC] granting non-audio WebView resources directly");
                            request.grant(request.getResources());
                            return;
                        }

                        boolean nativeGranted = ContextCompat.checkSelfPermission(
                                MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED;
                        Log.i(TAG, "[MIC] RECORD_AUDIO native=" + (nativeGranted ? "GRANTED" : "DENIED"));

                        if (nativeGranted) {
                            Log.i(TAG, "[MIC] granting RESOURCE_AUDIO_CAPTURE to WebView");
                            request.grant(request.getResources());
                        } else {
                            Log.i(TAG, "[MIC] requesting RECORD_AUDIO from Android OS");
                            pendingWebViewPermission = request;
                            ActivityCompat.requestPermissions(
                                    MainActivity.this,
                                    new String[]{Manifest.permission.RECORD_AUDIO},
                                    REQUEST_CODE_RECORD_AUDIO);
                        }
                    });
                }

                // ── navigator.geolocation inside the WebView ─────────────────
                /**
                 * Called by the WebView when page JS calls navigator.geolocation
                 * APIs (getCurrentPosition / watchPosition).
                 *
                 * Without this override the WebView silently denies geolocation
                 * requests, forcing the app to fall back to the saved profile ZIP
                 * (Alabama) instead of the user's real GPS position.
                 *
                 * Flow:
                 *   1. If ACCESS_FINE_LOCATION is already granted → allow immediately.
                 *   2. Otherwise → ask Android OS; stash callback and invoke once
                 *      the OS dialog resolves (see onRequestPermissionsResult).
                 *
                 * `retain=false` means the WebView will ask again next session
                 * rather than caching the decision forever, which keeps behaviour
                 * consistent with the native Android permission model.
                 */
                @Override
                public void onGeolocationPermissionsShowPrompt(
                        String origin, GeolocationPermissions.Callback callback) {
                    Log.i(TAG, "[GPS] WebView.onGeolocationPermissionsShowPrompt origin=" + origin);

                    boolean nativeGranted = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED;
                    Log.i(TAG, "[GPS] ACCESS_FINE_LOCATION native=" + (nativeGranted ? "GRANTED" : "DENIED"));

                    if (nativeGranted) {
                        Log.i(TAG, "[GPS] invoking WebView geolocation callback allow=true");
                        callback.invoke(origin, true, false);
                    } else {
                        pendingGeoCallback = callback;
                        pendingGeoOrigin   = origin;
                        Log.i(TAG, "[GPS] requesting location permission from Android OS");
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
                    Log.i(TAG, "[GPS] WebView.onGeolocationPermissionsHidePrompt — prompt hidden");
                    super.onGeolocationPermissionsHidePrompt();
                }
            }
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Permission result routing
    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        // Log every result for adb logcat diagnostics.
        for (int i = 0; i < permissions.length; i++) {
            Log.i(TAG, "[PERM] requestCode=" + requestCode
                    + " permission=" + permissions[i]
                    + " result=" + (grantResults.length > i && grantResults[i] == PackageManager.PERMISSION_GRANTED
                            ? "GRANTED" : "DENIED"));
        }

        // ── Microphone (from WebView getUserMedia flow) ───────────────────────
        if (requestCode == REQUEST_CODE_RECORD_AUDIO && pendingWebViewPermission != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.i(TAG, "[MIC] RECORD_AUDIO granted — forwarding RESOURCE_AUDIO_CAPTURE to WebView");
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
            Log.i(TAG, "[GPS] location permission result=" + (locGranted ? "GRANTED" : "DENIED")
                    + " — invoking WebView geolocation callback");
            pendingGeoCallback.invoke(pendingGeoOrigin, locGranted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin   = null;
        }

        // REQUEST_CODE_STARTUP_PERMS: proactive startup request — just log,
        // no pending callbacks to resolve.
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** Log current native permission state to adb logcat. */
    private void logPermissionStatus() {
        String mic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED";
        String fineLoc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED";
        String coarseLoc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED ? "GRANTED" : "DENIED";
        Log.i(TAG, "[STARTUP] RECORD_AUDIO=" + mic
                + " ACCESS_FINE_LOCATION=" + fineLoc
                + " ACCESS_COARSE_LOCATION=" + coarseLoc);
    }

    /**
     * Proactively request mic + location on first launch so the user sees
     * both permission dialogs before reaching a feature that needs them.
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
        }
    }
}
