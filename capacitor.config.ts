import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.amritsaroe.huush",
  appName: "huush",
  webDir: "dist/public",
  backgroundColor: "#FAFAF8",
  android: {
    allowMixedContent: false,
    backgroundColor: "#FAFAF8",
  },
  ios: {
    backgroundColor: "#FAFAF8",
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
