import { defineConfig } from "@trigger.dev/sdk/v3";
import * as Sentry from "@sentry/node";

// Error monitoring for the Trigger.dev worker (content generation + crons).
// This is where unattended failures happen, so capturing them is the
// highest-value alerting target. Inert while SENTRY_DSN is unset (mirrors the
// web app), so it's safe to ship before the Sentry env var is set on the
// Trigger.dev worker.
//
// Init runs once at worker startup (module load). Permanent task failures
// (run threw and won't be retried) are captured in onFailure, then flushed,
// since a Trigger.dev worker can recycle right after a run and drop buffered
// events otherwise.
const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: true,
    // Errors only. No performance tracing, and don't let Sentry install its
    // own OpenTelemetry SDK — the Trigger.dev worker already runs OTEL, and a
    // second setup can conflict. captureException still works without it.
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    sendDefaultPii: false,
  });
}

export default defineConfig({
  project: "proj_mmkhurgkukexqhkberpa",
  dirs: ["src/server/jobs"],
  maxDuration: 300,
  onFailure: async ({ error, task, ctx }) => {
    if (!sentryDsn) return;
    Sentry.captureException(error, {
      tags: { trigger_task: task },
      extra: { ctx },
    });
    await Sentry.flush(2000);
  },
});
