import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  TIDBITS_PALETTES,
  tidbitsAsset,
  tidbitsPaletteForPost,
} from '@/lib/tidbits/palette'
import { TIDBITS_WORDMARK_PATHS } from '@/lib/tidbits/wordmark'

function luminance(hex: string): number {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = Number.parseInt(channel, 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('Tidbits issue palettes', () => {
  it.each([
    ['kaffe', 'verdigris'],
    ['lamps', 'ochre'],
    ['copenhagen-sunset', 'cobalt'],
    ['cycling', 'aubergine'],
    ['jackknife', 'persimmon'],
    ['copenhill', 'cobalt'],
    ['sfmoma', 'cobalt'],
  ])('keeps %s assigned to %s across builds, readers, and email retries', (slug, id) => {
    expect(tidbitsPaletteForPost(slug).id).toBe(id)
  })

  it('has a stable fallback when there are no issues', () => {
    expect(tidbitsPaletteForPost().id).toBe('verdigris')
  })

  it('keeps the legacy hash for drafts without a saved assignment', () => {
    expect(tidbitsPaletteForPost('draft-photo').id).toBe('persimmon')
  })

  // WCAG 2.2 SC 1.4.3 and 1.4.11: compare unrounded values.
  // https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
  it.each(
    TIDBITS_PALETTES
  )('$id meets contrast targets in every supported treatment', (palette) => {
    for (const background of [palette.paper, '#ffffff', '#f5f3f0']) {
      expect(contrast(palette.ink, background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.accent, background)).toBeGreaterThanOrEqual(3)
      for (const text of [
        '#111110',
        '#222120',
        '#3b3834',
        '#625e58',
        '#6b6760',
      ]) {
        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(contrast(palette.foreground, palette.accent)).toBeGreaterThanOrEqual(
      4.5
    )
    for (const background of ['#121110', '#1c1a17', '#090908']) {
      for (const text of [palette.dark, '#ece9e4', '#d7d3cc', '#a8a49d']) {
        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('shares the capitalized letterforms between web and generated assets', async () => {
    const original = await readFile(
      join(
        process.cwd(),
        'public',
        tidbitsAsset(TIDBITS_PALETTES[0], 'wordmark')
      ),
      'utf8'
    )
    expect(
      [...original.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1])
    ).toEqual(TIDBITS_WORDMARK_PATHS)
  })

  it.each(
    TIDBITS_PALETTES
  )('$id ships correctly colored light and dark PNGs and SVGs', async (palette) => {
    for (const kind of ['email', 'email-dark'] as const) {
      const file = join(process.cwd(), 'public', tidbitsAsset(palette, kind))
      const { data, info } = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect(info).toMatchObject({ width: 416, height: 91, channels: 4 })
      const color = kind === 'email' ? palette.accent : palette.dark
      const expected = color
        .slice(1)
        .match(/../g)!
        .map((channel) => Number.parseInt(channel, 16))
      let opaque = 0
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] !== 255) continue
        opaque++
        expect([...data.subarray(index, index + 3)]).toEqual(expected)
      }
      expect(opaque).toBeGreaterThan(1000)
    }
    for (const kind of ['wordmark', 'icon'] as const) {
      const svg = await readFile(
        join(process.cwd(), 'public', tidbitsAsset(palette, kind)),
        'utf8'
      )
      expect(svg).toContain(palette.accent)
      if (kind === 'icon') expect(svg).toContain(palette.paper)
    }
  })
})
