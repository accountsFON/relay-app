-- White-label agency branding (P2 #21): optional logo URL + accent color on the
-- organization. Nullable, additive, no backfill — null falls back to the current
-- FON / Relay look, so existing orgs are visually unchanged until they set it.

BEGIN;

ALTER TABLE "organizations" ADD COLUMN "brandLogoUrl" TEXT;
ALTER TABLE "organizations" ADD COLUMN "brandColor" TEXT;

COMMIT;
