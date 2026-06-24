import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { hybridSearchPosts } from '@/lib/search/hybrid'

/**
 * Typeahead search uses the same hybrid BM25/vector path as Bell. The hybrid
 * arm adds one runtime query embedding plus local vector scoring, then falls
 * back to BM25 if embedding is unavailable or exceeds the shared timeout.
 * The UI keeps zero debounce, so this route returns timing and mode metadata
 * for analytics instead of adding client-side delay.
 */

interface SearchResult {
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  excerpts: string[]
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const started = performance.now()
    const search = await hybridSearchPosts(q)
    const durationMs = Math.round(performance.now() - started)
    const results: SearchResult[] = search.results.map((result) => ({
      slug: result.slug,
      title: result.title,
      url: result.url,
      newsletter: result.newsletter,
      coverImage: result.coverImage,
      excerpts: result.excerpts.map((excerpt) => excerpt.text),
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
