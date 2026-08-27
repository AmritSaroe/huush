package com.amritsaroe.huush;

import android.app.UiModeManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final long STARTUP_MAX_HOLD_MS = 3500L;

    private volatile boolean webContentReady = false;
    private volatile boolean readinessRequested = false;
    private boolean reportedFullyDrawn = false;
    private long startupStartedAt;
    private int appliedApplicationNightMode = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // AndroidX requires this call before super.onCreate() and before any
        // content-view operation so the system splash owns the full handoff.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        startupStartedAt = SystemClock.uptimeMillis();

        super.onCreate(savedInstanceState);

        Window window = getWindow();
        // Android 16 enforces edge-to-edge for target SDK 36. Let system bars
        // remain transparent and apply their insets through Capacitor's CSS mode.
        WindowCompat.enableEdgeToEdge(window);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        window.setBackgroundDrawableResource(R.color.huush_surface_light);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null) {
            webView.setBackgroundColor(Color.parseColor("#F6F1E8"));
            // The bundled local WebView content is trusted application code.
            webView.addJavascriptInterface(new StartupBridge(), "HuushStartup");
            webView.postInvalidateOnAnimation();
        }

        // Keep the native splash over the unpainted WebView until the bundled
        // app has rendered. The time bound prevents an initialization failure
        // from leaving the user on a permanent splash screen.
        splashScreen.setKeepOnScreenCondition(() ->
            !webContentReady
                && SystemClock.uptimeMillis() - startupStartedAt < STARTUP_MAX_HOLD_MS
        );

        bridgeInsetsToWebView();
    }

    private void applyApplicationNightMode(String theme) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        int mode = "dark".equals(theme)
            ? UiModeManager.MODE_NIGHT_YES
            : "system".equals(theme)
                ? UiModeManager.MODE_NIGHT_AUTO
                : UiModeManager.MODE_NIGHT_NO;
        if (appliedApplicationNightMode == mode) return;
        UiModeManager uiModeManager = getSystemService(UiModeManager.class);
        if (uiModeManager == null) return;
        try {
            uiModeManager.setApplicationNightMode(mode);
            appliedApplicationNightMode = mode;
        } catch (RuntimeException ignored) {
            // The WebView keeps its normal platform selection behavior if the
            // app-local night-mode service is unavailable or rejects the request.
        }
    }

    private void applyReaderTheme(String theme) {
        applyApplicationNightMode(theme);
    }

    private final class StartupBridge {
        @JavascriptInterface
        public void setReaderTheme(String theme) {
            runOnUiThread(() -> applyReaderTheme(theme));
        }

        @JavascriptInterface
        public void markReady() {
            if (readinessRequested) return;
            readinessRequested = true;
            runOnUiThread(() -> {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null && WebViewFeature.isFeatureSupported(WebViewFeature.VISUAL_STATE_CALLBACK)) {
                    WebViewCompat.postVisualStateCallback(webView, 0L, new WebViewCompat.VisualStateCallback() {
                        @Override
                        public void onComplete(long requestId) {
                            completeStartup(webView);
                        }
                    });
                } else {
                    completeStartup(webView);
                }
            });
        }
    }

    private void completeStartup(WebView webView) {
        webContentReady = true;
        if (!reportedFullyDrawn) {
            reportedFullyDrawn = true;
            reportFullyDrawn();
        }
        if (webView != null) webView.postInvalidateOnAnimation();
    }

    private void bridgeInsetsToWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            androidx.core.graphics.Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
            androidx.core.graphics.Insets systemInsets = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            int keyboardBottom = Math.max(0, imeInsets.bottom - systemInsets.bottom);
            float density = getResources().getDisplayMetrics().density > 0
                ? getResources().getDisplayMetrics().density
                : 1f;
            String script = String.format(
                Locale.US,
                // Capacitor 8 owns system-bar CSS insets. Keep the IME value
                // available for the keyboard-safe bottom sheet fallback without
                // injecting a second top/bottom system-bar inset.
                "document.documentElement.style.setProperty('--wm-native-safe-top','0px');" +
                    "document.documentElement.style.setProperty('--wm-native-safe-right','0px');" +
                    "document.documentElement.style.setProperty('--wm-native-safe-bottom','0px');" +
                    "document.documentElement.style.setProperty('--wm-native-safe-left','0px');" +
                    "document.documentElement.style.setProperty('--wm-native-keyboard-inset','%.2fpx');",
                keyboardBottom / density
            );
            getBridge().getWebView().evaluateJavascript(script, null);
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
