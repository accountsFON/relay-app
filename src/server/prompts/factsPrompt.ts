export function buildFactsPrompt(crawledContent: string): {
  system: string
  user: string
} {
  const system = `ROLE: Social media strategist.
RULES:
Plain Text only; no Markdown.
No guesses.
Deduplicate overlaps.
Be concrete.
≤900 tokens.`

  const user = `GOAL — Create factual notes that a social manager can use for this months social media captions strategy.

INSTRUCTIONS — Use scraped content only to deduce and fill in each section.
If a section has no evidence, write "Unknown."

OUTPUT
- What we do (3-5 bullets; outcomes over features).
- Services (list all known services; include concrete specifics if present).
- Products (list all known products; include concrete specifics if present):
  | Product | One-line value prop | Key specs/notes | Price | URL |
- Services (only if services are present or scraped data mentions services; else "Unknown"):
  | Service | One-line value prop | Key specs/notes | Price | URL |
- Proof & trust signals (facts with URLs if shown).
- CTAs mentioned (verbatim; list).
- Differentiators / positioning (from source only).
- Notable pages/URLs referenced (list).

SCRAPED CONTENT (verbatim):
${crawledContent}`

  return { system, user }
}
