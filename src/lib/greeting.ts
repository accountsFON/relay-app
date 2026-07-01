/**
 * greetingName , the name to greet a recipient by in transactional email.
 *
 * We intentionally do NOT shorten to a first token. The reviewer name is
 * frequently a client / business name (e.g. "Old Plank"), and first-token
 * shortening mangled those into "Old" ("Hi Old," / "Hey Old,"). Using the
 * full trimmed name reads correctly for both people ("Sarah Smith") and
 * businesses ("Old Plank"). Internal whitespace is collapsed so stray
 * double spaces don't leak into the greeting. Falls back to "there" when
 * no usable name is present.
 */
export function greetingName(full: string | null | undefined): string {
  const trimmed = (full ?? '').trim().replace(/\s+/g, ' ')
  return trimmed.length > 0 ? trimmed : 'there'
}
