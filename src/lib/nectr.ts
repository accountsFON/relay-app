/**
 * NectrCRM is Five One Nine's white-labeled GoHighLevel instance. At the
 * scheduling stage the AM uploads the exported Social Planner CSV here, so
 * the batch detail action row links out to the app.
 *
 * Plain app URL, no subaccount deep link: the AM selects the right location
 * once inside NectrCRM.
 *
 * NOTE on the host: the canonical domain is `app.nectrcrm.com` (no "a").
 * The item 37 brief said `app.nectarcrm.com`, but that host 301-redirects
 * to itself (a broken loop); `app.nectrcrm.com` serves the live app and
 * matches the operational nectr-pit-setup runbook.
 */
export const NECTR_CRM_URL = 'https://app.nectrcrm.com'

/** Deep-link to a client's NECTR sub-account Social Planner, where an AM connects
 * social accounts (an OAuth flow GHL's UI handles). Confirm the exact sub-path
 * against a live NECTR sub-account; social-planner is the connect entry point. */
export function nectrConnectUrl(locationId: string): string {
  return `${NECTR_CRM_URL}/v2/location/${locationId}/marketing/social-planner`
}
