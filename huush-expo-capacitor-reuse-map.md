# Huush Expo + React Native architecture and Capacitor reuse map

## Executive architecture

The proposed Huush application should be a TypeScript monorepo with two clients and shared domain packages:

```text
                    ┌────────────────────────────┐
                    │ Shared TypeScript packages │
                    │ models · policies · parser │
                    │ sanitizer · test fixtures  │
                    └──────────────┬─────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
   ┌──────────▼──────────┐                   ┌──────────▼──────────┐
   │ Expo mobile client  │                   │ Expo Web client     │
   │ Android + iOS       │                   │ Desktop browsers    │
   │ React Native views  │                   │ React Native Web    │
   │ Expo Router         │                   │ Expo Router          │
   └──────────┬──────────┘                   └──────────┬──────────┘
              │                                         │
   ┌──────────▼──────────┐                   ┌──────────▼──────────┐
   │ Native adapters     │                   │ Browser adapters    │
   │ SQLite/files/share  │                   │ IndexedDB/fetch     │
   │ system bars         │                   │ DOM/web APIs        │
   └──────────┬──────────┘                   └──────────┬──────────┘
              └────────────────────┬────────────────────┘
                                   │
                         ┌─────────▼─────────┐
                         │ Extraction service │
                         │ Node/Deno          │
                         │ Readability.js     │
                         │ sanitization/gates│
                         └───────────────────┘
```

Expo Router should own routes such as `/`, `/tags`, `/settings`, `/capture`, and `/article/[id]`. Each route renders shared React components, but platform-specific implementations can be selected when mobile and browser interaction differ. Expo Router officially supports file-based routes, deep links, shared Android/iOS/Web navigation, and static web rendering. [1] [2]

The application should have a unidirectional data flow:

> **Screen → View-model hook → use-case/repository → storage or network → observable state → screen**

The UI must not call SQLite, IndexedDB, or the extraction endpoint directly. This boundary keeps Android and Web behavior consistent and makes storage and network code testable without rendering a screen.

## Layer-by-layer design

| Layer | What it contains | Expo/React Native implementation |
|---|---|---|
| Screens | Library, article reader, tags, settings, capture, diagnostics | Expo Router route files under `src/app/` |
| UI components | Cards, toolbar, sheets, sliders, theme controls, reader blocks | React Native primitives; platform-specific files only when necessary |
| View-model hooks | Search state, article loading, settings, navigation actions | React hooks plus TanStack Query and a small UI store |
| Domain models | Article, collection, tag, reading progress, extraction result | Shared TypeScript types and runtime schemas |
| Use cases | Capture URL, save article, delete article, search, apply settings | Platform-independent TypeScript functions |
| Repositories | ArticleStore, SettingsStore, ExtractorClient | Interfaces with native and browser implementations |
| Native adapters | SQLite, file import, share sheet, system bars, notifications | Expo modules and development-build config/plugins |
| Web adapters | IndexedDB, browser URL/history, Web APIs, static rendering | React Native Web plus browser-specific modules |
| Server | Public HTML fetch, Readability.js, sanitization, quality/gate policy | Node/Deno function behind `/api/article-fetch` or an extraction endpoint |

## Article extraction flow

1. The user enters a URL in the Capture screen.
2. The client validates and normalizes the URL.
3. The client calls the canonical extraction service. A local TypeScript fallback may be used only when intentionally supported and must share the same fixtures and policy.
4. The service fetches publicly available HTML, runs Mozilla Readability, applies publisher adapters, sanitizes the result, removes promotional noise, calculates quality, and detects explicit access gates.
5. The service returns a structured article result containing title, byline, source, clean HTML, plain text, excerpt, image metadata, strategy, score, `previewOnly`, and `accessGated`.
6. The client renders a preview immediately. It persists only full articles; preview-only results remain temporary unless the product explicitly supports storing them as previews.
7. On Android, the native repository writes the article to SQLite. On Web, the browser repository writes to IndexedDB or the selected web backend.
8. The Reader route consumes the structured model and renders links, images, headings, paragraphs, and selection behavior using the platform-appropriate renderer.

The service must not bypass paywalls, authentication, subscriptions, or authorization. Short, incomplete, or gated results must remain preview-only with a browser fallback.

## Storage architecture

Use a repository interface rather than coupling the application to one database:

```ts
export interface ArticleStore {
  observeArticles(): Promise<Article[]>;
  findById(id: string): Promise<Article | null>;
  save(article: Article): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: string): Promise<Article[]>;
  assignCollections(id: string, collectionIds: string[]): Promise<void>;
}
```

The mobile implementation can use SQLite because saved articles, tags, collections, reading progress, and full-text search are structured relational data. The browser implementation can use IndexedDB or a server-backed store. Preferences such as theme, font, font size, and diagnostics flags belong in a small key-value adapter rather than the article database.

Isar is attractive for Flutter, but it is not relevant to an Expo implementation. For Expo, choose a maintained SQLite/native adapter plus a Web implementation behind the same interface. Do not pretend a mobile-only database automatically works in the browser.

## Native Android behavior

React Native removes the full-screen WebView dependency for the application shell. Android buttons, lists, text surfaces, scrolling, and native navigation are rendered through React Native’s native rendering architecture. System-bar control is handled through Expo or a small native module. If a platform-specific feature is missing, Expo development builds permit native libraries and configuration; Expo Go should not be treated as the final runtime. [3]

The New Architecture is enabled by default in current React Native projects and offers concurrent rendering, automatic batching, synchronous layout effects, and JSI interop. These capabilities are useful for smooth lists and responsive interactions, but they do not automatically fix poorly structured state updates or an expensive article render. [4]

For the Reader, prefer a native HTML renderer or a structured article model. Do not place the entire application inside a WebView again. If exact HTML fidelity is required for complex publisher output, isolate a WebView only to the article content component and test its selection behavior separately; the app shell, navigation, capture, settings, and library should remain native React Native views.

## Desktop Web behavior

Expo Web can share routes and components, but React Native Web is not identical to a hand-authored DOM/Vite application. The desktop acceptance suite must cover semantic headings, links, copy/select, keyboard shortcuts, accessibility trees, focus restoration, URL routing, responsive grid layouts, long-article performance, and browser history. If these tests fail, keep the existing browser-first web client and share only the TypeScript domain/extraction packages with Expo mobile.

## What can be reused from Capacitor directly

| Existing Capacitor code | Reuse classification | How to use it |
|---|---|---|
| `client/src/lib/extractor/index.js` orchestration | High, after refactoring | Move into a shared TypeScript package; replace only the transport and client logging seams |
| `client/src/lib/extractor/generic-adapter.js` | High | Reuse the Readability candidate logic and quality selection; make DOM/transport assumptions explicit |
| `client/src/lib/extractor/quality.js` | Direct | Reuse thresholds, scoring, and preview classification as shared pure functions |
| `client/src/lib/extractor/paywall.js` | Direct | Reuse the public-only gate vocabulary and page-level marker checks |
| `client/src/lib/extractor/metadata.js` | Direct | Reuse title/byline fallback, source naming, reading-time, image identity, and duplicate-image policy |
| `client/src/lib/article-sanitizer.js` | High | Reuse in the server extraction package and browser fallback; keep DOMPurify on Web/server and add a platform-safe equivalent only where needed |
| `client/src/lib/extractor/sanitize.js` | High | Reuse or move with the extraction package |
| `client/src/lib/publishers/*.js` | High | Move publisher adapters into the shared extraction service; adapters remain policy-bound and must not bypass gates |
| `client/src/lib/extractor/transport.js` | Partial | Reuse the interface, timeout, response-size, and error policy. Replace `CapacitorHttp` with `fetch` or the server endpoint in Expo |
| `client/src/lib/smry.js` | Partial | Reuse request/response policy only. Replace Capacitor-native HTTP with the server-side fallback client |
| `client/src/lib/article-store.js` | Partial/high | Reuse article model, URL normalization, migration behavior, deduplication, and repository contract. Rewrite IndexedDB details for the selected Expo Web adapter and use SQLite on native |
| `client/src/lib/logger.js` | Partial | Reuse event names, payload shape, retention rules, and diagnostic concepts. Replace Capacitor platform detection with Expo device/runtime metadata |
| `client/src/main.js` | Low | Reuse business rules and action semantics selectively; rewrite rendering, event delegation, focus management, and navigation as React components/hooks |
| `client/src/styles.css` | Low/partial | Reuse palette values, typography decisions, spacing tokens, and reader design rules. Rewrite selectors and layout into React Native styles plus Web-specific CSS |
| `client/index.html` | Low | Reuse metadata, font decisions, and branding; Expo Router owns application entry and web document configuration |
| `server/article-proxy.ts` | High | Reuse or rename as the canonical public extraction endpoint, subject to server deployment and security review |
| `capacitor.config.ts` | None as configuration | Reuse intent only: background color, insets policy, and web/native distinction must be expressed through Expo app config and native adapters |
| `android/app/src/main/...` | None as app shell | Do not copy Capacitor Activity/theme glue. Reimplement required native behavior through Expo modules/config plugins or a small custom module |
| `android` Compose test branch | Reference only | Use it to compare native selection, scrolling, and system bars; do not merge its Kotlin UI into Expo |

## What cannot be reused directly

The Capacitor Android plugins are not React Native modules. `CapacitorHttp`, Preferences, Filesystem, Share, App lifecycle listeners, and SystemBars calls cannot be imported into an Expo app. Their product behavior can be preserved, but each capability needs an Expo equivalent or a custom native module.

The vanilla-JS event delegation in `main.js` cannot be copied into React components. React Native has no browser `document` event delegation model for mobile UI, and React Native Web should not be forced to emulate the old root-innerHTML render loop. State must be hoisted into hooks/providers, and each screen should update only the relevant component subtree.

The CSS stylesheet cannot be copied as-is. Design tokens can be reused, but layout, safe-area handling, typography, hover/focus states, desktop grids, native press feedback, and platform selectors must be re-authored.

## Migration sequence

The safe order is to create a new Expo project/branch, keep the current Capacitor app untouched, and establish the shared TypeScript package first. Port models, URL normalization, quality policy, sanitization, title fallback, publisher adapters, and test fixtures before porting screens. Then build Library, Reader, Settings, Capture, and Tags as independent Expo Router routes. Add native storage and share/system-bar adapters only after the shell works on Android and Web.

The first replacement milestone should not claim complete parity. It should prove four things: Android startup and scrolling are smooth, the native selection toolbar is normal, the desktop browser route works with browser-native links and selection, and the same publisher fixtures produce the same extraction classification on both clients.

## References

[1]: https://docs.expo.dev/router/introduction/ — Expo Router universal routing and web support.
[2]: https://docs.expo.dev/router/basics/navigation/ — Expo Router navigation, URLs, and deep links.
[3]: https://docs.expo.dev/develop/development-builds/introduction/ — Expo development builds and native libraries/configuration.
[4]: https://reactnative.dev/architecture/landing-page — React Native New Architecture.
[5]: https://capacitorjs.com/docs/ — Capacitor v8 native runtime and plugin model.
