const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const MAJOR_US_HOLIDAYS: Record<string, (year: number) => string> = {
  "New Year's Day": (y) => `${y}-01-01`,
  "Presidents' Day": (y) => nthWeekday(y, 1, 1, 3),
  'Memorial Day': (y) => lastWeekday(y, 4, 1),
  'Juneteenth': (y) => `${y}-06-19`,
  'Independence Day': (y) => `${y}-07-04`,
  'Labor Day': (y) => nthWeekday(y, 8, 1, 1),
  'Veterans Day': (y) => `${y}-11-11`,
  'Thanksgiving': (y) => nthWeekday(y, 10, 4, 4),
  'Christmas Day': (y) => `${y}-12-25`,
}

export type PostingDate = {
  date: string
  day: string
  isHoliday?: boolean
  holidayName?: string
}

export type DateCalculatorResult = {
  postingDates: PostingDate[]
  holidaysInMonth: string[]
  holidayTags: string[]
}

export function calculatePostingDates(
  targetMonth: string,
  postingDays: string,
  excludedDates: string[],
  holidayHandling: string
): DateCalculatorResult {
  const [yearStr, monthStr] = targetMonth.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) - 1

  if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
    const now = new Date()
    return calculatePostingDates(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      postingDays,
      excludedDates,
      holidayHandling
    )
  }

  const allowedDays = parsePostingDays(postingDays)
  const excludedSet = new Set(excludedDates.map((d) => d.trim()))

  let holidays: Map<string, string> = new Map()
  if (holidayHandling === 'Major-US') {
    holidays = computeHolidays(year, month)
  }

  const holidaysInMonth: string[] = []
  const holidayTags: string[] = []
  for (const [name, dateStr] of holidays) {
    holidaysInMonth.push(`${name} (${dateStr})`)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const postingDates: PostingDate[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    const dayIndex = d.getDay()
    const dayName = DAY_NAMES[dayIndex]
    const dateStr = formatDate(d)

    if (!allowedDays.includes(dayName)) continue
    if (excludedSet.has(dateStr)) continue

    const entry: PostingDate = { date: dateStr, day: dayName }
    const holidayName = holidays.get(dateStr)
    if (holidayName) {
      entry.isHoliday = true
      entry.holidayName = holidayName
      holidayTags.push(`${dateStr}: ${holidayName}`)
    }

    const nextDate = new Date(d)
    nextDate.setDate(nextDate.getDate() + 1)
    const nextStr = formatDate(nextDate)
    const nextHoliday = holidays.get(nextStr)
    if (nextHoliday && !entry.isHoliday) {
      holidayTags.push(`${dateStr}: Eve of ${nextHoliday}`)
    }

    postingDates.push(entry)
  }

  return { postingDates, holidaysInMonth, holidayTags }
}

function parsePostingDays(raw: string): string[] {
  const normalized: Record<string, string> = {
    mon: 'Mon', monday: 'Mon',
    tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
    wed: 'Wed', wednesday: 'Wed',
    thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
    fri: 'Fri', friday: 'Fri',
    sat: 'Sat', saturday: 'Sat',
    sun: 'Sun', sunday: 'Sun',
  }

  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .map((s) => normalized[s] ?? s)
    .filter((s) => DAY_NAMES.includes(s as (typeof DAY_NAMES)[number]))
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  let count = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    if (d.getDay() === weekday) {
      count++
      if (count === n) return formatDate(d)
    }
  }
  return formatDate(new Date(year, month, 1))
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let day = daysInMonth; day >= 1; day--) {
    const d = new Date(year, month, day)
    if (d.getDay() === weekday) return formatDate(d)
  }
  return formatDate(new Date(year, month, 1))
}

function computeHolidays(year: number, month: number): Map<string, string> {
  const result = new Map<string, string>()
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`

  for (const [name, fn] of Object.entries(MAJOR_US_HOLIDAYS)) {
    const dateStr = fn(year)
    if (dateStr.startsWith(monthPrefix)) {
      result.set(dateStr, name)
    }
  }

  return result
}
