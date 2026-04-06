import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["pdf-to-png-converter", "pdf-parse", "canvas", "@napi-rs", "@napi-rs/canvas", "@napi-rs/canvas-win32-x64-msvc", "unzipper"],
  compiler: {
    // Allow console logs in all environments so we can debug batch processing
    removeConsole: false
  },
  experimental: {
    // Server Actions only — does not affect Route Handlers /api/*
    serverActions: {
      bodySizeLimit: "5000mb"
    },
    // Required for large multipart uploads: Next defaults to 10MB and truncates the
    // request body for cloning; Busboy then sees incomplete form data ("unexpected end of file").
    // See node_modules/next/dist/server/body-streams.js (DEFAULT_BODY_CLONE_SIZE_LIMIT).
    proxyClientMaxBodySize: "5000mb"
  }
};

export default nextConfig;
