import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  checkDocument,
  checkInternalPath,
  classifyLink,
  collectAppRoutes,
  collectPublicFiles,
  extractLinks,
  matchesDynamicRoute,
  pathnameOf,
  resolveRedirect,
  type SiteIndex,
} from '@/lib/links/check'

describe('extractLinks', () => {
  it('extracts markdown links and images', () => {
    const refs = extractLinks(
      'See [a post](/my-post) and ![a chart](/images/chart.png).'
    )
    expect(refs.map((r) => r.url)).toEqual(['/my-post', '/images/chart.png'])
  })

  it('extracts JSX href, src, and poster attributes', () => {
    const refs = extractLinks(
      '<a href="/about">x</a>\n<video src="/clip.mp4" poster="/poster.jpg" />'
    )
    expect(refs.map((r) => r.url)).toEqual([
      '/about',
      '/clip.mp4',
      '/poster.jpg',
    ])
  })

  it('reports 1-based line numbers', () => {
    const refs = extractLinks('first line\n\n[link](/target)\n')
    expect(refs).toEqual([{ url: '/target', line: 3 }])
  })

  it('ignores links inside fenced code blocks', () => {
    const source = '```md\n[fake](/not-real)\n```\n[real](/real)'
    expect(extractLinks(source).map((r) => r.url)).toEqual(['/real'])
  })

  it('ignores links inside inline code spans', () => {
    const source = 'Use `[x](/fake)` like [this](/real).'
    expect(extractLinks(source).map((r) => r.url)).toEqual(['/real'])
  })

  it('ignores frontmatter', () => {
    const source = '---\ncoverImage: /images/cover.jpg\n---\n\n[a](/b)'
    const refs = extractLinks(source)
    expect(refs).toEqual([{ url: '/b', line: 5 }])
  })

  it('handles parentheses in URLs', () => {
    const refs = extractLinks(
      '[meta](https://en.wikipedia.org/wiki/FF_Meta_(typeface))'
    )
    expect(refs[0].url).toBe('https://en.wikipedia.org/wiki/FF_Meta_(typeface)')
  })

  it('handles angle-bracket destinations and titles', () => {
    const refs = extractLinks('[a](</with space>) [b](/plain "a title")')
    expect(refs.map((r) => r.url)).toEqual(['/with space', '/plain'])
  })
})

describe('classifyLink', () => {
  it('classifies external schemes and protocol-relative URLs', () => {
    expect(classifyLink('https://example.com')).toBe('external')
    expect(classifyLink('http://example.com')).toBe('external')
    expect(classifyLink('mailto:a@b.co')).toBe('external')
    expect(classifyLink('tel:+15555555555')).toBe('external')
    expect(classifyLink('//cdn.example.com/x.js')).toBe('external')
  })

  it('classifies fragments, internal paths, and relative paths', () => {
    expect(classifyLink('#section')).toBe('fragment')
    expect(classifyLink('#/portal/signup')).toBe('fragment')
    expect(classifyLink('/my-post')).toBe('internal')
    expect(classifyLink('my-post')).toBe('relative')
    expect(classifyLink('./my-post')).toBe('relative')
  })
})

describe('pathnameOf', () => {
  it('strips query strings, fragments, and trailing slashes', () => {
    expect(pathnameOf('/post?ref=x')).toBe('/post')
    expect(pathnameOf('/post#anchor')).toBe('/post')
    expect(pathnameOf('/post/')).toBe('/post')
    expect(pathnameOf('/')).toBe('/')
  })
})

describe('resolveRedirect', () => {
  it('matches literal sources', () => {
    expect(
      resolveRedirect({ source: '/rss', destination: '/feed/rss.xml' }, '/rss')
    ).toBe('/feed/rss.xml')
  })

  it('substitutes one-segment params', () => {
    expect(
      resolveRedirect(
        { source: '/posts/:slug', destination: '/:slug' },
        '/posts/hello'
      )
    ).toBe('/hello')
  })

  it('matches catch-all params, including zero segments', () => {
    const redirect = {
      source: '/admin/:path*',
      destination: '/printing-press/:path*',
    }
    expect(resolveRedirect(redirect, '/admin/posts/send')).toBe(
      '/printing-press/posts/send'
    )
    expect(resolveRedirect(redirect, '/admin')).toBe('/printing-press')
  })

  it('returns null when the source does not match', () => {
    expect(
      resolveRedirect(
        { source: '/posts/:slug', destination: '/:slug' },
        '/essays/x'
      )
    ).toBeNull()
    expect(
      resolveRedirect(
        { source: '/posts/:slug', destination: '/:slug' },
        '/posts/a/b'
      )
    ).toBeNull()
  })
})

describe('route and public file collection', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-links-'))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('collects static and dynamic app routes', () => {
    const app = path.join(tmp, 'app')
    for (const dir of [
      '',
      'contraption',
      'feed/rss.xml',
      '(group)/about',
      '[slug]',
      'api/md/[slug]',
      '_private/hidden',
    ]) {
      fs.mkdirSync(path.join(app, dir), { recursive: true })
    }
    fs.writeFileSync(path.join(app, 'page.tsx'), '')
    fs.writeFileSync(path.join(app, 'contraption/page.tsx'), '')
    fs.writeFileSync(path.join(app, 'feed/rss.xml/route.ts'), '')
    fs.writeFileSync(path.join(app, '(group)/about/page.tsx'), '')
    fs.writeFileSync(path.join(app, '[slug]/page.tsx'), '')
    fs.writeFileSync(path.join(app, 'api/md/[slug]/route.ts'), '')
    fs.writeFileSync(path.join(app, '_private/hidden/page.tsx'), '')

    const { staticRoutes, dynamicRoutes } = collectAppRoutes(app)
    expect(staticRoutes).toEqual(
      new Set(['/', '/contraption', '/feed/rss.xml', '/about'])
    )
    expect(dynamicRoutes.sort()).toEqual(['/[slug]', '/api/md/[slug]'])
  })

  it('matches dynamic route patterns', () => {
    expect(matchesDynamicRoute('/api/md/any-slug', ['/api/md/[slug]'])).toBe(
      true
    )
    expect(matchesDynamicRoute('/api/md/a/b', ['/api/md/[slug]'])).toBe(false)
    expect(matchesDynamicRoute('/files/a/b', ['/files/[...path]'])).toBe(true)
  })

  it('collects public files as URL paths', () => {
    const pub = path.join(tmp, 'public')
    fs.mkdirSync(path.join(pub, 'images'), { recursive: true })
    fs.writeFileSync(path.join(pub, 'favicon.ico'), '')
    fs.writeFileSync(path.join(pub, 'images', 'Frame 1.jpg'), '')
    expect(collectPublicFiles(pub)).toEqual(
      new Set(['/favicon.ico', '/images/Frame 1.jpg'])
    )
  })
})

describe('checkInternalPath and checkDocument', () => {
  const index: SiteIndex = {
    slugs: new Set(['my-post', 'colophon']),
    routes: new Set(['/', '/contraption', '/print', '/feed/rss.xml']),
    dynamicRoutes: ['/api/md/[slug]'],
    publicFiles: new Set([
      '/images/chart.png',
      '/images/Frame 10.jpg',
      '/images/Literal%20Percent.jpg',
    ]),
    redirects: [
      { source: '/posts', destination: '/contraption' },
      { source: '/rss', destination: '/feed/rss.xml' },
      { source: '/old', destination: '/gone' },
      { source: '/posts/:slug', destination: '/:slug' },
    ],
    allow: new Set(['/404']),
  }

  it('accepts post slugs, routes, public files, and dynamic routes', () => {
    expect(checkInternalPath('/my-post', index)).toBeNull()
    expect(checkInternalPath('/colophon', index)).toBeNull()
    expect(checkInternalPath('/contraption', index)).toBeNull()
    expect(checkInternalPath('/feed/rss.xml', index)).toBeNull()
    expect(checkInternalPath('/images/chart.png', index)).toBeNull()
    expect(checkInternalPath('/api/md/anything', index)).toBeNull()
  })

  it('accepts the /:slug.md rewrite', () => {
    expect(checkInternalPath('/my-post.md', index)).toBeNull()
    expect(checkInternalPath('/nope.md', index)).not.toBeNull()
  })

  it('decodes percent escapes and accepts literal percent filenames', () => {
    expect(checkInternalPath('/images/Frame%2010.jpg', index)).toBeNull()
    expect(checkInternalPath('/images/Literal%20Percent.jpg', index)).toBeNull()
  })

  it('resolves redirects, including param substitution', () => {
    expect(checkInternalPath('/posts', index)).toBeNull()
    expect(checkInternalPath('/rss', index)).toBeNull()
    expect(checkInternalPath('/posts/my-post', index)).toBeNull()
  })

  it('reports redirects whose destination is broken', () => {
    expect(checkInternalPath('/old', index)).toContain('redirects to /gone')
    expect(checkInternalPath('/posts/missing', index)).toContain(
      'redirects to /missing'
    )
  })

  it('honors the whitelist', () => {
    expect(checkInternalPath('/404', index)).toBeNull()
  })

  it('suggests near-miss slugs', () => {
    expect(checkInternalPath('/my-postt', index)).toContain(
      'did you mean /my-post?'
    )
  })

  it('strips query strings and fragments in documents', () => {
    expect(
      checkDocument('[a](/my-post?ref=x) [b](/my-post#section)', index)
    ).toEqual([])
  })

  it('skips external and fragment-only links', () => {
    expect(
      checkDocument(
        '[x](https://example.com/missing) [y](#anchor) [z](mailto:a@b.co)',
        index
      )
    ).toEqual([])
  })

  it('flags relative links as missing a leading slash', () => {
    const problems = checkDocument('[broken](my-post)', index)
    expect(problems).toHaveLength(1)
    expect(problems[0].reason).toContain('leading slash')
  })

  it('flags unknown internal links with file positions', () => {
    const problems = checkDocument('line one\n\n[bad](/no-such-page)', index)
    expect(problems).toEqual([
      {
        url: '/no-such-page',
        line: 3,
        reason: expect.stringContaining('no matching post'),
      },
    ])
  })
})
