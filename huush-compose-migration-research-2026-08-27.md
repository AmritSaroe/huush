
## Stack comparison research

React Native’s official documentation says JavaScript is rendered with native code on Android and iOS, and recommends a framework such as Expo for new apps. It also points to community-supported React Native Web, Windows, and macOS targets. This can deliver a native-feeling mobile UI while reusing React concepts, but it would require a React/TypeScript rewrite of Huush’s current vanilla-JS application and would not reuse the existing DOM-based Readability integration unchanged. [11]

Capacitor’s official documentation describes it as a web-focused native runtime: an existing modern JavaScript project can be wrapped for mobile, with web-standard APIs and native plugins. This is the lowest-rewrite option and remains suitable for the current desktop web plus mobile architecture, but it retains the WebView system-bar and selection behavior that motivated the native experiment. [12]

JetBrains’ official Compose Multiplatform documentation states that shared UI is production-ready for mobile and desktop, while its web target is Beta. It emphasizes native-quality platform integration and gradual adoption, but the web maturity level is an important risk for Huush’s primary desktop browser requirement. [13]

Android’s official Compose interoperability guidance supports incremental coexistence: use `ComposeView` to place Compose in View hierarchies and `AndroidView`/`AndroidViewBinding` to place traditional Views inside Compose. This supports a staged migration instead of a risky all-at-once rewrite. [14]

[11]: https://reactnative.dev/ — React Native official documentation.
[12]: https://capacitorjs.com/docs/ — Capacitor v8 official documentation.
[13]: https://kotlinlang.org/compose-multiplatform/ — Compose Multiplatform official documentation.
[14]: https://developer.android.com/develop/ui/compose/migrate/interoperability-apis — Compose interoperability APIs, Android Developers.

## Flutter + Isar + Riverpod assessment

Flutter’s official supported-platforms page lists Android, Windows, macOS, Linux, and modern Chrome/Firefox/Safari/Edge web targets. It also distinguishes supported, CI-tested, and unsupported platform combinations, which is useful for a desktop deployment matrix. [15]

Isar’s official site describes it as a Flutter-oriented, asynchronous, indexed, ACID-compliant NoSQL database with full-text search and iOS/Android/desktop support. Its own page does not list web support. Therefore, Isar is a strong mobile/desktop persistence candidate but should not be assumed to be the single browser persistence layer for a Flutter web build without a verified web backend or alternate storage adapter. [16]

Riverpod’s official getting-started documentation describes a self-sufficient Dart package with optional code generation, Flutter integration, provider overrides for testing, and lint support. It is a reasonable predictable state-management choice for a Flutter implementation. [17]

The requested `readability_dart` package page could not be extracted successfully during research, so it should not be selected without checking its source, maintenance activity, test coverage against Mozilla Readability, web/Android support, and license. A small server-side Readability.js extraction step remains the higher-fidelity option if one parser must serve all clients.

[15]: https://docs.flutter.dev/reference/supported-platforms — Flutter supported deployment platforms.
[16]: https://isar.dev/ — Isar official documentation.
[17]: https://riverpod.dev/docs/introduction/getting_started — Riverpod official getting-started documentation.

## Dart Readability package comparison

The `reader_mode` package (0.2.2, published four months ago with a verified publisher) documents itself as a Dart port of Mozilla Readability.js. It advertises Android, iOS, Linux, macOS, web, and Windows compatibility, supports a JSDOMParser and a pure-Dart HTML parser, and exposes title, content, textContent, excerpt, byline, siteName, language, and published-time fields. It states dual Apache-2.0/MPL-2.0 licensing because the JSDOMParser is ported from Mozilla code; this needs to be included in release notices. [18]

The `readability` package (0.2.2) is different: it is a Flutter FFI wrapper around the Go `go-readability` library, is listed for Android, iOS, and macOS rather than web or Windows, and therefore is not a single parser solution for Huush’s Android-plus-browser target. [19]

The `xayn_readability` project is an Apache-2.0 native Dart port of Mozilla Readability and includes a Flutter reader-mode widget, but its public repository documentation is sparse and its last visible repository history is older than `reader_mode`. It is worth benchmarking, not adopting blindly. [20]

[18]: https://pub.dev/packages/reader_mode — `reader_mode` Dart port of Mozilla Readability.
[19]: https://pub.dev/packages/readability — Flutter FFI wrapper around Go Readability.
[20]: https://github.com/xaynetwork/xayn_readability — Xayn native Dart Readability port.
