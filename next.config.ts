import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "*.app.online.visualstudio.com",
        "*.github.dev",
        "localhost:3000"
      ]
    }
  }
};

export default nextConfig;
