import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  generateBuildId: () => "asp043",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
