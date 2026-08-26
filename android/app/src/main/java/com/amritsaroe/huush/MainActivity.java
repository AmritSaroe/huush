package com.amritsaroe.huush;

import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
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
    private View statusBarScrim;

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
            webView.addJavascriptInterface(new SystemBarsBridge(), "HuushSystemBars");
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
        installStatusBarScrim();
    }

    private final class StartupBridge {
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

    private final class SystemBarsBridge {
        @JavascriptInterface
        public void setStatusBarScrimColor(String color) {
            final int parsedColor;
            try {
                parsedColor = Color.parseColor(color);
            } catch (IllegalArgumentException ignored) {
                return;
            }
            runOnUiThread(() -> {
                if (statusBarScrim != null) statusBarScrim.setBackgroundColor(parsedColor);
            });
        }
    }

    private void installStatusBarScrim() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        View webView = getBridge().getWebView();
        if (!(webView.getParent() instanceof ViewGroup)) return;
        ViewGroup container = (ViewGroup) webView.getParent();

        statusBarScrim = new View(this);
        statusBarScrim.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        statusBarScrim.setClickable(false);
        statusBarScrim.setFocusable(false);
        statusBarScrim.setBackgroundColor(Color.parseColor("#F6F1E8"));

        if (container instanceof CoordinatorLayout) {
            CoordinatorLayout.LayoutParams layoutParams = new CoordinatorLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0
            );
            layoutParams.gravity = Gravity.TOP;
            container.addView(statusBarScrim, layoutParams);
        } else {
            container.addView(statusBarScrim, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0
            ));
        }

        ViewCompat.setOnApplyWindowInsetsListener(statusBarScrim, (view, insets) -> {
            androidx.core.graphics.Insets systemInsets = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
            );
            ViewGroup.LayoutParams layoutParams = view.getLayoutParams();
            int nextHeight = Math.max(0, systemInsets.top);
            if (layoutParams.height != nextHeight) {
                layoutParams.height = nextHeight;
                view.setLayoutParams(layoutParams);
            }
            return insets;
        });
        ViewCompat.requestApplyInsets(statusBarScrim);
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
