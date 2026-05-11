import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  allowedDevOrigins: [
    // Allow preview panel cross-origin requests
    ".space.z.ai",
    ".z.ai",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
