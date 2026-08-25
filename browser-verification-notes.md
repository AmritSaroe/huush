# Browser verification notes — Huush brand correction

At `http://localhost:4176/`, the real Vite app rendered the Library screen with a cream paper surface, live Huush wordmark, Library inline capture field and Add article button, collections, and exactly three bottom/side navigation items: Library, Tags, Settings. No centered navigation Add control was rendered.

Settings opened through the rendered navigation and showed all four reading font cards (Inter, Source Serif 4, Merriweather, Literata), text-size slider, System/Light/Dark/Sepia theme choices, storage/about sections, and the same three navigation items. The screenshot state used a light/sepia-like paper surface; the cream mark surface is intentionally close to the paper in that theme, while the three ink strokes remain visible. Further Dark-theme verification is required because it provides the strongest contrast check for the cream rounded-square mark.


Dark-theme verification: Settings switched to Dark without a full-page reload, the cream rounded-square Huush mark with three dark wave strokes was visible in the header, font cards and theme cards retained readable contrast, and the three-item navigation remained present. Returning toward the top moved the Settings internal scroll container rather than resetting the document state. The new mark is visually distinct in Dark as intended.


Library/capture verification: returning from Settings preserved the Dark theme and showed the new cream-square mark clearly. The rendered navigation contained only Library, Tags, and Settings. The empty-library “Add your first article” action opened the capture sheet with its URL field and plus submit button, confirming that article capture remains available through Library only.


Tags verification: closing the capture sheet returned to Library, then Tags opened in Dark theme. The page showed a thin outline tag glyph in the empty state, a New tag action, and exactly Library/Tags/Settings in the navigation. No centered `+ article` control appeared.


Live DOM audit via the browser console reported `innerWidth: 1280`, `.app-shell` width `1280px`, three rendered `.bottom-navigation button` elements (`show-library`, `show-tags`, `show-settings`), zero `.bottom-navigation__add` elements, one mark rect, and no legacy `M11 10h13` open-book path. The desktop layout therefore uses the intended full-width shell and side navigation while the renderer remains responsive through CSS breakpoints.


Sepia verification: Settings opened from Tags and Sepia was selected in place. The preview, controls, storage, and About sections remained on the same screen, with no full reload; the warm brown text on cream surface remained legible and the three-item navigation stayed consistent.
