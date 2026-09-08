import { describe, expect, it } from 'vitest'
import type { Post } from '@/lib/content/types'
import {
  buildMorningReportContent,
  fallbackMorningReportCopy,
  morningReportClock,
} from '@/lib/morning-report/content'
import { renderMorningReport } from '@/lib/morning-report/render'

const words = [
  { term: 'Ephemera', definition: 'Things that last briefly.' },
  { term: 'Serendipity', definition: 'A lucky discovery.' },
]
const contraptions = [
  { term: 'Map & compass', definition: 'Ways to find a route.' },
]
function post(
  slug: string,
  date: string,
  extra: Record<string, unknown> = {}
): Post {
  return {
    slug,
    newsletter: 'contraption',
    frontmatter: { title: slug, publishedAt: date, ...extra },
    excerpt: 'A short excerpt.',
    content: '',
  } as Post
}
const select = (date: string, posts: Post[]) =>
  buildMorningReportContent(date, { posts, words, contraptions })

describe('morning calendar and content', () => {
  it.each([
    ['2026-01-10T12:00:00Z', '2026-01-10', true],
    ['2026-07-10T11:45:00Z', '2026-07-10', true],
    ['2026-03-07T11:00:00Z', '2026-03-07', false],
    ['2026-03-08T11:00:00Z', '2026-03-08', true],
    ['2026-11-01T11:00:00Z', '2026-11-01', false],
    ['2026-11-01T12:00:00Z', '2026-11-01', true],
    ['2026-09-08T00:00:00Z', '2026-09-07', false],
    ['2026-09-08T12:00:00Z', '2026-09-08', false],
  ])('gates %s with the New York clock', (instant, date, due) => {
    expect(morningReportClock(new Date(instant))).toEqual({ date, due })
  })

  it('retains written publication dates, excludes current/future years and drafts', () => {
    const content = select('2026-09-08', [
      post('old', '2023-09-08'),
      post('timestamp', '2025-09-08T00:00:00Z'),
      post('yesterday', '2023-09-07'),
      post('current', '2026-09-08'),
      post('future', '2027-09-08'),
      post('draft', '2022-09-08', { draft: true }),
    ])
    expect(
      content.anniversaries.map(({ title, yearsAgo }) => [title, yearsAgo])
    ).toEqual([
      ['timestamp', 1],
      ['old', 3],
    ])
  })

  it('only celebrates leap-day posts on a real leap day', () => {
    expect(
      select('2028-02-29', [post('leap', '2024-02-29')]).anniversaries
    ).toHaveLength(1)
    expect(
      select('2027-02-28', [post('leap', '2024-02-29')]).anniversaries
    ).toEqual([])
    expect(() => select('2027-02-29', [])).toThrow()
  })

  it('selects genuine published photo-newsletter covers and remains stable when source order changes', () => {
    const photos = [
      post('illustration', '2020-01-01', { coverImage: '/images/drawing.jpg' }),
      {
        ...post('real', '2020-01-01', {
          coverImage: '/images/photo.jpg',
          coverImageAlt: 'A street',
          location: { name: 'New York', url: 'https://example.com' },
        }),
        newsletter: 'tidbits',
      },
      {
        ...post('draft', '2020-01-01', {
          draft: true,
          coverImage: '/images/draft.jpg',
        }),
        newsletter: 'tidbits',
      },
    ] as Post[]
    const content = select('2026-09-08', photos)
    expect(content.photo).toMatchObject({
      title: 'real',
      image: '/images/photo.jpg',
      alt: 'A street',
      caption: '2020-01-01 · New York',
    })
    expect(
      buildMorningReportContent('2026-09-08', {
        posts: photos.reverse(),
        words: [...words].reverse(),
        contraptions,
      })
    ).toEqual(content)
  })

  it('escapes every generated/archival text and renders useful parallel plaintext with optimized first-party image', () => {
    const photo = {
      ...post('<Photo>', '2025-09-08', {
        coverImage: '/images/photo.jpg',
        coverImageAlt: 'A <street> & cafe',
      }),
      newsletter: 'tidbits',
    } as Post
    const content = select('2026-09-08', [photo])
    const copy = {
      subject: 'A <good> morning',
      preheader: '<script>bad</script>',
      introduction: 'Routes & <discoveries>',
    }
    const { html, text } = renderMorningReport(content, copy)
    expect(html).not.toContain('<script>')
    expect(html).toContain('Routes &amp; &lt;discoveries&gt;')
    expect(html).toContain(
      '/_next/image?url=%2Fimages%2Fphoto.jpg&amp;w=640&amp;q=100'
    )
    expect(html).toContain(
      '<!--[if mso]><table role="presentation" width="640"'
    )
    expect(html).toContain('Tuesday, September 8, 2026')
    expect(text).toContain('One year ago today\n<Photo>')
    expect(text).toContain(content.word.url)
    expect(text).toContain(content.contraption.url)
    expect(text).toContain(content.photo!.url)
    expect(text).not.toContain('&amp;')
    expect(fallbackMorningReportCopy(content).subject).toContain(
      content.word.term
    )
  })
})
