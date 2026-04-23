import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fishystream.app",
  appName: "FishyStream",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
