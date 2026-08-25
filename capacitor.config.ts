import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.amritsaroe.huush",
  appName: "huush",
  webDir: "dist/public",
  backgroundColor: "#F7F3EB",
  android: {
    allowMixedContent: false,
    backgroundColor: "#F7F3EB",
  },
  ios: {
    backgroundColor: "#F7F3EB",
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
