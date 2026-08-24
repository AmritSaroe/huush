# huush

huush is a quiet, private article reader built with **Vite and Vanilla JavaScript**, then packaged for Android using Capacitor. Articles are extracted locally with Mozilla Readability, sanitized before rendering, and retained on the device. The Library, Tags, and Settings surfaces keep saved reading focused, while Settings contains the diagnostic event log for troubleshooting extraction or transport issues.

## Local development

Install packages with `pnpm install`, then launch the Vite preview with `pnpm dev`. The browser preview uses standard browser networking, so many publishers will block direct extraction because of CORS. The Android build uses Capacitor's native HTTP transport instead.

## Android build

The repository includes a GitHub Actions workflow at `.github/workflows/android-apk.yml`. Every push to `main` or `master`, and every manual workflow run, creates a debug APK artifact named `huush-android-debug-apk`. The workflow installs dependencies, builds the Vite bundle, syncs the Capacitor Android project, and runs Gradle's `assembleDebug` task.

For a local Android build, run:

```bash
pnpm install
pnpm run build:web
pnpm exec cap sync android
cd android && ./gradlew assembleDebug
```

The resulting APK is placed at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Product behavior

The app stores extracted articles locally and retains up to 160 recent diagnostic events. Text size, typeface, and light/dark/sepia appearance are persisted across sessions. Saved articles can be searched and organized into collections from Library and Tags.
