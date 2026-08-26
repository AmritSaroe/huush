# Huush

> A quiet place for the articles worth keeping.

Huush is a private, focused article reader for people who want to save the ideas they find online without carrying the noise of the original page into the reading experience. Paste an article link, let Huush extract the readable content, and return to it later in a calm interface designed around typography, space, and uninterrupted reading.

Huush is built Android-first with **Vite**, **Vanilla JavaScript**, **Mozilla Readability**, and **Capacitor 8**. Extracted articles are sanitized before they are rendered and saved locally on the device. There is no social feed, recommendation engine, or account layer in the core reading flow.

## The reading experience

The reader keeps the article’s title, source, metadata, lead image, synopsis, and body together in a consistent layout. A restrained reading toolbar provides only the actions needed while reading: return, save, open reader controls, share, and change the reading surface. Light, dark, and sepia themes, four reading typefaces, and adjustable text size make longer reading sessions more comfortable.

![Huush editorial hero: an open book on a warm ivory desk](docs/huush-readme-hero.png)

_Huush turns the articles worth keeping into a calm, personal reading space._

![Huush reading illustration showing a phone beside an open book](docs/huush-reading-illustration.png)

_The visual language pairs the familiarity of a book with the convenience of a private digital library._

## What Huush does

| Capability                   | Description                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Article capture              | Accepts individual article URLs and extracts the readable page content.                                                                                  |
| Publisher-aware extraction   | Uses a shared extraction pipeline with publisher-specific adapters where a site benefits from them.                                                      |
| Readability fallback         | Uses Mozilla Readability for generic article pages, with quality checks and a preview state for incomplete results.                                      |
| Clean rendering              | Sanitizes extracted HTML, normalizes links and images, removes unsafe presentation details, and keeps article content visually consistent.               |
| Local library                | Stores saved articles on the device using IndexedDB with a local-storage fallback.                                                                       |
| Search and collections       | Searches saved articles and organizes them into collections from Library and Tags.                                                                       |
| Reading controls             | Supports light, dark, and sepia themes; four reading fonts; adjustable type size; reading progress; and a focus mode.                                    |
| Temporary linked reading     | Opens eligible article links inside a temporary reader without saving them automatically. A separate Save action lets the reader keep one intentionally. |
| Sharing and browser fallback | Uses native sharing when available and falls back to the browser or Web Share API when appropriate.                                                      |
| Diagnostics                  | Provides an in-app diagnostic export for transport, extraction, rendering, and storage troubleshooting.                                                  |

## How an article moves through Huush

1. The user submits an individual article URL.
2. Huush chooses the native Android transport or browser transport available in the current environment.
3. The extraction registry selects a publisher adapter when one is available and falls back to generic extraction when needed.
4. The result is scored for quality, checked for access gates or preview-only content, sanitized, and normalized for rendering.
5. The article is saved only when the user confirms the capture. It is then available locally in Library and can be organized with Tags and collections.

This separation keeps transport, metadata, quality checks, paywall detection, sanitization, generic extraction, and publisher logic independent rather than putting every site-specific rule into one fetcher.

## Architecture

Huush uses a small, browser-native frontend and a Capacitor Android shell:

```text
client/
├── index.html
└── src/
    ├── main.js                    # Application state, rendering, navigation, actions
    ├── styles.css                 # Mobile-first interface and reading themes
    └── lib/
        ├── extractor/
        │   ├── index.js           # Extraction orchestration
        │   ├── transport.js       # Native/browser transport and limits
        │   ├── metadata.js        # Title, source, image, author, date
        │   ├── sanitize.js        # HTML cleanup and normalization
        │   ├── quality.js         # Quality scoring and preview rules
        │   ├── paywall.js         # Access-gate detection
        │   ├── generic-adapter.js # Readability and generic fallback
        │   └── registry.js        # Publisher adapter selection
        ├── publishers/            # Publisher-specific extraction adapters
        ├── article-store.js       # IndexedDB/local-storage persistence
        ├── article-sanitizer.js  # Stored/rendered article safety boundary
        └── logger.js              # Diagnostic events and export
android/
└── app/                           # Capacitor Android project
```

The Android shell targets modern Android edge-to-edge behavior and uses Capacitor System Bars with CSS inset handling. The reader reserves the device safe area separately from its control row so content and controls remain stable across display cutouts and different screen shapes.

## Technology

| Layer              | Technology                                                               |
| ------------------ | ------------------------------------------------------------------------ |
| Frontend           | Vite and Vanilla JavaScript                                              |
| Article extraction | Mozilla Readability with publisher adapters                              |
| Content safety     | DOMPurify and application-level article sanitization                     |
| Local persistence  | IndexedDB with local-storage fallback                                    |
| Android bridge     | Capacitor 8                                                              |
| Android target     | Android SDK 36 / Android 16 compatibility target                         |
| Styling            | CSS custom properties, responsive layout, and native safe-area variables |
| Package manager    | pnpm                                                                     |

Huush intentionally keeps the Android interface in the Android branch and the desktop presentation in the separate `webapp-huush` branch. This prevents desktop layout decisions from changing the mobile reading experience.

## Local development

Use Node.js and pnpm, then run the Vite development server:

```bash
pnpm install
pnpm dev
```

Open the local address printed by Vite. The browser build uses normal browser networking, so some publishers may reject direct requests because of CORS or anti-bot rules. Android uses the Capacitor native transport path where configured.

For a production web bundle:

```bash
pnpm run build:web
pnpm run preview
```

## Android development and APK build

The Android project is generated and synchronized from the web bundle. Build a debug APK locally with:

```bash
pnpm install
pnpm run build:web
pnpm run cap:sync
cd android
./gradlew assembleDebug
```

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The repository also contains an Android APK workflow at `.github/workflows/android-apk.yml` for repeatable CI builds. Huush is intended for direct distribution through GitHub and the official project website; no Play Store release is currently planned.

## Verification

Before pushing Android changes, run the project checks and build pipeline:

```bash
git diff --check
pnpm run check
pnpm run build:web
pnpm run cap:sync
cd android
./gradlew :app:lintDebug :app:assembleDebug --no-daemon --max-workers=1
```

Physical Android behavior still needs to be checked on a device, especially safe-area layout, keyboard behavior, status-bar rendering, WebView transport, and native share behavior. Browser validation is useful for DOM and responsive layout regressions but cannot substitute for Android WebView verification.

## Branches

| Branch                               | Purpose                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| `android-capacitor-8-migration-test` | Current Android-first Huush development and verification branch. |
| `webapp-huush`                       | Separate desktop web presentation.                               |

Short-lived experiment branches should be removed after their changes are incorporated into the relevant active branch.

## Privacy and scope

Huush is designed as a personal reading tool. Saved articles, preferences, collections, and diagnostic events are kept in the local application storage unless a user explicitly chooses an external action such as opening the source in a browser or sharing an article. Extraction quality depends on what a publisher makes available to the requesting environment; Huush does not attempt to bypass authentication, subscriptions, or access controls.

## Status

Huush is under active development. The core article-reading experience, local library, publisher-aware extraction pipeline, Android safe-area handling, themes, typography controls, sharing, linked-article reading, and diagnostics are implemented. The Android branch remains the source of truth for the current mobile interface while the desktop experience evolves independently.

## License

The project package metadata currently declares the MIT License. See `package.json` for the repository’s package-level license declaration.
