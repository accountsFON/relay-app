/**
 * Agency-wide Canva folder used as the fallback "Open in Canva" target
 * when a client has no per-client Canva URL set on their profile.
 *
 * Mirrors the hardcoded link the legacy Make.com scenario dropped into
 * Asana task notes for every run (see
 * `projects/relay-app/research/bekah-ai-system/external-services.md`).
 *
 * Future: move to an Organization-level setting once Relay onboards a
 * second real agency.
 */
export const FALLBACK_CANVA_FOLDER_URL =
  'https://www.canva.com/folder/FAFx8YbetmY'

export function resolveCanvaUrl(
  clientCanvaUrl: string | null | undefined
): string {
  return clientCanvaUrl?.trim() || FALLBACK_CANVA_FOLDER_URL
}
