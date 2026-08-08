import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_PUBLIC_DATA_MODE === "local" ? "export" : undefined,
};

export default nextConfig;
