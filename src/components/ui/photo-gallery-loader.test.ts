import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function response(hrefs: string[]) {
  return new Response(
    JSON.stringify({
      photos: hrefs.map((href) => ({
        src: `/images${href}.jpg`,
        caption: { collection: 'tidbits', href, title: href },
      })),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('photo gallery cache', () => {
  it('evicts a successful stale album and deduplicates the next explicit retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(['/older']))
      .mockResolvedValueOnce(response(['/new-photo', '/older']))
    vi.stubGlobal('fetch', fetch)
    const { loadPhotoGallery, photoGalleryIndex } = await import(
      '@/components/ui/photo-gallery-loader'
    )

    const stale = await loadPhotoGallery('tidbits')
    expect(photoGalleryIndex('tidbits', stale, '/new-photo')).toBe(-1)
    expect(fetch).toHaveBeenCalledTimes(1)

    const retry = loadPhotoGallery('tidbits')
    expect(loadPhotoGallery('tidbits')).toBe(retry)
    const fresh = await retry
    expect(photoGalleryIndex('tidbits', fresh, '/new-photo')).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][1]).toMatchObject({ cache: 'reload' })
    expect(await loadPhotoGallery('tidbits')).toBe(fresh)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('makes one request per retry when the origin still lacks the photo', async () => {
    const fetch = vi.fn().mockImplementation(async () => response(['/older']))
    vi.stubGlobal('fetch', fetch)
    const { loadPhotoGallery, photoGalleryIndex } = await import(
      '@/components/ui/photo-gallery-loader'
    )

    for (let attempt = 1; attempt <= 3; attempt++) {
      const photos = await loadPhotoGallery('tidbits')
      expect(photoGalleryIndex('tidbits', photos, '/new-photo')).toBe(-1)
      expect(fetch).toHaveBeenCalledTimes(attempt)
    }
  })

  it('does not let an older missing-photo check evict a newer request', async () => {
    let resolveRetry!: (value: Response) => void
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(['/older']))
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (resolveRetry = resolve))
      )
    vi.stubGlobal('fetch', fetch)
    const { loadPhotoGallery, photoGalleryIndex } = await import(
      '@/components/ui/photo-gallery-loader'
    )

    const stale = await loadPhotoGallery('tidbits')
    photoGalleryIndex('tidbits', stale, '/new-photo')
    const retry = loadPhotoGallery('tidbits')
    photoGalleryIndex('tidbits', stale, '/new-photo')
    expect(loadPhotoGallery('tidbits')).toBe(retry)
    expect(fetch).toHaveBeenCalledTimes(2)
    resolveRetry(response(['/new-photo']))
    const fresh = await retry
    photoGalleryIndex('tidbits', stale, '/new-photo')
    expect(await loadPhotoGallery('tidbits')).toBe(fresh)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries rejected requests without caching their failure', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(response(['/photo']))
    vi.stubGlobal('fetch', fetch)
    const { loadPhotoGallery } = await import(
      '@/components/ui/photo-gallery-loader'
    )

    await expect(loadPhotoGallery('tidbits')).rejects.toThrow(
      'Network unavailable'
    )
    expect(await loadPhotoGallery('tidbits')).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
