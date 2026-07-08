import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { hybridSearchPosts, type SearchScope } from '@/lib/search/hybrid'

/**
 * Typeahead search uses the same hybrid BM25/vector path as Bell. The hybrid
 * arm adds one runtime query embedding plus local vector scoring, then falls
 * back to BM25 if embedding is unavailable or exceeds the shared timeout.
 * The UI keeps zero debounce, so this route returns timing and mode metadata
 * for analytics instead of adding client-side delay.
 */

interface SearchResult {
  type: 'post' | 'page' | 'image'
  id: string
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  excerpts: string[]
  images: {
    id: string
    src: string
    alt: string
    url: string
    description: string
  }[]
  image?: {
    id: string
    src: string
    alt: string
    url: string
    description: string
  }
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  const rawScope = request.nextUrl.searchParams.get('scope')
  const scope: SearchScope = rawScope === 'images' ? 'images' : 'posts'

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const started = performance.now()
    const search = await hybridSearchPosts(q, { scope })
    const durationMs = Math.round(performance.now() - started)
    const results: SearchResult[] = search.results.map((result) => ({
      type: result.type,
      id: result.id,
      slug: result.slug,
      title: result.title,
      url: result.url,
      newsletter: result.newsletter,
      coverImage: result.coverImage,
      excerpts: result.excerpts.map((excerpt) => excerpt.text),
      images: result.images.map((image) => ({
        id: image.id,
        src: image.src,
        alt: image.alt,
        url: image.url,
        description: image.description,
      })),
      ...(result.image
        ? {
            image: {
              id: result.image.id,
              src: result.image.src,
              alt: result.image.alt,
              url: result.image.url,
              description: result.image.description,
            },
          }
        : {}),
    }))

    return NextResponse.json({
      results,
      mode: search.mode,
      durationMs,
    })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
