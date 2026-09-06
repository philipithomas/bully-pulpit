import { getPages } from '@/lib/content/loader'
import {
  findPublicAppPage,
  type PublicAppPagePath,
  publicAppPage,
} from '@/lib/public-pages'

export const EXPLORE_GROUP_IDS = [
  'writing',
  'photography',
  'curiosities',
  'tools-about',
] as const

export type ExploreGroupId = (typeof EXPLORE_GROUP_IDS)[number]

export type ExploreAccent = 'forest' | 'tidbits' | 'walnut' | 'indigo'

const EXPLORE_CONTENT_PAGE_SLUGS = [
  'diction',
  'contraptions',
  'blogroll',
  'audio',
  'media',
  'colophon',
  'contact',
] as const

export type ExploreContentPageSlug = (typeof EXPLORE_CONTENT_PAGE_SLUGS)[number]

export type ExploreDestinationId =
  | 'contraption'
  | 'workshop'
  | 'postcard'
  | 'tidbits'
  | 'tsundoku'
  | 'photography'
  | 'drawer'
  | ExploreContentPageSlug
  | 'bell'
  | 'mcp'

type ExploreDestinationReference =
  | {
      id: Exclude<
        ExploreDestinationId,
        ExploreContentPageSlug | 'bell' | 'drawer'
      >
      source: 'app'
      path: PublicAppPagePath
    }
  | {
      id: 'drawer'
      source: 'optional-app'
      path: '/drawer'
    }
  | {
      id: ExploreContentPageSlug
      source: 'content'
      slug: ExploreContentPageSlug
    }
  | {
      id: 'bell'
      source: 'bell'
      title: 'Bell'
      description: string
    }

interface ExploreGroupDefinition {
  id: ExploreGroupId
  title: string
  description: string
  accent: ExploreAccent
  destinations: readonly ExploreDestinationReference[]
}

/**
 * The editorial grouping is declared once here. App-page and MDX destination
 * copy is deliberately referenced rather than repeated, so Explore follows
 * the canonical public registries when a label or description changes.
 */
export const EXPLORE_GROUP_DEFINITIONS = [
  {
    id: 'writing',
    title: 'Writing',
    description: 'Essays, field notes, and dispatches from work in motion.',
    accent: 'forest',
    destinations: [
      { id: 'contraption', source: 'app', path: '/contraption' },
      { id: 'workshop', source: 'app', path: '/workshop' },
      { id: 'postcard', source: 'app', path: '/postcard' },
    ],
  },
  {
    id: 'photography',
    title: 'Photography',
    description: 'Photo journals and a searchable view across the archive.',
    accent: 'tidbits',
    destinations: [
      { id: 'tidbits', source: 'app', path: '/tidbits' },
      { id: 'tsundoku', source: 'app', path: '/tsundoku' },
      { id: 'photography', source: 'app', path: '/photography' },
    ],
  },
  {
    id: 'curiosities',
    title: 'Curiosities',
    description: 'Lists and collections assembled for repeat wandering.',
    accent: 'walnut',
    destinations: [
      { id: 'drawer', source: 'optional-app', path: '/drawer' },
      { id: 'diction', source: 'content', slug: 'diction' },
      { id: 'contraptions', source: 'content', slug: 'contraptions' },
      { id: 'blogroll', source: 'content', slug: 'blogroll' },
      { id: 'audio', source: 'content', slug: 'audio' },
      { id: 'media', source: 'content', slug: 'media' },
    ],
  },
  {
    id: 'tools-about',
    title: 'Tools and about',
    description: 'Ways to ask, connect, and see how the site works.',
    accent: 'indigo',
    destinations: [
      {
        id: 'bell',
        source: 'bell',
        title: 'Bell',
        description:
          "Ask the site's AI guide to find and explain public writing, pages, and photographs.",
      },
      { id: 'mcp', source: 'app', path: '/mcp/setup' },
      { id: 'colophon', source: 'content', slug: 'colophon' },
      { id: 'contact', source: 'content', slug: 'contact' },
    ],
  },
] as const satisfies readonly ExploreGroupDefinition[]

type ExploreDestinationBase = {
  id: ExploreDestinationId
  title: string
  description: string
}

export type ExploreDestination = ExploreDestinationBase &
  ({ kind: 'link'; href: `/${string}` } | { id: 'bell'; kind: 'bell' })

export type ExploreGroup = {
  id: ExploreGroupId
  title: string
  description: string
  accent: ExploreAccent
  destinations: readonly ExploreDestination[]
}

/** Resolve checked references into the serializable view model used by UI. */
export function getExploreGroups(): readonly ExploreGroup[] {
  const contentPages = new Map(getPages().map((page) => [page.slug, page]))

  return EXPLORE_GROUP_DEFINITIONS.map((group) => ({
    ...group,
    destinations: (
      group.destinations as readonly ExploreDestinationReference[]
    ).flatMap((destination): ExploreDestination[] => {
      if (destination.source === 'app') {
        const page = publicAppPage(destination.path)
        return [
          {
            id: destination.id,
            kind: 'link',
            href: page.path,
            title: page.title,
            description: page.description,
          },
        ]
      }

      // Parallel feature branches can register a public destination without
      // making Explore link to a route that has not landed yet. Once the
      // Drawer registry entry is present, this group picks it up automatically.
      if (destination.source === 'optional-app') {
        const page = findPublicAppPage(destination.path)
        return page
          ? [
              {
                id: destination.id,
                kind: 'link',
                href: page.path,
                title: page.title,
                description: page.description,
              },
            ]
          : []
      }

      if (destination.source === 'content') {
        const page = contentPages.get(destination.slug)
        if (!page) {
          throw new Error(
            `Explore references missing content page: ${destination.slug}`
          )
        }
        if (!page.frontmatter.description) {
          throw new Error(
            `Explore content page needs a description: ${destination.slug}`
          )
        }
        return [
          {
            id: destination.id,
            kind: 'link',
            href: `/${destination.slug}` as const,
            title: page.frontmatter.title,
            description: page.frontmatter.description,
          },
        ]
      }

      return [
        {
          id: destination.id,
          kind: 'bell',
          title: destination.title,
          description: destination.description,
        },
      ]
    }),
  }))
}
