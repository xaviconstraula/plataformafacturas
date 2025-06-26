import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["pdf-to-png-converter", "pdf-parse", "canvas", "@napi-rs", "@napi-rs/canvas", "@napi-rs/canvas-win32-x64-msvc"],
  compiler: {
    removeConsole: false
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "990mb"
    }
  }
};

export default nextConfig;
