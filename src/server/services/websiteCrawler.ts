import FirecrawlApp from '@mendable/firecrawl-js'
import { CRAWL_CONFIG } from '@/server/config/aiModels'

export type CrawlResult = {
  crawledContent: string
  urlsCrawled: number
  cost: { credits: number; usd: number }
}

export async function crawlWebsites(
  clientUrls: string[],
  briefText: string
): Promise<CrawlResult> {
  const mergedUrls = mergeAndScoreUrls(clientUrls, briefText)

  if (mergedUrls.length === 0) {
    return { crawledContent: '', urlsCrawled: 0, cost: { credits: 0, usd: 0 } }
  }

  const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
  const pages: string[] = []
  let creditsUsed = 0

  for (const url of mergedUrls) {
    try {
      const result = await firecrawl.scrape(url, {
        formats: ['markdown'],
        timeout: CRAWL_CONFIG.scrapeTimeoutMs,
      })

      if (result.markdown) {
        pages.push(`${url}\n\n${result.markdown}`)
        creditsUsed++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Firecrawl failed for ${url}: ${message}`)
    }
  }

  const crawledContent = pages.join('\n\n======\n\n')
  const usd = Math.round(creditsUsed * CRAWL_CONFIG.costPerCredit * 10000) / 10000

  return {
    crawledContent,
    urlsCrawled: pages.length,
    cost: { credits: creditsUsed, usd },
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
    .slice(0, CRAWL_CONFIG.maxUrls)
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
