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

  const system =
    'You are a senior social media copy editor. You rewrite Instagram and ' +
    'Facebook captions to address reviewer feedback while preserving the ' +
    "client's brand voice and the original post's intent. You return only " +
    'the rewritten caption, with no preamble, no explanation, and no ' +
    'quoting of the original.'

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
