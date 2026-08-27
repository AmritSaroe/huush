
## Stack comparison research

React Native’s official documentation says JavaScript is rendered with native code on Android and iOS, and recommends a framework such as Expo for new apps. It also points to community-supported React Native Web, Windows, and macOS targets. This can deliver a native-feeling mobile UI while reusing React concepts, but it would require a React/TypeScript rewrite of Huush’s current vanilla-JS application and would not reuse the existing DOM-based Readability integration unchanged. [11]

Capacitor’s official documentation describes it as a web-focused native runtime: an existing modern JavaScript project can be wrapped for mobile, with web-standard APIs and native plugins. This is the lowest-rewrite option and remains suitable for the current desktop web plus mobile architecture, but it retains the WebView system-bar and selection behavior that motivated the native experiment. [12]

JetBrains’ official Compose Multiplatform documentation states that shared UI is production-ready for mobile and desktop, while its web target is Beta. It emphasizes native-quality platform integration and gradual adoption, but the web maturity level is an important risk for Huush’s primary desktop browser requirement. [13]

Android’s official Compose interoperability guidance supports incremental coexistence: use `ComposeView` to place Compose in View hierarchies and `AndroidView`/`AndroidViewBinding` to place traditional Views inside Compose. This supports a staged migration instead of a risky all-at-once rewrite. [14]

[11]: https://reactnative.dev/ — React Native official documentation.
[12]: https://capacitorjs.com/docs/ — Capacitor v8 official documentation.
[13]: https://kotlinlang.org/compose-multiplatform/ — Compose Multiplatform official documentation.
[14]: https://developer.android.com/develop/ui/compose/migrate/interoperability-apis — Compose interoperability APIs, Android Developers.
