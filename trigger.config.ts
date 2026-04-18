import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_mmkhurgkukexqhkberpa",
  dirs: ["src/server/jobs"],
  maxDuration: 300,
  build: {
    external: ["apify-client", "proxy-agent"],
  },
});
