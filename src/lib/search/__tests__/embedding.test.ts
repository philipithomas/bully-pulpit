import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPostBySlug } from '@/lib/content/loader'
import { extractImageAssets } from '@/lib/search/corpus'
import {
  decodeVector,
  EMBEDDING_DIMS,
  embedImageWithDescription,
  encodeVector,
  GATEWAY_EMBEDDINGS_URL,
  IMAGE_EMBED_MAX_EDGE,
  truncateAndNormalize,
} from '@/lib/search/embedding'
import { publicImageFilePath } from '@/lib/search/image-source'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('embedImageWithDescription', () => {
  it('pairs the actual public photo with its authored location and public metadata', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-gateway-key')
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ embedding: [3, 4] }] })
    )
    vi.stubGlobal('fetch', fetchMock)
    const post = getPostBySlug('first-photo')
    expect(post).not.toBeNull()
    const [cover] = extractImageAssets(post!)

    const vector = await embedImageWithDescription({
      imagePath: publicImageFilePath(cover.src),
      text: cover.text,
    })

    expect(vector).toEqual([0.6, 0.8])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      GATEWAY_EMBEDDINGS_URL,
      expect.objectContaining({ method: 'POST' })
    )
    const [, request] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(request?.body))
    expect(body.input).toEqual([
      { type: 'text', text: cover.text },
      {
        type: 'image_url',
        image_url: {
          url: expect.stringMatching(/^data:image\/jpeg;base64,/),
        },
      },
    ])
    expect(body.input[0].text).toContain('Location: Kamimeguro')
    expect(body.input[0].text).toContain('Camera: Leica M11-P')
    const bytes = Buffer.from(
      body.input[1].image_url.url.split(',')[1],
      'base64'
    )
    const image = await sharp(bytes).metadata()
    expect(image.format).toBe('jpeg')
    expect(Math.max(image.width!, image.height!)).toBeLessThanOrEqual(
      IMAGE_EMBED_MAX_EDGE
    )
    expect(image.exif).toBeUndefined()
    expect(image.xmp).toBeUndefined()
  })
})

describe('truncateAndNormalize', () => {
  it('truncates to the requested dims', () => {
    const input = Array.from({ length: 1536 }, (_, i) => i + 1)
    const out = truncateAndNormalize(input, 256)
    expect(out).toHaveLength(256)
  })

  it('L2-normalizes to unit length', () => {
    const out = truncateAndNormalize([3, 4], 2)
    expect(out[0]).toBeCloseTo(0.6, 10)
    expect(out[1]).toBeCloseTo(0.8, 10)
    const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 10)
  })

  it('preserves direction after truncation', () => {
    const input = [2, 0, 0, 99, 99] // dims beyond 3 are dropped
    const out = truncateAndNormalize(input, 3)
    expect(out).toEqual([1, 0, 0])
  })

  it('returns a zero vector unchanged instead of dividing by zero', () => {
    expect(truncateAndNormalize([0, 0, 0], 3)).toEqual([0, 0, 0])
  })

  it('defaults to the index dims constant', () => {
    const input = Array.from({ length: 1536 }, () => 1)
    expect(truncateAndNormalize(input)).toHaveLength(EMBEDDING_DIMS)
  })
})

describe('encodeVector / decodeVector', () => {
  it('round-trips float32 values through base64', () => {
    const vector = [0.1, -0.25, 1, 0, -1, 3.5e-5]
    const decoded = decodeVector(encodeVector(vector))
    expect(decoded).toHaveLength(vector.length)
    for (let i = 0; i < vector.length; i++) {
      expect(decoded[i]).toBeCloseTo(vector[i], 6)
    }
  })

  it('encodes little-endian float32', () => {
    // 1.0 as little-endian float32 is 00 00 80 3f
    expect(Buffer.from(encodeVector([1]), 'base64').toString('hex')).toBe(
      '0000803f'
    )
  })
})
