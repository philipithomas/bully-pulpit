import {
  type CollectionEntry,
  collectionEntryAnchor,
  getCollection,
} from '@/lib/collections'
import { getAllPosts } from '@/lib/content/loader'
import { comparePostsNewestFirst } from '@/lib/content/post-order'
import type { Post } from '@/lib/content/types'
import type {
  HomeCuriosity,
  HomeDrawer,
  HomePhoto,
  HomeWriting,
} from '@/lib/home/types'
import { isPhotoNewsletter } from '@/lib/newsletters'

export const HOME_PHOTO_LIMIT = 12
const RECENT_WRITING_COUNT = 8

export interface HomeDrawerSources {
  posts: readonly Post[]
  diction: readonly CollectionEntry[]
  contraptions: readonly CollectionEntry[]
}

function stableScore(value: string): number {
  let score = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    score ^= value.charCodeAt(index)
    score = Math.imul(score, 0x01000193)
  }
  return score >>> 0
}

function dailyItem<T>(
  items: readonly T[],
  seed: string,
  identify: (item: T) => string
): T | null {
  return (
    [...items].sort((left, right) => {
      const leftId = identify(left)
      const rightId = identify(right)
      return (
        stableScore(`${seed}\u0000${leftId}`) -
          stableScore(`${seed}\u0000${rightId}`) ||
        leftId.localeCompare(rightId)
      )
    })[0] ?? null
  )
}

function publishedBy(post: Post, today: string): boolean {
  const date = post.frontmatter.publishedAt
  return (
    !post.frontmatter.draft &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date &&
    date <= today
  )
}

function photoForPost(post: Post): HomePhoto | null {
  const { coverImage, coverImageAlt, title, publishedAt, location } =
    post.frontmatter
  const dimensions = post.coverDimensions
  if (
    (post.newsletter !== 'tidbits' && post.newsletter !== 'tsundoku') ||
    !coverImage ||
    !/^\/images\/[^?#\0]+\.(?:jpe?g|png|webp|avif)$/i.test(coverImage) ||
    coverImage
      .split('/')
      .some((segment) => segment === '.' || segment === '..') ||
    !dimensions ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    return null
  }

  return {
    title,
    src: coverImage,
    alt: coverImageAlt || title,
    width: dimensions.width,
    height: dimensions.height,
    href: `/${post.slug}`,
    publishedAt,
    ...(location ? { location: location.name } : {}),
    newsletter: post.newsletter,
  }
}

function selectedPhotos(posts: readonly Post[], date: string): HomePhoto[] {
  const seen = new Set<string>()
  const photos = posts.flatMap((post) => {
    const photo = photoForPost(post)
    if (!photo || seen.has(photo.src)) return []
    seen.add(photo.src)
    return [photo]
  })
  if (photos.length <= HOME_PHOTO_LIMIT) return photos

  // Keep the newest photograph first. One daily pick from each chronological
  // slice lets the rest span the archive without shipping every photograph.
  const archive = photos.slice(1)
  const sample: HomePhoto[] = [photos[0]]
  for (let index = 0; index < HOME_PHOTO_LIMIT - 1; index += 1) {
    const start = Math.floor((index * archive.length) / (HOME_PHOTO_LIMIT - 1))
    const end = Math.floor(
      ((index + 1) * archive.length) / (HOME_PHOTO_LIMIT - 1)
    )
    const photo = dailyItem(
      archive.slice(start, end),
      `${date}:photographs`,
      (item) => item.src
    )
    if (photo) sample.push(photo)
  }
  return sample
}

function curiosity(
  entries: readonly CollectionEntry[],
  collection: 'diction' | 'contraptions',
  date: string
): HomeCuriosity | null {
  const entry = dailyItem(
    entries.filter((item) => item.term.trim() && item.definition.trim()),
    `${date}:${collection}`,
    (item) => item.term
  )
  if (!entry) return null

  return {
    title: entry.term,
    description: entry.definition,
    href: `/${collection}#${collectionEntryAnchor(entry)}`,
  }
}

function writingDescription(post: Post): string {
  const text = (
    post.frontmatter.subtitle ??
    post.frontmatter.description ??
    post.excerpt
  )
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^(?:>\s*|[-*+]\s+)/gm, '')
    .replace(/\\([\p{P}\p{S}])/gu, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= 180) return text
  return `${text
    .slice(0, 177)
    .replace(/\s+\S*$/, '')
    .trimEnd()}…`
}

function selectedWriting(
  posts: readonly Post[],
  date: string
): HomeWriting | null {
  const writing = posts.filter((post) => !isPhotoNewsletter(post.newsletter))
  const year = Number(date.slice(0, 4))
  const anniversaries = writing.filter(
    (post) =>
      post.frontmatter.publishedAt.slice(5) === date.slice(5) &&
      Number(post.frontmatter.publishedAt.slice(0, 4)) < year
  )
  const archive = writing.slice(
    Math.min(RECENT_WRITING_COUNT, writing.length - 1)
  )
  const post = dailyItem(
    anniversaries.length ? anniversaries : archive,
    `${date}:writing`,
    (item) => item.slug
  )
  if (!post) return null

  const yearsAgo = year - Number(post.frontmatter.publishedAt.slice(0, 4))
  return {
    title: post.frontmatter.title,
    description: writingDescription(post),
    href: `/${post.slug}`,
    publishedAt: post.frontmatter.publishedAt,
    label: anniversaries.length
      ? `On this day ${yearsAgo} ${yearsAgo === 1 ? 'year' : 'years'} ago`
      : 'From the archive',
  }
}

/** Pure, UTC-day selection shared by each homepage presentation. */
export function buildHomeDrawer(
  sources: HomeDrawerSources,
  now: Date
): HomeDrawer {
  const date = now.toISOString().slice(0, 10)
  const posts = sources.posts
    .filter((post) => publishedBy(post, date))
    .sort(comparePostsNewestFirst)
  const word = curiosity(sources.diction, 'diction', date)

  return {
    date,
    photos: selectedPhotos(posts, date),
    word,
    contraption: curiosity(
      sources.contraptions.filter(
        (entry) => entry.term.toLowerCase() !== word?.title.toLowerCase()
      ),
      'contraptions',
      date
    ),
    writing: selectedWriting(posts, date),
  }
}

/** Repository-only server work. The page's ISR policy refreshes the UTC day. */
export function getHomeDrawer(now = new Date()): HomeDrawer {
  return buildHomeDrawer(
    {
      posts: getAllPosts(),
      diction: getCollection('diction').entries,
      contraptions: getCollection('contraptions').entries,
    },
    now
  )
}
