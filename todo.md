# Corrective release tasks

- [x] Replace generated image marks with inline SVG branding so the Android WebView never depends on remote image loading for app icons.
- [x] Retain safe article image elements and source attributes during sanitization.
- [x] Resolve relative article-image URLs to absolute URLs before article storage.
- [x] Add responsive reader styles for article images, captions, and failed-image handling.
- [x] Rebuild the Capacitor Android APK through GitHub Actions and provide the corrected artifact for testing.

## Current corrective release

- [x] Prevent unintended pinch zoom, overscroll bounce, horizontal panning, and text-size inflation in the Android reader surface.
- [x] Replace the unstable cycling font UI with direct font choices, add Nunito, and remove Lora.
- [x] Replace the fixed size presets with direct A− and A+ reading-size controls.
- [x] Improve discovery of responsive, lazy-loaded, and hero images during article extraction.
- [x] Rebuild the Android APK and provide the updated artifact for focused mobile retesting.

## Navigation gesture correction

- [x] Restore Android system back and edge-swipe navigation without allowing horizontal page panning or overscroll bounce.
- [x] Avoid preventively blocking all browser touch gestures at the document level.
- [x] Deduplicate image-load telemetry across settings-driven reader re-renders.
- [x] Build and provide a navigation-corrected Android APK.

## Article scrolling correction

- [x] Remove remaining native WebView scroll suppression that could prevent article movement.
- [x] Create one explicit vertical reader scroll surface while leaving Android edge/back gestures available.
- [x] Build and provide a scrolling-corrected Android APK.

## Native-inspired redesign and interaction correction

- [x] Replace the current sparse index UI with a warm-white, card-led native dashboard informed by the supplied reference.
- [x] Add a compact bottom navigation and a clear library summary without imitating the reference product’s branding or content.
- [x] Make preference changes update only the relevant reader state so the screen no longer visibly reloads or blinks.
- [x] Add a center-tap focus mode that hides reader controls and restores them on the next tap.
- [x] Implement reliable Android back and edge-navigation handling for reader, settings, focus, and debug states.
- [x] Build and provide the redesigned Android APK.

## Dark low-chrome redesign

- [ ] Replace the warm dashboard palette with a restrained charcoal-black reader system inspired by the supplied reference.
- [ ] Rework library hierarchy around large editorial headings, quiet metadata, compact tabs, and low-contrast controls.
- [ ] Restyle reader focus, preferences, diagnostics, and saved articles to follow the same dark minimal system.
- [ ] Build and provide a dark-reader Android APK for comparison testing.

## Editorial large-type redesign

- [x] Replace the dark low-chrome direction with a pale editorial feed inspired by the supplied reading references.
- [x] Increase typographic scale and line-height across the library, article metadata, controls, and reading surface.
- [x] Add a lime highlighter treatment for selected editorial phrases and active reading states without fabricating editorial summaries.
- [x] Make light and dark themes visually complete, reachable from the app UI, and persistently stored.
- [x] Build and provide a large-type editorial Android APK for testing.
