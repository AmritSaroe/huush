# Huush Android Capacitor Modernization Plan

**Status:** Planning only; no platform migration has been applied.
**Created on branch:** `android-capacitor-8-migration-test`
**Base commit:** `a43508c` — `Preserve settings scroll across option changes`
**Product priority:** Finish the article-reading experience before merging platform changes.

## Decision summary

Huush should move from its current Capacitor 6 baseline to the latest supported Capacitor 8.x line, but the migration must happen in this isolated test branch. Capacitor’s official support policy lists v6 as end-of-support and v8 as active.[1] The official Capacitor 8 migration guide calls for a coordinated Android toolchain update rather than individual dependency edits, including min SDK 24, compile/target SDK 36, current Gradle/AGP requirements, and plugin updates.[2]

This is a **modernization of the native foundation, not a rewrite of Huush’s reader**. The vanilla-JavaScript interface remains a good fit for a lightweight article reader. We should not convert the project to React, Ionic, or Jetpack Compose solely to appear modern. New native code can use Kotlin if needed, but the existing small Java activity can remain Java until there is a concrete reason to rewrite it.

## Branch and interface strategy

The branch audit shows that the Android and web products currently share the same frontend paths. The Android branch contains the mobile interface plus Android resources and native code, while `webapp-huush` changes the same `client/src/main.js` and `client/src/styles.css` paths to provide the desktop presentation and Cloudflare functions. This means the products are **logically separate branches but not physically separated codebases**.

The proposed model keeps only two long-lived product branches while preventing accidental cross-contamination:

| Area | Android test/stable branch | Webapp branch |
|---|---|---|
| Primary interface | Mobile-first Huush interface, optimized for phone touch, keyboard, safe areas, and bottom navigation | Desktop Huush interface, optimized for full viewport, sidebar/top navigation, keyboard, and wide article grids |
| Native shell | Capacitor Android project, Android resources, splash/icon, status bar, insets, file sharing | None, except browser/PWA configuration |
| Article core | Same extraction, publisher adapters, sanitization, quality scoring, storage contracts, and article data model | Same core behavior, adapted to Cloudflare transport where required |
| Platform transport | Capacitor HTTP and native Filesystem/Preferences/Share/Status Bar | Browser fetch/proxy and browser storage/PWA behavior |
| Verification | Browser mobile emulation plus physical Android device matrix | Desktop browser plus mobile browser smoke tests |
| Release | Signed APK/AAB or signed direct-distribution APK | Cloudflare deployment |

The Android branch should contain the **mobile interface as its canonical UI**, so it can be opened in Chrome at 360px, 390px, and 412px widths for fast visual testing. This is useful because the same HTML/CSS surface is what Capacitor renders. Browser testing will catch layout, scroll, focus, animation, and responsive issues quickly; only native device testing can validate the Android WebView, keyboard, status bars, startup, sharing, and file permissions.

The separation should not be implemented by duplicating the extraction code. The shared boundary should be explicit:

```text
client/src/
  core/ or lib/             Shared article/storage/sanitization behavior
  publishers/               Shared publisher adapters
  platform/                 Browser and Capacitor transport/storage bridges
  main.js                   Product-specific UI composition per branch
  styles.css                Mobile UI on Android branch; desktop UI on webapp branch
android/                    Android-only native project and resources
functions/                  Webapp/Cloudflare-only proxy functions
```

For now, the repository can keep the existing `client/src/lib` locations rather than moving files in the same commit as the Capacitor migration. The important rule is that article correctness fixes must be written so they can be transferred to both branches, while UI layout fixes remain branch-specific. A shared article-core commit can be cherry-picked into both product branches; a mobile navigation change should stay on the Android branch; a desktop sidebar change should stay on `webapp-huush`.

## Migration sequence

### Phase 0 — Freeze and baseline

Keep `android-huush-final-brand-icon-fix-test` as the current tested UX baseline. The new `android-capacitor-8-migration-test` branch starts from commit `a43508c`. Before changing versions, record a release-like APK checksum and run the current article-reader smoke matrix: cold start, saved article open, article scroll, source link, share, delete/undo, Settings, font/theme changes, keyboard capture, back navigation, and rotation/configuration change.

### Phase 1 — Upgrade the supported toolchain together

Upgrade the Capacitor core, Android package, CLI, and every installed official plugin to the matching latest supported v8.x versions. Use the official migration workflow and inspect every generated diff rather than blindly accepting it.[2] The current Capacitor documentation requires Node.js 22 or later for v8 and a modern Android Studio/toolchain.[2]

The intended Android baseline is:

| Setting | Current project | Migration target |
|---|---:|---:|
| Capacitor | 6.2.x | Latest supported 8.x packages |
| Minimum SDK | 22 | 24 |
| Compile SDK | 35 | 36 |
| Target SDK | 34 | 36 |
| Android Gradle Plugin | 8.2.1 | Version required by the v8 migration guide |
| Gradle wrapper | Existing older wrapper | Version required by the v8 migration guide |
| Java/Node | Existing project toolchain | Verify against the v8 environment requirements |

The SDK target should be modernized even though Huush will not use Google Play. It improves Android 16 compatibility and avoids building on a platform baseline that is already outside the current official Capacitor guidance. The current Google Play target requirement is a separate publication rule, not the reason for this migration.[3]

### Phase 2 — Reconcile native custom code

After package migration, update `MainActivity` only where the new Capacitor/Android APIs require it. Preserve the existing startup behavior: install AndroidX SplashScreen before `super.onCreate()`, keep the readiness hold bounded, wait for WebView visual completion, and report fully drawn once. Replace the direct WebView visual-state call with the AndroidX compatibility API if the migrated dependency set supports it, as Lint currently recommends.

Review the window strategy against the current Android edge-to-edge guidance. The existing non-overlay approach is intentional and was tested on Android 16, so it should not be replaced casually. The migration should explicitly verify the status bar, navigation bar, display cutout, keyboard, bottom navigation, modal sheets, and reader toolbar before deciding whether to adopt a new edge-to-edge model.[4]

At the same time, move API-specific style attributes into versioned resource folders, remove obsolete generated splash/layout resources after confirming Capacitor no longer consumes them, and narrow the FileProvider paths to a dedicated export/cache directory. Add explicit Android backup and data-extraction rules so locally saved articles, settings, and diagnostic logs have an intentional restore policy.[5]

### Phase 3 — Harden the WebView boundary

Keep the existing DOMPurify-based article sanitization. Add a Content Security Policy compatible with the Capacitor local origin and the remote image/font sources that Huush actually needs. External article links should be deliberately opened outside the app WebView or intercepted by a controlled navigation policy. Capacitor and Android both recommend treating the WebView/native boundary as a security boundary.[6]

Unify the native and browser article transport policy. Both paths should validate HTTP/HTTPS URLs, reject credentials and unsafe ports, enforce response-size and timeout limits, check the content type, and prevent requests to loopback, link-local, private, or other non-public destinations where appropriate. The web proxy already performs more of these checks than the native path, so the migration should bring the native path up to the same defense-in-depth level.

### Phase 4 — Improve smoothness without changing the product identity

The primary performance work should remain in the shared frontend, not in a framework rewrite. The current renderer replaces `#root` on most state changes. That is simple and reliable, but it discards DOM identity, focus, animation state, and layout caches. The next optimization should preserve the app shell and primary scroll surfaces, then update only the changed toast, settings control, article card, progress state, or developer panel.

Move nonessential storage migration, statistics, and unchanged preference writes out of the first-paint critical path. Start the diagnostics frame monitor only when verbose diagnostics are enabled. Restrict `will-change` to elements that are actively animating, and keep frequent touch feedback short and transform/opacity-based. Verify changes using a release-like build and measured cold start, warm start, transition, reader scroll, and Settings scroll sessions rather than visual judgment alone.[7]

### Phase 5 — Add repeatable verification

The repository currently has only Capacitor template example tests and no application test command. Before calling the migration complete, add focused tests for URL normalization, title fallback, sanitizer behavior, image deduplication, article quality classification, storage migration, idempotent saves, and action dispatch. Add browser smoke tests for mobile capture, Settings, developer options, reader scroll, delete/undo, and external links.

The Android device matrix should include Android 14, 15, and 16 where available, with both gesture and three-button navigation, light and dark themes, keyboard open/closed, short and tall screens, display cutout or punch-hole devices, rotation, cold start after force-stop, background/foreground, share flow, and uninstall/reinstall. Accessibility checks should include TalkBack, large font/display size, visible focus, touch-target size, contrast, and reduced motion.[8]

### Phase 6 — Prepare direct open-source distribution

For GitHub and the official website, build a signed release APK rather than distributing debug artifacts. Keep the release signing key offline and backed up securely; never commit it. Publish the APK with a SHA-256 checksum, version number, changelog, minimum Android version, and a clear install guide explaining the per-source Install unknown apps permission on Android 8+.[9]

Because Android developer verification is planned to expand globally in 2027, register Huush’s package and signing key through Android Developer Console even though the app will not be on Google Play. The official guide says that apps distributed exclusively outside Play can still be sideloaded and that hobbyist/student accounts have a free lower-requirement path.[10] Registering `com.amritsaroe.huush` early also protects the relationship between the package name and the permanent signing key.

## Migration acceptance criteria

The migration branch is ready to merge only when all of the following are true:

| Gate | Required result |
|---|---|
| Build | Clean web build, Capacitor sync, Android resource processing, debug build, and release-like build |
| Lint | No unreviewed errors; warnings are fixed or individually justified |
| Startup | No white flash, no permanent splash, readiness is bounded, and app content appears correctly after cold start |
| Reader | Existing article extraction, sanitization, formatting, saving, deleting, sharing, and source links are unchanged or improved |
| UI | Mobile browser rendering matches the Android layout at the agreed phone widths; no scroll jumps, clipped sheets, or keyboard overlap |
| Native | Status bar, navigation bar, keyboard, cutout, rotation, back gesture, and theme transitions work on Android 14–16 |
| Security | CSP/navigation policy, URL validation, FileProvider scope, backup rules, and release signing are explicit and tested |
| Performance | Release-like startup, scroll, and transition measurements show no regression; full-root renders are reduced for high-frequency actions |
| Distribution | Signed artifact, checksum, changelog, installation instructions, and Android Developer Console registration plan are ready |
| Rollback | Stable Android branch remains installable and the migration can be reverted without changing the app ID or signing identity |

## Final recommendation

The branch split is helpful, but it should be understood correctly: it will let us test the Android mobile interface in a desktop browser much more faithfully, while the actual reusable article logic remains shared by discipline rather than accidental file copying. The immediate action is complete: the isolated migration branch now exists. The next action should be a deliberate Capacitor 8 migration in that branch after article-reader work reaches its next stable checkpoint.

### References

[1]: https://capacitorjs.com/docs/main/reference/support-policy "Capacitor support policy"

[2]: https://capacitorjs.com/docs/updating/8-0 "Updating to Capacitor 8.0"

[3]: https://developer.android.com/google/play/requirements/target-sdk "Google Play target API level requirement"

[4]: https://developer.android.com/develop/ui/views/layout/edge-to-edge "Android edge-to-edge guidance"

[5]: https://developer.android.com/identity/data/autobackup "Android Auto Backup"

[6]: https://developer.android.com/develop/ui/views/layout/webapps/managing-webview "Android WebView management guidance"

[7]: https://developer.android.com/topic/performance/measuring-performance "Android performance measurement guidance"

[8]: https://developer.android.com/guide/topics/ui/accessibility/apps "Android accessibility guidance"

[9]: https://developer.android.com/distribute/marketing-tools/alternative-distribution "Android alternative distribution options"

[10]: https://developer.android.com/developer-verification/guides/android-developer-console "Register on Android Developer Console"
