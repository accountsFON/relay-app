/**
 * Self-serve agency creation is gated off until Relay sells to outside
 * clients. Controlled by RELAY_ALLOW_AGENCY_CREATION (default false).
 * Mirrors the RELAY_ALLOW_PUBLIC_SIGNUP gate. When false, onboarding is
 * strictly invite-only: a user can only join the org they were invited from.
 */
export function isAgencyCreationEnabled(): boolean {
  return process.env.RELAY_ALLOW_AGENCY_CREATION === 'true'
}
