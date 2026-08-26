# Android reader overlap investigation — official and device findings

## Official guidance

Source: https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets

WebView forwards system-bar and display-cutout safe areas to web content through CSS `env(safe-area-inset-*)` variables. IME support uses visual-viewport resizing. WebView should receive non-zero insets when system UI overlaps its bounds; returning the original `WindowInsets` from an `OnApplyWindowInsetsListener` overrides default bounds checking, but can cause double padding if native UI also applies insets.

Source: https://capacitorjs.com/docs/apis/system-bars

Capacitor System Bars is intended for modern edge-to-edge use. `setOverlaysWebView()` is unsupported in System Bars and belongs to the legacy Status Bar plugin. When `insetsHandling` is `css`, Capacitor exposes system-bar values through CSS variables (`--safe-area-inset-x`) to supplement `env(safe-area-inset-x)` where needed.

Source: https://capacitorjs.com/docs/config

The configuration interface names the modern plugin key `SystemBars`, not `StatusBar`, and its `insetsHandling` option accepts `css` or `disable`.

## Device diagnostic: 2.5.9

The user’s Android export is version `2.5.9-reader-geometry-diagnostic` on Android. It reports a 411.43 CSS-pixel-wide viewport and a 38px top safe area.

At reader open, the DOM geometry is internally correct: toolbar `top=0`, `bottom=64`, `height=64`; scroll surface `top=64`, `height=827.43`; article opening `top=64`. Hit tests at y=0 and y=24 resolve to `header.reader-toolbar`, while y=64 resolves to article content.

When the toolbar is hidden, the DOM geometry is also internally correct: toolbar height `0`, surface `top=0`, surface height `891.43`. When the toolbar reappears, the same correct separation returns: toolbar bottom `64`, surface top `64`, and hit tests at y=0/y=24 resolve to the toolbar.

The device still visually shows article pixels in the top/status-bar strip despite these DOM hit tests and rectangles proving that the article surface does not occupy that area. Therefore the remaining defect is not article extraction or ordinary CSS stacking. It is a native Android edge-to-edge paint/compositing issue in the transparent status-bar region. The next fix should add an opaque native scrim over only the status-bar inset band, synchronized to the active Huush theme, without changing WebView content geometry.

## Relevant current native state

The Capacitor bridge layout is an `androidx.coordinatorlayout.widget.CoordinatorLayout` containing a full-size `CapacitorWebView`. A child view added after the WebView can therefore sit above it. The scrim must be non-clickable, top-aligned, and sized from the system-bar inset; it must not add padding or consume the insets.
