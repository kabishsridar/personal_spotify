package com.kabish.spotify;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAudioPlayerPlugin.class);
        super.onCreate(savedInstanceState);

        // ⚡ HARDWARE OPTIMIZATION: Configure WebView for high-speed rendering & ultra-low RAM
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            // Force hardware GPU acceleration to drastically reduce CPU load and RAM spikes
            webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

            // Optimize internal caching so repetitive audio streams & assets load instantly
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        }

        // 🔔 NOTIFICATION CONTROLS: Prompt user for Notification Permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle the new intent to ensure the app opens properly from task manager
        setIntent(intent);
    }

    @Override
    public void onPause() {
        super.onPause();
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            // Keep WebView active in background to allow continuous audio playback
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            // Guarantee WebView timers stay active when app is fully stopped (e.g. screen lock)
            webView.resumeTimers();
            webView.onResume();
        }
    }
}
