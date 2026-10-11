import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fishystream.app",
  appName: "FishyStream",
  webDir: "dist",
  android: {
    path: "packages/mobile/android"
  },
  server: {
    androidScheme: "https"
  }
};

export default config;
