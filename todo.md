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
- [ ] Build and provide a scrolling-corrected Android APK.
