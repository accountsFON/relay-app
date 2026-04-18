import { ApifyClient } from 'apify-client'
import { APIFY_CONFIG } from '@/server/config/aiModels'

export type CrawlResult = {
  crawledContent: string
  urlsCrawled: number
  cost: { computeUnits: number; usd: number }
}

export async function crawlWebsites(
  clientUrls: string[],
  briefText: string
): Promise<CrawlResult> {
  const mergedUrls = mergeAndScoreUrls(clientUrls, briefText)

  if (mergedUrls.length === 0) {
    return { crawledContent: '', urlsCrawled: 0, cost: { computeUnits: 0, usd: 0 } }
  }

  const startUrls = mergedUrls.map((url) => ({ url }))
  const apify = new ApifyClient({ token: process.env.APIFY_TOKEN })

  const run = await apify.actor(APIFY_CONFIG.actorId).call(
    {
      startUrls,
      crawlerType: APIFY_CONFIG.crawlerType,
      maxCrawlDepth: APIFY_CONFIG.maxCrawlDepth,
      maxPagesPerCrawl: APIFY_CONFIG.maxPagesPerCrawl,
      maxResults: APIFY_CONFIG.maxResults,
      requestTimeoutSecs: APIFY_CONFIG.requestTimeoutSecs,
      outputFormats: [APIFY_CONFIG.outputFormat],
      removeCookieWarnings: true,
      removeElementsCssSelector: 'nav, footer, script, style, [class*="cookie"]',
      aggressivePrune: true,
      blockMedia: true,
    },
    { waitSecs: 120 }
  )

  const { items } = await apify
    .dataset(run.defaultDatasetId)
    .listItems({ limit: 100 })

  const pages = items
    .map((item: Record<string, unknown>) => {
      const url = (item.url as string) ?? ''
      const content = (item.markdown as string) ?? (item.text as string) ?? ''
      return content ? `${url}\n\n${content}` : ''
    })
    .filter(Boolean)

  const crawledContent = pages.join('\n\n======\n\n')

  const computeUnits = run.stats?.computeUnits ?? 0
  const usd = Math.round(computeUnits * 0.4 * 10000) / 10000

  return {
    crawledContent,
    urlsCrawled: pages.length,
    cost: { computeUnits, usd },
  }
}

function mergeAndScoreUrls(clientUrls: string[], briefText: string): string[] {
  const urlSet = new Map<string, number>()

  for (const url of clientUrls) {
    const cleaned = url.trim()
    if (cleaned && isValidUrl(cleaned)) {
      urlSet.set(cleaned, (urlSet.get(cleaned) ?? 0) + 100)
    }
  }

  const briefUrls = extractUrlsFromBrief(briefText)
  for (const url of briefUrls) {
    if (isValidUrl(url)) {
      urlSet.set(url, (urlSet.get(url) ?? 0) + 50)
    }
  }

  for (const [url, score] of urlSet) {
    const path = new URL(url).pathname.toLowerCase()
    if (path.includes('service') || path.includes('product')) {
      urlSet.set(url, score + 10)
    } else if (path.includes('about')) {
      urlSet.set(url, score + 8)
    } else if (path.includes('blog')) {
      urlSet.set(url, score + 3)
    }
  }

  return Array.from(urlSet.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, APIFY_CONFIG.maxUrls)
    .map(([url]) => url)
}

function extractUrlsFromBrief(text: string): string[] {
  const jsonMatch = text.match(/URLS_JSON:\s*\[([^\]]*)\]/)
  if (jsonMatch) {
    try {
      const urls = JSON.parse(`[${jsonMatch[1]}]`)
      if (Array.isArray(urls)) return urls.filter((u: unknown) => typeof u === 'string')
    } catch {
      // fall through to regex
    }
  }

  const urlRegex = /https?:\/\/[^\s,)"']+/g
  return Array.from(text.matchAll(urlRegex), (m) => m[0])
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}
