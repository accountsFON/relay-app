/**
 * Membership cap applied to every Clerk organization Relay creates.
 *
 * Clerk defaults new organizations to `max_allowed_memberships: 5`. Relay is a
 * multi-user agency tool, so every org is created uncapped (0 = unlimited),
 * matching the production tenant that already runs at 0. Both org-creation
 * paths (onboarding self-serve + platform `createAgency`) pass this to
 * `clerkClient.organizations.createOrganization`, so no agency is ever born
 * with the default 5-member limit.
 */
export const ORG_MAX_ALLOWED_MEMBERSHIPS = 0
