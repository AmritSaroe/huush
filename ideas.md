# whitemint — design direction

## Three directions considered

### 1. Quiet Index
**Very brief intro:** A disciplined, editorial reading surface that feels like a private clipping book. Information is deliberately sparse, paced by typography and hairline dividers rather than decoration.

**Probability:** 0.07

### 2. Paper Margin
**Very brief intro:** A contemporary take on a printed literary journal, using generous margins and a calm serif reading field inside a crisp utility shell.

**Probability:** 0.04

### 3. Signal Slate
**Very brief intro:** A compact technical reader with dense diagnostic surfaces, monospaced status details, and an almost instrument-like interface.

**Probability:** 0.09

## Chosen direction — Quiet Index

### Design movement

**Quiet Index** draws from Swiss editorial systems and contemporary reading products: exact spacing, strong typographic hierarchy, monochrome restraint, and a narrow column that makes saved reading feel intentional rather than algorithmic.

### Core principles

1. **Reading remains dominant.** Controls retreat into precise, familiar shapes so every screen directs attention toward an article's words.
2. **Hierarchy is earned through type and spacing.** Hairline rules, tonal contrast, and carefully scaled labels create order without decorative color or card clutter.
3. **The app behaves like a dependable tool.** Loading, extraction failures, offline states, and logs appear plainly and are easy to understand.
4. **Monochrome never means lifeless.** Warm-white and ink-black surfaces, nuanced gray ramps, and tactile press states make the interface feel considered.

### Color philosophy

The palette is built around **paper, ink, and graphite**, with off-white used as a quiet reading field and near-black as the singular structural anchor. Gray tones only express information depth and interaction state; status colors are reserved for errors and success messages. The chosen signature color is **Ink Black `#111111`**, which becomes the active-control fill and the product's unmistakable visual mark.

### Layout paradigm

The primary experience is a **vertical reading rail**, not a dashboard: an upper utility strip introduces the current context, a compact capture field sits beneath it, and saved articles flow as a continuous index. On larger screens, that rail sits inside a centered phone-sized device frame with a secondary diagnostic mode available from the same low-profile tab bar. The reader opens as a full, uninterrupted page with a pinned control bar.

### Signature elements

1. A cropped **open-page glyph** used as the app mark and empty-state object.
2. **Editorial rules**: 1px dividers that align to the reading rail and organize each list item.
3. **Index numerals**: quiet monospaced timestamps, item numbers, and log metadata that imply a private archive.

### Interaction philosophy

Interactions should be confirmatory, never performative. Buttons compress slightly when pressed, reader navigation slides with a short horizontal movement, and feedback lives close to its trigger. The debugging tab treats technical details with the same clarity as the reader: a single copy action, a clear log count, and readable event records.

### Animation

Navigation uses a 220ms custom ease-out slide, with an entering page moving 14px from the right and fading from 0.96 opacity. The settings sheet rises in 240ms from the bottom; the backdrop fades over 180ms. New saved-list items enter with a 40ms stagger and only opacity plus a 6px vertical transform. All nonessential movement is disabled for reduced-motion preferences.

### Typography system

The UI follows the supplied **Inter 400/500** system for chrome, labels, article lists, and diagnostic text, while reading preferences expose **Merriweather, Lora, Source Serif 4, and JetBrains Mono**. Headlines use Inter 500 with modest negative tracking, reading body copy starts at 16px and 1.75 leading, and low-level technical data uses JetBrains Mono at 11–12px. No weight heavier than 500 appears in the interface.

### Brand essence

**whitemint is a private, no-distraction reading desk for saving the web's useful words in their cleanest form.**

Its personality is **considered, clear, and self-contained**.

### Brand voice

The voice is lucid, precise, and quietly confident. Headlines name a concrete state; CTAs are direct verbs; error copy states the action that failed without blaming the reader.

> “Save the page. Keep the words.”

> “Couldn’t extract this article. Copy the diagnostic log if you want help.”

### Wordmark and logo

The wordmark is a tight lowercase **whitemint** set in a carefully tracked Inter Medium, paired with an offset open-page mark: two outlined vertical leaves meeting at a central gutter, with the lower outer corner intentionally trimmed. The mark works at small sizes, remains monochrome, and can become the Android launcher icon and favicon without text.
