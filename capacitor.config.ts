import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.amritsaroe.whitemint",
  appName: "whitemint",
  webDir: "dist/public",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
