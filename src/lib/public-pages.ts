import { siteConfig } from '@/lib/config'
import { getPages, getPostsByNewsletter } from '@/lib/content/loader'
import type { Newsletter } from '@/lib/content/types'

export const PUBLIC_APP_PAGE_PATHS = [
  '/',
  '/contraption',
  '/workshop',
  '/postcard',
  '/umami',
  '/tsundoku',
  '/photography',
  '/print',
  '/sitemap',
] as const

export type PublicAppPagePath = (typeof PUBLIC_APP_PAGE_PATHS)[number]

export interface PublicAppPage {
  /** Stable internal search-index key. Public navigation always uses path. */
  id: `app-${string}`
  path: PublicAppPagePath
  title: string
  description: string
  /** Deterministic text embedded and indexed by site search. */
  searchText: string
  /** Current readable text returned to Bell and current-page context. */
  bellText: () => string
  humanSitemap: boolean
  xmlSitemap: boolean
}

export const PRINT_EDITION_STATUS_TEXT =
  'The print edition began on 2025-12-10 and is no longer available to order.'

function newsletterPage(
  newsletter: Newsletter,
  description: string = siteConfig.newsletters[newsletter].tagline
): PublicAppPage {
  const config = siteConfig.newsletters[newsletter]
  const path = `/${config.slug}` as PublicAppPagePath

  return {
    id: `app-${config.slug}`,
    path,
    title: config.name,
    description,
    searchText: `${config.name}. ${description} This page is the complete ${config.name} newsletter archive, with posts ordered from newest to oldest.`,
    bellText: () => {
      const recent = getPostsByNewsletter(newsletter)
        .slice(0, 5)
        .map(
          (post) =>
            `- ${post.frontmatter.title} (${post.frontmatter.publishedAt}, /${post.slug})`
        )

      return [
        `This page is the ${config.name} newsletter archive, ordered from newest to oldest. ${description}`,
        '',
        'Most recent posts:',
        ...recent,
      ].join('\n')
    },
    humanSitemap: true,
    xmlSitemap: true,
  }
}

function sitemapBellText(): string {
  const appPages = publicAppPages.map(
    (page) => `- ${page.title} (${page.path})`
  )
  const contentPages = getPages()
    .map((page) => `- ${page.frontmatter.title} (/${page.slug})`)
    .sort((a, b) => a.localeCompare(b))

  return [
    'The human sitemap lists the public pages and every published post on philipithomas.com. Posts are grouped by year and show their publication date and newsletter.',
    '',
    'App pages:',
    ...appPages,
    '',
    'Content pages:',
    ...contentPages,
  ].join('\n')
}

export const publicAppPages = [
  {
    id: 'app-home',
    path: '/',
    title: 'Home',
    description: siteConfig.description,
    searchText: `${siteConfig.author} crafts digital tools. He is an engineer living in New York City, working at the intersection of math, software, and business. He writes about software, projects, urbanism, coffee, and photography.`,
    bellText:
      () => `The homepage of philipithomas.com, the personal website and blog of ${siteConfig.author}. Philip crafts digital tools. He is an engineer living in New York City, working at the intersection of math, software, and business. He is interested in urbanism, coffee, and photography. He does not use social media, so this website contains his writing and media. Visitors can connect with him on GitHub and LinkedIn.

He currently publishes four newsletters:
- Contraption (/contraption): ${siteConfig.newsletters.contraption.tagline}
- Workshop (/workshop): ${siteConfig.newsletters.workshop.tagline}
- Postcard (/postcard): ${siteConfig.newsletters.postcard.tagline}
- umami (/umami): ${siteConfig.newsletters.umami.tagline}

The newsletters are available by email, RSS, and SMS, and the homepage has a signup form. Tsundoku (/tsundoku) is an archived pop-up photography newsletter whose historical posts and feeds remain available.`,
    humanSitemap: true,
    xmlSitemap: true,
  },
  newsletterPage('contraption'),
  newsletterPage('workshop'),
  newsletterPage('postcard'),
  newsletterPage(
    'umami',
    'An ongoing photography newsletter by Philip Thomas about street scenes, city life, coffee, and other things he notices along the way.'
  ),
  newsletterPage('tsundoku'),
  {
    id: 'app-photography',
    path: '/photography',
    title: 'Photography',
    description: 'I take and edit all photos on the site.',
    searchText:
      'Photography. Philip takes and edits all photos on the site. This page gathers post cover photography into a searchable gallery. Visitors can search the photographs by subject and open each image to see the posts where it appeared.',
    bellText: () =>
      "The Photography page gathers the cover photographs from Philip's posts into a gallery. Philip takes and edits all photos on the site. Visitors can search the photographs by subject and open a photo to see the posts where it appeared. Bell can search the same collection with image search.",
    humanSitemap: true,
    xmlSitemap: true,
  },
  {
    id: 'app-print',
    path: '/print',
    title: 'Print edition',
    description: `Every newsletter printed and mailed to you. ${PRINT_EDITION_STATUS_TEXT}`,
    searchText: `Print edition. Every newsletter was printed and mailed to subscribers. ${PRINT_EDITION_STATUS_TEXT} The launch essay is Introducing the print edition (/introducing-the-print-edition).`,
    bellText: () =>
      `The Print edition page describes an experiment that printed and mailed Philip's newsletters to subscribers. ${PRINT_EDITION_STATUS_TEXT} The launch essay, Introducing the print edition, is at /introducing-the-print-edition.`,
    humanSitemap: true,
    xmlSitemap: true,
  },
  {
    id: 'app-sitemap',
    path: '/sitemap',
    title: 'Sitemap',
    description: `A sitemap for humans: every page and post by ${siteConfig.author}.`,
    searchText:
      'Sitemap. A human-readable directory of every public page and published post on philipithomas.com. Posts are grouped by year with dates and newsletter names.',
    bellText: sitemapBellText,
    humanSitemap: true,
    xmlSitemap: true,
  },
] as const satisfies readonly PublicAppPage[]

const pagesByPath = new Map<string, PublicAppPage>(
  publicAppPages.map((page) => [page.path, page])
)

function normalizePath(path: string): string | null {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
    return null
  }
  if (path === '/') return path
  return path.replace(/\/+$/, '')
}

export function findPublicAppPage(path: string): PublicAppPage | null {
  const normalized = normalizePath(path)
  return normalized ? (pagesByPath.get(normalized) ?? null) : null
}

export function publicAppPage(path: PublicAppPagePath): PublicAppPage {
  const page = pagesByPath.get(path)
  if (!page) throw new Error(`Unknown public app page: ${path}`)
  return page
}

export function publicAppPageBellText(page: PublicAppPage): string {
  return `${page.title}\n\n${page.bellText()}`
}
