import type { PostingDate } from '@/server/services/dateCalculator'
import type { CtaCandidate } from '@/server/services/postParser'

type CaptionClient = {
  postLength?: string | null
}

export function buildCaptionPrompt(
  brief: string,
  facts: string,
  postingDates: PostingDate[],
  client: CaptionClient,
  ctaCandidates: CtaCandidate[]
): { user: string; assistantPrefill: string } {
  const datesBlock = postingDates
    .map(
      (d, i) =>
        `${i + 1}. ${d.date} (${d.day})${d.isHoliday ? ` [HOLIDAY: ${d.holidayName}]` : ''}`
    )
    .join('\n')

  const hasMultipleCtas = ctaCandidates.length >= 2
  const ctaIndexFieldExample = hasMultipleCtas ? '\n      "ctaIndex": 0,' : ''
  const ctaPickerBlock = hasMultipleCtas ? buildCtaPickerBlock(ctaCandidates) : ''
  const prefillPickerNote = hasMultipleCtas
    ? ' For each post, also pick the most appropriate CTA option by emitting its 0-based index in "ctaIndex".'
    : ''

  const user = `GOAL: Create all needed posts for this month, according to the posting dates and the business focuses for the month. Be strategic in the overall story you are telling throughout the month. Use various angles according to the focuses.

POSTING DATES:
${datesBlock}

OUTPUT FORMAT:
Return ONLY a valid JSON object with this exact structure (no other text, no markdown fences):
{
  "posts": [
    {
      "postNumber": 1,
      "date": "YYYY-MM-DD",
      "caption": "The caption body text with line breaks as \\n. Body only — do NOT include a CTA, contact info, or hashtags.",${ctaIndexFieldExample}
      "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
      "graphicHook": "3-8 word bold visual hook",
      "designerNotes": "1 short sentence suggesting a broad visual direction"
    }
  ]
}
${ctaPickerBlock}
RULES:
- One post per posting date; use dates exactly as given and in order.
- IMPORTANT: Vary caption lengths.
- Hashtags: 3-8 relevant tags per post.
- Vary openings (question, imperative, contrast, micro-story, stat-led).
- Respect brand voice from Brief; use Facts for specifics; do not invent.
- The Client Brief reflects the client profile and is authoritative. Cross-reference each Supporting Fact against the Brief: if a fact from the crawled website contradicts the Brief, follow the Brief and ignore the conflicting fact. Use Facts only for specifics that do not conflict with the Brief.
- Return ONLY the JSON object (no extra commentary, no markdown).
- If no concrete evidence exists in the input, use generic, non-specific language.
- Do NOT include a call-to-action, phone number, address, "Visit our website" / "Book now" / "Call us today" closings, or any contact info in the caption. The CTA is appended deterministically after generation. Stop the caption at the end of the body.
- BLACKLISTED CHARACTERS (never use): em dash, en dash, figure dash, non-breaking hyphen, overline, horizontal bar (U+2014, U+2013, U+2012, U+2011, U+203E, U+2015)
- Use regular hyphens (-) only.

INPUTS:
Client Brief:
${brief}

Supporting Facts:
${facts}

CAPTION LENGTH: ${client.postLength ?? 'Medium (vary between short and medium)'}`

  const assistantPrefill = `ROLE: Human social media copywriter.
TASK: Write the caption body for one publish-ready post per plan date using Client Brief + Supporting Facts. Body only — the system appends the CTA after generation.${prefillPickerNote}
STYLE: Human voice; simple captions for relevant ads on social media; purposeful line breaks; outcome-first; no cliches. Occasionally use emojis. Your caption should look like a human social media manager wrote it, not AI. Avoid cliche words and phrases.
CONSTRAINTS: No new facts/URLs. Vary hooks/angles; avoid repetition. Use proper punctuation. Do NOT include CTAs, phone numbers, or contact info — those are appended automatically.
BLACKLISTED CHARACTERS (never use): em dash, en dash, figure dash, non-breaking hyphen, overline, horizontal bar

{`

  return { user, assistantPrefill }
}

function buildCtaPickerBlock(candidates: CtaCandidate[]): string {
  const optionsList = candidates
    .map((c, i) => {
      const header = c.label ? `Option ${i} — ${c.label}` : `Option ${i}`
      return `${header}\n${c.body}`
    })
    .join('\n\n---\n\n')

  return `
CTA OPTIONS (pick exactly one per post):
For each post, emit the 0-based index of the option that best matches the post's topic in the "ctaIndex" field. Do NOT write any CTA text in the caption — the system will paste the chosen option's body verbatim. Pick based on the option's tagline name and content.

${optionsList}

`
}
