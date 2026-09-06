import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { describe, expect, it, vi } from 'vitest'
import SlugPage from '@/app/[slug]/page'
import { PhotoPostNavigation } from '@/components/posts/photo-post-navigation'
import { PhotoSwipeCover } from '@/components/posts/photo-swipe-cover'
import { PostNavigation } from '@/components/posts/post-navigation'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { getPhotoNavigation } from '@/lib/content/photo-navigation'

vi.mock('@/lib/content/highlighter', () => ({
  codeThemeName: 'github-light',
  getHighlighter: async () => ({}),
}))

type PageElement = ReactElement<
  Record<string, unknown> & { children?: ReactNode }
>

function elements(node: ReactNode): PageElement[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement(child)) return []
    const element = child as PageElement
    return [element, ...elements(element.props.children)]
  })
}

describe('standalone photo page navigation contract', () => {
  it.each([
    'tidbits',
    'tsundoku',
  ] as const)('provides circular cover swipes and immediate viewer neighbors for %s', async (newsletter) => {
    const post = getPostsByNewsletter(newsletter)[0]
    const navigation = getPhotoNavigation(post)
    const page = await SlugPage({
      params: Promise.resolve({ slug: post.slug }),
    })
    const nodes = elements(page)
    const wrapper = nodes.find((node) => node.type === PhotoSwipeCover)
    const cover = nodes.find((node) => node.props['data-zoomable'] === '')
    const links = nodes.find((node) => node.type === PhotoPostNavigation)

    expect(wrapper?.props).toMatchObject({
      slug: post.slug,
      older: { href: `/${navigation.older?.slug}` },
      newer: { href: `/${navigation.newer?.slug}` },
    })
    expect(cover?.props['data-zoom-caption-collection']).toBe(newsletter)
    expect(cover?.props['data-zoom-photo-count']).toBe(navigation.total)
    expect(cover?.props['data-zoom-photo-index']).toBe(0)
    const neighbors = JSON.parse(
      cover?.props['data-zoom-photo-neighbors'] as string
    )
    expect(neighbors).toHaveLength(2)
    expect(links?.props).toMatchObject({
      older: navigation.older,
      newer: navigation.newer,
    })
    expect(nodes.some((node) => node.type === PostNavigation)).toBe(false)
  })

  it.each([
    'contraption',
    'postcard',
    'workshop',
  ] as const)('leaves %s covers and post navigation outside photo swiping', async (newsletter) => {
    const post = getPostsByNewsletter(newsletter).find(
      (candidate) => candidate.frontmatter.coverImage
    )!
    const page = await SlugPage({
      params: Promise.resolve({ slug: post.slug }),
    })
    const nodes = elements(page)

    expect(nodes.some((node) => node.type === PhotoSwipeCover)).toBe(false)
    expect(nodes.some((node) => node.type === PhotoPostNavigation)).toBe(false)
    expect(nodes.some((node) => node.type === PostNavigation)).toBe(true)
    const cover = nodes.find((node) => node.props['data-zoomable'] === '')
    expect(cover).toBeDefined()
    expect(cover?.props['data-zoom-caption-collection']).toBeUndefined()
    expect(cover?.props['data-zoom-photo-neighbors']).toBeUndefined()
  })
})
