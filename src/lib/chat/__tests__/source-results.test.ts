import { describe, expect, it } from 'vitest'
import {
  bellSourcesFromMessage,
  bellSourcesFromMessageParts,
  bellSourcesFromToolOutput,
} from '@/lib/chat/source-results'

describe('Bell tool provenance', () => {
  it('unwraps chronological list results into dated post sources', () => {
    const sources = bellSourcesFromToolOutput(
      'listPosts',
      JSON.stringify({
        posts: [
          {
            type: 'post',
            title: 'Latest Workshop post',
            url: '/latest-workshop-post',
            publishedAt: '2026-06-25',
            newsletter: 'workshop',
          },
        ],
        pagination: {
          offset: 0,
          limit: 1,
          total: 1,
          hasMore: false,
          nextOffset: null,
        },
      })
    )

    expect(sources).toEqual([
      {
        type: 'post',
        title: 'Latest Workshop post',
        url: '/latest-workshop-post',
        publishedAt: '2026-06-25',
        newsletter: 'workshop',
      },
    ])
  })

  it('uses search metadata and the first matched section anchor', () => {
    const sources = bellSourcesFromToolOutput(
      'searchPosts',
      JSON.stringify([
        {
          type: 'post',
          title: 'Finding a software job',
          url: '/finding-a-software-job',
          publishedAt: '2024-01-02',
          newsletter: 'workshop',
          excerpts: [
            {
              text: 'The timeline',
              section: {
                heading: 'Timeline',
                url: '/finding-a-software-job#timeline',
              },
            },
          ],
        },
      ])
    )

    expect(sources).toEqual([
      {
        type: 'post',
        title: 'Finding a software job',
        url: '/finding-a-software-job#timeline',
        publishedAt: '2024-01-02',
        newsletter: 'workshop',
        section: 'Timeline',
      },
    ])
  })

  it('builds sources for full post and page reads', () => {
    expect(
      bellSourcesFromToolOutput(
        'fetchPost',
        JSON.stringify({
          type: 'post',
          title: 'A post',
          publishedAt: '2026-07-09T12:00:00Z',
          newsletter: 'contraption',
          content: 'Full text',
        }),
        { slug: 'a-post' }
      )
    ).toEqual([
      {
        type: 'post',
        title: 'A post',
        url: '/a-post',
        publishedAt: '2026-07-09',
        newsletter: 'contraption',
      },
    ])

    expect(
      bellSourcesFromToolOutput(
        'fetchPage',
        JSON.stringify({
          type: 'page',
          title: 'Contact',
          url: '/contact',
          newsletter: 'page',
          content: 'Contact details',
        })
      )
    ).toMatchObject([{ type: 'page', title: 'Contact', url: '/contact' }])

    expect(
      bellSourcesFromToolOutput(
        'fetchPublicUrl',
        JSON.stringify({
          type: 'external',
          title: 'External source',
          url: 'https://example.com/source',
          content: 'External text',
        })
      )
    ).toEqual([
      {
        type: 'external',
        title: 'External source',
        url: 'https://example.com/source',
      },
    ])
  })

  it('uses only completed successful tools and keeps richer deduplicated sources', () => {
    const root = JSON.stringify({
      type: 'post',
      title: 'A post',
      url: '/a-post',
      newsletter: 'workshop',
    })
    const section = JSON.stringify([
      {
        type: 'post',
        title: 'A post',
        url: '/a-post',
        newsletter: 'workshop',
        excerpts: [
          {
            text: 'Details',
            section: { heading: 'Details', url: '/a-post#details' },
          },
        ],
      },
    ])

    expect(
      bellSourcesFromMessageParts([
        {
          type: 'tool-fetchPost',
          state: 'output-available',
          output: root,
        },
        {
          type: 'tool-searchPosts',
          state: 'output-available',
          output: section,
        },
        {
          type: 'tool-fetchPage',
          state: 'input-available',
          output: JSON.stringify({ title: 'Private', url: '/private' }),
        },
        {
          type: 'tool-fetchPage',
          state: 'output-available',
          output: JSON.stringify({ error: 'No page exists' }),
        },
      ])
    ).toEqual([
      {
        type: 'post',
        title: 'A post',
        url: '/a-post#details',
        newsletter: 'workshop',
        section: 'Details',
      },
    ])
  })

  it('rejects malformed and unsafe source output', () => {
    expect(bellSourcesFromToolOutput('searchPosts', 'not JSON')).toEqual([])
    expect(
      bellSourcesFromToolOutput(
        'fetchPage',
        JSON.stringify({
          type: 'page',
          title: 'Unsafe',
          url: 'javascript:alert(1)',
        })
      )
    ).toEqual([])
    expect(
      bellSourcesFromToolOutput(
        'fetchPublicUrl',
        JSON.stringify({
          type: 'external',
          title: 'Unsafe',
          url: 'javascript:alert(1)',
        })
      )
    ).toEqual([])
  })

  it('uses validated current-page metadata for a no-tool answer', () => {
    expect(
      bellSourcesFromMessage({
        parts: [{ type: 'text', text: 'The contact page lists email.' }],
        metadata: {
          currentPageSource: {
            type: 'page',
            title: 'Contact',
            url: '/contact',
            publishedAt: null,
            newsletter: 'page',
          },
        },
      })
    ).toEqual([
      {
        type: 'page',
        title: 'Contact',
        url: '/contact',
        newsletter: 'page',
      },
    ])
  })

  it('accepts an Umami post as validated current-page provenance', () => {
    expect(
      bellSourcesFromMessage({
        parts: [{ type: 'text', text: 'This photo was taken at SFMOMA.' }],
        metadata: {
          currentPageSource: {
            type: 'post',
            title: 'SFMOMA',
            url: '/sfmoma',
            publishedAt: '2026-07-11',
            newsletter: 'umami',
          },
        },
      })
    ).toEqual([
      {
        type: 'post',
        title: 'SFMOMA',
        url: '/sfmoma',
        publishedAt: '2026-07-11',
        newsletter: 'umami',
      },
    ])
  })

  it('prefers completed tool sources without adding the page fallback', () => {
    expect(
      bellSourcesFromMessage({
        parts: [
          {
            type: 'tool-fetchPost',
            state: 'output-available',
            input: { slug: 'a-post' },
            output: JSON.stringify({
              type: 'post',
              title: 'A post',
              url: '/a-post',
              publishedAt: '2026-07-09',
              newsletter: 'contraption',
            }),
          },
          { type: 'text', text: 'The answer uses a fetched post.' },
        ],
        metadata: {
          currentPageSource: {
            type: 'page',
            title: 'Contact',
            url: '/contact',
            publishedAt: null,
            newsletter: 'page',
          },
        },
      })
    ).toEqual([
      {
        type: 'post',
        title: 'A post',
        url: '/a-post',
        publishedAt: '2026-07-09',
        newsletter: 'contraption',
      },
    ])
  })

  it('rejects malformed current-page metadata', () => {
    const malformedSources = [
      {
        type: 'page',
        title: 'External',
        url: 'https://example.com/contact',
        publishedAt: null,
        newsletter: 'page',
      },
      {
        type: 'page',
        title: 'Missing date field',
        url: '/contact',
        newsletter: 'page',
      },
      {
        type: 'page',
        title: 'Bad date',
        url: '/contact',
        publishedAt: 'yesterday',
        newsletter: 'page',
      },
      {
        type: 'page',
        title: 'Private dimension',
        url: '/contact',
        publishedAt: null,
        newsletter: 'reader@example.com',
      },
      {
        type: 'post',
        title: 'Undated post',
        url: '/a-post',
        publishedAt: null,
        newsletter: 'contraption',
      },
    ]

    for (const currentPageSource of malformedSources) {
      expect(
        bellSourcesFromMessage({
          parts: [{ type: 'text', text: 'No tools.' }],
          metadata: { currentPageSource },
        })
      ).toEqual([])
    }
  })
})
