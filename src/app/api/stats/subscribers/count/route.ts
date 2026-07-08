import { NextResponse } from 'next/server'
import { countActive } from '@/lib/db/queries/subscribers'

// Read at request time only. The homepage now bakes a best-effort count into
// static HTML at build time; this route remains available for client-only forms.
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
