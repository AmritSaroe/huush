package com.amritsaroe.huush;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        // Use the traditional non-overlay layout so Android can render an actual
        // status-bar surface. This is supported while Huush targets SDK 34.
        WindowCompat.setDecorFitsSystemWindows(window, true);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        window.setStatusBarColor(Color.parseColor("#FAFAF8"));
        window.setNavigationBarColor(Color.parseColor("#FAFAF8"));
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.parseColor("#FAFAF8"));
        }

        bridgeInsetsToWebView();
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
                // The WebView is below system bars in this mode, so safe-area
                // padding must not be applied a second time. Keep the IME value
                // available for the keyboard-safe bottom sheet fallback.
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
