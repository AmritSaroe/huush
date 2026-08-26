# Browser verification notes — Huush brand correction

At `http://localhost:4176/`, the real Vite app rendered the Library screen with a cream paper surface, live Huush wordmark, Library inline capture field and Add article button, collections, and exactly three bottom/side navigation items: Library, Tags, Settings. No centered navigation Add control was rendered.

Settings opened through the rendered navigation and showed all four reading font cards (Inter, Source Serif 4, Merriweather, Literata), text-size slider, System/Light/Dark/Sepia theme choices, storage/about sections, and the same three navigation items. The screenshot state used a light/sepia-like paper surface; the cream mark surface is intentionally close to the paper in that theme, while the open-book glyph remains visible. Further Dark-theme verification is required because it provides the strongest contrast check for the cream rounded-square mark.


Dark-theme verification: Settings switched to Dark without a full-page reload, the cream rounded-square Huush mark with the dark open-book glyph was visible in the header, font cards and theme cards retained readable contrast, and the three-item navigation remained present. Returning toward the top moved the Settings internal scroll container rather than resetting the document state. The new mark is visually distinct in Dark as intended.


Library/capture verification: returning from Settings preserved the Dark theme and showed the new cream-square mark clearly. The rendered navigation contained only Library, Tags, and Settings. The empty-library “Add your first article” action opened the capture sheet with its URL field and plus submit button, confirming that article capture remains available through Library only.


Tags verification: closing the capture sheet returned to Library, then Tags opened in Dark theme. The page showed a thin outline tag glyph in the empty state, a New tag action, and exactly Library/Tags/Settings in the navigation. No centered `+ article` control appeared.


Live DOM audit via the browser console reported `innerWidth: 1280`, `.app-shell` width `1280px`, three rendered `.bottom-navigation button` elements (`show-library`, `show-tags`, `show-settings`), zero `.bottom-navigation__add` elements, one mark rect, and no legacy `M11 10h13` open-book path. The desktop layout therefore uses the intended full-width shell and side navigation while the renderer remains responsive through CSS breakpoints.


Sepia verification: Settings opened from Tags and Sepia was selected in place. The preview, controls, storage, and About sections remained on the same screen, with no full reload; the warm brown text on cream surface remained legible and the three-item navigation stayed consistent.


Open-book correction verification: after reloading the live Vite app, the Library header and lockup visibly showed the outlined open-book mark. Live DOM inspection found two `.quiet-mark` instances, both containing the approved mockup open-book paths, zero wave-mark paths, three navigation labels (Library, Tags, Settings), zero `.bottom-navigation__add` elements, and the Library navigation SVG matched the same open-book path family.


Text-size label fix verification: after reloading the Vite app and opening Settings, the rendered Text size section contains the single `Text size` heading, decrement/increment controls, slider, and 14–24 scale ticks. The redundant visible `18px` value and `Default` chip are absent; the selected scale tick remains available as the current-position indicator. The browser app stayed on the same Settings screen with no APK build performed.


Duplicate Library branding fix: the live browser app now renders one `.library-lockup` containing the sole visible `huush` wordmark. The Library top bar contains zero `.editorial-topbar__brand` elements, while its search button remains present and the navigation remains Library/Tags/Settings.


Settings branding fix: the live browser app now shows no centered Huush logo in the Settings header. The back button remains at the top-left, the “Keep your signal clear.” hierarchy begins below it, the single Text size heading remains, and Library/Tags/Settings navigation is unchanged.


Final combined verification — Library: the live Vite app renders one Library editorial lockup (`huush`), zero Library top-bar brand elements, one approved open-book mark path, zero navigation Add elements, three navigation labels (Library, Tags, Settings), and one retained inline capture submit button.


Final combined verification — Settings: the live Vite app renders zero Settings brand elements, one Return-to-Library back button, one `Text size` heading, no visible `[data-setting-size]` or `[data-size-default]` labels, and the same Library/Tags/Settings navigation.


Library branding placement fix: the live Vite app now renders one compact `.editorial-topbar__brand` in the Library header, zero `.library-lockup` content blocks, the retained `Worth keeping.` kicker, one search control, and Library/Tags/Settings navigation. The rendered screenshot shows the brand aligned at the upper-left with search at the opposite top corner.


Quiet Editorial coded-logo verification: the live app renders one top-corner brand with an inline SVG and no `<img>` logo. The brand symbol contains the shared outer vector path plus eight internal page-line paths (four per side), and the Library navigation book uses the same coded geometry. The content lockup remains removed and navigation labels remain Library/Tags/Settings. The highest-density Android fallback was visually checked and shows the centered solid twin-page mark with cream lines.


Responsive logo/name verification: the live document title is `Huush — quiet reading`. Library branding renders as inline SVG with one outer symbol path plus eight detail paths (four per side), while the small Library navigation icon renders the same silhouette with four detail paths (two per side). No logo images are present in the live DOM. The three-item navigation remains intact.


## 2026-08-26 Settings scroll preservation check

On the local Huush app, Settings was scrolled to the lower About section and **Open source licenses** was clicked. The resulting confirmation toast appeared while the Settings dashboard remained at the same lower scroll position; it did not jump back to the top. This verifies the new `settingsScrollTop` capture/restore path for the `showToast()` render triggered by `open-licenses`.


## 2026-08-26 Developer-option scroll race check

A browser test unlocked Developer options while Settings was scrolled to the lower section. The first implementation restored `scrollTop` in `requestAnimationFrame`, so two immediate developer-toggle renders captured an interim `scrollTop` of 0. The restoration was changed to synchronous assignment immediately after `innerHTML` replacement; this must be retested after the hot reload.


## 2026-08-26 Synchronous developer-option restoration verified

After the hot reload, Settings with Developer options enabled was scrolled to `scrollTop: 1504`. Clicking both **Logging enabled** and **Verbose logging** in immediate succession kept the scroll position at `1504` after each render and at the end. This confirms the synchronous restoration removes the rapid-render race.


## 2026-08-26 Android migration human-style regression baseline

The local Android migration branch loads the Library view at `http://127.0.0.1:3001/` with the expected Huush branding, search button, article URL field, Add article action, collection controls, saved article card, and three-item Library/Tags/Settings navigation. The browser rendered the compact mobile-oriented shell inside the current desktop viewport without a visible startup error. Further interaction testing is in progress; this entry records only the initial baseline.

## 2026-08-26 Reader interaction pass

The saved test article opens successfully. The reader header exposes back, saved-state, reader menu, share, reading-surface, Organize, and Open source actions. The reader menu opens as a centered bottom-sheet style panel with Done, Focus mode, Reading settings, Copy source link, and Share article. Focus mode hides the reader chrome while leaving the article content visible and the vertical scroll position intact. No immediate visual inconsistency was found in this path.

## 2026-08-26 Reader focus and footer boundary pass

Escape did not exit Focus mode, but the documented center-tap gesture did restore the reader toolbar. This is acceptable for the touch design because the menu label changes to “Show controls”; Android back is also wired to exit Focus mode. Scrolling the long test article to the end kept the toolbar stable, showed the final paragraphs and both Organize/Open source actions without clipping, and did not reproduce the earlier end-of-page shiver in this browser run.

## 2026-08-26 Capture validation pass

Returning from the reader restored Library at the expected top position. Submitting an empty capture form produced the in-app “Paste a complete article URL first.” toast without navigation or reload. Entering `example.com` and submitting was rejected by the browser’s native `type=url` validation (“Please enter a URL.”), which is appropriate and prevents a network request; the Library surface remained intact.

## 2026-08-26 Saved-article search pass

The Library search control expands inline without a full reload. A matching query filtered the saved card correctly; a non-matching query displayed “No matching articles. Try a different title, source, or keyword.” with a Clear search action. Navigation remained stable and the capture form stayed available. No stale article card remained visible for the non-match.

## 2026-08-26 Settings typography pass

Settings opened with four expected reading fonts and the size range. Selecting Merriweather updated the live preview and selected radio state in place; increasing the size changed the range value from 18 to 19 without resetting the internal Settings scroll. A reproducible inconsistency is present: the Settings UI reports **App version 2.4.4**, while the Android test APK is version `2.5.1-statusbar-test`/code 24. This should be aligned before delivery.

## 2026-08-26 Settings theme pass

Dark and Sepia themes both switched in place without a reload. The selected theme cards, live preview, typeface cards, storage rows, and navigation stayed readable; the previously reported Sepia headline bar was not reproduced. The selected font remained Merriweather and size remained 19 across the theme changes, as expected.

## 2026-08-26 Canonical mobile wide-viewport pass

After applying `data-canonical-ui="mobile"`, the interactive 900px browser view rendered a 720px Android-style surface centered with neutral side bars, circular plus capture action, and three-item bottom navigation. The first standalone headless Chromium screenshots at 390px and 900px captured only the paper background, so that method is timing-sensitive for this Vite app and is not treated as a UI failure; interactive browser rendering remains the authoritative check for this pass. A browser-native screenshot method with an explicit readiness wait will be used before final validation.

## 2026-08-26 Mobile-canonical correction verified at wide viewport

After a cold reload at the 900px browser viewport, the Android branch rendered a centered 720px mobile surface with neutral side bars, a circular plus capture action, compact single-column article cards, and three bottom-navigation items. The Settings view retained the same bottom navigation and bottom-sheet-style behavior. The Settings label now reports `2.5.2-mobile-ui-test`, matching the updated source version planned for the APK.

## 2026-08-26 Wide-browser canonical capture and reader pass

At 900px, the Library capture row now uses the Android circular plus action with the label hidden visually, not the desktop Add article pill. The saved article opens inside the centered 720px mobile reader surface with the compact toolbar, mobile-width typography, Article divider, and no expanded desktop article margins. Submitting the empty form still produces the expected local validation toast.

## 2026-08-26 Wide-browser reader-sheet pass

The reader menu and nested Reading settings both render as bottom sheets at 900px, matching Android rather than desktop dialog geometry. The reader font selection updates the article in place, and closing the nested sheet returns to the same reader surface without resetting the article to the top.

## 2026-08-26 Organization flow pass

The Organize action opens a bottom sheet at the wide test viewport, the Long reads checkbox can be selected, and Save organization closes the sheet without losing the reader position. Returning to Library showed `Long reads · 1`, and selecting that chip displayed the saved article in the collection. The Android-style footer and side-bar spacing remained consistent throughout.

## 2026-08-26 Settings destructive-action and developer pass

The clear-library confirmation now appears as a mobile bottom sheet inside the 720px shell and sits above the persistent bottom navigation; Cancel returned to the same lower scroll position. Reset reading defaults restored Light, Source Serif 4, and 18px with a local success toast and no reload. Logging and Verbose logging toggled independently while the lower Settings scroll position remained stable.

## 2026-08-26 Canonical Tags and collection-sheet pass

Tags now uses the same centered 720px Android surface at the wide browser viewport with the same three-item bottom navigation. New tag opens a bottom sheet inside that surface, and Done returns cleanly to Tags. No desktop sidebar or centered desktop modal appeared.

## 2026-08-26 Stable headless screenshot check

With a 5-second readiness budget and compositor flush, standalone Chromium still captured only the paper background at both 390px and 900px, while the interactive browser consistently rendered the complete app and its screenshots. The blank standalone captures are therefore a harness/startup-context limitation, not evidence of a blank app; DOM output from the same method did render `data-canonical-ui="mobile"` and the expected app markup.

## 2026-08-26 Diagnostics and console pass

The canonical mobile Event log view supports live text filtering and Error/Warn/Info filters; an Error filter with the `article` query correctly displayed “No matching events.” Returning to Settings preserved the mobile shell. Open-source notices appeared as a local toast without a scroll reset. The live console showed no uncaught exception or unhandled rejection during the tested navigation, sheets, settings, and reader flows.

## 2026-08-26 Final first-paint mobile-canonical check

A cold interactive browser start at the wide viewport now shows the Android Library interface immediately: the 720px mobile surface is centered with neutral side bars, the capture action is a circular plus button, article cards remain compact and single-column, and navigation remains Library/Tags/Settings at the bottom. The static HTML marker prevents the old desktop presentation from appearing before JavaScript initialization.

## 2026-08-26 Full feature pass: Library search

Cold Library start stayed on the canonical Android shell at the wide viewport. The top search control expands an inline saved-article search field, focuses correctly, and filters the fixture. A guaranteed non-match shows a dedicated message and Clear search action rather than stale cards. The circular plus remains the only article-capture action; bottom navigation remains Library, Tags, and Settings.

## 2026-08-26 Full feature pass: capture validation and recovery

Empty capture submission shows `Paste a complete article URL first.` without layout movement. A malformed URL is rejected by the browser URL control with `Please enter a URL.` and does not start a fetch. A valid safe HTTPS request entered the `Fetching article…` state, then returned to an idle Library state without a stuck spinner; the current fixture remained intact.

## 2026-08-26 Full feature pass: extraction and reader fixture

The controlled same-origin article now saves through the real capture flow. The expanded fixture is not preview-only, uses the full `og:title`/heading title, retains 15 body paragraphs, and retains exactly one Open Graph image after duplicate-image removal. Publisher `style`, `class`, `id`, `data-*`, and script attributes were removed; the remaining `data-loaded` marker belongs to Huush’s image loader and is not publisher content. A reproducible issue remains for loopback/IP URLs: `sourceName()` renders the source as `0` because it treats the final IPv4 component as the brand.


## 2026-08-26 Full feature pass: reader end and progress

The expanded full article reaches the footer at the end of the reader without clipping; Organize and Open source remain reachable. Before the patch, the reader progressbar visually tracked scroll but its `aria-valuenow` stayed at `0` at the end. The handler now synchronizes `aria-valuenow` and `aria-valuetext` whenever scroll progress changes; a post-patch end-position verification is still required.


## 2026-08-26 Full feature pass: progress and Focus mode

After the patch, scrolling the full fixture to the end reports `aria-valuenow="100"`, `aria-valuetext="100% read"`, visual progress `100%`, and an end-reachable footer. A clean runtime reload then confirmed the Reader menu’s Focus mode hides the entire reader chrome and leaves only the article actions visible; the earlier failed toggle was caused by the hot-reload test context, not the clean app runtime.


## 2026-08-26 Full feature pass: Focus-mode exit checks

The clean runtime enters Focus mode correctly and removes the Reader toolbar. A browser coordinate tap on the rendered article and Escape did not exit Focus mode in this run; the state remained `focus=true`, `toolbarHidden=true`, and `scrollTop=0`. This may reflect the browser harness not delivering the intended content click, but it must be verified against the delegated click handler and Android back callback before release.


## 2026-08-26 Full feature pass: reader tools

A real paragraph click exits Focus mode and restores controls without a reload. Copy source link closes the menu, shows `Source link copied.`, and returns to the reader. The full fixture reader currently shows one hero image and the Article separator; its source is now displayed as `Local source` for the loopback test URL.


## 2026-08-26 Full feature pass: reading preferences and copy

Nested Reading settings remain bottom-anchored and preserve the reader. Merriweather selection updates in place; rapid slider values `24 → 20 → 18` end at `18px` and the visible ARIA label reads `18 pixels, default`. Copy source link shows a success toast and closes the menu. Dark and Sepia reader surfaces remain readable and the previously reported Sepia headline bar was not reproduced.


## 2026-08-26 Full feature pass: sharing

The Reader menu and toolbar share actions reach the handler, but browser mode currently shows `Couldn’t open sharing.` because it calls the native Capacitor Share plugin without a web fallback. This is a real cross-platform inconsistency for the Android branch’s browser-mobile test surface. The fix will use `navigator.share()` where available, treat user cancellation as non-error, and fall back to copying the source URL.


## 2026-08-26 Full feature pass: browser share and new collection

Browser Share article now falls back to copying the source URL and shows `Source link copied. Sharing is unavailable here.` instead of a false native-share error. New collection opens as an in-shell bottom sheet; a blank submission leaves the sheet open and creates no empty collection.

## 2026-08-26 Full feature pass: tap targets
A final cascade-safe canonical-mobile layer raised the Library search/theme control, collection chips/new controls, empty-state CTA, capture inputs, reader toolbar/tools, Settings back control, and persistent bottom navigation to at least 48 CSS px. The live wide-viewport audit found no visible primary button/radio control below 48px; the only sub-48 measurement is the native range track (16px) inside a 48px `.font-size-slider` wrapper. Capture sheet closure remained clean. Physical Android status/gesture inset, IME, rotation, TalkBack, splash, and native Share verification remain device-only.

## Open exhaustive checks
Developer version seven-tap unlock, reduced-motion, keyboard visualViewport behavior, accessibility focus order, and final console diagnostics still require completion before build and delivery.

## 2026-08-26 Full feature pass: deletion and clear flows
A touch-like drag through the actual delegated pointer handlers removed the first saved card. A second swipe removed the remaining card; the underlying pending-delete state was restored through the existing Undo action and the article returned to Library. Clear-library Cancel preserved the article count and lower Settings scroll; Confirm cleared all saved articles and collections, updated storage to zero, and returned the empty-state counts without a reload. The disposable article was recaptured afterward for reader tests.

## 2026-08-26 Full feature pass: reader surface and actions
The Reader surface chooser rendered as an in-shell bottom sheet with Light, Sepia, and Dark radio options; switching to Light closed the sheet in place and preserved the reader. Bookmark returned `Already saved in your library.` without changing state. Browser Share returned `Source link copied. Sharing is unavailable here.` and did not log a native plugin failure. The reader remained at the same position throughout.

## 2026-08-26 Full feature pass: confirmation dialogs
The native browser-confirm dependency was removed from collection deletion and developer Clear logs. Both now use the in-app accessible confirmation dialog. Collection deletion confirmation removed the collection while retaining articles; Clear logs Cancel preserved the view, and Confirm removed diagnostics only, retained saved-article storage, dismissed the dialog, and displayed the success toast. An active collection delete was also verified: the article stayed saved, its membership was removed, and the Library filter reset to All.

## 2026-08-26 Full feature pass: developer options and accessibility
A fresh locked-state seven-tap test initially exposed a real scroll jump when Developer options were revealed from a scrolled Settings view. The toggle now captures and restores the Settings scroll position; a repeat from `scrollTop=520` ended at `520` (`delta=0`) while enabling Developer options. Logging toggled off/on in place; Simulate error created `error.test`; Error filtering and row expansion showed the diagnostic detail; Export logs produced a valid 11.8 KB JSON download with 39 events; Reset developer options hid the section again. The live accessibility audit found 26 visible controls with no unnamed control; only the native 16px range track is below 48px, inside a 48px `.font-size-slider` wrapper.

## 2026-08-26 Full feature pass: System theme and keyboard-safe capture
System theme selected successfully with `themePreference=system`, effective `theme=light` under the browser’s light OS preference, label `System (light)`, and matching theme-color token. The capture sheet’s focused URL field measured 61px high and remained within the visible 1100px browser viewport; the sheet used its expected bottom anchoring and no layout overflow appeared. This is browser-side verification only; Android IME resize, rotation, and safe-area behavior still require a physical device.

## 2026-08-26 Full feature pass: collection management
The visible Library collection header previously exposed only `+ New`, leaving the existing rename/delete handlers unreachable. A `Manage` action was added beside `+ New`. Rename to `Essays` persisted in place and retained the article membership; duplicate rename was rejected with `That collection already exists.` Deleting the disposable `Regression Folder` now opens an in-app confirmation sheet rather than a blocking browser `window.confirm`; confirming removed only the collection, kept both saved articles, and returned to Library. Android back now dismisses this confirmation before closing its underlying sheet.
