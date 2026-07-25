import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin Turbopack workspace root to this repo so module resolution
  // (e.g. tailwindcss) stays inside the project and doesn't drift up
  // to $HOME based on stray lockfiles.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

// Sentry build integration. Runtime init is inert without a DSN, and
// source-map upload only runs when SENTRY_AUTH_TOKEN is present (CI/prod),
// so local + preview builds are unaffected.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  disableLogger: true,
});
