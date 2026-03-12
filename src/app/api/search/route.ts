import { waitUntil } from '@vercel/functions'
import type { SparseVector } from 'chromadb'
import { K, Knn, Search } from 'chromadb'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getClient, getPostsSchema } from '@/lib/chroma'

const EMBED_URL =
  'https://chroma-core--chroma-cloud-embed-publicchromacloudembedfl-dc8dbe.us-east.modal.direct/embed_sparse'

async function embedSparse(text: string): Promise<SparseVector> {
  const apiKey = process.env.CHROMA_API_KEY
  if (!apiKey) {
    throw new Error('CHROMA_API_KEY not set')
  }
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'x-chroma-token': apiKey ?? '',
      'x-chroma-embedding-model': 'prithivida/Splade_PP_en_v1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts: [text], task: '', target: '' }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embed failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  const sv = data.embeddings[0] as SparseVector

  // Sort by indices ascending (match Python behavior)
  const pairs = sv.indices.map((idx: number, i: number) => ({
    index: idx,
    value: sv.values[i],
  }))
  pairs.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
  sv.indices = pairs.map((p: { index: number }) => p.index)
  sv.values = pairs.map((p: { value: number }) => p.value)

  return sv
}

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
        K('type')
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
            matches: [],
          })
        }

        grouped.get(slug)!.matches.push({
          document: row.document ?? '',
          score,
          type: meta.type as string,
        })
      }
    }

    // Sort each group's matches by score (lower = better for distance)
    // and limit to top 3 matches per slug
    const results = Array.from(grouped.values())
      .map((g) => ({
        ...g,
        matches: g.matches.sort((a, b) => a.score - b.score).slice(0, 3),
      }))
      .sort((a, b) => a.matches[0].score - b.matches[0].score)
      .slice(0, 10)

    const durationMs = Math.round(performance.now() - start)
    const searchId = crypto.randomUUID()
    const topMatch = results[0] ?? null

    // Log after response — waitUntil keeps the function alive on Vercel
    waitUntil(
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
