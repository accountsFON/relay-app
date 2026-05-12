/**
 * Demo seed: 20 clients spanning 18 industries, 16 active + 1 paused +
 * 1 archived + 2 unassigned (in onboarding queue).
 *
 * Every client carries a full profile (business summary, brand voice,
 * target audience, main CTA, focus areas, dos/donts, posting days,
 * holiday handling, urls, assets folder url). 12 of 20 also carry
 * crawledData so the generate page "use stored data" path is testable.
 *
 * Idempotent on (organizationId, name).
 */
import type { DbClient } from '@/db/client'
import { ClientStatus } from '@prisma/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SeededUserMap } from './users'

interface BusinessSummaryMap {
  [industry: string]: string
}
interface BrandVoiceMap {
  [tone: string]: string
}
interface DosDontsMap {
  [key: string]: { dos: string; donts: string }
}

function loadJson<T>(file: string): T {
  const p = path.join(__dirname, 'data', file)
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

const BUSINESS_SUMMARIES = loadJson<BusinessSummaryMap>('business-summaries.json')
const BRAND_VOICES = loadJson<BrandVoiceMap>('brand-voices.json')
const DOS_DONTS = loadJson<DosDontsMap>('dos-donts.json')

type AmKey = 'am1' | 'am2' | null
type DesignerKey = 'designer1' | 'designer2' | null

interface ClientDef {
  /** Index 1-20 from the plan's roster table. */
  idx: number
  name: string
  industry: string
  /** JSON industry key for fixtures lookup. */
  industryKey: string
  location: string
  status: ClientStatus
  am: AmKey
  designer: DesignerKey
  onboarded: boolean
  brandVoiceTone: string
  targetAudience: string
  mainCta: string
  focus1: string
  focus2: string
  focus3: string
  postingDays: string
  holidayHandling: 'Major-US' | 'Off'
  urls: string[]
  assetsFolderUrl: string
  /** True for ~60% of clients so the "use stored crawl" path has data. */
  hasCrawledData: boolean
  phone: string
  /** When supplied, overrides the industry default dos/donts. */
  dosOverride?: { dos: string; donts: string }
}

export const CLIENT_DEFS: ClientDef[] = [
  {
    idx: 1,
    name: 'Cedar Creek Dental',
    industry: 'Dental',
    industryKey: 'dental',
    location: 'Asheville, NC',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'warm',
    targetAudience: 'Families and adults in greater Asheville looking for a friendly, modern dentist.',
    mainCta: 'Schedule your checkup online or call us today.',
    focus1: 'Preventive care + checkups',
    focus2: 'Cosmetic dentistry + whitening',
    focus3: 'Implants + restorative work',
    postingDays: 'Mon,Wed,Fri',
    holidayHandling: 'Major-US',
    urls: ['https://cedarcreekdental.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/cedar-creek-assets',
    hasCrawledData: true,
    phone: '(828) 555 0101',
  },
  {
    idx: 2,
    name: 'Apex Plumbing & Drain',
    industry: 'Plumbing',
    industryKey: 'plumbing',
    location: 'Charlotte, NC',
    status: ClientStatus.active,
    am: 'am2',
    designer: 'designer2',
    onboarded: true,
    brandVoiceTone: 'authoritative',
    targetAudience: 'Homeowners in the greater Charlotte metro who want a trusted, no nonsense plumber.',
    mainCta: 'Call now for same day service.',
    focus1: 'Emergency repairs',
    focus2: 'Water heater installation',
    focus3: 'Drain + sewer line service',
    postingDays: 'Tue,Thu,Sat',
    holidayHandling: 'Major-US',
    urls: ['https://apexplumbingnc.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/apex-plumbing-assets',
    hasCrawledData: true,
    phone: '(704) 555 0102',
  },
  {
    idx: 3,
    name: 'Sunrise Yoga Studio',
    industry: 'Fitness',
    industryKey: 'fitness',
    location: 'Austin, TX',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'empathetic',
    targetAudience: 'Yoga curious adults 25 to 55 in Austin, plus established practitioners looking for community.',
    mainCta: 'Book your first class for free.',
    focus1: 'Beginner classes',
    focus2: 'Yin + restorative',
    focus3: 'Workshops + retreats',
    postingDays: 'Mon,Wed,Fri',
    holidayHandling: 'Major-US',
    urls: ['https://sunriseyogaaustin.example.com', 'https://www.instagram.com/sunriseyogaaustin'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/sunrise-yoga-assets',
    hasCrawledData: true,
    phone: '(512) 555 0103',
  },
  {
    idx: 4,
    name: 'Riverbend Realty',
    industry: 'Real estate',
    industryKey: 'real_estate',
    location: 'Boise, ID',
    status: ClientStatus.active,
    am: 'am2',
    designer: 'designer2',
    onboarded: true,
    brandVoiceTone: 'professional',
    targetAudience: 'Boise area home buyers, sellers, and small portfolio investors.',
    mainCta: 'Browse listings or schedule a free consult.',
    focus1: 'First time buyers',
    focus2: 'Move up sellers',
    focus3: 'Investment + relocation',
    postingDays: 'Mon,Tue,Wed,Thu,Fri',
    holidayHandling: 'Major-US',
    urls: ['https://riverbendrealty.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/riverbend-assets',
    hasCrawledData: false,
    phone: '(208) 555 0104',
  },
  {
    idx: 5,
    name: 'Mainline Auto Repair',
    industry: 'Auto',
    industryKey: 'auto',
    location: 'Pittsburgh, PA',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'casual',
    targetAudience: 'Car owners across Pittsburgh, especially those tired of being upsold at chain shops.',
    mainCta: 'Schedule a free inspection.',
    focus1: 'Diagnostics + repair',
    focus2: 'Preventive maintenance',
    focus3: 'European imports + diesel',
    postingDays: 'Tue,Thu',
    holidayHandling: 'Major-US',
    urls: ['https://mainlineautopgh.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/mainline-auto-assets',
    hasCrawledData: true,
    phone: '(412) 555 0105',
  },
  {
    idx: 6,
    name: 'Lighthouse Family Law',
    industry: 'Legal',
    industryKey: 'legal',
    location: 'Portland, ME',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer2',
    onboarded: true,
    brandVoiceTone: 'empathetic',
    targetAudience: 'Adults navigating divorce, custody, and estate planning in southern Maine.',
    mainCta: 'Schedule a free 30 minute consultation.',
    focus1: 'Mediation focused divorce',
    focus2: 'Custody + family',
    focus3: 'Wills + estate planning',
    postingDays: 'Mon,Wed,Fri',
    holidayHandling: 'Major-US',
    urls: ['https://lighthousefamilylaw.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/lighthouse-law-assets',
    hasCrawledData: true,
    phone: '(207) 555 0106',
  },
  {
    idx: 7,
    name: 'Hilltop Tax & Bookkeeping',
    industry: 'Accounting',
    industryKey: 'accounting',
    location: 'Denver, CO',
    status: ClientStatus.active,
    am: 'am2',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'professional',
    targetAudience: 'Small business owners and self employed professionals across Colorado.',
    mainCta: 'Book a free 15 minute discovery call.',
    focus1: 'Year round tax planning',
    focus2: 'Bookkeeping + clean up',
    focus3: 'S corp + entity structuring',
    postingDays: 'Tue,Thu',
    holidayHandling: 'Major-US',
    urls: ['https://hilltoptax.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/hilltop-tax-assets',
    hasCrawledData: false,
    phone: '(303) 555 0107',
  },
  {
    idx: 8,
    name: 'Greenway Landscaping',
    industry: 'Landscaping',
    industryKey: 'landscaping',
    location: 'Raleigh, NC',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'casual',
    targetAudience: 'Raleigh and Cary homeowners who care about a beautiful, low maintenance yard.',
    mainCta: 'Get a free design consultation.',
    focus1: 'Landscape design + install',
    focus2: 'Hardscape + outdoor living',
    focus3: 'Maintenance + irrigation',
    postingDays: 'Mon,Thu',
    holidayHandling: 'Major-US',
    urls: ['https://greenwaylandscaping.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/greenway-assets',
    hasCrawledData: true,
    phone: '(919) 555 0108',
  },
  {
    idx: 9,
    name: 'The Bread & Bowl',
    industry: 'Restaurant',
    industryKey: 'restaurant',
    location: 'Madison, WI',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer2',
    onboarded: true,
    brandVoiceTone: 'playful',
    targetAudience: 'Madison area food lovers, professionals, and date night couples.',
    mainCta: 'Reserve your table online.',
    focus1: 'Seasonal dinner menu',
    focus2: 'Brunch weekends',
    focus3: 'Private events + catering',
    postingDays: 'Wed,Fri,Sat',
    holidayHandling: 'Major-US',
    urls: ['https://breadandbowlmadison.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/bread-bowl-assets',
    hasCrawledData: true,
    phone: '(608) 555 0109',
  },
  {
    idx: 10,
    name: 'Cyclone CrossFit',
    industry: 'Fitness',
    industryKey: 'fitness',
    location: 'Des Moines, IA',
    status: ClientStatus.active,
    am: 'am2',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'edgy',
    targetAudience: 'Athletic adults 25 to 50 in greater Des Moines who want serious coaching, not a chain gym.',
    mainCta: 'Book a no sweat intro session.',
    focus1: 'Group classes',
    focus2: 'Personal training',
    focus3: 'Nutrition coaching',
    postingDays: 'Mon,Wed,Fri',
    holidayHandling: 'Major-US',
    urls: ['https://cyclonecrossfit.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/cyclone-cf-assets',
    hasCrawledData: false,
    phone: '(515) 555 0110',
  },
  {
    idx: 11,
    name: 'Northbay Veterinary',
    industry: 'Veterinary',
    industryKey: 'veterinary',
    location: 'Petaluma, CA',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'warm',
    targetAudience: 'Pet owners across Petaluma, Novato, and the broader Northbay region.',
    mainCta: 'Schedule your wellness exam today.',
    focus1: 'Wellness + preventive care',
    focus2: 'Senior pet specialty',
    focus3: 'Surgery + dentistry',
    postingDays: 'Tue,Thu,Sat',
    holidayHandling: 'Major-US',
    urls: ['https://northbayvet.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/northbay-vet-assets',
    hasCrawledData: true,
    phone: '(707) 555 0111',
  },
  {
    idx: 12,
    name: 'Stonewall Roofing',
    industry: 'Contracting',
    industryKey: 'contracting',
    location: 'Birmingham, AL',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer2',
    onboarded: true,
    brandVoiceTone: 'authoritative',
    targetAudience: 'Birmingham metro homeowners and small commercial property owners.',
    mainCta: 'Schedule a free roof inspection.',
    focus1: 'Storm damage + insurance',
    focus2: 'Full roof replacement',
    focus3: 'Repair + maintenance',
    postingDays: 'Mon,Thu',
    holidayHandling: 'Major-US',
    urls: ['https://stonewallroofing.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/stonewall-roof-assets',
    hasCrawledData: false,
    phone: '(205) 555 0112',
  },
  {
    idx: 13,
    name: 'Solstice Photography',
    industry: 'Photography',
    industryKey: 'photography',
    location: 'Santa Fe, NM',
    status: ClientStatus.active,
    am: 'am2',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'playful',
    targetAudience: 'Couples, families, and small businesses in Santa Fe and the broader high desert.',
    mainCta: 'Inquire about your session.',
    focus1: 'Weddings',
    focus2: 'Family + portraits',
    focus3: 'Brand + headshots',
    postingDays: 'Tue,Fri',
    holidayHandling: 'Off',
    urls: ['https://solsticephoto.example.com', 'https://www.instagram.com/solsticephoto'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/solstice-photo-assets',
    hasCrawledData: true,
    phone: '(505) 555 0113',
  },
  {
    idx: 14,
    name: 'Halcyon HVAC',
    industry: 'HVAC',
    industryKey: 'hvac',
    location: 'Tampa, FL',
    status: ClientStatus.active,
    am: 'am2',
    designer: 'designer2',
    onboarded: true,
    brandVoiceTone: 'professional',
    targetAudience: 'Tampa Bay homeowners who want fast, fair, and reliable HVAC service.',
    mainCta: 'Schedule a free estimate.',
    focus1: 'New system install',
    focus2: 'Maintenance plans',
    focus3: 'Indoor air quality',
    postingDays: 'Mon,Wed,Fri',
    holidayHandling: 'Major-US',
    urls: ['https://halcyonhvac.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/halcyon-hvac-assets',
    hasCrawledData: true,
    phone: '(813) 555 0114',
  },
  {
    idx: 15,
    name: 'Bright Path Tutoring',
    industry: 'Education',
    industryKey: 'education',
    location: 'Boston, MA',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'empathetic',
    targetAudience: 'Greater Boston K through 12 families plus college students seeking subject mastery.',
    mainCta: 'Book a free diagnostic session.',
    focus1: 'SAT + ACT prep',
    focus2: 'Math + science tutoring',
    focus3: 'Executive function coaching',
    postingDays: 'Mon,Wed,Sat',
    holidayHandling: 'Major-US',
    urls: ['https://brightpathtutoring.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/bright-path-assets',
    hasCrawledData: false,
    phone: '(617) 555 0115',
  },
  {
    idx: 16,
    name: 'Coastal Bay Salon',
    industry: 'Beauty',
    industryKey: 'beauty',
    location: 'Charleston, SC',
    status: ClientStatus.active,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'warm',
    targetAudience: 'Charleston area women and men looking for a relaxed but expert salon experience.',
    mainCta: 'Book online or text us.',
    focus1: 'Color + balayage',
    focus2: 'Bridal + event styling',
    focus3: 'Lashes + brows',
    postingDays: 'Tue,Fri,Sat',
    holidayHandling: 'Major-US',
    urls: ['https://coastalbaysalon.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/coastal-bay-assets',
    hasCrawledData: true,
    phone: '(843) 555 0116',
  },
  {
    idx: 17,
    name: 'Old Mill Brewing Co',
    industry: 'Beverage',
    industryKey: 'beverage',
    location: 'Burlington, VT',
    status: ClientStatus.paused,
    am: 'am2',
    designer: 'designer2',
    onboarded: true,
    brandVoiceTone: 'casual',
    targetAudience: 'Vermont craft beer fans, taproom regulars, and small batch enthusiasts.',
    mainCta: 'Visit the taproom or order growlers online.',
    focus1: 'Tap list + new releases',
    focus2: 'Tours + events',
    focus3: 'Cellar + barrel program',
    postingDays: 'Wed,Sat',
    holidayHandling: 'Off',
    urls: ['https://oldmillbrewing.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/old-mill-assets',
    hasCrawledData: false,
    phone: '(802) 555 0117',
  },
  {
    idx: 18,
    name: 'Polaris Wellness',
    industry: 'Health',
    industryKey: 'health',
    location: 'Minneapolis, MN',
    status: ClientStatus.archived,
    am: 'am1',
    designer: 'designer1',
    onboarded: true,
    brandVoiceTone: 'clinical',
    targetAudience: 'Twin Cities adults seeking root cause functional health beyond conventional primary care.',
    mainCta: 'Schedule a discovery call.',
    focus1: 'Functional medicine',
    focus2: 'IV therapy + recovery',
    focus3: 'Hormone balance',
    postingDays: 'Mon,Thu',
    holidayHandling: 'Major-US',
    urls: ['https://polariswellness.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/polaris-wellness-assets',
    hasCrawledData: true,
    phone: '(612) 555 0118',
  },
  {
    idx: 19,
    name: 'Ironwood Construction',
    industry: 'Contracting',
    industryKey: 'contracting',
    location: 'Spokane, WA',
    status: ClientStatus.active,
    am: null,
    designer: null,
    onboarded: false,
    brandVoiceTone: 'authoritative',
    targetAudience: 'Spokane and Coeur d Alene homeowners planning major remodels or additions.',
    mainCta: 'Request a project consultation.',
    focus1: 'Whole home renovation',
    focus2: 'Additions + ADUs',
    focus3: 'Kitchen + bath remodel',
    postingDays: 'Mon,Wed,Fri',
    holidayHandling: 'Major-US',
    urls: ['https://ironwoodconstruction.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/ironwood-assets',
    hasCrawledData: false,
    phone: '(509) 555 0119',
  },
  {
    idx: 20,
    name: 'Maple & Oak Furnishings',
    industry: 'Retail',
    industryKey: 'retail',
    location: 'Burlington, NC',
    status: ClientStatus.active,
    am: null,
    designer: null,
    onboarded: false,
    brandVoiceTone: 'warm',
    targetAudience: 'Triangle and Triad homeowners shopping for handcrafted furniture and home goods.',
    mainCta: 'Visit the showroom or shop online.',
    focus1: 'Solid wood furniture',
    focus2: 'Handmade home goods',
    focus3: 'Local artisan partnerships',
    postingDays: 'Tue,Sat',
    holidayHandling: 'Major-US',
    urls: ['https://mapleandoakfurnishings.example.com'],
    assetsFolderUrl: 'https://drive.google.com/drive/folders/maple-oak-assets',
    hasCrawledData: false,
    phone: '(336) 555 0120',
  },
]

export interface SeededClient {
  id: string
  idx: number
  name: string
  industryKey: string
  status: ClientStatus
  onboarded: boolean
  amUserId: string | null
  designerUserId: string | null
  postingDays: string
  /** Used by content-runs seed to append the CTA after each caption body. */
  mainCta: string
}

function buildCrawledData(def: ClientDef): string | null {
  if (!def.hasCrawledData) return null
  return JSON.stringify(
    {
      source: 'firecrawl',
      crawledAt: '2026-04-15T12:00:00Z',
      url: def.urls[0],
      summary: BUSINESS_SUMMARIES[def.industryKey],
      services: [def.focus1, def.focus2, def.focus3],
      cta: def.mainCta,
      brandTone: def.brandVoiceTone,
    },
    null,
    2,
  )
}

function dosForClient(def: ClientDef): { dos: string; donts: string } {
  if (def.dosOverride) return def.dosOverride
  return DOS_DONTS[def.industryKey] ?? DOS_DONTS.default
}

export async function seedClients(
  db: DbClient,
  org: SeededUserMap,
): Promise<SeededClient[]> {
  const onboardedAt = new Date('2026-02-01T00:00:00Z')
  const result: SeededClient[] = []

  for (const def of CLIENT_DEFS) {
    const amUserId = def.am ? org.users[def.am].id : null
    const designerUserId = def.designer ? org.users[def.designer].id : null
    const dosObj = dosForClient(def)
    const summary = BUSINESS_SUMMARIES[def.industryKey] ?? ''
    const brandVoice = BRAND_VOICES[def.brandVoiceTone]
    const crawled = buildCrawledData(def)

    const existing = await db.client.findFirst({
      where: { organizationId: org.organizationId, name: def.name },
      select: { id: true },
    })

    const data = {
      organizationId: org.organizationId,
      name: def.name,
      assignedAmId: amUserId,
      assignedDesignerId: designerUserId,
      businessSummary: summary,
      brandVoice,
      industry: def.industry,
      location: def.location,
      phone: def.phone,
      mainCta: def.mainCta,
      focus1: def.focus1,
      focus2: def.focus2,
      focus3: def.focus3,
      dos: dosObj.dos,
      donts: dosObj.donts,
      postingDays: def.postingDays,
      postLength: 'medium',
      urls: def.urls,
      targetAudience: def.targetAudience,
      holidayHandling: def.holidayHandling,
      excludedDates: [] as string[],
      assetsFolderUrl: def.assetsFolderUrl,
      autoCrawl: 'always',
      crawledData: crawled,
      crawledDataAt: crawled ? new Date('2026-04-15T12:00:00Z') : null,
      status: def.status,
      onboardingCompletedAt: def.onboarded ? onboardedAt : null,
    }

    let row: { id: string }
    if (existing) {
      row = await db.client.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      })
    } else {
      row = await db.client.create({ data, select: { id: true } })
    }

    result.push({
      id: row.id,
      idx: def.idx,
      name: def.name,
      industryKey: def.industryKey,
      status: def.status,
      onboarded: def.onboarded,
      amUserId,
      designerUserId,
      postingDays: def.postingDays,
      mainCta: def.mainCta,
    })
  }

  return result
}
