# Huush native Readability and Android/web stack report

## What changed

The branch `native-kotlin-compose-test` now uses `net.dankito.readability4j:readability4j:1.0.8`, an Apache-2.0 Kotlin port of Mozilla Readability, as the native parser foundation. The parser is wrapped by `NativeReadabilityExtractor`, which adds Huush-specific title fallback, byline fallback, HTML sanitization, removal of scripts/styles/classes/IDs/data attributes and promotional nodes, absolute URL normalization, paywall-marker detection, candidate scoring, and the existing preview rule of fewer than 1,200 characters or fewer than three content blocks.

This is more faithful than the original native `article`/`main`/`p` heuristic, but it is not a fresh line-by-line port of the latest Mozilla Readability.js commit. Readability4J 1.0.8 was published in 2021 and documents compatibility with an older Mozilla Readability revision. If benchmark tests later show differences on specific publishers, the next step should be a controlled fork/update of the Kotlin parser rather than silently relaxing the preview threshold or bypassing gates.

Normal and linked article fetching must continue to use this same native repository pipeline. Pages that are genuinely short, gated, or incomplete remain preview-only. Huush must not bypass authentication, subscriptions, authorization, or paywalls.

## Technology options

| Stack | Android experience | Desktop browser experience | Code sharing | Main trade-off for Huush |
|---|---|---|---|---|
| Native Kotlin + Jetpack Compose Android plus existing TypeScript web app | Strongest control over Android system bars, scrolling, selection, lifecycle, and performance | Excellent, because the web app remains browser-native | Share API contracts, data models, fixtures, and extraction policy; keep UI platform-specific | Two UI implementations, but the lowest technical risk for the current Android problem |
| Kotlin Multiplatform shared core plus Compose Android and separate TypeScript web UI | Native Android UI and shared Kotlin domain/data logic | Excellent browser behavior if the web UI remains TypeScript | Share models, repository contracts, validation, and potentially parser logic | Best balanced long-term architecture; requires a shared-module build and platform adapters |
| Compose Multiplatform for Android, desktop, and web | Strong Android and desktop-native UI | Compose web is currently Beta according to JetBrains | Potentially high UI sharing | Attractive for a Kotlin-only product, but risky while the primary requirement is a mature desktop browser reader |
| React Native with React Native Web/Expo | Native Android components rendered from JavaScript | Possible through React Native Web | High React UI sharing | Requires a substantial rewrite from vanilla JS and adds a React ecosystem; web semantics and the existing DOM-based parser need re-integration |
| Flutter | Native-style Android rendering and a single Dart UI codebase | Supported browser delivery through WebAssembly/canvas-oriented rendering | High UI sharing | Requires a Dart rewrite and is less natural for a browser-first, text-heavy reader with semantic links and browser selection behavior |
| Capacitor plus the existing web UI | Minimal rewrite and excellent desktop web | Excellent | Maximum reuse of current TypeScript/DOM code | Retains the WebView-specific system-bar and selection-toolbar issues that motivated the native branch |

## Flutter + Isar + Riverpod proposal

This proposal is technically coherent and stronger than a generic Flutter stack because it assigns clear responsibilities: Flutter for the UI, Riverpod for predictable state, Isar for mobile/desktop offline data, and a Readability implementation for extraction. Flutter’s official platform matrix covers Android, Windows, macOS, Linux, and current major browsers. [10] Riverpod’s official documentation supports provider overrides, code generation, and linting, making it a reasonable state-management choice. [11]

The important caveat is Isar’s platform boundary. Isar’s official site advertises iOS, Android, and desktop support, but does not advertise web support. A Flutter web build would therefore need a separate browser persistence adapter—such as IndexedDB, SQLite through a server-backed design, or the existing web storage/backend approach—if the desktop requirement means browser delivery rather than a Windows/macOS/Linux executable. [12]

For extraction, `reader_mode` is the most relevant current Dart candidate found: it documents Android, iOS, Linux, macOS, web, and Windows compatibility, exposes Mozilla-style article fields, and claims both a JSDOMParser and a pure-Dart parser. However, its licensing is dual Apache-2.0/MPL-2.0 and its output should be benchmarked against Huush’s existing JavaScript pipeline. The similarly named `readability` package is a Flutter FFI wrapper around Go Readability and is listed for Android, iOS, and macOS, so it is not a universal web solution. [13] [14] A server-side Readability.js service remains the strongest fidelity option if all clients should receive identical extraction results.

| Proposed Flutter component | Assessment for Huush |
|---|---|
| Flutter | Good choice if one shared UI across Android and desktop executables is more important than browser-native rendering. Web support exists, but article text, links, selection, accessibility, and SEO need explicit testing. |
| Isar | Strong for Android and native desktop offline data, including indexes and full-text search. Do not assume it covers Flutter Web; use a storage interface with a browser-specific implementation. |
| Riverpod | Good choice. It fits article-loading states, search, settings, sync, and testable repositories. It is not a database or extraction solution. |
| `reader_mode` | Most promising pure-Dart candidate found for one parser across targets, but requires a benchmark corpus, licensing review, and validation against current Mozilla behavior. |
| Server-side Readability.js | Best for algorithm fidelity and one canonical result, but requires network access, a backend, rate limits, privacy decisions, and a safe public-fetch service. |

## Recommendation

Huush should use a **native Android app in Kotlin + Jetpack Compose** and keep the existing desktop web app as a separate browser-native frontend. Add a shared contract layer rather than forcing shared UI: identical article fields, preview/gate semantics, URL normalization rules, test fixtures, and repository behavior should be specified once and tested in both implementations.

If code sharing is important later, introduce **Kotlin Multiplatform for the domain/data layer only**. Keep Compose Android native, and keep the desktop website in TypeScript until Compose Multiplatform Web is mature enough for Huush’s browser requirements. This preserves Android’s native advantages without sacrificing browser-native text, links, accessibility, and deployment.

Do not switch to React Native or Flutter solely to avoid duplicate UI code. Both would be new rewrites, and neither directly solves the extraction-quality problem. Do not rewrite the entire repository again. The working native branch is already evidence that the problematic Android selection surface can be avoided without changing the web product.

## References

[1]: https://github.com/mozilla/readability — Mozilla Readability official repository and source.
[2]: https://github.com/dankito/Readability4J — Readability4J Kotlin port and API documentation.
[3]: https://mvnrepository.com/artifact/net.dankito.readability4j/readability4j/1.0.8 — Readability4J artifact metadata, version, and Apache-2.0 license listing.
[4]: https://developer.android.com/kotlin/multiplatform — Android Developers guidance on Kotlin Multiplatform and the distinction between shared logic and shared UI.
[5]: https://kotlinlang.org/compose-multiplatform/ — JetBrains Compose Multiplatform platform support and web maturity information.
[6]: https://reactnative.dev/ — React Native official documentation and native rendering/platform information.
[7]: https://docs.flutter.dev/platform-integration/web — Flutter official web-support documentation.
[8]: https://capacitorjs.com/docs/ — Capacitor v8 official web-native runtime documentation.
[9]: https://developer.android.com/compose — Android’s official Jetpack Compose overview.
[10]: https://docs.flutter.dev/reference/supported-platforms — Flutter supported deployment platforms.
[11]: https://riverpod.dev/docs/introduction/getting_started — Riverpod official getting-started documentation.
[12]: https://isar.dev/ — Isar official documentation.
[13]: https://pub.dev/packages/reader_mode — `reader_mode` Dart port of Mozilla Readability.
[14]: https://pub.dev/packages/readability — Flutter FFI wrapper around Go Readability.
