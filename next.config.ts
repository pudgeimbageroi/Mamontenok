import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Telegram avatars
      { protocol: "https", hostname: "t.me" },
      { protocol: "https", hostname: "*.telegram.org" },
    ],
  },
};

export default nextConfig;
