import { NextResponse } from 'next/server'
import { countActive } from '@/lib/db/queries/subscribers'

// Read at request time only (route handlers are never prerendered), so the
// homepage can stay static and `next build` never touches the database.
export async function GET() {
  try {
    const count = await countActive()
    return NextResponse.json(
      { count },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400',
        },
      }
    )
  } catch (err) {
    console.error('[stats/subscribers/count] error:', err)
    return NextResponse.json({ count: 0 })
  }
}
