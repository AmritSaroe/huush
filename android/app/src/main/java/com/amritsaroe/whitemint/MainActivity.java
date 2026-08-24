package com.amritsaroe.whitemint;

import android.graphics.Color;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.Window;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }

        bridgeInsetsToWebView();
    }

    private void bridgeInsetsToWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            int insetTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            androidx.core.graphics.Insets systemInsets = insets.getInsets(insetTypes);
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            float density = metrics.density > 0 ? metrics.density : 1f;
            String script = String.format(
                Locale.US,
                "document.documentElement.style.setProperty('--wm-native-safe-top','%.2fpx');" +
                    "document.documentElement.style.setProperty('--wm-native-safe-right','%.2fpx');" +
                    "document.documentElement.style.setProperty('--wm-native-safe-bottom','%.2fpx');" +
                    "document.documentElement.style.setProperty('--wm-native-safe-left','%.2fpx');",
                systemInsets.top / density,
                systemInsets.right / density,
                systemInsets.bottom / density,
                systemInsets.left / density
            );
            getBridge().getWebView().evaluateJavascript(script, null);
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
