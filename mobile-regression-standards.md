# Huush Mobile Regression Standards

## Official guidance used

| Area | Standard applied | Source |
|---|---|---|
| Android edge-to-edge | Target SDK 35+ apps on Android 15+ draw behind system bars; use `WindowCompat.enableEdgeToEdge()` and consume system-bar, cutout, and gesture insets for tappable UI. | [Android: Display content edge-to-edge in views](https://developer.android.com/develop/ui/views/layout/edge-to-edge) |
| WebView insets | WebView exposes system-bar and display-cutout safe areas through CSS variables and resizes the visual viewport for the IME; avoid double-padding and test overlap behavior. | [Android: Understand window insets in WebView](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets) |
| Capacitor 8 | Capacitor 8 removed legacy Android margin handling in favor of System Bars and CSS `env`/injected safe-area variables. | [Capacitor: Updating to 8.0](https://capacitorjs.com/docs/updating/8-0) |
| Capacitor System Bars | Modern edge-to-edge uses the bundled System Bars API; `insetsHandling: "css"` injects `--safe-area-inset-*` fallbacks for Android WebView compatibility. | [Capacitor: System Bars API](https://capacitorjs.com/docs/apis/system-bars) |
| Mobile accessibility | Touch controls need accessible semantics, mobile-friendly input, responsive behavior, and screen-reader support. | [MDN: Mobile accessibility](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/Mobile) |
| Tap targets | Aim for roughly 48 device-independent pixels per target with about 8px spacing. | [web.dev: Accessible tap targets](https://web.dev/articles/accessible-tap-targets) |

## Regression matrix

### Startup and shell

- Cold start has no white flash, desktop-layout flash, clipped top content, or visible status-bar overlap.
- The Android branch always renders the canonical mobile shell, including in a wide browser viewport.
- The mobile shell is centered with intentional side bars on wide screens.
- The three-item bottom navigation is stable, has no duplicate Add action, and remains above the navigation/gesture inset.
- Light, dark, and sepia themes apply consistently to the shell, system-bar appearance, sheets, toasts, and reader.

### Library and capture

- Empty Library state is understandable and aligned.
- Capture field, plus submit action, URL validation, loading, success, preview-only, extraction failure, and retry paths work without reloads.
- Search opens, focuses, filters, clears, and closes without layout jumps.
- Saved cards open correctly; image, source, title, reading time, and saved metadata are not duplicated or clipped.
- Swipe-to-reveal/delete, undo, and collection organization are recoverable and do not open the article accidentally.

### Tags and local data

- Create, validate, rename, delete, and select collections.
- Collection counts and membership survive navigation and reload.
- Clear-library confirmation is safe, cancelable, and correctly layered above bottom navigation.
- IndexedDB migration/localStorage fallback does not duplicate or lose articles.

### Reader

- Article opening preserves metadata, synopsis/article separation, images, links, and readability.
- Reader toolbar, share, source link, organize, saved state, progress, long scroll, end-of-article spacing, Focus mode, center-tap restore, and Android back behavior work.
- Reader settings change font, size, and theme in place without resetting scroll.
- Reader sheets are bottom anchored and keyboard/safe-area aware.

### Settings and developer tools

- Typeface selection, size slider, theme selection, and reset defaults update in place.
- Settings scroll does not jump after changes, disclosures, or version taps.
- Developer-options seven-tap unlock does not reload or reset scroll.
- Event-log search and filters, export, clear logs, simulate error, and reset options are safe and usable.
- Open-source notice and toasts do not alter scroll position.

### Semantics and resilience

- Every interactive control has an accessible name and appropriate native element/role.
- Keyboard and screen-reader focus remain visible and escape routes exist from every sheet/view.
- Touch targets are at least 48px where practical and do not overlap.
- No uncaught exceptions, unhandled rejections, duplicate listeners, or repeated status-bar update loops.
- Android build, lint, Capacitor sync, and APK metadata remain valid.

## Evidence discipline

Browser interaction is useful for layout and state transitions, but actual Android 16 status-bar, keyboard, gesture-navigation, rotation, TalkBack, and native share behavior must still be confirmed on the user’s physical device because no Android device is attached to this environment.
