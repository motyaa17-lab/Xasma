package com.xasma.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Android 13+ POST_NOTIFICATIONS + channel for WebView Notification API used by the web layer.
 */
@CapacitorPlugin(
    name = "AndroidNotifyPerms",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "postNotifications")
    }
)
public class AndroidNotifyPermsPlugin extends Plugin {

    public static final String CHANNEL_ID = "xasma_messages";

    @Override
    public void load() {
        super.load();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel ch =
                    new NotificationChannel(CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("New chat message alerts");
                ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
                nm.createNotificationChannel(ch);
            }
        }
    }

    @PluginMethod
    public void getPostNotificationStatus(PluginCall call) {
        JSObject ret = new JSObject();
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        // User can turn off all app notifications in system UI while POST_* may still look granted (API 24+).
        if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !nm.areNotificationsEnabled()) {
            ret.put("display", "denied");
            call.resolve(ret);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            ret.put("display", "granted");
            call.resolve(ret);
            return;
        }
        PermissionState st = getPermissionState("postNotifications");
        if (st == PermissionState.GRANTED) {
            ret.put("display", "granted");
        } else if (st == PermissionState.DENIED) {
            ret.put("display", "denied");
        } else {
            ret.put("display", "prompt");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPostNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve();
            return;
        }
        if (getPermissionState("postNotifications") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("postNotifications", call, "postNotificationsCallback");
    }

    @PermissionCallback
    private void postNotificationsCallback(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void openAppNotificationSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(intent);
        } catch (Exception e) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallback.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(fallback);
        }
        call.resolve();
    }
}
