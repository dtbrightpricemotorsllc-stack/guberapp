package com.guber.app;

import android.Manifest;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * JS bridge for the Android live-task foreground service. Exposed to the web
 * layer as the "ForegroundTracking" plugin with start()/stop(). The JS tracking
 * service calls these when an active task starts/ends so the persistent
 * status-bar notification appears for the duration of tracking.
 *
 * Also exposes checkBackgroundLocation() / requestBackgroundLocation() so the
 * JS layer can implement the Google Play-required two-step in-app disclosure
 * flow before requesting ACCESS_BACKGROUND_LOCATION at runtime.
 * On Android 11+ the OS redirects to the location permission settings page
 * ("Allow all the time") when the permission is requested.
 */
@CapacitorPlugin(
    name = "ForegroundTracking",
    permissions = {
        @Permission(
            alias = "backgroundLocation",
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }
        )
    }
)
public class ForegroundTrackingPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String title     = call.getString("title", "GUBER");
        String text      = call.getString("text", "Sharing your live location for an active task.");
        Integer jobIdObj = call.getInt("jobId");
        String authToken = call.getString("authToken");
        String batchPath = call.getString("batchPath");

        Intent intent = new Intent(getContext(), GuberTrackingService.class);
        intent.setAction(GuberTrackingService.ACTION_START);
        intent.putExtra(GuberTrackingService.EXTRA_TITLE, title);
        intent.putExtra(GuberTrackingService.EXTRA_TEXT, text);
        if (jobIdObj != null && jobIdObj > 0) {
            intent.putExtra(GuberTrackingService.EXTRA_JOB_ID, jobIdObj.intValue());
        }
        if (authToken != null && !authToken.isEmpty()) {
            intent.putExtra(GuberTrackingService.EXTRA_AUTH_TOKEN, authToken);
        }
        if (batchPath != null && !batchPath.isEmpty()) {
            intent.putExtra(GuberTrackingService.EXTRA_BATCH_PATH, batchPath);
        }

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

    /**
     * Returns the current background location permission state without prompting.
     * Result: { status: "granted" | "denied" | "prompt" | "prompt-with-rationale" }
     */
    @PluginMethod
    public void checkBackgroundLocation(PluginCall call) {
        JSObject result = new JSObject();
        PermissionState state = getPermissionState("backgroundLocation");
        result.put("status", state != null ? state.toString() : "prompt");
        call.resolve(result);
    }

    /**
     * Requests ACCESS_BACKGROUND_LOCATION after the JS layer has already shown
     * its in-app disclosure. If already granted, resolves immediately.
     * Result: { status: "granted" | "denied" }
     */
    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        PermissionState state = getPermissionState("backgroundLocation");
        if (state == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("status", "granted");
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("backgroundLocation", call, "bgLocationCallback");
    }

    @PermissionCallback
    private void bgLocationCallback(PluginCall call) {
        JSObject result = new JSObject();
        PermissionState state = getPermissionState("backgroundLocation");
        result.put("status", state == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(result);
    }
}
