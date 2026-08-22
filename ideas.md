# whitemint editorial redesign — ground-truth reference

The supplied reading-app references are the visual target. **whitemint should borrow their high-legibility editorial rhythm, not their name, logos, feed content, or premium-product claims.** The app remains a private article archive: users save their own links, read cleaned articles, and export diagnostics.

## Chosen direction — Editorial Signal

### Design movement

**Editorial Signal** combines a newspaper-like hierarchy with the friendliness of a daily reading companion. It favors substantial type, abundant breathing room, small source markers, real article imagery, and a pale paper canvas punctuated by a highlighter-lime accent.

### Core principles

1. **Large type is the interface.** Headers, feed titles, controls, and article body text are comfortably sized so the app feels calm at an arm’s length.
2. **Reading looks curated, never fabricated.** Saved articles become feature cards using their own extracted title, source, reading time, and image; the product never invents summaries, recommendations, or ratings.
3. **The accent marks value.** Lime highlight bars emphasize a concrete app message or state, while article content and metadata remain neutral and readable.
4. **Light and dark are equals.** Both themes are designed as complete systems, not color inversion; each preserves comfortable contrast, legible imagery, and visual hierarchy.

### Color philosophy

Light mode uses **paper `#F6F5F1`**, ink `#101014`, and a lime highlighter **`#C6FA55`**. Dark mode uses graphite `#111113`, warm text `#F3F1EB`, a muted highlighter `#B2DD48`, and lifted charcoal cards. A soft periwinkle reader header is reserved for the article’s opening scene in light mode, while dark mode uses deep plum-black to keep the reader grounded.

### Layout paradigm

The library opens as a **daily reading brief**: a date-level heading, a short app-specific archive note, then a vertically paced feed of saved-article cards. Each card gives image, source, title, and reading time room to breathe. The reader begins with a large editorial title block, source identity, metadata, and—when present—the extracted hero image before the body.

### Signature elements

1. **Lime highlighter spans** behind selected interface phrases such as “worth keeping”.
2. **Source chips** with the first two letters of a source domain, generated locally from article metadata.
3. A **lavender opening field** for reader titles in light mode, paired with a darker grounded field in dark mode.

### Interaction philosophy

The bottom navigation remains low profile. A persistent theme control is available from the library header and reading preferences. In a reader, a center tap toggles focus mode; a second tap restores controls. Preferences update in place, retaining scroll location with no visible screen reconstruction.

### Animation

Content changes should be immediate or use only a 160ms fade/translate. Theme transitions use a short opacity and color transition, while reader focus hides chrome with a light fade. No animation should move the article body or interrupt scrolling.

### Typography system

**Nunito** leads the app chrome and daily briefing, using 600–700 weights. Article titles use Merriweather at display scale, and the article body continues to honor direct reading-font selection. UI labels start at 13–15px, card titles at 24–30px, reader titles at 38–48px on mobile, and body text defaults to 18px with generous leading.

### Brand essence

**whitemint turns your saved web reading into a calm, large-type daily brief you control.**

Its personality is **editorial, generous, and intentional**.

### Brand voice

The voice is selective and plainspoken. It describes the reader’s own archive rather than pretending to be a newsroom.

> “Your reading, delivered with room to think.”

> “A good article is worth keeping.”

### Wordmark and logo

The existing open-page mark remains, paired with a lower-case **whitemint** wordmark in Nunito. The mark may appear as a small source-style tile, while the wordmark stays secondary to the saved reading itself.
