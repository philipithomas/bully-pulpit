import { K, Knn, Search } from 'chromadb'
import type { NextRequest } from 'next/server'
import { after, NextResponse } from 'next/server'
import { embedSparse, getClient, getPostsSchema } from '@/lib/chroma'

interface SearchMatch {
  document: string
  score: number
  type: string
}

interface GroupedResult {
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  matches: SearchMatch[]
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  const sessionId = request.nextUrl.searchParams.get('sid') ?? 'unknown'

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const start = performance.now()

  try {
    const client = getClient()
    const collection = await client.getOrCreateCollection({
      name: 'posts',
      schema: getPostsSchema(),
    })

    const sparseQuery = await embedSparse(q)

    const search = new Search()
      .rank(
        Knn({
          query: sparseQuery,
          key: 'sparse_embedding',
          returnRank: true,
          limit: 30,
        })
      )
      .select(
        K.DOCUMENT,
        K.SCORE,
        K('slug'),
        K('title'),
        K('url'),
        K('newsletter'),
        K('type'),
        K('category'),
        K('coverImage')
      )

    const result = await collection.search(search)
    const rows = result.rows()

    // Group results by slug, keeping best match per slug
    const grouped = new Map<string, GroupedResult>()

    for (const group of rows) {
      for (const row of group) {
        const meta = row.metadata ?? {}
        const slug = meta.slug as string
        const score = row.score ?? 0

        if (!grouped.has(slug)) {
          grouped.set(slug, {
            slug,
            title: meta.title as string,
            url: meta.url as string,
            newsletter: meta.newsletter as string,
            coverImage: '',
            matches: [],
          })
        }

        const entry = grouped.get(slug)!

        // Capture coverImage from any matching row that has it
        const coverImage = meta.coverImage as string | undefined
        if (coverImage && !entry.coverImage) {
          entry.coverImage = coverImage
        }

        entry.matches.push({
          document: row.document ?? '',
          score,
          type: meta.type as string,
        })
      }
    }

    // Sort each group's matches by score (lower = better for distance)
    // and limit to top 3 matches per slug.
    // Exclude image-only results from typeahead (they exist for agent use).
    const results = Array.from(grouped.values())
      .map((g) => ({
        ...g,
        matches: g.matches.sort((a, b) => a.score - b.score).slice(0, 3),
      }))
      .filter((g) => g.matches.some((m) => m.type !== 'image'))
      .sort((a, b) => a.matches[0].score - b.matches[0].score)
      .slice(0, 10)

    const durationMs = Math.round(performance.now() - start)
    const searchId = crypto.randomUUID()
    const topMatch = results[0] ?? null

    // Log after response is sent
    after(() =>
      logSearch({
        searchId,
        sessionId,
        query: q,
        durationMs,
        resultCount: results.length,
        topMatchSlug: topMatch?.slug ?? '',
        topMatchUrl: topMatch?.url ?? '',
      }).catch((err) => console.error('Search log failed:', err))
    )

    return NextResponse.json({ results, searchId, durationMs })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

async function logSearch(entry: {
  searchId: string
  sessionId: string
  query: string
  durationMs: number
  resultCount: number
  topMatchSlug: string
  topMatchUrl: string
}) {
  const client = getClient()
  const logs = await client.getOrCreateCollection({
    name: 'search_logs',
    schema: getPostsSchema(),
  })

  const now = new Date()

  await logs.upsert({
    ids: [entry.searchId],
    documents: [entry.query],
    metadatas: [
      {
        session_id: entry.sessionId,
        query: entry.query,
        timestamp: now.toISOString(),
        timestamp_unix: Math.floor(now.getTime() / 1000),
        duration_ms: entry.durationMs,
        result_count: entry.resultCount,
        top_match_slug: entry.topMatchSlug,
        top_match_url: entry.topMatchUrl,
        selected_slug: '',
        selected_url: '',
      },
    ],
  })
}
