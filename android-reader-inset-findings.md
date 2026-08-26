# Android reader overlap investigation — official findings

## Android WebView
Source: https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets

WebView forwards system-bar and display-cutout safe areas to web content through CSS `env(safe-area-inset-*)` variables. IME support uses visual-viewport resizing. WebView should receive non-zero insets when system UI overlaps its bounds; returning the original `WindowInsets` from an `OnApplyWindowInsetsListener` overrides default bounds checking, but can cause double padding if native UI also applies insets.

## Capacitor System Bars
Source: https://capacitorjs.com/docs/apis/system-bars

Capacitor System Bars is intended for modern edge-to-edge use. `setOverlaysWebView()` is unsupported in System Bars and belongs to the legacy Status Bar plugin. When `insetsHandling` is `css`, Capacitor exposes system-bar values through CSS variables (`--safe-area-inset-x`) to supplement `env(safe-area-inset-x)` where needed.

## Configuration correction
Source: https://capacitorjs.com/docs/config

The configuration interface names the modern plugin key `SystemBars`, not `StatusBar`, and its `insetsHandling` option accepts `css` or `disable`. The current project places `insetsHandling: "css"` under `StatusBar`, so the setting is attached to the legacy plugin rather than explicitly configuring modern System Bars. Capacitor System Bars defaults to CSS handling, but the project should use the documented key to make inset ownership explicit.

## Implication for Huush

The native activity currently calls `WindowCompat.enableEdgeToEdge`, configures a legacy `StatusBar` entry with `insetsHandling: "css"`, and additionally installs a WebView `OnApplyWindowInsetsListener` that writes zero native safe-area variables. The frontend also calls legacy `StatusBar.setOverlaysWebView({ overlay: false })` at startup. Capacitor documents this overlay method as legacy behavior for older Android, while modern System Bars is intended for edge-to-edge use. The apparent Android-only overlap must be checked for conflicting inset ownership. The web reader should consume exactly one source of top inset and must not be shifted by a legacy native overlay toggle.
