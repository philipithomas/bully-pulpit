import { describe, expect, it } from 'vitest'
import {
  forceDarkColorScheme,
  forceLightColorScheme,
} from '@/lib/email/preview'
import { renderNewsletterShell } from '@/lib/email/templates/newsletter-shell'

describe('forceDarkColorScheme', () => {
  it('rewrites the exact media query the newsletter shell emits', () => {
    const html = renderNewsletterShell({
      content: '<p>Hello</p>',
      unsubscribeUrl: 'https://www.philipithomas.com/unsubscribe',
      newsletter: 'contraption',
      siteUrl: 'https://www.philipithomas.com',
    })
    expect(html).toContain('@media (prefers-color-scheme: dark)')
    const dark = forceDarkColorScheme(html)
    // No dark media condition survives (the CSS comment mentioning the
    // feature in prose is fine; only the @media condition matters).
    expect(dark).not.toMatch(/@media\s*\(\s*prefers-color-scheme/)
    expect(dark).toContain('@media all')
    // Only the media condition changes: the dark overrides themselves and the
    // light-mode inline styles pass through byte for byte.
    expect(dark).toContain(
      '.email-card { background-color: #1C1A17 !important; }'
    )
    expect(dark).toContain('background-color: #ffffff;')
  })

  it('tolerates whitespace variations around the condition', () => {
    const variants = [
      '@media (prefers-color-scheme: dark) { body { color: red; } }',
      '@media(prefers-color-scheme:dark) { body { color: red; } }',
      '@media  ( prefers-color-scheme : dark ) { body { color: red; } }',
    ]
    for (const css of variants) {
      expect(forceDarkColorScheme(css)).toBe(
        '@media all { body { color: red; } }'
      )
    }
  })

  it('replaces every occurrence and leaves other media queries alone', () => {
    const css = [
      '@media (max-width: 620px) { .a { padding: 0; } }',
      '@media (prefers-color-scheme: dark) { .b { color: red; } }',
      '@media (prefers-color-scheme: dark) { .c { color: blue; } }',
    ].join('\n')
    const out = forceDarkColorScheme(css)
    expect(out).toContain('@media (max-width: 620px)')
    expect(out.match(/@media all/g)).toHaveLength(2)
  })

  it('returns html without a dark block unchanged', () => {
    const html = '<html><body><p>No dark styles</p></body></html>'
    expect(forceDarkColorScheme(html)).toBe(html)
  })
})

describe('forceLightColorScheme', () => {
  it('disables the email dark-mode block without changing its contents', () => {
    const html = `<style>
      body { background: white; color: black; }
      @media (prefers-color-scheme: dark) {
        body { background: #121110; color: white; }
      }
    </style>`

    const light = forceLightColorScheme(html)

    expect(light).toContain('@media not all')
    expect(light).not.toContain('prefers-color-scheme')
    expect(light).toContain('background: #121110')
  })
})
