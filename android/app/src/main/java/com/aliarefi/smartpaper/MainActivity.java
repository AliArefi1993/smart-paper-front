package com.aliarefi.smartpaper;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final Handler backHandler = new Handler(Looper.getMainLooper());
    private int backRequest = 0;
    private boolean backPending = false;
    private boolean resumed = false;
    private long lastBackAt = -1000;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(EmailReportPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleAppBack();
            }
        });
    }

    private boolean isAppUrl(String value) {
        if (value == null || bridge == null) return false;
        Uri url = Uri.parse(value);
        Uri local = Uri.parse(bridge.getLocalUrl());
        if (!local.getScheme().equals(url.getScheme()) || !local.getHost().equals(url.getHost())
            || local.getPort() != url.getPort()) return false;
        String path = url.getPath();
        if (path == null) return false;
        path = path.replaceAll("/+$", "");
        return path.isEmpty() || path.equals("/ideas") || path.equals("/timer") || path.equals("/finance")
            || path.equals("/summaries") || path.equals("/export") || path.equals("/settings");
    }

    private void handleAppBack() {
        if (!resumed || bridge == null || bridge.getWebView() == null) return;
        long now = SystemClock.elapsedRealtime();
        if (backPending || now - lastBackAt < 250) return;
        lastBackAt = now;
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(bridge.getWebView());
        if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) {
            WindowCompat.getInsetsController(getWindow(), bridge.getWebView()).hide(WindowInsetsCompat.Type.ime());
            return;
        }
        String requestUrl = bridge.getWebView().getUrl();
        if (!isAppUrl(requestUrl)) return;
        backPending = true;
        int request = ++backRequest;
        Runnable timeout = () -> {
            if (request == backRequest) { backRequest++; backPending = false; }
        };
        backHandler.postDelayed(timeout, 2500);
        // Missing/initializing JS consumes Back. Only the live app can authorize root exit.
        bridge.eval("window.smartPaperAndroidBack ? window.smartPaperAndroidBack() : 'handled'", result -> {
            if (request != backRequest) return;
            backHandler.removeCallbacks(timeout);
            backPending = false;
            if (resumed && requestUrl.equals(bridge.getWebView().getUrl()) && isAppUrl(requestUrl)
                && "\"exit\"".equals(result)) moveTaskToBack(true);
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        resumed = true;
    }

    @Override
    public void onPause() {
        resumed = false;
        backRequest++;
        backPending = false;
        backHandler.removeCallbacksAndMessages(null);
        super.onPause();
    }

    @Override
    public void onDestroy() {
        backHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
