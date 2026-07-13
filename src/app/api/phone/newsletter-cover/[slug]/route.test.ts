import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Post } from '@/lib/content/types'

vi.mock('@/lib/content/loader-without-images', () => ({
  getPostBySlugWithoutImages: vi.fn(),
}))

import { GET, HEAD } from '@/app/api/phone/newsletter-cover/[slug]/route'
import { getPostBySlugWithoutImages } from '@/lib/content/loader-without-images'

const PHOTO_POST = {
  slug: 'first-photo',
  newsletter: 'tsundoku',
  frontmatter: {
    title: 'First photo',
    publishedAt: '2026-06-24',
    coverImage: '/images/covers/tsundoku/selfie.jpg',
    coverImageAlt: 'A mirror selfie',
  },
  content: '',
  excerpt: '',
} as Post

const mockedGetPost = vi.mocked(getPostBySlugWithoutImages)
const mockedFetch = vi.fn()
const context = { params: Promise.resolve({ slug: PHOTO_POST.slug }) }
let optimizedSource: Buffer

function coverRequest(
  coverImage: string = PHOTO_POST.frontmatter.coverImage as string
): Request {
  const url = new URL(
    `https://example.com/api/phone/newsletter-cover/${PHOTO_POST.slug}`
  )
  url.searchParams.set('v', coverImage)
  return new Request(url)
}

beforeAll(async () => {
  const source = await fs.readFile(
    path.join(
      process.cwd(),
      'public',
      (PHOTO_POST.frontmatter.coverImage as string).slice(1)
    )
  )
  optimizedSource = await sharp(source)
    .resize({
      width: 1200,
      height: 1200,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 100 })
    .toBuffer()
})

beforeEach(() => {
  mockedGetPost.mockReturnValue(PHOTO_POST)
  mockedFetch.mockResolvedValue(
    new Response(Uint8Array.from(optimizedSource), {
      headers: {
        'Content-Length': String(optimizedSource.byteLength),
        'Content-Type': 'image/jpeg',
      },
    })
  )
  vi.stubGlobal('fetch', mockedFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('photography newsletter MMS cover', () => {
  it('serves a bounded JPEG with Twilio-safe headers', async () => {
    const response = await GET(coverRequest(), context)
    const body = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(body).metadata()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Content-Disposition')).toBe(
      'inline; filename="cover.jpg"'
    )
    expect(response.headers.get('Content-Length')).toBe(String(body.byteLength))
    expect(body.byteLength).toBeLessThan(4_500_000)
    expect(metadata.format).toBe('jpeg')
    expect(metadata.width).toBeLessThanOrEqual(1200)
    expect(metadata.height).toBeLessThanOrEqual(1200)
  })

  it('returns the same metadata without a HEAD body', async () => {
    const response = await HEAD(coverRequest(), context)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toMatch(/^\d+$/)
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  })

  it('does not expose covers for ordinary newsletters', async () => {
    mockedGetPost.mockReturnValue({
      ...PHOTO_POST,
      newsletter: 'contraption',
    })

    const response = await GET(coverRequest(), context)

    expect(response.status).toBe(404)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('requires the snapshotted cover path', async () => {
    const response = await GET(
      new Request(
        `https://example.com/api/phone/newsletter-cover/${PHOTO_POST.slug}`
      ),
      context
    )

    expect(response.status).toBe(404)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('uses the snapshot after the post cover changes', async () => {
    mockedGetPost.mockReturnValue({
      ...PHOTO_POST,
      frontmatter: {
        ...PHOTO_POST.frontmatter,
        coverImage: '/images/covers/tsundoku/replacement.jpg',
      },
    })

    const response = await GET(coverRequest(), context)

    expect(response.status).toBe(200)
    const sourceUrl = mockedFetch.mock.calls[0]?.[0]
    const optimizerUrl = new URL(String(sourceUrl))
    expect(optimizerUrl.pathname).toBe('/_next/image')
    expect(optimizerUrl.searchParams.get('url')).toBe(
      PHOTO_POST.frontmatter.coverImage
    )
    expect(optimizerUrl.searchParams.get('w')).toBe('1200')
    expect(optimizerUrl.searchParams.get('q')).toBe('100')
  })
})
