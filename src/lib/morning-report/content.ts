import { createHash } from 'node:crypto'
import { getCollection } from '@/lib/collections'
import {
  type CollectionEntry,
  collectionEntryAnchor,
} from '@/lib/collections/model'
import { getAllPostsWithoutImages } from '@/lib/content/loader-without-images'
import { photoMetadataText } from '@/lib/content/photo-metadata'
import type { Post } from '@/lib/content/types'
import { siteIdentity } from '@/lib/site-identity'

export const MORNING_REPORT_TIME_ZONE = 'America/New_York'
export const MORNING_REPORT_HOUR = 7
export const MORNING_REPORT_SCHEDULE = '*/15 11,12 * * *'

export interface MorningReportContent {
  date: string
  anniversaries: Array<{
    title: string
    url: string
    publishedAt: string
    yearsAgo: number
    excerpt: string
  }>
  word: {
    term: string
    definition: string
    suffix?: string
    url: string
    reference?: { label: string; href: string }
  }
  contraption: MorningReportContent['word']
  photo: {
    title: string
    url: string
    image: string
    alt: string
    caption: string
  } | null
}

export interface MorningReportCopy {
  subject: string
  preheader: string
  introduction: string
}

export interface MorningReportEmail extends MorningReportCopy {
  html: string
  text: string
  model: string | null
  generationId: string | null
}

/** Vercel schedules use UTC; the local-hour gate handles both DST offsets. */
export function morningReportClock(now = new Date()): {
  date: string
  due: boolean
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MORNING_REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === name)?.value
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    due: Number(value('hour')) === MORNING_REPORT_HOUR,
  }
}

/** Hash each identity, not its array position, so source ordering is irrelevant. */
function choose<T>(
  values: readonly T[],
  date: string,
  kind: string,
  identity: (value: T) => string
): T | undefined {
  return values
    .map((value) => ({
      value,
      rank: createHash('sha256')
        .update(`${date}:${kind}:${identity(value)}`)
        .digest('hex'),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank))[0]?.value
}

function collectionItem(
  entry: CollectionEntry,
  slug: 'diction' | 'contraptions'
): MorningReportContent['word'] {
  return {
    term: entry.term,
    definition: entry.definition,
    ...(entry.suffix ? { suffix: entry.suffix } : {}),
    ...(entry.reference ? { reference: entry.reference } : {}),
    url: `${siteIdentity.productionUrl}/${slug}#${collectionEntryAnchor(entry)}`,
  }
}

export function buildMorningReportContent(
  date: string,
  input?: {
    posts: readonly Post[]
    words: readonly CollectionEntry[]
    contraptions: readonly CollectionEntry[]
  }
): MorningReportContent {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new Error('Invalid morning report date')
  }
  const posts = input?.posts ?? getAllPostsWithoutImages()
  const word = choose(
    input?.words ?? getCollection('diction').entries,
    date,
    'word',
    (entry) => entry.term
  )
  const contraption = choose(
    input?.contraptions ?? getCollection('contraptions').entries,
    date,
    'contraption',
    (entry) => entry.term
  )
  if (!word || !contraption)
    throw new Error('Morning report collections are empty')
  // Publication dates are editorial calendar dates. Never convert a midnight
  // date-only value into New York time, which would shift it to yesterday.
  const published = posts.filter(
    (post) =>
      !post.frontmatter.draft &&
      /^\d{4}-\d{2}-\d{2}/.test(post.frontmatter.publishedAt) &&
      post.frontmatter.publishedAt.slice(0, 10) <= date
  )
  const anniversaries = published
    .filter((post) => {
      const publicationDate = post.frontmatter.publishedAt.slice(0, 10)
      return (
        publicationDate.slice(5) === date.slice(5) &&
        publicationDate.slice(0, 4) < date.slice(0, 4)
      )
    })
    .map((post) => ({
      title: post.frontmatter.title,
      url: `${siteIdentity.productionUrl}/${post.slug}`,
      publishedAt: post.frontmatter.publishedAt.slice(0, 10),
      yearsAgo:
        Number(date.slice(0, 4)) -
        Number(post.frontmatter.publishedAt.slice(0, 4)),
      excerpt: post.excerpt,
    }))
    .sort((a, b) => a.yearsAgo - b.yearsAgo || a.url.localeCompare(b.url))
  const photo = choose(
    published.filter(
      (post) =>
        (post.newsletter === 'tidbits' || post.newsletter === 'tsundoku') &&
        /^\/images\/.+\.(?:jpe?g|png|webp|avif)$/i.test(
          post.frontmatter.coverImage ?? ''
        )
    ),
    date,
    'photo',
    (post) => post.slug
  )
  return {
    date,
    anniversaries,
    word: collectionItem(word, 'diction'),
    contraption: collectionItem(contraption, 'contraptions'),
    photo: photo
      ? {
          title: photo.frontmatter.title,
          url: `${siteIdentity.productionUrl}/${photo.slug}`,
          image: photo.frontmatter.coverImage!,
          alt: photo.frontmatter.coverImageAlt || photo.frontmatter.title,
          caption: [
            photo.frontmatter.publishedAt.slice(0, 10),
            photo.frontmatter.location?.name,
            photoMetadataText(photo.frontmatter.photo),
          ]
            .filter(Boolean)
            .join(' · '),
        }
      : null,
  }
}

export function fallbackMorningReportCopy(
  content: MorningReportContent
): MorningReportCopy {
  return {
    subject:
      `Morning report: ${content.word.term} and ${content.contraption.term}`.slice(
        0,
        100
      ),
    preheader: `A word, a contraption, and a little rediscovery for ${content.date}.`,
    introduction:
      'Good morning. Here is a small selection from your archive: something to remember, something to learn, and something to look at.',
  }
}
