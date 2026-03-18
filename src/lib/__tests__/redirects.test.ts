import { describe, expect, it } from 'vitest'
import { getRedirects } from '@/lib/redirects'

const redirects = getRedirects()

function findRedirect(source: string) {
  return redirects.find((r) => r.source === source)
}

describe('redirects', () => {
  it('all redirects are permanent', () => {
    for (const r of redirects) {
      expect(r.permanent, `${r.source} should be permanent`).toBe(true)
    }
  })

  it('no duplicate sources', () => {
    const sources = redirects.map((r) => r.source)
    const dupes = sources.filter((s, i) => sources.indexOf(s) !== i)
    expect(dupes, `duplicate sources: ${dupes.join(', ')}`).toEqual([])
  })

  it('no redirect points to itself', () => {
    for (const r of redirects) {
      expect(r.destination, `${r.source} redirects to itself`).not.toBe(
        r.source
      )
    }
  })

  describe('Ghost /posts legacy', () => {
    it('/posts -> /contraption', () => {
      expect(findRedirect('/posts')?.destination).toBe('/contraption')
    })

    it('/posts/:slug catch-all -> /:slug', () => {
      expect(findRedirect('/posts/:slug')?.destination).toBe('/:slug')
    })

    it('explicit post mappings override catch-all', () => {
      expect(
        findRedirect('/posts/slow-travel-in-paris-discovering-substance-cafe')
          ?.destination
      ).toBe('/slow-travel')
    })

    it('unmigrated posts -> /contraption', () => {
      expect(
        findRedirect(
          '/posts/hacking-dopamine-for-entrepreneurial-success-lessons-from-neuroscience'
        )?.destination
      ).toBe('/contraption')
    })
  })

  describe('postcard month redirects', () => {
    it('/posts/what-i-m-up-to-january-2024 -> /2024-01', () => {
      expect(
        findRedirect('/posts/what-i-m-up-to-january-2024')?.destination
      ).toBe('/2024-01')
    })

    it('/december-2025 -> /2025-12', () => {
      expect(findRedirect('/december-2025')?.destination).toBe('/2025-12')
    })

    it('generates redirects for all years and months', () => {
      const postcardSources = redirects.filter(
        (r) =>
          r.source.startsWith('/posts/what-i-m-up-to-') ||
          /^\/(?:january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}$/.test(
            r.source
          )
      )
      // 7 years * 12 months * 2 formats = 168
      expect(postcardSources).toHaveLength(7 * 12 * 2)
    })
  })

  describe('Ghost section slug redirects', () => {
    it('/essays/:slug -> /:slug', () => {
      expect(findRedirect('/essays/:slug')?.destination).toBe('/:slug')
    })

    it('/conversations/:slug -> /:slug', () => {
      expect(findRedirect('/conversations/:slug')?.destination).toBe('/:slug')
    })

    it('/updates/:slug -> /:slug', () => {
      expect(findRedirect('/updates/:slug')?.destination).toBe('/:slug')
    })

    it('/news/:slug -> /:slug', () => {
      expect(findRedirect('/news/:slug')?.destination).toBe('/:slug')
    })

    it('/policies/:slug -> /:slug', () => {
      expect(findRedirect('/policies/:slug')?.destination).toBe('/:slug')
    })
  })

  describe('Ghost section index redirects', () => {
    it.each([
      '/essays',
      '/conversations',
      '/updates',
      '/news',
    ])('%s -> /', (source) => {
      expect(findRedirect(source)?.destination).toBe('/')
    })
  })

  describe('Ghost misc page redirects', () => {
    it.each([
      '/tools',
      '/products',
      '/collabs',
      '/consulting',
    ])('%s -> /', (source) => {
      expect(findRedirect(source)?.destination).toBe('/')
    })
  })

  describe('deprecated policy pages -> /policies', () => {
    it.each([
      '/security',
      '/copyright',
      '/cancellation',
      '/refund',
      '/abuse',
      '/how-we-handle-abusive-usage',
      '/recruitment',
      '/taxes',
      '/company-processors',
      '/booklet-subprocessors',
      '/postcard-subprocessors',
      '/ownership-booklet',
    ])('%s -> /policies', (source) => {
      expect(findRedirect(source)?.destination).toBe('/policies')
    })
  })

  describe('other legacy redirects', () => {
    it('/projects -> /', () => {
      expect(findRedirect('/projects')?.destination).toBe('/')
    })

    it('/rss -> /feed/rss.xml', () => {
      expect(findRedirect('/rss')?.destination).toBe('/feed/rss.xml')
    })

    it('/press -> /print', () => {
      expect(findRedirect('/press')?.destination).toBe('/print')
    })
  })
})
