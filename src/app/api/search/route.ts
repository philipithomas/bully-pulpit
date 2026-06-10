import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getLexicalIndex } from '@/lib/search/lexical'

/**
 * Typeahead search: BM25 over the local lexical index. No network calls, no
 * external services, no logging — pure in-process compute, so per-keystroke
 * latency is the function invocation itself.
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
    const index = await getLexicalIndex()
    const results: SearchResult[] = index.search(q, 10).map((hit) => ({
      slug: hit.slug,
      title: hit.title,
      url: hit.url,
      newsletter: hit.newsletter,
      coverImage: hit.coverImage,
      excerpts: index.extractExcerpts(hit.slug, hit.terms, 3),
    }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
