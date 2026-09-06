import { describe, expect, it } from 'vitest'
import { publicContentPath } from '@/lib/content/public-path'

describe('publicContentPath', () => {
  it('preserves ordinary post slugs', () => {
    expect(publicContentPath('a-post-about-coffee')).toBe(
      '/a-post-about-coffee'
    )
  })

  it('keeps stored slugs inside one encoded path segment', () => {
    const path = publicContentPath('section/</loc><script>alert(1)</script>')

    expect(path).toBe(
      '/section%2F%3C%2Floc%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E'
    )
    expect(path).not.toContain('<')
    expect(path).not.toContain('>')
    expect(path.slice(1)).not.toContain('/')
  })
})
