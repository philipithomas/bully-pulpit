import { describe, expect, it } from 'vitest'
import { getRewrites } from '@/lib/rewrites'

const rewrites = getRewrites()

function findRewrite(source: string) {
  return rewrites.find((rewrite) => rewrite.source === source)
}

describe('rewrites', () => {
  it('has no duplicate sources or self-rewrites', () => {
    const sources = rewrites.map((rewrite) => rewrite.source)
    const duplicates = sources.filter(
      (source, index) => sources.indexOf(source) !== index
    )

    expect(duplicates).toEqual([])
    for (const rewrite of rewrites) {
      expect(rewrite.destination).not.toBe(rewrite.source)
    }
  })

  describe('Tidbits asset compatibility', () => {
    it.each([
      ['/images/umami.svg', '/images/tidbits.svg'],
      ['/images/umami-icon.svg', '/images/tidbits-icon.svg'],
      ['/images/umami-email.png', '/images/tidbits-email.png'],
      ['/images/covers/umami/:path*', '/images/covers/tidbits/:path*'],
    ])('%s serves %s', (source, destination) => {
      expect(findRewrite(source)?.destination).toBe(destination)
    })
  })

  it('preserves Markdown mirrors', () => {
    expect(findRewrite('/:slug(.*)\\.md')?.destination).toBe('/api/md/:slug')
  })
})
