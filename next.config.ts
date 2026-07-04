import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // ── Rendering & Caching (Next.js 16) ──────────────────────────────────
  // cacheComponents: true,  // enable after removing force-dynamic from route segments
  // viewTransition: not a valid Next.js 16 top-level key — removed

  // ── Images ────────────────────────────────────────────────────────────
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24, // 24h
  },

  // ── Allowed cross-origin dev origins ──────────────────────────────────
  allowedDevOrigins: [
    ".space.z.ai",
    ".z.ai",
    "localhost",
    "127.0.0.1",
  ],

  experimental: {
    // Lightning CSS (Rust-based, replaces PostCSS for production builds)
    useLightningcss: true,

    // Treeshake barrel imports — reduces vendor bundle
    optimizePackageImports: [
      "recharts",
      "lucide-react",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
    ],

    // Stable filesystem cache for dev builds
    turbopackFileSystemCacheForDev: true,
  },
};

export default nextConfig;
