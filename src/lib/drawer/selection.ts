import {
  DRAWER_CATEGORIES,
  type DrawerCatalog,
  type DrawerCategory,
  type DrawerItem,
  type DrawerSelection,
} from '@/lib/drawer/types'

const ISO_DATE = /^(?!0000)\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

export const MIN_DRAWER_DATE = '0001-01-01'

const FALLBACKS: Record<DrawerCategory, DrawerItem> = {
  writing: {
    id: 'fallback:writing',
    category: 'writing',
    title: 'The writing drawer is empty',
    description: 'No published essay or journal entry has been filed here yet.',
    fallback: true,
  },
  photograph: {
    id: 'fallback:photograph',
    category: 'photograph',
    title: 'The photograph drawer is empty',
    description: 'No published photograph has been filed here yet.',
    fallback: true,
  },
  diction: {
    id: 'fallback:diction',
    category: 'diction',
    title: 'The Diction drawer is empty',
    description: 'No word has been filed in Diction yet.',
    fallback: true,
  },
  contraption: {
    id: 'fallback:contraption',
    category: 'contraption',
    title: 'The Contraptions drawer is empty',
    description: 'No curious term has been filed in Contraptions yet.',
    fallback: true,
  },
  blogroll: {
    id: 'fallback:blogroll',
    category: 'blogroll',
    title: 'The Blogroll drawer is empty',
    description: 'No outside destination has been filed here yet.',
    fallback: true,
  },
}

function utcTime(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`)
}

export function isDrawerDate(
  value: string | null | undefined
): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const time = utcTime(value)
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  )
}

export function utcIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function millisecondsUntilNextUtcDay(date: Date): number {
  const nextDay = new Date(date.getTime())
  nextDay.setUTCHours(24, 0, 0, 0)
  return nextDay.getTime() - date.getTime()
}

export function resolveDrawerDate(
  requestedDate: string | null | undefined,
  today: string,
  earliestDate = MIN_DRAWER_DATE
): string {
  if (!isDrawerDate(today)) throw new Error(`Invalid current date: ${today}`)
  if (!isDrawerDate(earliestDate)) {
    throw new Error(`Invalid earliest date: ${earliestDate}`)
  }
  const minimumDate = earliestDate <= today ? earliestDate : today
  if (!isDrawerDate(requestedDate) || requestedDate > today) return today
  return requestedDate < minimumDate ? minimumDate : requestedDate
}

export function shiftDrawerDate(date: string, days: number): string {
  if (!isDrawerDate(date)) throw new Error(`Invalid drawer date: ${date}`)
  const shifted = new Date(utcTime(date) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
  if (!isDrawerDate(shifted)) {
    throw new Error(`Drawer date is outside the supported range: ${shifted}`)
  }
  return shifted
}

export function drawerHref(date: string): string {
  if (!isDrawerDate(date)) throw new Error(`Invalid drawer date: ${date}`)
  return `/drawer?date=${date}`
}

export function drawerDateReplacementHref(
  requestedDate: string | null,
  resolvedDate: string
): string | null {
  if (requestedDate === null || requestedDate === resolvedDate) return null
  return drawerHref(resolvedDate)
}

/** FNV-1a gives a small, stable unsigned score in browsers and Node alike. */
function seedScore(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function normalizedTitle(item: DrawerItem): string {
  return item.title.trim().toLocaleLowerCase('en-US')
}

function normalizedHref(item: DrawerItem): string | null {
  if (!item.href) return null
  return item.href.replace(/\/$/, '').toLocaleLowerCase('en-US') || '/'
}

function isStargazing(item: DrawerItem): boolean {
  const href = normalizedHref(item)
  return href === '/stargazing' || normalizedTitle(item) === 'stargazing'
}

function rankedCandidates(
  candidates: readonly DrawerItem[],
  date: string,
  category: DrawerCategory
): DrawerItem[] {
  return [...candidates]
    .filter((item) => item.category === category && !isStargazing(item))
    .sort((left, right) => {
      const leftScore = seedScore(`${date}\u0000${category}\u0000${left.id}`)
      const rightScore = seedScore(`${date}\u0000${category}\u0000${right.id}`)
      return leftScore - rightScore || left.id.localeCompare(right.id)
    })
}

/**
 * Pick one item per fixed compartment. The date and stable item IDs are the
 * only seed material, so input order, build time, locale, and time zone cannot
 * affect the result.
 */
export function selectDrawer(
  catalog: DrawerCatalog,
  date: string
): DrawerSelection {
  if (!isDrawerDate(date)) throw new Error(`Invalid drawer date: ${date}`)

  const usedTitles = new Set<string>()
  const usedHrefs = new Set<string>()
  const items = DRAWER_CATEGORIES.map((category) => {
    const item = rankedCandidates(
      catalog.collections[category],
      date,
      category
    ).find((candidate) => {
      const title = normalizedTitle(candidate)
      const href = normalizedHref(candidate)
      return !usedTitles.has(title) && (!href || !usedHrefs.has(href))
    })
    const selected = item ?? FALLBACKS[category]
    usedTitles.add(normalizedTitle(selected))
    const href = normalizedHref(selected)
    if (href) usedHrefs.add(href)
    return selected
  })

  return { date, items }
}

/**
 * Choose another date in the known archive window without randomness. It is
 * surprising to the visitor but remains easy to test and reproduce.
 */
export function surpriseDrawerDate(
  displayedDate: string,
  latestDate: string,
  earliestDate: string
): string {
  if (
    !isDrawerDate(displayedDate) ||
    !isDrawerDate(latestDate) ||
    !isDrawerDate(earliestDate)
  ) {
    throw new Error('Surprise me requires valid ISO dates')
  }

  const lowerTime = Math.min(utcTime(earliestDate), utcTime(latestDate))
  const upperTime = Math.max(utcTime(earliestDate), utcTime(latestDate))
  const dayCount = Math.floor((upperTime - lowerTime) / DAY_MS) + 1
  if (dayCount <= 1) return new Date(lowerTime).toISOString().slice(0, 10)

  const displayedIndex = Math.floor(
    (utcTime(displayedDate) - lowerTime) / DAY_MS
  )
  let targetIndex =
    seedScore(`drawer-surprise\u0000${displayedDate}\u0000${latestDate}`) %
    dayCount
  if (targetIndex === displayedIndex) targetIndex = (targetIndex + 1) % dayCount

  return new Date(lowerTime + targetIndex * DAY_MS).toISOString().slice(0, 10)
}
