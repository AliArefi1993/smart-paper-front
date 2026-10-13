import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Freeze the committed Android build identity into the packaged web assets.
const androidBuild = readFileSync("android/app/build.gradle", "utf8");
const versionName = androidBuild.match(/versionName\s+"([0-9.]+)"/)?.[1];
const versionCode = androidBuild.match(/versionCode\s+(\d+)/)?.[1];

const nextConfig: NextConfig = {
  output: process.env.NEXT_PUBLIC_DATA_MODE === "local" ? "export" : undefined,
  env: {
    NEXT_PUBLIC_APP_VERSION: versionName && versionCode ? `${versionName}+${versionCode}` : "unavailable",
  },
};

export default nextConfig;
