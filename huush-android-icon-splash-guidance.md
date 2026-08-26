# Huush Android icon and splash correction

## Official Android guidance reviewed

- Adaptive icons: https://developer.android.com/develop/ui/compose/system/icon_design_adaptive
- Splash screens: https://developer.android.com/develop/ui/views/launch/splash-screen

## Relevant rules

Android adaptive icons require separate foreground and background layers, with each layer sized to 108×108 dp. The critical icon/logo must fit within the 66×66 dp safe zone; the outer 18 dp on each side is reserved for masking and launcher effects. Android recommends clean vector edges and says the layers must not contain their own masks or background shadows.

For Android 12+ splash screens, the app icon is rendered by the system and is not a free-size full-screen logo. The official dimensions distinguish icons with a background from icons without one: an app icon with an icon background is designed around a 240×240 dp treatment within the system’s 160 dp circle, while an icon without a background uses a smaller 288×288 dp canvas treatment. The splash theme should provide the background color; the supplied icon drawable should not add a competing nested tile unless that is intentionally part of the icon design.

## Huush implementation decision

Use one opaque cream adaptive background layer and one transparent foreground layer containing only the centered coded Quiet Editorial twin-page mark. Keep the critical foreground silhouette inside the adaptive 66×66 dp safe zone and avoid a cream rectangle inside the foreground. Use the same symbol-only vector for the monochrome layer. For the splash, use the cream startup theme background and a smaller transparent symbol-only vector so Android’s system splash scaling does not magnify a nested square.

The launcher label `huush` is supplied by Android and is not part of the icon artwork. It should remain separate from the symbol; the APK cannot remove the launcher label through the icon drawable.
