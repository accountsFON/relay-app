import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack workspace root to this repo so module resolution
  // (e.g. tailwindcss) stays inside the project and doesn't drift up
  // to $HOME based on stray lockfiles.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
