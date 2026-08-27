# Huush Expo interface design

## Product intent

Huush is a calm, private personal reading space for saving genuinely public articles and reading them offline. The Expo rebuild uses a native-first Android and iOS experience, while retaining a responsive desktop Web mode. The design is editorial rather than dashboard-like: reading is the primary activity, controls are quiet, and every screen supports one-handed mobile use in a 9:16 portrait viewport.

## Screen list and layout

| Screen | Primary content and functionality | Mobile portrait layout | Desktop Web adaptation |
|---|---|---|---|
| Library | Saved articles, search, current collection, capture entry point, empty state | Header with Huush mark, search field, single-column `FlatList`, floating capture button above the tab bar | Full-viewport surface, persistent top navigation, inline capture field, two/three-column article grid |
| Capture sheet | URL field, paste action, extract action, loading/error state | Bottom sheet with a large URL field and single primary action within thumb reach | Centered dialog; the Library hero keeps an inline capture field as the main entry point |
| Reader | Title, source/byline, save/remove actions, article blocks, preview notice, source link | Native stack screen; large back target at top-left and actions at top-right; text measure remains comfortable at 18–22sp | Full-width background with the text column capped at approximately 680px; keyboard-accessible reader actions |
| Tags and collections | Article grouping and filters | List of named collections and article counts; create/rename actions in a modal sheet | Two-pane list/filter treatment within the wide Library shell |
| Settings | Theme, reader font, text size, diagnostics, open-source notices | Grouped settings rows with the reader controls near the top; slider commits on release | Same hierarchy in a narrow settings column; no page-level rerender on a preference change |
| Diagnostics | Recent fetch/extraction events and app information | Optional developer route hidden from ordinary navigation | Read-only panel for browser debugging |

## Key user flows

| Flow | Steps |
|---|---|
| Capture a public article | User opens Capture → pastes URL → starts extraction → sees loading state → receives full reader or preview-only reader → chooses Save only for a complete, public article |
| Read offline | User opens an article card → reader opens from the native stack → selects/copies text or follows a reference → returns with system back gesture/button |
| Read a preview | Extraction identifies a short, incomplete, or gated page → reader shows the available preview and a clear browser action → Huush does not store it as a complete offline article |
| Change reader preferences | User opens Settings → selects theme/font or moves size slider → app updates the reader without resetting the current screen or scroll position → preference persists locally |
| Use reference links | User taps a link in article content → Huush requests the same canonical extraction pipeline → opens a temporary reader → offers Save only if extraction is complete |

## Color choices

The brand uses the Quiet Editorial direction already selected for Huush. Light is warm-paper rather than pure white, dark is ink-black rather than blue-black, and sepia is a low-saturation book page rather than yellowed parchment.

| Token | Light | Dark | Sepia | Use |
|---|---|---|---|---|
| Canvas | `#F6F1E8` | `#161616` | `#E8DCC6` | Screen background and reader field |
| Surface | `#FFFDF8` | `#202020` | `#F1E7D4` | Cards, sheets, controls |
| Ink | `#24211D` | `#F4F1EB` | `#3E2723` | Headlines and primary text |
| Muted ink | `#766F65` | `#B8B2A8` | `#75614F` | Metadata and secondary labels |
| Accent leaf | `#A3C956` | `#B7DA63` | `#7F9C45` | Links, active tab, selection-adjacent emphasis |
| Divider | `#DED6C9` | `#353535` | `#D1C0A5` | Hairline separators and quiet borders |

## Typography and interaction

The interface uses a clean sans-serif system stack for navigation and settings. The reader and editorial headings use Source Serif 4 once the font asset is bundled. Reader paragraphs use 1.55–1.7× line height and never animate font metric changes. All primary tap targets are at least 44pt. Bottom navigation is used below 1024px; the capture action is a floating button rather than a redundant tab. Motion is limited to short opacity and 0.97 press-scale feedback, with no full-screen mount animations or layout jumps.

## Accessibility and platform rules

All controls require labels, sufficient contrast, keyboard focus on Web, and predictable Android back behavior. Native system bars follow the chosen reader theme but are not used to style private Android selection surfaces. Browser layouts retain semantic headings and links. The app never claims a gated preview is saved as a complete offline article.
