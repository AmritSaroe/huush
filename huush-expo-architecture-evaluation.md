# Huush Expo + React Native architecture evaluation

## Decision

Expo + React Native is a valid leading candidate for Huush if the priority is one TypeScript product targeting Android, iOS, and the browser. The recommended configuration is Expo Router, React Native’s New Architecture, a development build rather than Expo Go for the real app, Riverpod-equivalent React state management such as TanStack Query plus a small local store, and a repository abstraction for storage and article extraction.

Expo Router is documented as a file-based router for React Native and Web, with shared routes, deep links, static web rendering, and platform-specific APIs. Expo’s documentation recommends a development build once the app needs native libraries or native configuration. React Native’s New Architecture is enabled by default in new projects and provides concurrent rendering, automatic batching, synchronous layout effects, and JSI-based native interop; it still requires appropriate app code and compatible libraries to produce user-visible improvements. [1] [2] [3]

## Recommended Huush layers

| Layer | Recommended technology | Responsibility |
|---|---|---|
| App shell and UI | React Native + Expo | Native Android/iOS UI and shared responsive UI primitives |
| Routing | Expo Router | Library, tags, settings, reader, capture, deep links, and web URLs |
| State | TanStack Query for async server/cache state plus Zustand or React Context for small local UI state | Loading, errors, article cache, settings, sheets, search, and navigation state |
| Native storage | SQLite-backed adapter such as Expo SQLite for structured native data | Saved articles, tags, collections, reading progress, and indexes |
| Browser storage | IndexedDB adapter or a web database with the same repository interface | Saved articles and settings in the desktop browser |
| Small preferences | `expo-secure-store` only for secrets; AsyncStorage or a web-compatible preferences adapter for non-secret settings | Theme, font, size, onboarding, and local flags |
| Article extraction | Canonical server-side Readability.js endpoint, with a tested local fallback where possible | Fetch public HTML, extract, sanitize, score, and classify preview/gated content |
| Reader rendering | Native HTML renderer on mobile and semantic HTML on Web, behind a shared article-content model | Article typography, images, links, selection, accessibility, and offline reading |
| Native capabilities | Expo modules and development-build config plugins | System bars, share sheet, file import, notifications, and platform integrations |

## Storage warning

Do not design Isar as the universal storage layer for Expo Web. Isar’s official documentation advertises mobile and native desktop support, not browser support. Expo SQLite or another SQLite adapter is appropriate for native structured data, but Web needs a separate implementation. The repository interface should hide this difference:

```ts
export interface ArticleStore {
  observeArticles(): Promise<Article[]>;
  saveArticle(article: Article): Promise<void>;
  deleteArticle(id: string): Promise<void>;
  searchArticles(query: string): Promise<Article[]>;
}
```

## Extraction recommendation

The existing JavaScript Readability implementation is valuable because it already contains Huush’s publisher adapters, title fallback, sanitization, preview threshold, and public-only policy. In Expo, the safest high-fidelity design is to move that canonical extraction pipeline into a small server-side Node/Deno function and let both the Web and native clients call it. The service must only fetch genuinely public content, must not bypass authentication or paywalls, must preserve provenance, and must return `previewOnly` for short or gated results.

A pure Dart or Kotlin parser is no longer necessary if Expo is selected. A local TypeScript fallback can be retained for pages that are already available in the client, but it should share fixtures and policy with the server extractor. Do not parse arbitrary article HTML by manually mapping a few tags; that was the cause of the native preview problem.

## Why Expo is attractive for Huush

Expo retains TypeScript as the main language, which allows the existing JavaScript extraction policy, metadata helpers, and web concepts to be reused more directly than with Kotlin or Flutter. React Native renders native platform components on mobile rather than embedding the entire UI in a WebView. Expo Router provides a single route model for Android and Web, and development builds permit custom native modules when Expo Go is insufficient. [1] [2]

The trade-off is that React Native Web is not identical to a conventional DOM application. Article reading must be tested for browser text selection, semantic links, keyboard shortcuts, accessibility, SEO, long documents, and responsive desktop layouts. If the desktop website must remain the highest-quality browser experience, Huush may still keep a separate browser-first frontend while sharing TypeScript domain/extraction packages with the Expo mobile app.

## Migration boundary

Do not convert the existing Capacitor or Compose branches in place. Create a new Expo repository or branch with a distinct application identifier. First port the domain contracts and extraction fixtures, then implement Library, Reader, Settings, and Capture as independent routes. Keep the current Capacitor app as the production reference and the Compose app as the native-selection reference until the Expo prototype passes the following gates:

| Gate | Required result |
|---|---|
| Startup | No white flash beyond the configured splash handoff; fast first meaningful screen |
| Android reader | Smooth long scrolling, native text selection, copy/share, links, and correct system-bar icons |
| Desktop Web | Full-viewport responsive layout, keyboard navigation, browser-native links and selection |
| Extraction | Same title, content, sanitizer, preview, and gate classifications as the canonical fixtures |
| Offline | Saved full articles reopen without a network connection; previews are not silently saved as full content |
| Navigation | Deep links open the correct article on Web and Android; back behavior is predictable |
| Storage | Native and Web adapters pass the same repository contract tests |

## References

[1]: https://docs.expo.dev/router/introduction/ — Expo Router introduction and universal routing.
[2]: https://docs.expo.dev/develop/development-builds/introduction/ — Expo development builds and native configuration.
[3]: https://reactnative.dev/architecture/landing-page — React Native New Architecture.
[4]: https://reactnative.dev/ — React Native official documentation.
[5]: https://capacitorjs.com/docs/ — Capacitor official documentation.
