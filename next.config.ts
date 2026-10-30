import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.BUILD_TARGET === 'mobile' ? { output: 'export' } : {}),
  images: {
    unoptimized: true
  }
};

export default nextConfig;
