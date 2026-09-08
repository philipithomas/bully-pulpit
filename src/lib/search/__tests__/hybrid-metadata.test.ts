import { describe, expect, it, vi } from 'vitest'
import { hybridSearchPosts } from '@/lib/search/hybrid'

vi.mock('@/lib/search/corpus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search/corpus')>()
  return {
    ...actual,
    buildCorpus: () =>
      actual.buildCorpusFromPosts([
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
