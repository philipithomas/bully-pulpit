import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'
import { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from '@/lib/pwa/config'

describe('web app manifest', () => {
  it('has a stable cross-platform install identity', () => {
    expect(manifest()).toMatchObject({
      name: 'Philip Ilic Thomas',
      short_name: 'Philip Thomas',
      id: '/',
      start_url: '/',
      scope: '/',
      lang: 'en-US',
      dir: 'ltr',
      display: 'standalone',
      orientation: 'any',
      background_color: PWA_BACKGROUND_COLOR,
      theme_color: PWA_THEME_COLOR,
      prefer_related_applications: false,
    })
  })

  it('provides exact-size ordinary and maskable PNG icons', async () => {
    const icons = manifest().icons ?? []

    for (const purpose of ['any', 'maskable'] as const) {
      expect(icons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sizes: '192x192', purpose }),
          expect.objectContaining({ sizes: '512x512', purpose }),
        ])
      )
    }

    for (const icon of icons) {
      expect(icon.type).toBe('image/png')
      const [width, height] = (icon.sizes ?? '').split('x').map(Number)
      const file = path.join(process.cwd(), 'public', icon.src)
      const metadata = await sharp(file).metadata()
      expect([metadata.width, metadata.height]).toEqual([width, height])
    }
  })

  it('keeps the opaque icon artwork inside the maskable safe circle', async () => {
    const { data, info } = await sharp(
      path.join(process.cwd(), 'public/icon-512.png')
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const center = (info.width - 1) / 2
    const safeRadius = info.width * 0.4
    let furthestLightPixel = 0

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels
        expect(data[offset + 3]).toBe(255)
        if (
          data[offset] > 180 &&
          data[offset + 1] > 180 &&
          data[offset + 2] > 180
        ) {
          furthestLightPixel = Math.max(
            furthestLightPixel,
            Math.hypot(x - center, y - center)
          )
        }
      }
    }

    expect(furthestLightPixel).toBeLessThanOrEqual(safeRadius)
  })
})
