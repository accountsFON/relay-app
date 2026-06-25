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
