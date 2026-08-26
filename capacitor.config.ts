import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.amritsaroe.huush",
  appName: "huush",
  webDir: "dist/public",
  backgroundColor: "#F6F1E8",
  android: {
    allowMixedContent: false,
    backgroundColor: "#F6F1E8",
  },
  ios: {
    backgroundColor: "#F6F1E8",
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
