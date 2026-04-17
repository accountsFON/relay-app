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
      "caption": "The full caption text with line breaks as \\n",
      "cta": "The Main CTA text verbatim",
      "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
      "graphicHook": "3-8 word bold visual hook",
      "designerNotes": "1 short sentence suggesting a broad visual direction"
    }
  ]
}

RULES:
- One post per posting date; use dates exactly as given and in order.
- IMPORTANT: Vary caption lengths.
- Hashtags: 3-8 relevant tags per post.
- Vary openings (question, imperative, contrast, micro-story, stat-led).
- Respect brand voice from Brief; use Facts for specifics; do not invent.
- Return ONLY the JSON object (no extra commentary, no markdown).
- If no concrete evidence exists in the input, use generic, non-specific language.
- BLACKLISTED CHARACTERS (never use): em dash, en dash, figure dash, non-breaking hyphen, overline, horizontal bar (U+2014, U+2013, U+2012, U+2011, U+203E, U+2015)
- Use regular hyphens (-) only.

INPUTS:
Client Brief:
${brief}

Supporting Facts:
${facts}

CAPTION LENGTH: ${client.postLength ?? 'Medium (vary between short and medium)'}
MAIN CTA: ${client.mainCta ?? 'Not provided'}`

  const assistantPrefill = `ROLE: Human social media copywriter.
TASK: Write one publish-ready post per plan date using Client Brief + Supporting Facts.
STYLE: Human voice; simple captions for relevant ads on social media; purposeful line breaks; outcome-first; no cliches. Occasionally use emojis. Your caption should look like a human social media manager wrote it, not AI. Avoid cliche words and phrases.
CONSTRAINTS: No new facts/URLs. Vary hooks/angles; avoid repetition. Use proper punctuation.
BLACKLISTED CHARACTERS (never use): em dash, en dash, figure dash, non-breaking hyphen, overline, horizontal bar

{`

  return { user, assistantPrefill }
}
