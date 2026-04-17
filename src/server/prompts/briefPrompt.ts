import type { PostingDate } from '@/server/services/dateCalculator'

type BriefInput = {
  name: string
  businessSummary?: string | null
  brandVoice?: string | null
  phone?: string | null
  mainCta?: string | null
  focus1?: string | null
  focus2?: string | null
  focus3?: string | null
  dos?: string | null
  donts?: string | null
  urls: string[]
  targetAudience?: string | null
}

export function buildBriefPrompt(
  client: BriefInput,
  postingDates: PostingDate[],
  holidays: string[],
  holidayTags: string[]
): { system: string; user: string } {
  const system = `ROLE: Senior Story Brand marketing editor.
TASK: Normalize messy business inputs into a concise client brief for social posting prep.
RULES: Extract and organize only. Do not add, infer, or remove facts. If missing/ambiguous, use known facts to create an accurate representation for that section. Plain text only. ≤1000 tokens.`

  const postingDatesStr = postingDates
    .map((d) => `${d.date} (${d.day})${d.isHoliday ? ` [${d.holidayName}]` : ''}`)
    .join(', ')

  const user = `GOAL — Create a clean "Client Brief v1.0" used by downstream steps.

INSTRUCTIONS — Use the inputs exactly. Rewrite for clarity only; do not add, infer, or remove facts.
If missing/ambiguous, use known facts to create an accurate representation for that section.
Plain text only.

OUTPUT — Use these exact headings (in this order):
0) Important Business Details — list of things like business phone, main website URL, etc.
1) Elevator Summary — One concise paragraph of what the business does (benefits-first).
2) Ideal Customer Persona and Pain Points — Who it serves + key pains.
3) Brand Voice — Short, comma-separated descriptors from inputs.
4) Focuses for this month — Short bullet phrases aligned to focus 1, focus 2, and focus 3.
   Don't drop details like URLs to include, etc. It's crucial the Focus fields stay canon for downline.
5) Proof Points — Facts only; include source URLs if present.
6) Product or Service Focuses — What's emphasized this month.
7) Do Nots — Things to avoid (verbatim if provided).
8) Dos — Required statements and best practices (verbatim if provided).
9) Visual or Creative Notes — Design pointers only from inputs.
10) Compliance Notes — Any constraints or nuance rules; else "Unknown."
11) Main CTA — Copy entire content verbatim from Main CTA input; preserve line breaks.

FINAL LINE — Append exactly:
URLS_JSON: [${client.urls.map((u) => `"${u}"`).join(', ')}]
(If none, output: URLS_JSON: [])

--- INPUTS ---

Client Name: ${client.name}
Business Summary: ${client.businessSummary ?? 'Not provided'}
Brand Voice: ${client.brandVoice ?? 'Not provided'}
Business Phone: ${client.phone ?? 'Not provided'}
Main CTA: ${client.mainCta ?? 'Not provided'}
Focus 1: ${client.focus1 ?? 'Not provided'}
Focus 2: ${client.focus2 ?? 'Not provided'}
Focus 3: ${client.focus3 ?? 'Not provided'}
Do: ${client.dos ?? 'Not provided'}
Don't: ${client.donts ?? 'Not provided'}
Target Audience: ${client.targetAudience ?? 'Not provided'}
URLs: ${client.urls.join(', ') || 'None'}
Posting Dates: ${postingDatesStr}
Holidays in Month: ${holidays.join(', ') || 'None'}
Holiday Tags: ${holidayTags.join(', ') || 'None'}`

  return { system, user }
}
