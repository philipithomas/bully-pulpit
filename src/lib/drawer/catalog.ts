import { getAllPosts, getPages } from '@/lib/content/loader'
import type { Page, Post } from '@/lib/content/types'
import type {
  DrawerCatalog,
  DrawerCategory,
  DrawerCollections,
  DrawerItem,
} from '@/lib/drawer/types'
import { isPhotoNewsletter } from '@/lib/newsletters'

const OLDER_WRITING_SKIP = 8

const newsletterNames = {
  contraption: 'Contraption',
  workshop: 'Workshop',
  postcard: 'Postcard',
  tidbits: 'tidbits',
  tsundoku: 'Tsundoku',
} as const

function inlinePlaintext(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tidyDefinition(markdown: string): string {
  return inlinePlaintext(markdown)
    .replace(/\s+Wikipedia\.?$/i, '')
    .trim()
}

function uniqueItems(items: DrawerItem[]): DrawerItem[] {
  const ids = new Set<string>()
  return items
    .filter((item) => {
      if (ids.has(item.id)) return false
      ids.add(item.id)
      return true
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function definitionItems(
  content: string,
  category: Extract<DrawerCategory, 'diction' | 'contraption'>,
  href: '/diction' | '/contraptions'
): DrawerItem[] {
  const items: DrawerItem[] = []
  const entryPattern = /^\s*[-*+]\s+\*\*(.+?)\*\*\s+[—–-]\s+(.+)$/gm
  for (const match of content.matchAll(entryPattern)) {
    const title = inlinePlaintext(match[1] ?? '')
    const description = tidyDefinition(match[2] ?? '')
    if (!title || !description) continue
    items.push({
      id: `${category}:${title.toLocaleLowerCase('en-US')}`,
      category,
      title,
      description,
      href,
      sourceLabel:
        category === 'diction' ? 'Browse Diction' : 'Browse Contraptions',
    })
  }
  return uniqueItems(items)
}

function blogrollItems(content: string): DrawerItem[] {
  const items: DrawerItem[] = []
  const entryPattern =
    /^\s*[-*+]\s+\[([^\]]+)]\((https?:\/\/[^)]+)\)(?:\s+[—–-]\s+(.+))?\s*$/gm
  for (const match of content.matchAll(entryPattern)) {
    const title = inlinePlaintext(match[1] ?? '')
    const href = match[2]?.trim()
    if (!title || !href) continue
    items.push({
      id: `blogroll:${href}`,
      category: 'blogroll',
      title,
      description: match[3]
        ? inlinePlaintext(match[3])
        : "One of the websites and publications on Philip's Blogroll.",
      href,
      sourceLabel: 'Visit from the Blogroll',
      external: true,
    })
  }
  return uniqueItems(items)
}

function postDescription(post: Post): string {
  const description =
    post.frontmatter.subtitle ?? post.frontmatter.description ?? post.excerpt
  const text = inlinePlaintext(description)
  if (text.length <= 180) return text
  return `${text.slice(0, 177).trimEnd()}…`
}

function writingItems(posts: readonly Post[]): DrawerItem[] {
  const published = posts
    .filter(
      (post) =>
        !post.frontmatter.draft &&
        post.frontmatter.publishedAt &&
        !isPhotoNewsletter(post.newsletter) &&
        post.slug !== 'stargazing'
    )
    .sort(
      (left, right) =>
        right.frontmatter.publishedAt.localeCompare(
          left.frontmatter.publishedAt
        ) || left.slug.localeCompare(right.slug)
    )
  const older =
    published.length > OLDER_WRITING_SKIP
      ? published.slice(OLDER_WRITING_SKIP)
      : published

  return uniqueItems(
    older.map((post) => ({
      id: `writing:${post.slug}`,
      category: 'writing',
      title: post.frontmatter.title,
      description: postDescription(post),
      href: `/${post.slug}`,
      publishedAt: post.frontmatter.publishedAt,
      sourceLabel: newsletterNames[post.newsletter],
    }))
  )
}

function photographItems(posts: readonly Post[]): DrawerItem[] {
  return uniqueItems(
    posts
      .filter(
        (post) =>
          !post.frontmatter.draft &&
          post.frontmatter.publishedAt &&
          isPhotoNewsletter(post.newsletter) &&
          Boolean(post.frontmatter.coverImage) &&
          post.slug !== 'stargazing'
      )
      .map((post) => ({
        id: `photograph:${post.frontmatter.coverImage}`,
        category: 'photograph',
        title: post.frontmatter.title,
        description: post.frontmatter.location
          ? `Photographed at ${post.frontmatter.location.name}.`
          : `${newsletterNames[post.newsletter]} photograph from ${post.frontmatter.publishedAt}.`,
        href: `/${post.slug}`,
        publishedAt: post.frontmatter.publishedAt,
        sourceLabel: newsletterNames[post.newsletter],
        image: {
          src: post.frontmatter.coverImage as string,
          alt: post.frontmatter.coverImageAlt ?? post.frontmatter.title,
        },
      }))
  )
}

function pageContent(pages: readonly Page[], slug: string): string {
  return (
    pages.find((page) => page.slug === slug && !page.frontmatter.draft)
      ?.content ?? ''
  )
}

export function buildDrawerCatalog(
  posts: readonly Post[],
  pages: readonly Page[]
): DrawerCatalog {
  const collections: DrawerCollections = {
    writing: writingItems(posts),
    photograph: photographItems(posts),
    diction: definitionItems(
      pageContent(pages, 'diction'),
      'diction',
      '/diction'
    ),
    contraption: definitionItems(
      pageContent(pages, 'contraptions'),
      'contraption',
      '/contraptions'
    ),
    blogroll: blogrollItems(pageContent(pages, 'blogroll')),
  }
  const dates = posts
    .filter((post) => !post.frontmatter.draft && post.slug !== 'stargazing')
    .map((post) => post.frontmatter.publishedAt)
    .filter(Boolean)
    .sort()

  return { collections, earliestDate: dates[0] ?? null }
}

/** Build-time-only catalog: repository files are the sole data source. */
export function getDrawerCatalog(): DrawerCatalog {
  return buildDrawerCatalog(getAllPosts(), getPages())
}
