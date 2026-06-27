package com.guber.app;

import android.os.Bundle;
import android.webkit.PermissionRequest;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ForegroundTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Grant audio capture to the WebView so webkitSpeechRecognition works.
     *
     * Capacitor's default BridgeWebChromeClient does not override
     * onPermissionRequest, so Android silently denies RESOURCE_AUDIO_CAPTURE
     * — causing the mic button to appear to "work" (listening = true for a
     * moment) but never return any speech results.
     *
     * We extend BridgeWebChromeClient so all other chrome-client behaviour
     * (file chooser, JS dialogs, geolocation prompts, etc.) is preserved.
     */
    @Override
    protected void onStart() {
        super.onStart();
        getBridge().getWebView().setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            }
        );
    }
}
