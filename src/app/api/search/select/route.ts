import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getClient, getPostsSchema } from '@/lib/chroma'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { searchId, selectedSlug, selectedUrl } = body

    if (!searchId || !UUID_RE.test(searchId)) {
      return NextResponse.json({ error: 'Invalid searchId' }, { status: 400 })
    }

    if (!selectedSlug || !selectedUrl) {
      return NextResponse.json(
        { error: 'Missing selectedSlug or selectedUrl' },
        { status: 400 }
      )
    }

    const client = getClient()
    const logs = await client.getOrCreateCollection({
      name: 'search_logs',
      schema: getPostsSchema(),
    })

    const existing = await logs.get({ ids: [searchId] })
    if (existing.ids.length === 0) {
      return NextResponse.json(
        { error: 'Search log not found' },
        { status: 404 }
      )
    }

    const meta = existing.metadatas[0] ?? {}
    await logs.update({
      ids: [searchId],
      metadatas: [
        {
          ...meta,
          selected_slug: selectedSlug,
          selected_url: selectedUrl,
        },
      ],
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Select log failed:', err)
    return NextResponse.json(
      { error: 'Failed to log selection' },
      { status: 500 }
    )
  }
}
