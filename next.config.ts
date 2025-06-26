import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["pdf-to-png-converter", "pdf-parse", "canvas", "@napi-rs", "@napi-rs/canvas", "@napi-rs/canvas-win32-x64-msvc"],
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "990mb"
    }
  }
};

export default nextConfig;
