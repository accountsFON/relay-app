/**
 * Refuses to run a destructive operation when the connection string's
 * hostname matches PROD_DATABASE_HOSTNAME. Set PROD_DATABASE_HOSTNAME in
 * .env.local to enable the guard. Pass --i-know-this-is-prod on the CLI
 * to override (recovery cleanups, intentional prod backfills).
 *
 * No-op in app runtime (NODE_ENV=production) and when the env is unset
 * (Vercel prod and Trigger.dev image both leave it unset).
 */
export function assertNotProdDb(connectionString: string): void {
  if (process.env.NODE_ENV === 'production') return
  const prodHostname = process.env.PROD_DATABASE_HOSTNAME
  if (!prodHostname) return
  const url = new URL(connectionString)
  if (url.hostname === prodHostname) {
    if (process.argv.includes('--i-know-this-is-prod')) {
      console.warn(`[db-guardrail] override flag present, allowing prod write`)
      return
    }
    throw new Error(
      `[db-guardrail] refusing to run against prod hostname ${prodHostname}.\n` +
        `Pass --i-know-this-is-prod to override.`,
    )
  }
}
