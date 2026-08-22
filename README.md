# whitemint

whitemint is a private, monochrome article reader built with **Vite and Vanilla JavaScript**, then packaged for Android using Capacitor. Articles are extracted locally with Mozilla Readability, sanitized before rendering, and retained on the device. The Debug tab exports a concise event log that can be pasted into a support conversation when an extraction fails.

## Local development

Install packages with `pnpm install`, then launch the Vite preview with `pnpm dev`. The browser preview uses standard browser networking, so many publishers will block direct extraction because of CORS. The Android build uses Capacitor's native HTTP transport instead.

## Android build

The repository includes a GitHub Actions workflow at `.github/workflows/android-apk.yml`. Every push to `main` or `master`, and every manual workflow run, creates a debug APK artifact named `whitemint-debug-apk`. The workflow installs dependencies, builds the Vite bundle, syncs the Capacitor Android project, and runs Gradle's `assembleDebug` task.

For a local Android build, run:

```bash
pnpm install
pnpm run build:web
pnpm exec cap sync android
cd android && ./gradlew assembleDebug
```

The resulting APK is placed at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Product behavior

The app keeps up to 50 extracted articles and up to 160 recent diagnostic events. Text size, typeface, and light/dark appearance are persisted across sessions. The reader deliberately excludes advertising, social features, folders, search, sync, and external imagery so saved articles remain the focus.
