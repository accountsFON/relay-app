import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import { calculatePostingDates } from '@/server/services/dateCalculator'
import { generateBrief } from '@/server/services/briefGenerator'
import { crawlWebsites } from '@/server/services/websiteCrawler'
import { extractFacts } from '@/server/services/factsExtractor'
import { generateCaptions } from '@/server/services/captionGenerator'
import { createPostsFromCaptions } from '@/server/services/postParser'
import { sumCosts, costToCredits } from '@/server/services/costTracker'
import type { CostResult } from '@/server/services/costTracker'

type TokenUsageLog = Record<string, { input: number; output: number }>

export const generateContentTask = task({
  id: 'generate-content',
  retry: { maxAttempts: 2 },
  run: async ({ contentRunId }: { contentRunId: string }) => {
    const contentRun = await db.contentRun.findUniqueOrThrow({
      where: { id: contentRunId },
      include: { client: true },
    })

    const client = contentRun.client
    const tokenUsage: TokenUsageLog = {}
    let openaiCost = 0
    let anthropicCost = 0
    let apifyCost = 0

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

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          crawledContent: crawlResult.crawledContent,
          apifyCostUsd: apifyCost,
        },
      })

      // Step 4: Extract facts
      const factsResult = await extractFacts(crawlResult.crawledContent)

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

      const totalCost = sumCosts(openaiCost, anthropicCost, apifyCost)

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          status: 'complete',
          openaiCostUsd: openaiCost,
          anthropicCostUsd: anthropicCost,
          apifyCostUsd: apifyCost,
          totalCostUsd: totalCost,
          creditsConsumed: costToCredits(totalCost),
          tokenUsage: tokenUsage as unknown as Record<string, never>,
          completedAt: new Date(),
        },
      })

      return { postCount, totalCostUsd: totalCost }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      await db.contentRun.update({
        where: { id: contentRunId },
        data: {
          status: 'failed',
          errorMessage: message,
          openaiCostUsd: openaiCost || undefined,
          anthropicCostUsd: anthropicCost || undefined,
          apifyCostUsd: apifyCost || undefined,
          totalCostUsd: sumCosts(openaiCost, anthropicCost, apifyCost) || undefined,
          tokenUsage: Object.keys(tokenUsage).length > 0
            ? (tokenUsage as unknown as Record<string, never>)
            : undefined,
        },
      })

      throw error
    }
  },
})
