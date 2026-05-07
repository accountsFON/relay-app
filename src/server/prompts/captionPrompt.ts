import type { PostingDate } from '@/server/services/dateCalculator'

type CaptionClient = {
  mainCta?: string | null
  postLength?: string | null
}

export function buildCaptionPrompt(
  brief: string,
  facts: string,
  postingDates: PostingDate[],
  client: CaptionClient
): { user: string; assistantPrefill: string } {
  const datesBlock = postingDates
    .map(
      (d, i) =>
        `${i + 1}. ${d.date} (${d.day})${d.isHoliday ? ` [HOLIDAY: ${d.holidayName}]` : ''}`
    )
    .join('\n')

  const mainCta = client.mainCta ?? ''
  const ctaFence = '<<<<<MAIN_CTA_BLOCK>>>>>'

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
      "caption": "<body text — your creative work>\\n\\n${ctaFence}",
      "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
      "graphicHook": "3-8 word bold visual hook",
      "designerNotes": "1 short sentence suggesting a broad visual direction"
    }
  ]
}

The literal token "${ctaFence}" in each caption MUST be replaced with the following block, copied character-for-character. Do not paraphrase. Do not polish. Do not summarize. Do not reflow whitespace. Do not change punctuation, capitalization, line breaks, or spacing. The CTA is a fixed brand asset and is the same in every post.

${ctaFence}
${mainCta || 'Not provided'}
${ctaFence}

RULES (fidelity beats creativity):
- The CTA block above is non-negotiable and identical in every caption.
- If no concrete evidence exists in the input, use generic, non-specific language ("many businesses", "some people", "often") rather than a named product or testimonial you cannot justify. Never fabricate products, services, or testimonials.
- One post per posting date; use dates exactly as given and in order.
- Vary caption body lengths and openings (question, imperative, contrast, micro-story, stat-led). Variation applies to the body only — never to the CTA block.
- Hashtags: 3-8 relevant tags per post.
- Respect brand voice from Brief; use Facts for specifics; do not invent.
- Return ONLY the JSON object (no commentary, no markdown).
- BLACKLISTED CHARACTERS (never use): em dash, en dash, figure dash, non-breaking hyphen, overline, horizontal bar (U+2014, U+2013, U+2012, U+2011, U+203E, U+2015). Use regular hyphens (-) only.

INPUTS:
Client Brief:
${brief}

Supporting Facts:
${facts}

CAPTION LENGTH: ${client.postLength ?? 'Medium (vary between short and medium)'}`

  const assistantPrefill = `ROLE: Human social media copywriter.
TASK: Write one publish-ready post per plan date using Client Brief + Supporting Facts.
STYLE: Human voice; simple captions for relevant ads on social media; purposeful line breaks; outcome-first; no cliches. Occasionally use emojis. Your caption should look like a human social media manager wrote it, not AI. Avoid cliche words and phrases.
CONSTRAINTS: No new facts/URLs. Vary hooks/angles in the body only; the CTA block is verbatim and identical across posts. Use proper punctuation.
BLACKLISTED CHARACTERS (never use): em dash, en dash, figure dash, non-breaking hyphen, overline, horizontal bar

{`

  return { user, assistantPrefill }
}
