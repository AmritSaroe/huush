# Huush Android final interface preflight

## Baseline and non-negotiables

Implementation branch: `android-huush-final-interface-test`, based on `android-huush-font-card-fix-test` (`1e9f677`). The approved source is the HTML/CSS/JavaScript prototype in `concept-mockup/`, not a screenshot. The Android build remains Capacitor 6 / target SDK 34. Existing Readability extraction, publisher adapters, sanitization, smry fallback, IndexedDB/local storage fallback, Capacitor Preferences, status-bar bridge, keyboard/inset bridge, diagnostics, hardware back, reader cache, and developer options remain intact.

The renderer stays vanilla JavaScript. No React, Tailwind, shadcn, external icon package, external font request, generated bitmap, or new Capacitor plugin is introduced.

## Resolved inconsistencies

| Area | Existing Android behavior | Final Android decision |
|---|---|---|
| Dashboard navigation | Three bottom items: Library, Tags, Settings; Add is separate | Use four stable items: Library, Tags, centered Add, Settings. Add is the only filled primary action. |
| Library header | Direct moon/sun theme action | Use Huush identity plus search. Theme remains in Settings and Reader context, matching the approved mockup. |
| Tags naming | Internal collections are exposed as collections | Keep collection storage and organization internals; expose the approved “Tags” language in the navigation and page copy. |
| Card source badge | Source initials badge plus source name | Remove initials badge from article cards. Keep source name as plaintext metadata. Reader source remains plaintext. |
| Article-card imagery | Extracted images can dominate card geometry | Use stable CSS editorial tiles on Library cards; keep extracted images in the Reader content. This avoids image layout shifts and matches the image-free mockup. |
| Reader toolbar | Back, theme, font, copy actions | Back, Huush identity, bookmark, menu, share, and reading surface. Font and copy remain available through Reader menu/Settings rather than disappearing. |
| Reader menu | No single contextual menu | Add a real Reader menu sheet for Focus mode, Copy source link, Share article, Reading surface, and Reading settings. |
| Settings copy | “Keep your signal clear” and mixed legacy blocks | Use the prototype hierarchy: “Make it yours.”, live preview, Typeface, Text size, Theme, Reading behavior, Storage, About, then Developer options. |
| Capture | Inline capture plus separate sheet | Keep inline Library capture and central Add entry as the same capture sheet flow. Do not create a second extraction pipeline. |
| Capture states | Busy stage plus toast on failure/success | Keep the production extraction path. Style busy, success, and failure feedback as the final sheet/toast language without simulating extraction. |
| Themes | Light/Dark/Sepia plus system preference | Keep System, Light, Sepia, and Dark for backward compatibility. Present Light/Sepia/Dark as the primary visual cards; System remains a clearly labelled optional choice. |
| Font system | Four bundled reading fonts | Keep Inter, Source Serif 4, Merriweather, Literata. Source Serif 4 remains default. UI uses Inter; reading uses selected font. |
| Motion | Existing view-transition and reader toolbar motion | Reuse current guarded transitions and scroll behavior. Add only opacity/translate/press treatments from the prototype. Reduced-motion disables non-essential animation. |
| Layout | Android-safe insets and adaptive-layout vars exist | Keep adaptive-layout and native inset bridge. Dashboard and Reader own their internal scroll containers; no double safe-area padding. |
| Diagnostics | Developer-only screen and event viewer | Preserve below About and keep the seven-tap unlock behavior. Do not redesign diagnostics into the primary navigation. |

## Screen contracts

### Library

The screen uses the Huush wordmark, search button, “Your reading space” kicker, “Worth keeping.” serif hero, public-link capture, four filter/collection surfaces, stable article counts, CSS editorial tiles, source plaintext, title, reading time, saved date, bookmark/delete behavior, and a centered Add action in bottom navigation. Empty, filtered, and cleared-library states have one obvious action and never dead-end.

### Tags

The screen uses “Organise by meaning” copy, tag cards backed by `state.collections`, article counts, New tag, tag detail, and the existing collection management and organization flows. Tag creation, rename, delete, and assignment remain persistent and accessible.

### Reader

The reader has a dedicated toolbar and a full-height internal content surface. The opening block, synopsis divider, sanitized article body, preview notice, article actions, source link, reader progress, focus mode, and toolbar hide/reveal remain. All toolbar controls have 48px hit areas and accessible names.

### Settings

The settings page is a single internally scrollable screen. It contains live reading preview, four font cards, live text-size preview with persistence on change, theme cards, reading behavior toggles, storage summary and confirmation, About, and Developer options. Settings updates patch in place where already supported; they do not reload the whole document or reset scroll.

### Sheets and feedback

Capture, organization, new-tag, clear-library, reader-menu, and reader-theme sheets share one overlay contract: fixed backdrop, bottom-aligned panel, safe-area padding, visible close action, keyboard back/Escape close, focusable primary action, and a 240ms translate/opacity entrance that is removed under reduced motion. Toasts are short status messages and never the only recovery path for an error.

## Icon and typography contract

All interface icons are inline SVGs in a 24px viewBox with round 1.7–1.9px strokes. Decorative SVGs are aria-hidden; buttons own labels. The core language is open book for Library, tag/archive for Tags, plus for Add, gear for Settings, arrow-back/bookmark/share/more/theme for Reader, and trash only for destructive actions. No source-initial badge is used on cards.

Inter handles UI labels, metadata, button text, navigation, status, and diagnostics. Source Serif 4 is Huush identity, display headings, and default reading face. Literata and Merriweather remain selectable. All font weights used by the UI must exist in local assets.

## Acceptance gates before APK

The implementation is not ready until the following are verified in Chrome and on the Android build: four-item dashboard navigation; no duplicate Add entry; Library, Tags, Reader, Settings, capture, empty, loading, error, and success paths; article organization; bookmark and delete/undo; Light, Sepia, Dark, and System behavior; all four fonts; slider live preview and one persistence event on release; Reader focus/menu/theme/share/copy; stable internal scrolling; keyboard and visual viewport behavior; gesture and three-button navigation; rotation; font scaling; status/navigation bar colors; cold start/splash; no horizontal overflow; and no repeated listener attachment.
