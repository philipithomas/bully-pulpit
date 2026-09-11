import { describe, expect, it, vi } from 'vitest'
import { hybridSearchPosts } from '@/lib/search/hybrid'

vi.mock('@/lib/search/corpus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search/corpus')>()
  return {
    ...actual,
    buildCorpus: () =>
      actual.buildCorpusFromPosts([
        {
          slug: 'location-only-photo',
          newsletter: 'tsundoku',
          frontmatter: {
            title: 'Morning garden',
            publishedAt: '2026-06-25',
            coverImage: '/images/covers/garden.jpg',
            coverImageAlt: 'A quiet garden beside a pond',
            location: {
              name: 'Tenryū-ji, Kyoto',
              url: 'https://example.com/temple',
            },
            featured: false,
            draft: false,
          },
          content: '',
          excerpt: '',
        },
        {
          slug: 'subtitle-example',
          newsletter: 'workshop',
          frontmatter: {
            title: 'An example post',
            subtitle: 'The editorial subtitle',
            description: 'A secondary description',
            publishedAt: '2026-09-01',
            coverImageAlt: 'A sailboat in the harbor at dusk',
            featured: false,
            draft: false,
          },
          content: 'The article discusses an example.',
          excerpt: 'The article discusses an example.',
        },
      ]),
  }
})

vi.mock('@/lib/search/index-file', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/search/index-file')>()
  return { ...actual, loadSearchIndex: () => null }
})

describe('hybrid search metadata', () => {
  it('retrieves a location-only photo without a vector index and keeps metadata distinct from prose', async () => {
    const { results } = await hybridSearchPosts('Kyoto', { useVector: false })
    expect(results[0]).toMatchObject({
      slug: 'location-only-photo',
      excerpts: [],
      location: { name: 'Tenryū-ji, Kyoto' },
      images: [{ location: { name: 'Tenryū-ji, Kyoto' } }],
    })
  })

  it('keeps image search usable when vectors are missing', async () => {
    const { mode, results } = await hybridSearchPosts('Kyoto', {
      scope: 'images',
      useVector: false,
    })
    expect(mode).toBe('lexical')
    expect(results[0]).toMatchObject({
      type: 'image',
      slug: 'location-only-photo',
      location: { name: 'Tenryū-ji, Kyoto' },
      image: {
        alt: 'A quiet garden beside a pond',
        location: { name: 'Tenryū-ji, Kyoto' },
      },
    })
  })

  it('carries the post subtitle through as its description', async () => {
    const { results } = await hybridSearchPosts('example', { useVector: false })

    expect(results[0]).toMatchObject({
      slug: 'subtitle-example',
      description: 'The editorial subtitle',
      excerpts: [{ text: 'The article discusses an example.' }],
    })
  })

  it('does not expose cover alt as prose when only the image description matches', async () => {
    const { results } = await hybridSearchPosts('sailboat', {
      useVector: false,
    })

    expect(results[0]).toMatchObject({
      slug: 'subtitle-example',
      description: 'The editorial subtitle',
      excerpts: [],
    })
  })
})
