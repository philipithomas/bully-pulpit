import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JsonLd, serializeJsonLd } from '@/components/seo/json-ld'
import type { Post } from '@/lib/content/types'

describe('serializeJsonLd', () => {
  it('escapes every "<" so a closing script sequence cannot terminate the tag', () => {
    const schema = { headline: 'a</script><script>alert(1)</script>b' }
    const serialized = serializeJsonLd(schema)
    expect(serialized).not.toContain('<')
    expect(serialized).toContain('\\u003c')
  })

  it('round-trips to the original value through JSON.parse', () => {
    const schema = {
      headline: '</script> and 1 < 2',
      description: 'plain text',
    }
    expect(JSON.parse(serializeJsonLd(schema))).toEqual(schema)
  })

  it('leaves schemas without "<" untouched', () => {
    const schema = { '@type': 'WebSite', name: 'Bully pulpit' }
    expect(serializeJsonLd(schema)).toBe(JSON.stringify(schema))
  })
})

describe('JsonLd', () => {
  const post: Post = {
    slug: 'test-post',
    newsletter: 'contraption',
    frontmatter: {
      title: 'Title with </script><script>alert(1)</script> inside',
      description: 'A description',
      publishedAt: '2026-01-01',
      featured: false,
      draft: false,
    },
    content: 'Body',
    excerpt: 'Body',
  }

  it('renders article JSON-LD without an early script terminator', () => {
    const markup = renderToStaticMarkup(<JsonLd type="article" post={post} />)
    // The legitimate closing tag is the only one in the markup.
    expect(markup.match(/<\/script>/g)).toHaveLength(1)
    expect(markup).not.toContain('alert(1)</script>')
    const json = markup.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    expect(JSON.parse(json).headline).toBe(post.frontmatter.title)
  })

  it('renders website JSON-LD as parseable JSON', () => {
    const markup = renderToStaticMarkup(<JsonLd type="website" />)
    const json = markup.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    expect(JSON.parse(json)['@type']).toBe('WebSite')
  })
})
