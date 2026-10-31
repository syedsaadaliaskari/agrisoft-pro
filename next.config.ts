import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  generateBuildId: () => "asp044",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
