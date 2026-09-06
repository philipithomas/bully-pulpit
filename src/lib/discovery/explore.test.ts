import { describe, expect, it } from 'vitest'
import { getPageBySlug } from '@/lib/content/loader'
import { EXPLORE_GROUP_IDS, getExploreGroups } from '@/lib/discovery/explore'
import { findPublicAppPage, publicAppPage } from '@/lib/public-pages'

const EXPECTED_DESTINATIONS_WITHOUT_OPTIONAL_PAGES = [
  'contraption',
  'workshop',
  'postcard',
  'tidbits',
  'tsundoku',
  'photography',
  'diction',
  'contraptions',
  'blogroll',
  'audio',
  'media',
  'bell',
  'mcp',
  'colophon',
  'contact',
] as const

describe('Explore discovery groups', () => {
  it('keeps the requested editorial groups and destinations in reading order', () => {
    const groups = getExploreGroups()
    const expectedDestinations = [
      ...EXPECTED_DESTINATIONS_WITHOUT_OPTIONAL_PAGES,
    ] as string[]
    if (findPublicAppPage('/drawer')) {
      expectedDestinations.splice(6, 0, 'drawer')
    }

    expect(groups.map((group) => group.id)).toEqual(EXPLORE_GROUP_IDS)
    expect(
      groups.flatMap((group) =>
        group.destinations.map((destination) => destination.id)
      )
    ).toEqual(expectedDestinations)
  })

  it('only exposes the parallel Drawer feature after its route is registered', () => {
    const drawer = getExploreGroups()
      .flatMap((group) => group.destinations)
      .find((destination) => destination.id === 'drawer')

    if (findPublicAppPage('/drawer')) {
      expect(drawer).toMatchObject({ href: '/drawer', kind: 'link' })
    } else {
      expect(drawer).toBeUndefined()
    }
  })

  it('resolves canonical labels and descriptions without duplicate copy', () => {
    const destinations = getExploreGroups().flatMap(
      (group) => group.destinations
    )

    for (const destination of destinations) {
      expect(destination.title.trim().length).toBeGreaterThan(0)
      expect(destination.description.trim()).toMatch(/[.!?]$/)
    }

    const contraption = destinations.find(
      (destination) => destination.id === 'contraption'
    )
    const contraptionPage = publicAppPage('/contraption')
    expect(contraption).toMatchObject({
      href: contraptionPage.path,
      title: contraptionPage.title,
      description: contraptionPage.description,
    })

    const media = destinations.find((destination) => destination.id === 'media')
    expect(media).toMatchObject({
      title: getPageBySlug('media')?.frontmatter.title,
      description: getPageBySlug('media')?.frontmatter.description,
    })
  })

  it('uses unique, internal destination links and one typed Bell action', () => {
    const destinations = getExploreGroups().flatMap(
      (group) => group.destinations
    )
    const hrefs = destinations.map((destination) => destination.href)

    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(
      hrefs.every((href) => href.startsWith('/') || href === '#bell')
    ).toBe(true)
    expect(
      destinations.filter((destination) => destination.kind === 'bell')
    ).toEqual([
      expect.objectContaining({ id: 'bell', href: '#bell', title: 'Bell' }),
    ])
  })
})
