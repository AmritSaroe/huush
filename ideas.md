# whitemint redesign — ground-truth reference

The supplied reference is the visual target for the next release. **whitemint must adopt its native-app character without copying its brand, copy, data, or finance-product features.** The result is a warm, reader-first archive with similar clarity, rounded card rhythm, tactile controls, and calm use of one luminous accent.

## Chosen direction — Mint Companion

### Design movement

Native mobile product design with **friendly utility cards**: softly rounded surfaces, roomy gutters, inky navy typography, a warm white canvas, and one optimistic green accent. The composition should feel like an intentional phone application rather than an adapted web page.

### Core principles

1. **A useful welcome.** The library opens with a compact activity snapshot and a prominent save card, so the archive feels alive without inventing social proof or editorial content.
2. **One high-value accent.** A lime-mint progress card expresses the current library state; the rest of the interface remains paper-white, navy, and soft gray.
3. **Touchable hierarchy.** Rounded cards, round icon buttons, and a fixed bottom bar make every principal action easy to discover with one hand.
4. **Focus by subtraction.** In an article, tapping the reading field enters focus mode: the header and navigation disappear, while a second tap restores them.

### Color philosophy

Warm white acts as the reading paper. **Whitemint green `#B9E77A`** is the signature color and appears only on the library-status card and small active moments. Deep navy `#0D0B2B` anchors icons, copy, and the navigation system. Shadows are blue-gray and deliberately diffuse rather than heavy.

### Layout paradigm

The library is a **stack of inhabitable cards** above a fixed bottom navigation: a top utility row, one bright archive-progress card, one large save-link card, then saved readings. The reader is an immersive vertical page with a compact top bar that can fully disappear in focus mode.

### Signature elements

1. A rounded **open-page glyph** contained in a soft square tile.
2. A **mint archive-progress card** with a circular count indicator.
3. A five-position **bottom navigation** where only Reader and Debug are active destinations; other positions are intentionally absent rather than fake features.

### Interaction philosophy

Reader and Debug navigation are explicit, while Android back and edge gestures return from settings, focus mode, or an open article in that order. Preference controls update the in-place reader without reconstructing the screen. Center taps on reading content toggle focus without interfering with links, images, selections, or form controls.

### Animation

Use short 160–220ms opacity and transform transitions only. Opening a card lifts its shadow slightly. Focus mode fades the toolbar and bottom navigation instead of triggering a page transition. Font, size, and theme changes must be instantaneous with no reader remount or scroll reset.

### Typography system

**Nunito** provides the friendly UI voice; Inter remains available for a sharper reading option. Merriweather, Source Serif, and JetBrains Mono remain direct reader choices. Library headings use Nunito 600–700, metadata uses Nunito 500, and article text honors the current reading preference.

### Brand essence

**whitemint is a quiet pocket archive that turns the web’s worthwhile articles into an inviting personal reading habit.**

Its personality is **warm, capable, and calm**.

### Brand voice

The voice is supportive and practical. Headings name a clear next state, while action labels use everyday verbs.

> “Save a good read for later.”

> “Your private shelf is ready when you are.”

### Wordmark and logo

The open-page mark is retained but placed inside a rounded navy tile. The wordmark remains lowercase **whitemint**, now set in Nunito with a softer, more companionable rhythm.
