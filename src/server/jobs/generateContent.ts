import { task } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import { calculatePostingDates } from '@/server/services/dateCalculator'
import { generateBrief } from '@/server/services/briefGenerator'
import { crawlWebsites } from '@/server/services/websiteCrawler'
import { extractFacts } from '@/server/services/factsExtractor'
import { generateCaptions } from '@/server/services/captionGenerator'
import { createPostsFromCaptions, parseCtaCandidates } from '@/server/services/postParser'
import { completionMentionUserIds } from '@/lib/content-generation-recipients'
import { sumCosts, costToCredits, buildCostBreakdown } from '@/server/services/costTracker'
import type { CostResult, RunCostBreakdown } from '@/server/services/costTracker'
import { recordActivity, ActivityKind, EventVisibility } from '@/server/services/activity'
import {
  finalizePostGeneration,
  findDefaultMatchingBatch,
} from '@/server/services/finalize-post-generation'
import {
  isRunCancelled,
  markRunCompleteIfNotCancelled,
  markRunRunningIfNotCancelled,
} from '@/server/jobs/run-cancellation'
import { makeStepTimer } from '@/server/jobs/step-timer'

type TokenUsageLog = Record<string, { input: number; output: number }>

export const generateContentTask = task({
  id: 'generate-content',
  // No automatic retries. The pipeline is not idempotent: postParser
  // calls createMany without an attemptNumber gate, so a retry after a
  // transient mid-pipeline error would double the post set and double
  // the AI spend. The Post.@@unique([contentRunId, postDate]) constraint
  // is the database-level guard if retries ever get re-enabled, but
  // dropping maxAttempts to 1 removes the source entirely. Failures
  // surface immediately to the user via the in-flight pill's Retry
  // button, which goes through the auth + scope path correctly.
  retry: { maxAttempts: 1 },
  run: async ({ contentRunId, reCrawl = true }: { contentRunId: string; reCrawl?: boolean }) => {
    const pipelineStart = Date.now()
    // Per-step wall-clock timing. `lap` is called after each pipeline step so
    // the run's tokenUsage carries a `stepDurationsMs` breakdown (and a log
    // line below), making it obvious which step dominates a slow run.
    const stepTimer = makeStepTimer()

    const contentRun = await db.contentRun.findUniqueOrThrow({
      where: { id: contentRunId },
      include: { client: true },
    })

    const client = contentRun.client

    const tokenUsage: TokenUsageLog = {}
    let openaiCost = 0
    let anthropicCost = 0
    let crawlerCost = 0
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
      // Atomic start guard: mark running ONLY if not already cancelled. A user
      // can cancel while the run sits queued (before this job picks it up); an
      // unconditional "set running" here would clobber that cancel and run the
      // whole pipeline. When this returns false the run was cancelled before it
      // started: exit immediately (no run_started, no work). This also bounds the
      // wasted compute for the pre-persist window where runs.cancel was skipped
      // because triggerJobId was not yet written.
      if (!(await markRunRunningIfNotCancelled(contentRunId))) {
        return { cancelled: true as const }
      }

      await recordActivity({
        clientId: client.id,
        runId: contentRunId,
        kind: ActivityKind.run_started,
        payload: { targetMonth: contentRun.targetMonth },
      })

      // Pipeline steps begin: rebase the step timer so per-step laps exclude
      // the run init (the running-status write + run_started activity above).
      stepTimer.reset()

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

      stepTimer.lap('date_calculation')

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

      stepTimer.lap('brief_generation')

      // Step 3: Crawl websites (or use cached data)
      currentStep = 'website_crawl'
      let crawledContent = ''

      if (reCrawl || !client.crawledData) {
        const crawlResult = await crawlWebsites(client.urls, briefResult.brief)

        crawledContent = crawlResult.crawledContent
        crawlerCost = crawlResult.cost.usd
        crawlCostDetail = {
          credits: crawlResult.cost.credits,
          usd: crawlResult.cost.usd,
          urlsCrawled: crawlResult.urlsCrawled,
        }

        // Surface crawler failures as a usable error instead of silently
        // producing a 'complete' run with placeholder facts. websiteCrawler
        // warn-and-continues on per-URL failures; if the client supplied
        // URLs but NONE of them came back with content, the brief, facts,
        // and posts downstream are all built on emptiness. Throwing here
        // lets the existing catch block mark the run failed with a
        // useful errorMessage for the FailedRunBanner.
        if (client.urls.length > 0 && crawlResult.urlsCrawled === 0) {
          throw new Error(
            `Website crawl failed: 0 of ${client.urls.length} URLs returned content. Check the client's URLs and Firecrawl logs for the per-URL warnings.`,
          )
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
          crawlerCostUsd: crawlerCost,
        },
      })

      stepTimer.lap('website_crawl')

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

      stepTimer.lap('facts_extraction')

      // Step 5: Generate captions, parse CTA candidates once, share between prompt + parser
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

      stepTimer.lap('caption_generation')

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

      stepTimer.lap('post_finalization')

      const pipelineDurationSeconds = Math.round((Date.now() - pipelineStart) / 1000)

      // Per-step timing breakdown — surfaces in the Trigger.dev run log so a
      // slow run can be diagnosed without re-running, and is also persisted on
      // the ContentRun (tokenUsage.stepDurationsMs) below.
      console.log('[generate-content] step durations (ms)', {
        contentRunId,
        totalMs: Date.now() - pipelineStart,
        crawled: reCrawl || !client.crawledData,
        steps: stepTimer.durationsMs,
      })

      const breakdown = buildCostBreakdown({
        briefCost,
        factsCost,
        captionsCost,
        crawlCost: crawlCostDetail,
        pipelineDurationSeconds,
      })

      // Cancellation guard, atomic: mark complete ONLY if the run was not
      // cancelled. This is a single guarded write (not a separate read +
      // update), so a cancel that commits mid-flight cannot be clobbered back
      // to `complete` by a TOCTOU race. When it returns false the run was
      // cancelled: stop here, do not finalize/attach, do not notify. The cancel
      // action is the source of truth; any posts created earlier stay
      // unattached (no batch is touched).
      const didComplete = await markRunCompleteIfNotCancelled(contentRunId, {
        openaiCostUsd: breakdown.openai.total,
        anthropicCostUsd: breakdown.anthropic.total,
        crawlerCostUsd: breakdown.crawl.usd,
        totalCostUsd: breakdown.total,
        creditsConsumed: breakdown.credits,
        tokenUsage: {
          ...tokenUsage,
          breakdown: JSON.parse(JSON.stringify(breakdown)),
          pipelineDurationSeconds,
          stepDurationsMs: { ...stepTimer.durationsMs },
        },
        completedAt: new Date(),
      })
      if (!didComplete) {
        return { cancelled: true as const }
      }

      // Background auto-finalize: if the user dismissed the dialog while
      // the pipeline was running, attach posts to the default target now so
      // the inbox notification can deep-link straight to the populated batch.
      //
      // Routing matches the client-side InFlightAutoFinalizer:
      //   - targetBatchId set             -> 'replace' (atomic swap)
      //   - targetBatchId null + match    -> 'replace' against the match
      //   - targetBatchId null + no match -> 'auto-new'
      const refreshed = await db.contentRun.findUnique({
        where: { id: contentRunId },
        select: { autoFinalize: true, targetBatchId: true },
      })
      let attachedBatchId: string | null = null
      if (refreshed?.autoFinalize) {
        try {
          let payload:
            | { choice: 'replace'; runId: string; batchId: string }
            | { choice: 'auto-new'; runId: string }
          if (refreshed.targetBatchId) {
            payload = {
              choice: 'replace',
              runId: contentRunId,
              batchId: refreshed.targetBatchId,
            }
          } else {
            const match = await findDefaultMatchingBatch(
              client.id,
              contentRun.targetMonth,
            )
            // 'add' was removed with the InFlightChoiceModal. The pipeline
            // path now mirrors the client-side AutoFinalizer: if a match
            // exists with no explicit target, replace it (matches the
            // pre-flight Replace flow's intent).
            payload = match
              ? { choice: 'replace', runId: contentRunId, batchId: match.batchId }
              : { choice: 'auto-new', runId: contentRunId }
          }
          const result = await finalizePostGeneration({
            input: payload,
            actorUserId: contentRun.triggeredById,
            // Pipeline runs in the run's own org context. The service's
            // cross-tenant scope check passes naturally because the
            // "actor" here is implicitly the original triggering user
            // operating inside their own org.
            actorOrganizationId: client.organizationId,
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
        // Always notify on completion: the triggering user (so they hear
        // about it whether they stayed on the page or navigated away) plus the
        // client's assigned AM if different, so the relay owner knows content
        // is ready to review even when an admin triggered the generation.
        mentionedUserIds: completionMentionUserIds(
          contentRun.triggeredById,
          client.assignedAmId,
        ),
      })

      return { postCount, totalCostUsd: breakdown.total, breakdown }
    } catch (error) {
      // If the run was cancelled mid-flight, the abort may surface here as a
      // throw. Do not overwrite the user's cancellation with a failure, and
      // do not emit a failed-run notification.
      if (await isRunCancelled(contentRunId)) {
        return { cancelled: true as const }
      }

      // Attribute the time spent in the step that was in flight when it threw,
      // so a failed run's stepDurationsMs still shows where the time went.
      stepTimer.lap(currentStep)

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
        stepDurationsMs: { ...stepTimer.durationsMs },
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
          crawlerCostUsd: partialBreakdown.crawl.usd || undefined,
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
