import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import { calculatePostingDates } from '@/server/services/dateCalculator'
import { generateBrief } from '@/server/services/briefGenerator'
import { crawlWebsites } from '@/server/services/websiteCrawler'
import { extractFacts } from '@/server/services/factsExtractor'
import { generateCaptions } from '@/server/services/captionGenerator'
import { createPostsFromCaptions, parseCtaCandidates } from '@/server/services/postParser'
import { sumCosts, costToCredits, buildCostBreakdown } from '@/server/services/costTracker'
import type { CostResult, RunCostBreakdown } from '@/server/services/costTracker'
import { recordActivity, ActivityKind, EventVisibility } from '@/server/services/activity'
import {
  finalizePostGeneration,
  findDefaultMatchingBatch,
} from '@/server/services/finalize-post-generation'

type TokenUsageLog = Record<string, { input: number; output: number }>

export const generateContentTask = task({
  id: 'generate-content',
  retry: { maxAttempts: 2 },
  run: async ({ contentRunId, reCrawl = true }: { contentRunId: string; reCrawl?: boolean }) => {
    const pipelineStart = Date.now()

    const contentRun = await db.contentRun.findUniqueOrThrow({
      where: { id: contentRunId },
      include: { client: true },
    })

    const client = contentRun.client

    const tokenUsage: TokenUsageLog = {}
    let openaiCost = 0
    let anthropicCost = 0
    let apifyCost = 0
    let briefCost: CostResult = { inputTokens: 0, outputTokens: 0, usd: 0 }
    let factsCost: CostResult = { inputTokens: 0, outputTokens: 0, usd: 0 }
    let captionsCost: CostResult = { inputTokens: 0, outputTokens: 0, usd: 0 }
    let crawlCostDetail = { credits: 0, usd: 0, urlsCrawled: 0 }

    // Tracks which named pipeline step is currently running. The catch
    // block reads this back into errorContext so the FailedRunBanner can
    // show the actual failure point instead of inferring from data shape.
    // Names mirror the comment headers below so they stay in sync.
    let currentStep:
      | 'run_init'
      | 'date_calculation'
      | 'brief_generation'
      | 'website_crawl'
      | 'facts_extraction'
      | 'caption_generation'
      | 'post_finalization' = 'run_init'

    try {
      await db.contentRun.update({
        where: { id: contentRunId },
        data: { status: 'running', startedAt: new Date() },
      })

      await recordActivity({
        clientId: client.id,
        runId: contentRunId,
        kind: ActivityKind.run_started,
        payload: { targetMonth: contentRun.targetMonth },
      })

      // Step 1: Calculate posting dates
      currentStep = 'date_calculation'
      const { postingDates, holidaysInMonth, holidayTags } = calculatePostingDates(
        contentRun.targetMonth,
        client.postingDays,
        client.excludedDates,
        client.holidayHandling
      )

      await db.contentRun.update({
        where: { id: contentRunId },
        data: { postingDates: postingDates.map((d) => d.date) },
      })

      // Step 2: Generate brief
      currentStep = 'brief_generation'
      const briefResult = await generateBrief(
        client,
        postingDates,
        holidaysInMonth,
        holidayTags
      )

      briefCost = briefResult.cost
      tokenUsage.brief = {
        input: briefResult.cost.inputTokens,
        output: briefResult.cost.outputTokens,
      }
      openaiCost = sumCosts(openaiCost, briefResult.cost.usd)

      await db.contentRun.update({
        where: { id: contentRunId },
        data: { brief: briefResult.brief, openaiCostUsd: openaiCost },
      })

      // Step 3: Crawl websites (or use cached data)
      currentStep = 'website_crawl'
      let crawledContent = ''

      if (reCrawl || !client.crawledData) {
        const crawlResult = await crawlWebsites(client.urls, briefResult.brief)

        crawledContent = crawlResult.crawledContent
        apifyCost = crawlResult.cost.usd
        crawlCostDetail = {
          credits: crawlResult.cost.credits,
          usd: crawlResult.cost.usd,
          urlsCrawled: crawlResult.urlsCrawled,
        }

        await db.client.update({
          where: { id: client.id },
          data: { crawledData: crawledContent, crawledDataAt: new Date() },
        })
      } else {
        crawledContent = client.crawledData
        crawlCostDetail = { credits: 0, usd: 0, urlsCrawled: 0 }
      }

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          crawledContent,
          apifyCostUsd: apifyCost,
        },
      })

      // Step 4: Extract facts
      currentStep = 'facts_extraction'
      const factsResult = await extractFacts(crawledContent)

      factsCost = factsResult.cost
      tokenUsage.facts = {
        input: factsResult.cost.inputTokens,
        output: factsResult.cost.outputTokens,
      }
      openaiCost = sumCosts(openaiCost, factsResult.cost.usd)

      await db.contentRun.update({
        where: { id: contentRunId },
        data: { supportingFacts: factsResult.facts, openaiCostUsd: openaiCost },
      })

      // Step 5: Generate captions — parse CTA candidates once, share between prompt + parser
      currentStep = 'caption_generation'
      const ctaCandidates = parseCtaCandidates(client.mainCta)

      const captionResult = await generateCaptions(
        briefResult.brief,
        factsResult.facts,
        postingDates,
        client,
        ctaCandidates
      )

      captionsCost = captionResult.cost
      tokenUsage.captions = {
        input: captionResult.cost.inputTokens,
        output: captionResult.cost.outputTokens,
      }
      anthropicCost = captionResult.cost.usd

      // Step 6: Create Post records with batchId=null. The modal's
      // finalizePostGenerationAction handles batch attachment after the user
      // chooses how to handle the new posts.
      currentStep = 'post_finalization'
      const postCount = await createPostsFromCaptions(
        captionResult.posts,
        contentRunId,
        client.id,
        ctaCandidates,
        null
      )

      const pipelineDurationSeconds = Math.round((Date.now() - pipelineStart) / 1000)

      const breakdown = buildCostBreakdown({
        briefCost,
        factsCost,
        captionsCost,
        crawlCost: crawlCostDetail,
        pipelineDurationSeconds,
      })

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          status: 'complete',
          openaiCostUsd: breakdown.openai.total,
          anthropicCostUsd: breakdown.anthropic.total,
          apifyCostUsd: breakdown.crawl.usd,
          totalCostUsd: breakdown.total,
          creditsConsumed: breakdown.credits,
          tokenUsage: {
            ...tokenUsage,
            breakdown: JSON.parse(JSON.stringify(breakdown)),
            pipelineDurationSeconds,
          },
          completedAt: new Date(),
        },
      })

      // Background auto-finalize: if the user dismissed the dialog while
      // the pipeline was running, attach posts to the default target now so
      // the inbox notification can deep-link straight to the populated batch.
      const refreshed = await db.contentRun.findUnique({
        where: { id: contentRunId },
        select: { autoFinalize: true },
      })
      let attachedBatchId: string | null = null
      if (refreshed?.autoFinalize) {
        try {
          const match = await findDefaultMatchingBatch(
            client.id,
            contentRun.targetMonth,
          )
          const result = await finalizePostGeneration({
            input: match
              ? { choice: 'add', runId: contentRunId, batchId: match.batchId }
              : { choice: 'auto-new', runId: contentRunId },
            actorUserId: contentRun.triggeredById,
          })
          attachedBatchId = result.batchId
        } catch (err) {
          // Auto-finalize is best-effort; pipeline already succeeded.
          // The user can still attach via the modal on next visit.
          console.error('[generate-content] auto-finalize failed', err)
        }
      }

      await recordActivity({
        clientId: client.id,
        runId: contentRunId,
        kind: ActivityKind.run_completed,
        // Public so the client thread shows the handoff.
        visibility: EventVisibility.public,
        payload: {
          targetMonth: contentRun.targetMonth,
          postCount,
          totalCostUsd: breakdown.total,
          batchId: attachedBatchId,
        },
        // Only mention the triggering user when the run auto-finalized in
        // the background. Foreground users land on the batch via the modal
        // redirect, so no inbox notification is needed for them.
        mentionedUserIds: attachedBatchId ? [contentRun.triggeredById] : [],
      })

      return { postCount, totalCostUsd: breakdown.total, breakdown }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const pipelineDurationSeconds = Math.round((Date.now() - pipelineStart) / 1000)

      const partialBreakdown = buildCostBreakdown({
        briefCost,
        factsCost,
        captionsCost,
        crawlCost: crawlCostDetail,
        pipelineDurationSeconds,
      })

      // Capture enough error context to render a useful failed run detail
      // page later. We keep the raw stack (truncated) under tokenUsage rather
      // than introducing a new column; the run detail page reads it back.
      // `failedStep` is the named pipeline step that was in flight when the
      // throw happened; the FailedRunBanner prefers it over data shape
      // inference so partial writes do not mislabel the failure point.
      const errorContext = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message,
        stack:
          error instanceof Error && error.stack
            ? error.stack.slice(0, 8000)
            : null,
        capturedAt: new Date().toISOString(),
        failedStep: currentStep,
      }

      const tokenUsageForFailed = {
        ...tokenUsage,
        breakdown: JSON.parse(JSON.stringify(partialBreakdown)),
        pipelineDurationSeconds,
        errorContext,
        failedStep: currentStep,
      }

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          status: 'failed',
          errorMessage: message,
          openaiCostUsd: partialBreakdown.openai.total || undefined,
          anthropicCostUsd: partialBreakdown.anthropic.total || undefined,
          apifyCostUsd: partialBreakdown.crawl.usd || undefined,
          totalCostUsd: partialBreakdown.total || undefined,
          tokenUsage: tokenUsageForFailed,
        },
      })

      await recordActivity({
        clientId: client.id,
        runId: contentRunId,
        kind: ActivityKind.run_failed,
        payload: {
          targetMonth: contentRun.targetMonth,
          errorMessage: message,
        },
      })

      throw error
    }
  },
})
