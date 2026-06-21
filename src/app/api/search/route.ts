import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { hybridSearchPosts } from '@/lib/search/hybrid'

/**
 * Typeahead search uses the same hybrid BM25/vector search as Bell. The UI
 * still fires with zero debounce; if runtime query embedding is unavailable
 * locally, the shared search path falls back to BM25-only.
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
    const search = await hybridSearchPosts(q)
    const results: SearchResult[] = search.results.map((result) => ({
      slug: result.slug,
      title: result.title,
      url: result.url,
      newsletter: result.newsletter,
      coverImage: result.coverImage,
      excerpts: result.excerpts.map((excerpt) => excerpt.text),
    }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
