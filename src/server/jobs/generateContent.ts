import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import { calculatePostingDates } from '@/server/services/dateCalculator'
import { generateBrief } from '@/server/services/briefGenerator'
import { crawlWebsites } from '@/server/services/websiteCrawler'
import { extractFacts } from '@/server/services/factsExtractor'
import { generateCaptions } from '@/server/services/captionGenerator'
import { createPostsFromCaptions } from '@/server/services/postParser'
import { sumCosts, costToCredits, buildCostBreakdown } from '@/server/services/costTracker'
import type { CostResult, RunCostBreakdown } from '@/server/services/costTracker'

type TokenUsageLog = Record<string, { input: number; output: number }>

export const generateContentTask = task({
  id: 'generate-content',
  retry: { maxAttempts: 2 },
  queue: { concurrencyLimit: 4 },
  run: async ({ contentRunId }: { contentRunId: string }) => {
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

    try {
      await db.contentRun.update({
        where: { id: contentRunId },
        data: { status: 'running', startedAt: new Date() },
      })

      // Step 1: Calculate posting dates
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

      // Step 3: Crawl websites
      const crawlResult = await crawlWebsites(client.urls, briefResult.brief)

      apifyCost = crawlResult.cost.usd
      crawlCostDetail = {
        credits: crawlResult.cost.credits,
        usd: crawlResult.cost.usd,
        urlsCrawled: crawlResult.urlsCrawled,
      }

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          crawledContent: crawlResult.crawledContent,
          apifyCostUsd: apifyCost,
        },
      })

      // Step 4: Extract facts
      const factsResult = await extractFacts(crawlResult.crawledContent)

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

      // Step 5: Generate captions
      const captionResult = await generateCaptions(
        briefResult.brief,
        factsResult.facts,
        postingDates,
        client
      )

      captionsCost = captionResult.cost
      tokenUsage.captions = {
        input: captionResult.cost.inputTokens,
        output: captionResult.cost.outputTokens,
      }
      anthropicCost = captionResult.cost.usd

      // Step 6: Create Post records
      const postCount = await createPostsFromCaptions(
        captionResult.posts,
        contentRunId,
        client.id
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

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          status: 'failed',
          errorMessage: message,
          openaiCostUsd: partialBreakdown.openai.total || undefined,
          anthropicCostUsd: partialBreakdown.anthropic.total || undefined,
          apifyCostUsd: partialBreakdown.crawl.usd || undefined,
          totalCostUsd: partialBreakdown.total || undefined,
          tokenUsage: Object.keys(tokenUsage).length > 0
            ? {
                ...tokenUsage,
                breakdown: JSON.parse(JSON.stringify(partialBreakdown)),
                pipelineDurationSeconds,
              }
            : undefined,
        },
      })

      throw error
    }
  },
})
