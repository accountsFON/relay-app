/**
 * Mention parsing for activity comments.
 *
 * Body format: `Hey @julio.aleman, copy is ready 👀`
 * Token format: `firstname.lastname` (lowercase, dot-separated).
 *
 * Pure function. The server action calls extractHandles() then resolves
 * each handle to a User row via memberships in the active org.
 */
export function extractHandles(body: string): string[] {
  const re = /@([a-z][a-z0-9._-]{1,40})/gi
  const handles = new Set<string>()
  for (const m of body.matchAll(re)) {
    handles.add(m[1].toLowerCase())
  }
  return Array.from(handles)
}

/**
 * Convert a User name to a handle.  "Julio Aleman" → "julio.aleman".
 * Falls back to the slugified full name if the format is unusual.
 */
export function userNameToHandle(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '.')
  return cleaned || 'user'
}
