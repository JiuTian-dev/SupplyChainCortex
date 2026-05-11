import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
  } as NextConfig['experimental'],
  allowedDevOrigins: [
    // Allow preview panel cross-origin requests
    ".space.z.ai",
    ".z.ai",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
