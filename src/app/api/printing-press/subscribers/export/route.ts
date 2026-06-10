import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { allSubscribersForExport } from '@/lib/db/queries/subscribers'
import { subscribersToCsv } from '@/lib/subscribers-csv'

export async function GET() {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await allSubscribersForExport()
  const csv = subscribersToCsv(rows)

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="subscribers-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
