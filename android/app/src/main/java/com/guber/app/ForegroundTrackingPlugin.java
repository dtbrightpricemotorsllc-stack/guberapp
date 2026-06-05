package com.guber.app;

import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge for the Android live-task foreground service. Exposed to the web
 * layer as the "ForegroundTracking" plugin with start()/stop(). The JS tracking
 * service calls these when an active task starts/ends so the persistent
 * status-bar notification appears for the duration of tracking.
 */
@CapacitorPlugin(name = "ForegroundTracking")
public class ForegroundTrackingPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "GUBER");
        String text = call.getString("text", "Sharing your live location for an active task.");

        Intent intent = new Intent(getContext(), GuberTrackingService.class);
        intent.setAction(GuberTrackingService.ACTION_START);
        intent.putExtra(GuberTrackingService.EXTRA_TITLE, title);
        intent.putExtra(GuberTrackingService.EXTRA_TEXT, text);

        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to start foreground tracking service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), GuberTrackingService.class);
        intent.setAction(GuberTrackingService.ACTION_STOP);
        try {
            getContext().startService(intent);
        } catch (Exception ignored) {
            // If the service isn't running there's nothing to stop — not an error.
        }
        call.resolve();
    }
}
