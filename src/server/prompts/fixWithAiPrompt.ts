/**
 * Prompt for the Fix with AI flow.
 *
 * Spec: projects/relay-app/2026-05-16-post-preview-feedback-system-design.md
 *       § Fix with AI (prompt template)
 *
 * The AM triggers this on an open thread (post-level or caption-text). The
 * model rewrites the caption to address the thread's feedback while staying
 * inside the client's brand guardrails (brandVoice + dos + donts).
 */

export type FixWithAiPromptInput = {
  clientName: string
  brandVoice: string | null
  dos: string | null
  donts: string | null
  currentCaption: string
  /**
   * Chronological list of comments on the thread (oldest first). Each entry
   * is the author's display label plus the comment body. The author label is
   * passed in as already-formatted text so the prompt builder doesn't need
   * to know about Clerk / magic link reviewer distinctions.
   */
  comments: ReadonlyArray<{ author: string; body: string }>
}

export type FixWithAiPrompt = { system: string; user: string }

const FIX_WITH_AI_SYSTEM =
  'You are a senior social media copy editor. You rewrite Instagram and ' +
  'Facebook captions to address reviewer feedback while preserving the ' +
  "client's brand voice and the original post's intent. You return only " +
  'the rewritten caption, with no preamble, no explanation, and no ' +
  'quoting of the original.'

/**
 * Build the system + user prompt for the Fix with AI call. Uses safe
 * fallbacks ("(none provided)") for empty brand context fields so the model
 * never sees an unfilled template variable.
 */
export function buildFixWithAiPrompt(input: FixWithAiPromptInput): FixWithAiPrompt {
  const clientName = input.clientName.trim() || 'this client'
  const brandVoice = (input.brandVoice ?? '').trim() || '(none provided)'
  const dos = (input.dos ?? '').trim() || '(none provided)'
  const donts = (input.donts ?? '').trim() || '(none provided)'
  const caption = input.currentCaption

  const commentsFormatted =
    input.comments.length === 0
      ? '(no comments)'
      : input.comments
          .map((c, i) => {
            const author = (c.author ?? '').trim() || 'Reviewer'
            const body = (c.body ?? '').trim()
            return `${i + 1}. ${author}: ${body}`
          })
          .join('\n')

  const system = FIX_WITH_AI_SYSTEM

  const user = `You are rewriting an Instagram and Facebook caption for ${clientName} based on
reviewer feedback. The same caption is cross-posted to both platforms.

Brand voice: ${brandVoice}
Things to always do: ${dos}
Things to never do: ${donts}

Current caption:
${caption}

Feedback thread (most recent last):
${commentsFormatted}

Rewrite the caption to address the feedback above. Match the original length
within 15 percent. Preserve the post's intent unless the feedback explicitly
asks to change it. Do not invent facts that aren't in the original or the
client brand context. Return only the new caption, no preamble or
explanation.`

  return { system, user }
}

export type FixWithAiPostVerdict =
  | 'approved'
  | 'changes_requested'
  | 'caption_edited'
  | 'none'

export type FixWithAiPostPromptInput = {
  clientName: string
  brandVoice: string | null
  dos: string | null
  donts: string | null
  currentCaption: string
  verdict: FixWithAiPostVerdict
  /** The client's own replacement caption when verdict === 'caption_edited'. */
  suggestedCaption: string | null
  /** One entry per pin/comment thread on the post, in batch order. */
  pins: ReadonlyArray<{
    location: 'image' | 'caption' | 'post'
    comments: ReadonlyArray<{ author: string; body: string }>
  }>
}

const VERDICT_PHRASE: Record<FixWithAiPostVerdict, string> = {
  approved: 'approved the post but left comments',
  changes_requested: 'requested changes',
  caption_edited: 'edited the copy themselves',
  none: 'left comments without an overall verdict',
}

/**
 * Per-post variant: aggregates the whole post's client feedback (overall
 * verdict, the client's own suggested caption, and every pin/comment) into
 * one rewrite request. Shares the system instruction with the per-pin
 * builder.
 */
export function buildFixWithAiPromptForPost(
  input: FixWithAiPostPromptInput,
): FixWithAiPrompt {
  const clientName = input.clientName.trim() || 'this client'
  const brandVoice = (input.brandVoice ?? '').trim() || '(none provided)'
  const dos = (input.dos ?? '').trim() || '(none provided)'
  const donts = (input.donts ?? '').trim() || '(none provided)'

  const suggestedBlock =
    input.suggestedCaption && input.suggestedCaption.trim()
      ? `\nThe client's own suggested caption (use as a strong signal of what they want):\n${input.suggestedCaption.trim()}\n`
      : ''

  const pinsFormatted =
    input.pins.length === 0
      ? '(no pin comments)'
      : input.pins
          .map((pin, i) => {
            const where =
              pin.location === 'image'
                ? 'On the image'
                : pin.location === 'caption'
                  ? 'On the caption'
                  : 'On the post'
            const comments =
              pin.comments.length === 0
                ? '  (no comments)'
                : pin.comments
                    .map((c) => {
                      const author = (c.author ?? '').trim() || 'Reviewer'
                      const body = (c.body ?? '').trim()
                      return `  - ${author}: ${body}`
                    })
                    .join('\n')
            return `Pin ${i + 1} (${where}):\n${comments}`
          })
          .join('\n')

  const system = FIX_WITH_AI_SYSTEM

  const user = `You are rewriting an Instagram and Facebook caption for ${clientName} based on
client review feedback. The same caption is cross-posted to both platforms.

Brand voice: ${brandVoice}
Things to always do: ${dos}
Things to never do: ${donts}

The client ${VERDICT_PHRASE[input.verdict]}.
${suggestedBlock}
Current caption:
${input.currentCaption}

All feedback on this post:
${pinsFormatted}

Rewrite the caption to address all of the feedback above. Match the original
length within 15 percent. Preserve the post's intent unless the feedback
explicitly asks to change it. Do not invent facts that aren't in the original
or the client brand context. Return only the new caption, no preamble or
explanation.`

  return { system, user }
}
