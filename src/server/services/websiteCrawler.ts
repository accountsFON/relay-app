import FirecrawlApp from '@mendable/firecrawl-js'
import { CRAWL_CONFIG } from '@/server/config/aiModels'

const SOCIAL_DOMAINS = new Set([
  'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
  'yelp.com', 'google.com', 'drive.google.com', 'docs.google.com',
  'dropbox.com', 'canva.com', 'behance.net', 'dribbble.com',
])

export type CrawlResult = {
  crawledContent: string
  urlsCrawled: number
  cost: { credits: number; usd: number }
}

export async function crawlWebsites(
  clientUrls: string[],
  briefText: string
): Promise<CrawlResult> {
  const allUrls = mergeUrls(clientUrls, briefText)

  if (allUrls.length === 0) {
    return { crawledContent: '', urlsCrawled: 0, cost: { credits: 0, usd: 0 } }
  }

  const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
  const pages: string[] = []
  let creditsUsed = 0

  const { primaryUrl, secondaryUrls } = classifyUrls(allUrls)

  if (primaryUrl) {
    try {
      const crawlResult = await retryOnRateLimit(() =>
        firecrawl.crawl(primaryUrl, {
          limit: 5,
          allowExternalLinks: false,
          maxDiscoveryDepth: 2,
          timeout: 120000,
        })
      )

      if (crawlResult.data) {
        for (const doc of crawlResult.data) {
          if (doc.markdown) {
            const url = doc.metadata?.url ?? doc.metadata?.sourceURL ?? primaryUrl
            pages.push(`${url}\n\n${doc.markdown}`)
          }
        }
      }
      creditsUsed += crawlResult.creditsUsed ?? crawlResult.data?.length ?? 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Firecrawl crawl failed for ${primaryUrl}: ${message}`)
    }
  }

  for (const url of secondaryUrls) {
    try {
      const result = await retryOnRateLimit(() =>
        firecrawl.scrape(url, {
          formats: ['markdown'],
          timeout: CRAWL_CONFIG.scrapeTimeoutMs,
        })
      )

      if (result.markdown) {
        pages.push(`${url}\n\n${result.markdown}`)
        creditsUsed++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Firecrawl scrape failed for ${url}: ${message}`)
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

function classifyUrls(urls: string[]): {
  primaryUrl: string | null
  secondaryUrls: string[]
} {
  let primaryUrl: string | null = null
  const secondaryUrls: string[] = []

  for (const url of urls) {
    const domain = getDomain(url)
    if (!domain) continue

    if (SOCIAL_DOMAINS.has(domain) || SOCIAL_DOMAINS.has(getBaseDomain(domain))) {
      secondaryUrls.push(url)
    } else if (!primaryUrl) {
      primaryUrl = url
    } else if (getDomain(primaryUrl) === domain) {
      // skip duplicate primary domain pages (crawl() will find them)
    } else {
      secondaryUrls.push(url)
    }
  }

  return { primaryUrl, secondaryUrls }
}

function mergeUrls(clientUrls: string[], briefText: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const url of clientUrls) {
    const cleaned = url.trim()
    if (cleaned && isValidUrl(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned)
      result.push(cleaned)
    }
  }

  const briefUrls = extractUrlsFromBrief(briefText)
  for (const url of briefUrls) {
    if (isValidUrl(url) && !seen.has(url)) {
      seen.add(url)
      result.push(url)
    }
  }

  return result.slice(0, CRAWL_CONFIG.maxUrls)
}

function extractUrlsFromBrief(text: string): string[] {
  const jsonMatch = text.match(/URLS_JSON:\s*\[([^\]]*)\]/)
  if (jsonMatch) {
    try {
      const urls = JSON.parse(`[${jsonMatch[1]}]`)
      if (Array.isArray(urls)) return urls.filter((u: unknown) => typeof u === 'string')
    } catch {
      // fall through
    }
  }
  const urlRegex = /https?:\/\/[^\s,)"']+/g
  return Array.from(text.matchAll(urlRegex), (m) => m[0])
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function getBaseDomain(hostname: string): string {
  const parts = hostname.split('.')
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname
}

async function retryOnRateLimit<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('Rate limit') && attempt < maxRetries) {
        const waitMatch = message.match(/retry after (\d+)s/)
        const waitSecs = waitMatch ? parseInt(waitMatch[1], 10) + 2 : 30
        console.warn(`Firecrawl rate limited, waiting ${waitSecs}s (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise((resolve) => setTimeout(resolve, waitSecs * 1000))
        continue
      }
      throw error
    }
  }
  throw new Error('Rate limit retries exhausted')
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}
