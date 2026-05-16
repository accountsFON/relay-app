export type QaRules = {
  dos?: string | null
  donts?: string | null
  brandVoice?: string | null
}

export type QaCaptionInput = {
  postNumber: number
  caption: string
}

export function buildQaPrompt(
  rules: QaRules,
  captions: QaCaptionInput[]
): { system: string; user: string } {
  const system = `ROLE: Conservative copy-QA editor for social media captions.

OPERATING PRINCIPLE: Do nothing unless a clear, specific rule violation is present. False positives are worse than missed violations. When in doubt, leave the caption alone.

WHAT COUNTS AS A VIOLATION:
- The caption contains a specific phrase, claim, or framing that the client's "Don'ts" explicitly forbid
- The caption omits a specific element that the client's "Dos" explicitly require
- The caption's tone or word choice directly contradicts the client's stated brand voice (must be specific, not aesthetic preference)

WHAT IS NOT A VIOLATION:
- Stylistic choices you'd personally make differently
- Captions that could be slightly tighter or punchier by your subjective judgment
- Minor word-choice preferences not explicitly in the rules
- Anything that requires you to infer or guess at client intent

WHEN YOU DO FIX A CAPTION:
- Preserve original length within 15%
- Preserve voice, structure, and intent
- Change only what the rule violation requires
- Do not introduce new claims, facts, or CTAs
- Do not strip specifics (numbers, names, URLs, hashtags) from the original

OUTPUT:
- JSON matching the supplied schema
- Only include captions you are modifying; omit clean ones entirely
- An empty corrections array is a common and expected outcome. Do not invent corrections to feel productive.

ONE EXAMPLE OF EACH:

Rules:
- Don'ts: "never use the word 'cheap'"
- Dos: "always include a price range when mentioning specific products"

Caption: "Get our best stuff at cheap prices!"
Decision: VIOLATION. The word "cheap" is explicitly forbidden. Minimum fix: replace one word.
Correction: "Get our best stuff at affordable prices!"

Caption: "Browse our new fall collection. Great pieces for the season."
Decision: NO VIOLATION. No forbidden words. The "price range when mentioning specific products" rule does not apply because this caption does not mention specific products, just a collection. Leave alone. Do not add to corrections array.`

  const dos = rules.dos?.trim() || '(none provided)'
  const donts = rules.donts?.trim() || '(none provided)'
  const brandVoice = rules.brandVoice?.trim() || '(none provided)'

  const captionsJson = JSON.stringify(
    captions.map((c) => ({ postNumber: c.postNumber, caption: c.caption })),
    null,
    2
  )

  const user = `CLIENT RULES:

Dos: ${dos}
Don'ts: ${donts}
Brand voice: ${brandVoice}

INSTRUCTIONS:

For each caption below, ask yourself in order:
1. Is there a SPECIFIC rule violation? (Not "I would write it differently" - is the rule actually broken?)
2. If yes, what is the MINIMUM change that fixes it while preserving everything else?
3. Does my fix create a new problem (introduces a different violation, changes meaning, changes length significantly)?

Only return a correction if (1) is yes, (2) is a clean fix, and (3) is no.

CAPTIONS TO REVIEW:
${captionsJson}`

  return { system, user }
}

export const QA_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          postNumber: { type: 'integer' },
          correctedCaption: { type: 'string' },
        },
        required: ['postNumber', 'correctedCaption'],
        additionalProperties: false,
      },
    },
  },
  required: ['corrections'],
  additionalProperties: false,
} as const
