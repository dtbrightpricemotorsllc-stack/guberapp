package com.guber.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_CODE_RECORD_AUDIO = 1001;
    private PermissionRequest pendingWebViewPermission;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ForegroundTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Grant audio capture to the WebView through Android's runtime permission
     * system so that:
     *   1. Samsung (and all Android) permission managers register GUBER as an
     *      app that requests microphone access — fixing it missing from the list.
     *   2. The OS permission dialog appears and the user's choice is honoured.
     *   3. webkitSpeechRecognition / MediaRecorder work after the user grants.
     *
     * Previous: called request.grant() directly, bypassing Android's permission
     * system entirely — which is why GUBER never appeared in Samsung's mic list.
     */
    @Override
    public void onStart() {
        super.onStart();
        getBridge().getWebView().setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        boolean needsAudio = false;
                        for (String resource : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                                needsAudio = true;
                                break;
                            }
                        }

                        if (!needsAudio) {
                            // Non-audio WebView permission (camera, etc.) — grant directly.
                            request.grant(request.getResources());
                            return;
                        }

                        if (ContextCompat.checkSelfPermission(
                                MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED) {
                            // Already granted by the user previously — forward to WebView.
                            request.grant(request.getResources());
                        } else {
                            // Ask Android for permission; hold the WebView request until we know.
                            pendingWebViewPermission = request;
                            ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{Manifest.permission.RECORD_AUDIO},
                                REQUEST_CODE_RECORD_AUDIO
                            );
                        }
                    });
                }
            }
        );
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CODE_RECORD_AUDIO && pendingWebViewPermission != null) {
            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingWebViewPermission.grant(pendingWebViewPermission.getResources());
            } else {
                pendingWebViewPermission.deny();
            }
            pendingWebViewPermission = null;
        }
    }
}
