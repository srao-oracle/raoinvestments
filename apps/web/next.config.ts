import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  // Serwist PWA integration is added in M8.
};

export default nextConfig;
